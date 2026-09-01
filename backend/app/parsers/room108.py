from __future__ import annotations

import io
import re

import pdfplumber

from .base import BaseInvoiceParser, ParsedInvoiceLine, ParsedInvoiceResult, ParsedInvoiceSection

# Voorbeeld (F26013252, geverifieerd tegen een echte verzamelfactuur):
#
#   Ordernummer G26055476
#   Referentie V26052177 Jongerius
#
#   Aantal Omschrijving Stukprijs Bedrag
#   3,00 st Los garantiepakket 108% Safe! € 23,30 € 69,90
#
#   Ordernummer G26055491
#   ...
#
# Elke sectie begint met "Ordernummer <G-nummer>" + "Referentie <V-nummer> ...",
# gevolgd door regels "<aantal>,00 st <omschrijving> € <stukprijs> € <bedrag>".
# Configuratieregels (Stof/Leder categorie, Element, Afmeting ca., ...) horen
# bij de vorige regel en tellen niet mee als eigen productregel.

_ORDER_HEADER_RE = re.compile(r"^Ordernummer\s+(\S+)\s*$")
_REFERENCE_RE = re.compile(r"^Referentie\s+(.+)$")
_LINE_ITEM_RE = re.compile(
    r"^(-?\d+,\d{2})\s*st\s+(.+?)\s+€\s*([\d.,]+)\s+€\s*(-?[\d.,]+)\s*$"
)
_HEADER_ROW_RE = re.compile(r"^Aantal\s+Omschrijving\s+Stukprijs\s+Bedrag\s*$")


def _parse_nl_money(raw: str) -> float:
    return float(raw.replace(".", "").replace(",", "."))


def _parse_nl_number(raw: str) -> float:
    return float(raw.replace(",", "."))


class Room108InvoiceParser(BaseInvoiceParser):
    supplier_key = "room108"

    def parse(self, pdf_bytes: bytes) -> ParsedInvoiceResult:
        warnings: list[str] = []
        lines_text: list[str] = []
        invoice_number: str | None = None
        invoice_date: str | None = None

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                lines_text.extend(text.splitlines())

        # Kop staat in 2 kolommen die pdfplumber op dezelfde regel samenvoegt,
        # bv. "t.a.v. Jan van Balkom Factuurnummer F26013252".
        for raw_line in lines_text[:15]:
            m = re.search(r"Factuurnummer\s+(\S+)", raw_line)
            if m:
                invoice_number = m.group(1)
            m = re.search(r"Factuurdatum\s+(\d{1,2})-(\d{1,2})-(\d{4})", raw_line)
            if m:
                invoice_date = f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"

        sections: list[ParsedInvoiceSection] = []
        current: ParsedInvoiceSection | None = None

        for raw_line in lines_text:
            line = raw_line.strip()
            if not line:
                continue

            header_match = _ORDER_HEADER_RE.match(line)
            if header_match:
                current = ParsedInvoiceSection(
                    order_key_type="external_order_number",
                    order_key_value=header_match.group(1),
                )
                sections.append(current)
                continue

            if current is None:
                continue  # kop-/voettekst voor de eerste order-sectie, negeren

            ref_match = _REFERENCE_RE.match(line)
            if ref_match and current.reference is None:
                current.reference = ref_match.group(1).strip()
                continue

            if _HEADER_ROW_RE.match(line):
                continue  # tabelkop, geen data

            item_match = _LINE_ITEM_RE.match(line)
            if item_match:
                current.lines.append(
                    ParsedInvoiceLine(
                        description=item_match.group(2).strip(),
                        quantity=_parse_nl_number(item_match.group(1)),
                        unit_price=_parse_nl_money(item_match.group(3)),
                        line_price=_parse_nl_money(item_match.group(4)),
                    )
                )
            # Overige regels (Stof/Leder categorie, Element, Afmeting ca., ...)
            # zijn configuratiedetails van de vorige regel - genegeerd, niet
            # nodig voor de prijsvergelijking.

        if not sections:
            warnings.append("Geen 'Ordernummer'-secties gevonden in de factuur.")

        return ParsedInvoiceResult(
            supplier=self.supplier_key,
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            sections=sections,
            warnings=warnings,
            confidence=0.9 if sections else 0.2,
        )


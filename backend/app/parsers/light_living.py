from __future__ import annotations

import io
import re

import pdfplumber

from .base import BaseInvoiceParser, ParsedInvoiceLine, ParsedInvoiceResult, ParsedInvoiceSection

# Voorbeeld (26304316, geverifieerd tegen een echte factuur):
#
#   Uw referentie: I26066472          <- 1x in de koptekst, herhaald op elke
#                                         pagina - de HELE factuur hoort bij
#                                         deze ene inkooporder (geen
#                                         verzamelfactuur zoals Room108).
#
#   Ordernr. Artikel.nr. Aantal Artikelomschrijving  Land van Herkomst  Netto Prijs  Netto Totaal
#   104197   5500018      1     Bijzettafel 53x30x48 cm LIENZ antiek   IN    31,16    31,16
#                                brons
#            7109216      2     Klok Ø15 cm LICOLA antiek zwart        IN     7,40    14,80
#
# "Ordernr." is Light & Living's EIGEN interne suborder-nummer (niet ons
# I-/G-nummer) - genegeerd voor de koppeling, alleen "Uw referentie" telt.
# Beschrijvingen lopen soms door op de volgende regel (geen bedragen op die
# regel) - die worden aan de vorige regel geplakt. FREIGHT CHARGES-regels
# hebben geen bedrag en worden overgeslagen (net als bij orderbevestigingen).

_REFERENCE_RE = re.compile(r"^Uw referentie:\s*(.+?)\s*$")
# Alleen een echt I-nummer is bruikbaar om te koppelen. Staat er vrije tekst
# ("Offerte showroom najaarscollectie"), dan hoort de factuur alsnog in de
# tool - maar dan als niet-gekoppeld, voor handmatige controle.
_PURCHASE_ORDER_NUMBER_RE = re.compile(r"^I\d{6,}$")
_INVOICE_HEADER_RE = re.compile(r"^(\d{1,2}-\d{1,2}-\d{4})\s+(\d+)\s+\d+\s*$")
# Regel met bedragen: [ordernr] artikelnr aantal omschrijving landcode kortingsperc% prijs totaal
_LINE_ITEM_RE = re.compile(
    r"^(?:(\d+)\s+)?(\d{5,})\s+(-?\d+)\s+(.+?)\s+([A-Z]{2})\s+([\d,]+)\s*%\s+(-?[\d.,]+)\s+(-?[\d.,]+)\s*$"
)
# Groepen: 1 eigen ordernr (genegeerd), 2 artikelnr, 3 aantal, 4 omschrijving,
# 5 land van herkomst, 6 kortingspercentage (genegeerd), 7 netto stukprijs,
# 8 netto totaal.
_FREIGHT_RE = re.compile(r"^FREIGHT CHARGES\b", re.IGNORECASE)
# Lopend subtotaal bovenaan een vervolgpagina, staat weer binnen de tabel
# maar is geen productregel en geen eind-van-tabel-marker.
_CARRYOVER_RE = re.compile(r"Transport van vorige pagina")
_TABLE_HEADER_RE = re.compile(r"^Ordernr\.\s+Artikel\.nr\.\s+Aantal\b")

# Niet ge-anchored: deze voettekst-labels staan soms samengevoegd met een
# ander (links-)kolomlabel op dezelfde regel, bv.
# "Afleveradres: Transport naar volgende pagina 6.346,94".
_TABLE_END_RE = re.compile(r"(Transport naar volgende pagina|Subtotaal|Kortings|Afleveradres:|Pagina:)")
# Basecone hangt een exportpagina "Document tijdlijn" achter de eigenlijke
# factuur (goedkeur-audittrail, geen onderdeel van de factuur van de
# leverancier zelf) - alles daarna nooit als factuurregel meenemen.
_DOCUMENT_TIJDLIJN_RE = re.compile(r"^Document tijdlijn")


def _parse_nl_money(raw: str) -> float:
    return float(raw.replace(".", "").replace(",", "."))


class LightLivingInvoiceParser(BaseInvoiceParser):
    supplier_key = "light-living"

    def parse(self, pdf_bytes: bytes) -> ParsedInvoiceResult:
        warnings: list[str] = []
        lines_text: list[str] = []

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                lines_text.extend(text.splitlines())

        reference: str | None = None
        invoice_number: str | None = None
        invoice_date: str | None = None
        lines: list[ParsedInvoiceLine] = []
        in_table = False

        for raw_line in lines_text:
            line = raw_line.strip()
            if not line:
                continue

            if _DOCUMENT_TIJDLIJN_RE.match(line):
                break  # Basecone-audittrail, niet onderdeel van de factuur

            if reference is None:
                ref_match = _REFERENCE_RE.match(line)
                if ref_match:
                    reference = ref_match.group(1)
                    continue

            if invoice_number is None:
                header_match = _INVOICE_HEADER_RE.match(line)
                if header_match:
                    d, m, y = header_match.group(1).split("-")
                    invoice_date = f"{y}-{int(m):02d}-{int(d):02d}"
                    invoice_number = header_match.group(2)
                    continue

            if _TABLE_HEADER_RE.match(line):
                in_table = True
                continue
            if _TABLE_END_RE.search(line):
                in_table = False
                continue
            if not in_table:
                continue  # kop-/voettekst buiten de regeltabel, nooit meenemen

            if _FREIGHT_RE.match(line) or _CARRYOVER_RE.search(line):
                continue

            item_match = _LINE_ITEM_RE.match(line)
            if item_match:
                lines.append(
                    ParsedInvoiceLine(
                        code=item_match.group(2),
                        description=item_match.group(4).strip(),
                        quantity=float(item_match.group(3)),
                        unit_price=_parse_nl_money(item_match.group(7)),
                        line_price=_parse_nl_money(item_match.group(8)),
                    )
                )
                continue

            # Beschrijving loopt door op een aparte regel (geen bedragen erop):
            # plakken aan de laatst toegevoegde regel. We zijn hier altijd
            # binnen de tabel (in_table), dus geen kop-/voettekst meer mogelijk.
            if lines:
                lines[-1].description = f"{lines[-1].description} {line}".strip()

        # Alleen een echt I-nummer is bruikbaar om te koppelen. Staat er vrije
        # tekst (bv. "Offerte showroom najaarscollectie" bij een showroom-
        # inkoop), dan is er geen inkooporder om tegen te vergelijken - de
        # factuur moet dan tóch in de tool komen, als niet-gekoppeld, zodat
        # facturatie hem ziet in plaats van dat hij stil verdwijnt.
        order_key_value = None
        if reference and _PURCHASE_ORDER_NUMBER_RE.match(reference):
            order_key_value = reference
        elif reference:
            warnings.append(
                f"Referentie '{reference}' is geen inkoopordernummer - "
                "factuur kan niet automatisch gekoppeld worden."
            )
        else:
            warnings.append("Geen 'Uw referentie' gevonden in de factuur.")

        if not lines:
            warnings.append("Geen productregels gevonden in de factuur.")

        # De layout is herkend zodra er productregels uit de tabel komen; dat
        # is wat deze factuur tot een Light & Living-factuur maakt, niet de
        # aanwezigheid van een bruikbaar ordernummer.
        sections = (
            [
                ParsedInvoiceSection(
                    order_key_type="purchase_order_number",
                    order_key_value=order_key_value,
                    lines=lines,
                    reference=reference,
                )
            ]
            if lines
            else []
        )

        return ParsedInvoiceResult(
            supplier=self.supplier_key,
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            sections=sections,
            warnings=warnings,
            confidence=0.9 if order_key_value and lines else (0.6 if lines else 0.2),
        )

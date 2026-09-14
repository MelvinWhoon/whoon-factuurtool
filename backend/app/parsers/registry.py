from __future__ import annotations

import io
import re

import pdfplumber

from .base import BaseInvoiceParser, ParsedInvoiceLine, ParsedInvoiceResult, ParsedInvoiceSection
from .light_living import LightLivingInvoiceParser
from .room108 import Room108InvoiceParser

_PARSERS: dict[str, BaseInvoiceParser] = {
    "room108": Room108InvoiceParser(),
    "light-living": LightLivingInvoiceParser(),
}

# Generieke laatste-redmiddel-herkenning voor leveranciers zonder eigen parser
# (10 van de 12 actieve leveranciers hebben er vandaag geen - zie het
# facturen-tool-plan). Herkent GEEN regels, alleen (a) het printed totaalbedrag
# en (b) ordernummer-achtige referenties, zodat er in elk geval een
# totaalbedrag-vergelijking mogelijk is i.p.v. de factuur helemaal te missen.
_TOTAL_LABEL_RE = re.compile(
    r"(?:totaalbedrag|eindtotaal|te betalen|total(?:\s+incl\w*)?|grand\s*total)"
    r"[^\d\-]{0,20}(-?[\d.,]+)",
    re.IGNORECASE,
)
# LogicTrade-inkoopordernummers (I...) en verkooporder-/V-nummers - zelfde
# generieke patronen als whoon-ordertool/pdf_parser gebruikt.
_PURCHASE_ORDER_NUMBER_RE = re.compile(r"\bI\d{6,}\b")
_SALES_ORDER_NUMBER_RE = re.compile(r"\bV\d{6,}\b")


def _parse_generic_amount(raw: str) -> float | None:
    text = raw.strip()
    # NL-notatie (1.234,56) vs EN-notatie (1,234.56) onderscheiden op de
    # positie van het laatste scheidingsteken.
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _generic_fallback_parse(pdf_bytes: bytes) -> ParsedInvoiceResult | None:
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    total_amount = None
    for match in _TOTAL_LABEL_RE.finditer(text):
        amount = _parse_generic_amount(match.group(1))
        if amount is not None:
            total_amount = amount  # laatste treffer wint (vaak de eindtotaalregel)

    po_numbers = list(dict.fromkeys(_PURCHASE_ORDER_NUMBER_RE.findall(text)))
    sales_numbers = list(dict.fromkeys(_SALES_ORDER_NUMBER_RE.findall(text)))

    if total_amount is None and not po_numbers and not sales_numbers:
        return None  # niets bruikbaars gevonden, echt geen basis om op te bouwen

    sections: list[ParsedInvoiceSection] = []
    if len(po_numbers) == 1:
        # Eén duidelijke inkooporder-referentie: het totaalbedrag mag daar met
        # vertrouwen aan toegeschreven worden als 1 synthetische regel, zodat
        # de bestaande totaalbedrag-vergelijking (whoon.relink_invoice_lines)
        # er zonder wijziging mee kan rekenen.
        sections.append(
            ParsedInvoiceSection(
                order_key_type="purchase_order_number",
                order_key_value=po_numbers[0],
                lines=(
                    [
                        ParsedInvoiceLine(
                            description="Totaalbedrag (automatisch herkend, regels niet uitgesplitst)",
                            line_price=total_amount,
                        )
                    ]
                    if total_amount is not None
                    else []
                ),
                reference=sales_numbers[0] if sales_numbers else None,
            )
        )
    else:
        # Meerdere (of geen) ordernummers: zonder een specifieke parser is niet
        # te bepalen hoe het totaal over de referenties verdeeld is - wél elke
        # referentie als losse, regelloze sectie teruggeven zodat de factuur
        # zichtbaar en doorzoekbaar is i.p.v. onzichtbaar in 'onbekend'.
        for po_number in po_numbers:
            sections.append(
                ParsedInvoiceSection(order_key_type="purchase_order_number", order_key_value=po_number)
            )
        if not po_numbers:
            for sales_number in sales_numbers:
                sections.append(
                    ParsedInvoiceSection(
                        order_key_type="external_order_number", order_key_value=None, reference=sales_number
                    )
                )

    warnings = ["Generieke herkenning: regels zijn niet uitgesplitst, alleen totaalbedrag/referenties."]
    return ParsedInvoiceResult(
        supplier="onbekend",
        invoice_number=None,
        invoice_date=None,
        sections=sections,
        warnings=warnings,
        confidence=0.1,
        total_amount=total_amount,
    )


def get_parser(supplier: str) -> BaseInvoiceParser | None:
    return _PARSERS.get(supplier)


def list_suppliers() -> list[str]:
    return sorted(_PARSERS.keys())


def detect_and_parse(pdf_bytes: bytes):
    """Bepaalt zélf welke leverancier het is door alle parsers te proberen.

    Nodig omdat facturen binnenkomen op de GEDEELDE mailbox invoice@whoon.com:
    de afzender zegt daar niets over de leverancier (vaak een ander adres dan
    het order-adres in whoon.suppliers). De factuurlayouts zijn juist wél
    kenmerkend - Room108 heeft "Ordernummer G…"-koppen, Light & Living een
    "Uw referentie: I…" - dus de parser die daadwerkelijk secties vindt, is
    de juiste. Vindt geen enkele parser iets, dan is het resultaat None en
    gaat de factuur naar de handmatige wachtrij (nooit gokken).
    """
    best = None
    for parser in _PARSERS.values():
        try:
            result = parser.parse(pdf_bytes)
        except Exception:  # noqa: BLE001 - een kapotte parser mag de rest niet blokkeren
            continue
        if not result.sections:
            continue
        if best is None or result.confidence > best.confidence:
            best = result
    if best is not None:
        return best

    # Geen enkele specifieke parser vond iets - voor 10 van de 12 actieve
    # leveranciers bestaat er (nog) geen eigen parser, dus dit is de normale
    # weg voor hen. Probeer in elk geval het totaalbedrag en ordernummers te
    # vinden, zodat de factuur niet zonder meer in de 'onbekend'-wachtrij
    # verdwijnt (zie facturen-tool-plan, "generieke fallback").
    try:
        return _generic_fallback_parse(pdf_bytes)
    except Exception:  # noqa: BLE001 - fallback mag nooit een harde 422 veroorzaken
        return None

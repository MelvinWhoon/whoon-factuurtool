from __future__ import annotations

from .base import BaseInvoiceParser
from .light_living import LightLivingInvoiceParser
from .room108 import Room108InvoiceParser

_PARSERS: dict[str, BaseInvoiceParser] = {
    "room108": Room108InvoiceParser(),
    "light-living": LightLivingInvoiceParser(),
}


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
    return best

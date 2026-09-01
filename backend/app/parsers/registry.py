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

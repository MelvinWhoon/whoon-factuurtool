from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class ParsedInvoiceLine:
    description: str
    quantity: float | None = None
    unit_price: float | None = None
    line_price: float | None = None
    code: str | None = None


@dataclass
class ParsedInvoiceSection:
    """Een deel van de factuur dat bij precies 1 inkooporder hoort. Bij een
    losse factuur is er 1 sectie voor het hele document; bij een
    verzamelfactuur (Room108, Hjort) is er 1 sectie per inkooporder."""

    order_key_type: Literal["purchase_order_number", "external_order_number"]
    order_key_value: str
    lines: list[ParsedInvoiceLine] = field(default_factory=list)
    reference: str | None = None


@dataclass
class ParsedInvoiceResult:
    supplier: str
    invoice_number: str | None
    invoice_date: str | None  # ISO yyyy-mm-dd
    sections: list[ParsedInvoiceSection]
    warnings: list[str] = field(default_factory=list)
    confidence: float = 1.0

    def to_json(self) -> dict[str, Any]:
        return {
            "supplier": self.supplier,
            "invoiceNumber": self.invoice_number,
            "invoiceDate": self.invoice_date,
            "sections": [
                {
                    "orderKey": {"type": s.order_key_type, "value": s.order_key_value},
                    "reference": s.reference,
                    "lines": [
                        {
                            "description": line.description,
                            "quantity": line.quantity,
                            "unitPrice": line.unit_price,
                            "linePrice": line.line_price,
                            "code": line.code,
                        }
                        for line in s.lines
                    ],
                }
                for s in self.sections
            ],
            "warnings": self.warnings,
            "confidence": self.confidence,
        }


class BaseInvoiceParser:
    """Zelfde soort contract als pdf_parser/parsers/base.py in whoon-ordertool
    (BaseSupplierParser), maar voor facturen i.p.v. orderbevestigingen -
    bewust een eigen, kleine kopie in deze losstaande repo (geen gedeelde
    package tussen de twee tools, zie het isolatie-uitgangspunt van deze app)."""

    supplier_key: str

    def parse(self, pdf_bytes: bytes) -> ParsedInvoiceResult:
        raise NotImplementedError

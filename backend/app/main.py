from __future__ import annotations

import base64
import os

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

from .matching import SourceLine, match_invoice_lines_to_source
from .parsers.registry import detect_and_parse, get_parser, list_suppliers

# Zelfde patroon als whoon-ordertool/pdf_parser/api.py: een simpele, statische
# X-API-Key. Bewust geen database-toegang hier (net als het bestaande
# pdf_parser/api.py) - deze service parst en vergelijkt alleen; het lezen van
# whoon.purchase_orders en het wegschrijven van resultaten gebeurt door de
# n8n-intake-workflow (fase 2), met de service_role-key, niet door deze API.


def require_api_key(x_api_key: str | None = Header(None, alias="X-API-Key")) -> None:
    api_key = os.getenv("FACTUREN_API_KEY")
    if not api_key:
        return
    if x_api_key != api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


app = FastAPI(title="Facturen Parser/Vergelijker", dependencies=[Depends(require_api_key)])


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.get("/suppliers")
async def suppliers() -> dict:
    return {"suppliers": list_suppliers()}


@app.post("/parse")
async def parse_invoice(supplier: str = Form("auto"), file: UploadFile = File(...)) -> dict:
    """supplier='auto' (default) laat de service zelf bepalen welke leverancier
    het is - nodig voor de gedeelde mailbox invoice@whoon.com, waar de afzender
    niets zegt over de leverancier."""
    pdf_bytes = await file.read()

    if supplier == "auto":
        try:
            result = detect_and_parse(pdf_bytes)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=422, detail=f"Kon factuur niet parsen: {exc}") from exc
        if result is None:
            raise HTTPException(
                status_code=422,
                detail="Geen bekende leveranciers-layout herkend in deze factuur.",
            )
        return result.to_json()

    parser = get_parser(supplier)
    if parser is None:
        raise HTTPException(status_code=400, detail=f"Geen parser voor leverancier '{supplier}'.")

    try:
        result = parser.parse(pdf_bytes)
    except Exception as exc:  # noqa: BLE001 - altijd een nette 422 i.p.v. een crash
        raise HTTPException(status_code=422, detail=f"Kon factuur niet parsen: {exc}") from exc

    return result.to_json()


class ParseBase64Request(BaseModel):
    content_base64: str
    supplier: str = "auto"
    filename: str | None = None


@app.post("/parse-base64")
async def parse_invoice_base64(payload: ParseBase64Request) -> dict:
    """Zelfde als /parse, maar met de PDF als base64 in een JSON-body.

    Nodig voor n8n: de httpRequest-helper in een Code-node stuurt 'formData'
    niet betrouwbaar als echte multipart door (FastAPI ziet het file-veld dan
    als ontbrekend). Dat is in de Ordervergelijker al eerder tegen het lijf
    gelopen bij de PDF-upload; JSON+base64 werkt daar wel, dus hier meteen zo.
    """
    try:
        pdf_bytes = base64.b64decode(payload.content_base64)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Ongeldige base64-inhoud: {exc}") from exc

    if payload.supplier == "auto":
        result = detect_and_parse(pdf_bytes)
        if result is None:
            raise HTTPException(
                status_code=422,
                detail="Geen bekende leveranciers-layout herkend in deze factuur.",
            )
        return result.to_json()

    parser = get_parser(payload.supplier)
    if parser is None:
        raise HTTPException(
            status_code=400, detail=f"Geen parser voor leverancier '{payload.supplier}'."
        )
    try:
        return parser.parse(pdf_bytes).to_json()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Kon factuur niet parsen: {exc}") from exc


class SourceLinePayload(BaseModel):
    code: str | None = None
    description: str | None = None
    linePrice: float | None = None
    quantity: float | None = None


class InvoiceLinePayload(BaseModel):
    code: str | None = None
    description: str | None = None
    linePrice: float | None = None
    quantity: float | None = None


class CompareRequest(BaseModel):
    sourceLines: list[SourceLinePayload]
    invoiceLines: list[InvoiceLinePayload]
    tolerancePct: float = 1.0


@app.post("/compare")
async def compare_invoice_lines(payload: CompareRequest) -> dict:
    source_lines = [
        SourceLine(code=l.code, description=l.description, line_price=l.linePrice, quantity=l.quantity)
        for l in payload.sourceLines
    ]
    invoice_lines = [
        SourceLine(code=l.code, description=l.description, line_price=l.linePrice, quantity=l.quantity)
        for l in payload.invoiceLines
    ]

    results = match_invoice_lines_to_source(source_lines, invoice_lines, payload.tolerancePct)

    return {
        "results": [
            {
                "invoiceLineIndex": r.invoice_line_index,
                "sourceIndex": r.source_index,
                "status": r.status,
                "sourceLinePrice": r.source_line_price,
                "priceDifference": r.price_difference,
                "priceDifferencePct": r.price_difference_pct,
                "priceWithinTolerance": r.price_within_tolerance,
                "matchMethod": r.match_method,
                "meta": r.meta,
            }
            for r in results
        ],
        "summary": {
            "matched": sum(1 for r in results if r.status == "matched"),
            "unmatched": sum(1 for r in results if r.status == "unmatched"),
            "outOfTolerance": sum(
                1 for r in results if r.status == "matched" and r.price_within_tolerance is False
            ),
        },
    }

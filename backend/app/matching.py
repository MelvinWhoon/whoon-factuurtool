from __future__ import annotations

from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any

# Matching-primitief, geïnspireerd op whoon-ordertool/pdf_parser/compare.py
# (exacte-code-eerst + fuzzy toewijzing) - hier als eigen, kleine kopie i.p.v.
# een gedeelde package, in lijn met het isolatie-uitgangspunt van deze app.
# Geen AI-embeddings hier: bij facturen zijn de artikelcodes al leidend
# (bevestigd bij Room108 en Light & Living), dus een simpele tekst-gelijkenis
# als terugval volstaat voor de MVP.


@dataclass
class SourceLine:
    code: str | None
    description: str | None
    line_price: float | None
    quantity: float | None = None


@dataclass
class MatchResult:
    source_index: int | None
    invoice_line_index: int
    status: str  # "matched" | "unmatched"
    source_line_price: float | None = None
    price_difference: float | None = None
    price_difference_pct: float | None = None
    price_within_tolerance: bool | None = None
    match_method: str | None = None  # "exact_code" | "fuzzy_description"
    meta: dict[str, Any] = field(default_factory=dict)


def _normalize_code(value: str | None) -> str | None:
    if not value:
        return None
    normalized = str(value).strip().lower()
    return normalized or None


def _text_similarity(a: str | None, b: str | None) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _price_within_tolerance(source_price: float, invoice_price: float, tolerance_pct: float) -> bool:
    if invoice_price <= source_price:
        return True
    if source_price == 0:
        return invoice_price == 0
    overrun_pct = (invoice_price - source_price) / source_price * 100
    return overrun_pct <= tolerance_pct


def match_invoice_lines_to_source(
    source_lines: list[SourceLine],
    invoice_lines: list[SourceLine],
    tolerance_pct: float,
    min_fuzzy_score: float = 0.6,
) -> list[MatchResult]:
    """Koppelt factuurregels aan bronregels (inkooporder), exacte code eerst,
    dan fuzzy op omschrijving voor wat overblijft. Retourneert 1 resultaat per
    factuurregel (in dezelfde volgorde als invoice_lines)."""

    assigned_source: set[int] = set()
    results: dict[int, MatchResult] = {}

    # 1) Exacte code-match, alleen als eenduidig aan beide kanten.
    source_code_counts: dict[str, int] = {}
    for line in source_lines:
        code = _normalize_code(line.code)
        if code:
            source_code_counts[code] = source_code_counts.get(code, 0) + 1

    invoice_code_counts: dict[str, int] = {}
    for line in invoice_lines:
        code = _normalize_code(line.code)
        if code:
            invoice_code_counts[code] = invoice_code_counts.get(code, 0) + 1

    source_by_code: dict[str, int] = {}
    for idx, line in enumerate(source_lines):
        code = _normalize_code(line.code)
        if code and source_code_counts.get(code) == 1:
            source_by_code[code] = idx

    for inv_idx, inv_line in enumerate(invoice_lines):
        code = _normalize_code(inv_line.code)
        if not code or invoice_code_counts.get(code) != 1:
            continue
        source_idx = source_by_code.get(code)
        if source_idx is None or source_idx in assigned_source:
            continue
        assigned_source.add(source_idx)
        results[inv_idx] = _build_match(
            source_idx, inv_idx, source_lines[source_idx], inv_line, tolerance_pct, "exact_code"
        )

    # 2) Fuzzy op omschrijving voor de rest (greedy, hoogste score eerst).
    remaining_invoice = [i for i in range(len(invoice_lines)) if i not in results]
    remaining_source = [i for i in range(len(source_lines)) if i not in assigned_source]

    candidates = []
    for inv_idx in remaining_invoice:
        for src_idx in remaining_source:
            score = _text_similarity(invoice_lines[inv_idx].description, source_lines[src_idx].description)
            if score >= min_fuzzy_score:
                candidates.append((score, inv_idx, src_idx))
    candidates.sort(key=lambda c: c[0], reverse=True)

    used_invoice: set[int] = set()
    for score, inv_idx, src_idx in candidates:
        if inv_idx in used_invoice or src_idx in assigned_source:
            continue
        used_invoice.add(inv_idx)
        assigned_source.add(src_idx)
        results[inv_idx] = _build_match(
            src_idx, inv_idx, source_lines[src_idx], invoice_lines[inv_idx], tolerance_pct, "fuzzy_description"
        )
        results[inv_idx].meta["similarity"] = round(score, 4)

    # 3) Wat overblijft: geen match - nooit gokken.
    for inv_idx in range(len(invoice_lines)):
        if inv_idx not in results:
            results[inv_idx] = MatchResult(
                source_index=None, invoice_line_index=inv_idx, status="unmatched"
            )

    return [results[i] for i in range(len(invoice_lines))]


def _build_match(
    source_idx: int,
    inv_idx: int,
    source_line: SourceLine,
    invoice_line: SourceLine,
    tolerance_pct: float,
    method: str,
) -> MatchResult:
    source_price = source_line.line_price if source_line.line_price is not None else 0.0
    invoice_price = invoice_line.line_price if invoice_line.line_price is not None else 0.0
    diff = round(invoice_price - source_price, 2)
    diff_pct = round((diff / source_price * 100), 2) if source_price else (0.0 if diff == 0 else None)
    return MatchResult(
        source_index=source_idx,
        invoice_line_index=inv_idx,
        status="matched",
        source_line_price=source_price,
        price_difference=diff,
        price_difference_pct=diff_pct,
        price_within_tolerance=_price_within_tolerance(source_price, invoice_price, tolerance_pct),
        match_method=method,
    )

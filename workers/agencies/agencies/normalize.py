"""Normalize adapter rows into the shape of a shared `Call` (pure functions).

`Call` writes are NOT done here. They depend on FO-266 (F1: the Call additive
columns and the `callIdentifier @unique` idempotency key). Until that is merged,
this module only produces the field mapping and its tests, so the write step is a
one-line change once F1 lands.

Field names below are the planned Call fields; keep them in sync with the
Prisma schema when FO-266 merges.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

_SPACE = re.compile(r"\s+")
_TRAILING_META = re.compile(r"\s*-->.*$")


def call_identifier(row: dict[str, Any]) -> str:
    """Deterministic key: the same source announcement always maps to the same id."""
    ref = row.get("ref")
    if not ref:
        raise ValueError("ref yok")
    return f"{row['source'].upper()}:{ref}"


def _title(row: dict[str, Any]) -> str:
    raw = row.get("name") or row.get("title") or row.get("ref") or ""
    return _SPACE.sub(" ", _TRAILING_META.sub("", raw)).strip()[:300]


def to_call(row: dict[str, Any]) -> dict[str, Any]:
    deadline_utc = None
    if row.get("deadline_local"):
        deadline_utc = (
            datetime.fromisoformat(row["deadline_local"]).astimezone(timezone.utc).isoformat(timespec="seconds")
        )
    return {
        "callIdentifier": call_identifier(row),
        "title": _title(row),
        "sourceUrl": row.get("url"),
        "deadlineAt": deadline_utc,
        "deadlineTz": "Europe/Istanbul" if row.get("deadline_local") else None,
        "supportMinTl": row.get("support_min_tl"),
        "supportMaxTl": row.get("support_max_tl"),
        "supportRatePct": row.get("support_rate_pct"),
    }

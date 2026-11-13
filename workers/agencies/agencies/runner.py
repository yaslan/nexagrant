"""One collection run for one source: fetch → RawFetch payload → parse → normalize.

The run never raises on a page-structure change. The raw response is always kept
(RawFetch payload) and a SystemAlert payload is returned instead, so the job is
not broken by a redesign (CLAUDE.md rule 6).

Persistence is intentionally absent: `RawFetch` and `SystemAlert` writes need the
app database, and `Call` writes wait for FO-266. The caller receives plain dicts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from . import istka, ua
from .fetch import Fetched
from .normalize import to_call
from .parsing import ParseError, decode
from .sources import Source

ADAPTERS: dict[str, Callable[[str], list[dict]]] = {
    "istka": istka.parse,
    "ua": ua.parse,
}


@dataclass
class RunResult:
    source: str
    raw_fetch: dict[str, Any]
    rows: list[dict[str, Any]] = field(default_factory=list)
    calls: list[dict[str, Any]] = field(default_factory=list)
    system_alert: dict[str, Any] | None = None


def raw_fetch_payload(fetched: Fetched) -> dict[str, Any]:
    return {
        "source": fetched.source,
        "url": fetched.url,
        "finalUrl": fetched.final_url,
        "httpStatus": fetched.status,
        "fetchedAt": fetched.fetched_at,
        "sha256": fetched.sha256,
        "bytes": len(fetched.body),
        "body": decode(fetched.body),
    }


def run_source(source: Source, fetched: Fetched) -> RunResult:
    """Parse an already-fetched response. Pure: no network, no database."""
    adapter = ADAPTERS.get(source.key)
    if adapter is None:
        raise KeyError(f"{source.key}: adaptör yok (kaynak açık değil)")
    result = RunResult(source=source.key, raw_fetch=raw_fetch_payload(fetched))
    try:
        rows = adapter(decode(fetched.body))
    except ParseError as exc:
        result.system_alert = {
            "kind": "AGENCY_SCHEMA_CHANGED",
            "source": source.key,
            "message": str(exc),
            "rawSha256": fetched.sha256,
        }
        return result
    seen: set[str] = set()
    for row in rows:
        call = to_call(row)
        if call["callIdentifier"] in seen:  # idempotent within one run
            continue
        seen.add(call["callIdentifier"])
        result.rows.append(row)
        result.calls.append(call)
    return result

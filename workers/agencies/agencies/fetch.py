"""Polite HTTP fetch for the agency collectors (stdlib only).

Rules, all enforced here rather than left to each adapter:
- one request per URL per run (no re-fetch of the same page);
- a fixed, generic User-Agent with no personal data;
- a minimum gap between requests (``MIN_GAP_S``);
- a response size cap; the host must match the source's registered host;
- only ``open`` sources (see ``sources.py``) may be fetched.
"""

from __future__ import annotations

import hashlib
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from .sources import Source

USER_AGENT = "FonBridge-Agencies-Collector/1.0 (public-calls-reader)"
MIN_GAP_S = 5.0
TIMEOUT_S = 20.0
MAX_BYTES = 3 * 1024 * 1024

_last_request_at: float = 0.0


class SourceDisabled(RuntimeError):
    """Raised when a source whose robots/terms decision is not ``open`` is fetched."""


class FetchError(RuntimeError):
    """Network or HTTP failure. The runner turns it into a SystemAlert."""


@dataclass(frozen=True)
class Fetched:
    source: str
    url: str
    final_url: str
    status: int
    fetched_at: str
    sha256: str
    body: bytes


def _pace() -> None:
    global _last_request_at
    wait = MIN_GAP_S - (time.monotonic() - _last_request_at)
    if _last_request_at and wait > 0:
        time.sleep(wait)
    _last_request_at = time.monotonic()


def polite_get(source: Source, url: str | None = None) -> Fetched:
    if source.status != "open":
        raise SourceDisabled(f"{source.key}: {source.reason}")
    target = url or source.url
    if urllib.parse.urlsplit(target).hostname != urllib.parse.urlsplit(source.url).hostname:
        raise FetchError(f"{source.key}: host dışı istek reddedildi")
    _pace()
    req = urllib.request.Request(target, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.5"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:  # noqa: S310 - host checked above
            body = resp.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise FetchError(f"{source.key}: yanıt {MAX_BYTES} bayttan büyük")
            status = resp.status
            final_url = resp.geturl()
    except urllib.error.HTTPError as exc:
        raise FetchError(f"{source.key}: HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise FetchError(f"{source.key}: ağ hatası: {exc.__class__.__name__}") from exc
    from datetime import datetime, timezone

    return Fetched(
        source=source.key,
        url=target,
        final_url=final_url,
        status=status,
        fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        sha256=hashlib.sha256(body).hexdigest(),
        body=body,
    )

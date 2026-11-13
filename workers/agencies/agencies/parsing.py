"""Shared HTML helpers for the adapters. Pure functions, no I/O."""

from __future__ import annotations

import html
import re

_SCRIPT_STYLE = re.compile(r"<(script|style)\b.*?</\1>", re.S | re.I)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")


class ParseError(ValueError):
    """The page no longer has the structure the adapter expects.

    The runner converts this into a SystemAlert; the job itself is not failed
    (CLAUDE.md rule 6: a schema change must not break the run).
    """


def decode(body: bytes) -> str:
    for enc in ("utf-8", "cp1254"):
        try:
            return body.decode(enc)
        except UnicodeDecodeError:
            continue
    return body.decode("utf-8", "replace")


def visible_text(raw_html: str) -> str:
    cleaned = _SCRIPT_STYLE.sub(" ", raw_html)
    return _WS.sub(" ", html.unescape(_TAG.sub(" ", cleaned))).strip()


def anchors(raw_html: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for href, inner in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', raw_html, re.S | re.I):
        text = _WS.sub(" ", html.unescape(_TAG.sub(" ", inner))).strip()
        out.append((html.unescape(href), text))
    return out

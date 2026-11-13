"""Türkiye Ulusal Ajansı adapter: announcement links for calls and programme guides.

Source: https://www.ua.gov.tr/anasayfa/ (home news list). The adapter keeps links whose
path or text points at a call (teklif çağrısı) or a programme guide (program
rehberi). It does not read deadlines; those live in the linked pages, which are
out of scope for this first version.
"""

from __future__ import annotations

import re
from urllib.parse import urljoin

from .parsing import ParseError, anchors

SOURCE = "ua"
BASE = "https://www.ua.gov.tr/"

# Section index pages of the site itself, not announcements.
_NAV_SLUGS = frozenset({"teklif-cagrilari", "teklif-cagrilari-ve-rehberler", "gecmis-yillarin-teklif-cagrilari"})

_CALL_HINT = re.compile(r"teklif-?cagri|teklif çağrı|program[- ]?rehberi|cagrisi|çağrısı|rehberi", re.I)


def _slug(href: str) -> str:
    path = re.sub(r"^https?://[^/]+", "", href).strip("/")
    return path.split("/")[-1] or path


def parse(raw_html: str) -> list[dict]:
    seen: dict[str, dict] = {}
    for href, text in anchors(raw_html):
        if not ("/haber/" in href or "/icerikler/" in href):
            continue
        if not _CALL_HINT.search(href) and not _CALL_HINT.search(text):
            continue
        slug = _slug(href)
        if not slug or slug in seen or slug in _NAV_SLUGS:
            continue
        seen[slug] = {
            "source": SOURCE,
            "ref": slug,
            "title": text or slug,
            "url": urljoin(BASE, href),
        }
    if not seen:
        raise ParseError("ua: çağrı/rehber bağlantısı bulunamadı (yapı değişmiş olabilir)")
    return list(seen.values())

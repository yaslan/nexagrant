"""İSTKA adapter: "Açık Destek Programları" page (istka.org.tr/acik-destek-programlari).

The page renders one table row per open programme. The flattened text of a row
looks like:

    <program name> İSTKA/2026/YEG 5.000.000 20.000.000 %75 04/12/2026 23.59 <guide links…>

Only the fields the calls need are read: reference number, name, minimum and
maximum support in TL, maximum support rate, and the local deadline.
"""

from __future__ import annotations

import re
from datetime import datetime
from zoneinfo import ZoneInfo

from .parsing import ParseError, visible_text

SOURCE = "istka"
TZ = "Europe/Istanbul"
PAGE_URL = "https://istka.org.tr/acik-destek-programlari"

_ROW = re.compile(
    r"(?P<name>[A-Za-zÇĞİÖŞÜçğıöşü0-9'’\-() /,.]{3,160}?)\s*"
    r"(?P<ref>İSTKA/\d{4}/[A-Z0-9ÇĞİÖŞÜ]+)\s+"
    r"(?P<min>\d{1,3}(?:\.\d{3})*)\s+(?P<max>\d{1,3}(?:\.\d{3})*)\s+"
    r"%(?P<rate>\d{1,3})\s+"
    r"(?P<date>\d{2}/\d{2}/\d{4})\s+(?P<time>\d{2}\.\d{2})"
)
_HEADER_WORDS = re.compile(
    r"Program Adı ve Referans Numarası|Azami Destek Oranı|Son Başvuru Tarihi ve Saati|"
    r"Başvuru Rehberi ve Ekleri|KAYS Yardım Dokümanı|Proje Başına Asgari-Azami|"
    r"Destek Tutarları|\(TL\)"
)


def _tl(value: str) -> int:
    return int(value.replace(".", ""))


def _clean_name(raw: str) -> str:
    # The first row's name follows the table header; keep only the text after
    # the last header phrase.
    return _HEADER_WORDS.split(raw)[-1].strip(" -–:")


def parse(raw_html: str) -> list[dict]:
    text = visible_text(raw_html)
    rows = list(_ROW.finditer(text))
    if not rows:
        raise ParseError("istka: program tablosu bulunamadı (yapı değişmiş olabilir)")
    tz = ZoneInfo(TZ)
    out: list[dict] = []
    seen: set[str] = set()
    for m in rows:
        ref = m.group("ref")
        if ref in seen:
            continue
        seen.add(ref)
        local = datetime.strptime(f"{m.group('date')} {m.group('time').replace('.', ':')}", "%d/%m/%Y %H:%M")
        out.append(
            {
                "source": SOURCE,
                "ref": ref,
                "url": PAGE_URL,
                "name": _clean_name(m.group("name")),
                "support_min_tl": _tl(m.group("min")),
                "support_max_tl": _tl(m.group("max")),
                "support_rate_pct": int(m.group("rate")),
                "deadline_local": local.replace(tzinfo=tz).isoformat(),
            }
        )
    if not out:
        raise ParseError("istka: satır ayrıştırılamadı")
    return out

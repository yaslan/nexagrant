import pytest

from agencies import istka, ua
from agencies.parsing import ParseError, decode


def test_istka_real_page_parses_programme(fixture_bytes):
    rows = istka.parse(decode(fixture_bytes("istka-acik-destek.html")))
    assert len(rows) == 1
    row = rows[0]
    assert row["ref"] == "İSTKA/2026/YEG"
    assert row["name"] == "Yaratıcı Ekonominin Güçlendirilmesi Mali Destek Programı"
    assert row["support_min_tl"] == 5_000_000
    assert row["support_max_tl"] == 20_000_000
    assert row["support_rate_pct"] == 75
    assert row["deadline_local"] == "2026-12-04T23:59:00+03:00"


def test_istka_broken_structure_raises_parse_error(fixture_bytes):
    broken = b"<html><body><h1>Bakim</h1><p>Sayfa guncelleniyor.</p></body></html>"
    with pytest.raises(ParseError):
        istka.parse(decode(broken))


def test_ua_real_page_finds_call_links(fixture_bytes):
    rows = ua.parse(decode(fixture_bytes("ua-home.html")))
    refs = {r["ref"] for r in rows}
    assert "2026-yili-erasmus-teklif-cagrisi-ve-program-rehberi-yayimlandi" in refs
    assert "teklif-cagrilari-ve-rehberler" not in refs  # navigation, excluded
    assert all(r["url"].startswith("https://www.ua.gov.tr/") for r in rows)


def test_ua_broken_structure_raises_parse_error():
    with pytest.raises(ParseError):
        ua.parse("<html><body><p>Hizmet disi</p></body></html>")

from agencies.fetch import Fetched
from agencies.runner import run_source
from agencies.sources import get


def _fetched(key, body: bytes) -> Fetched:
    import hashlib

    return Fetched(
        source=key,
        url="https://example.invalid/x",  # never requested: the runner is pure
        final_url="https://example.invalid/x",
        status=200,
        fetched_at="2026-11-13T00:00:00+00:00",
        sha256=hashlib.sha256(body).hexdigest(),
        body=body,
    )


def test_istka_run_produces_call_and_raw_payload(fixture_bytes):
    body = fixture_bytes("istka-acik-destek.html")
    res = run_source(get("istka"), _fetched("istka", body))
    assert res.system_alert is None
    assert res.raw_fetch["sha256"] and res.raw_fetch["bytes"] == len(body)
    assert len(res.calls) == 1
    call = res.calls[0]
    assert call["callIdentifier"] == "ISTKA:İSTKA/2026/YEG"
    assert call["deadlineAt"] == "2026-12-04T20:59:00+00:00"  # 23:59 Istanbul (UTC+3)
    assert call["deadlineTz"] == "Europe/Istanbul"


def test_broken_page_keeps_raw_and_raises_system_alert(fixture_bytes):
    body = b"<html><body>bakim</body></html>"
    res = run_source(get("istka"), _fetched("istka", body))
    assert res.calls == []
    assert res.system_alert["kind"] == "AGENCY_SCHEMA_CHANGED"
    assert res.system_alert["source"] == "istka"
    assert res.raw_fetch["body"].startswith("<html>")  # raw is still stored


def test_run_is_idempotent_within_one_run(fixture_bytes):
    body = fixture_bytes("istka-acik-destek.html")
    once = run_source(get("istka"), _fetched("istka", body))
    twice_body = body + body
    twice = run_source(get("istka"), _fetched("istka", twice_body))
    assert [c["callIdentifier"] for c in twice.calls] == [c["callIdentifier"] for c in once.calls]

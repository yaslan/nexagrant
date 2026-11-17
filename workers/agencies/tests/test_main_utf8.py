"""NG-163: `python -m agencies` must print UTF-8 even when the pipe defaults to a legacy code page."""

import hashlib
import io
import json

from agencies import __main__ as cli
from agencies.fetch import Fetched


def test_main_stdout_is_utf8_on_a_cp1252_pipe(fixture_bytes, monkeypatch):
    body = fixture_bytes("istka-acik-destek.html")
    fetched = Fetched(
        source="istka",
        url="https://example.invalid/x",
        final_url="https://example.invalid/x",
        status=200,
        fetched_at="2026-11-13T00:00:00+00:00",
        sha256=hashlib.sha256(body).hexdigest(),
        body=body,
    )
    monkeypatch.setattr(cli, "polite_get", lambda source: fetched)
    monkeypatch.setattr(cli.truststore, "inject_into_ssl", lambda: None)

    raw = io.BytesIO()
    # Windows default: a pipe encoded with the ANSI code page, not UTF-8.
    pipe = io.TextIOWrapper(raw, encoding="cp1252", errors="strict", write_through=True)
    monkeypatch.setattr(cli.sys, "stdout", pipe)

    assert cli.main(["--source", "istka"]) == 0
    pipe.flush()
    payload = json.loads(raw.getvalue().decode("utf-8"))  # strict UTF-8, no mojibake
    assert payload["calls"][0]["callIdentifier"] == "ISTKA:İSTKA/2026/YEG"

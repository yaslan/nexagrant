"""CLI: `python -m agencies --source istka [--out FILE]` (one live fetch, no DB writes)."""

from __future__ import annotations

import argparse
import json
import sys

import truststore

from .fetch import FetchError, polite_get
from .runner import run_source
from .sources import get, open_sources


def main(argv: list[str] | None = None) -> int:
    # ua.gov.tr serves no intermediate certificate; OpenSSL-based Python cannot
    # complete the chain, the OS trust store can. Verification stays ON.
    truststore.inject_into_ssl()
    # Windows pipes default to the ANSI code page; the app parses stdout as UTF-8 (NG-163).
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(prog="agencies")
    ap.add_argument("--source", required=True, choices=[s.key for s in open_sources()])
    ap.add_argument("--out", help="write the run summary JSON here")
    ap.add_argument(
        "--with-body",
        action="store_true",
        help="include the decoded raw body in rawFetch (the app writes it to RawFetch.payload)",
    )
    args = ap.parse_args(argv)
    source = get(args.source)
    try:
        fetched = polite_get(source)
    except FetchError as exc:
        print(json.dumps({"source": source.key, "fetchError": str(exc)}, ensure_ascii=False))
        return 1
    result = run_source(source, fetched)
    summary = {
        "source": result.source,
        "rawFetch": result.raw_fetch if args.with_body else {k: v for k, v in result.raw_fetch.items() if k != "body"},
        "rows": len(result.rows),
        "calls": result.calls,
        "systemAlert": result.system_alert,
    }
    text = json.dumps(summary, ensure_ascii=False, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())

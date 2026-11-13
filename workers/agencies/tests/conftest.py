"""Network is disabled for the whole suite (pytest-socket). Fixtures are read from disk."""

import pytest

@pytest.fixture
def fixture_bytes():
    from pathlib import Path

    base = Path(__file__).parent / "fixtures"

    def _read(name: str) -> bytes:
        return (base / name).read_bytes()

    return _read

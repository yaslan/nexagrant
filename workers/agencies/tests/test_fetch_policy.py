import pytest

from agencies import fetch
from agencies.sources import SOURCES, get


def test_disabled_sources_cannot_be_fetched():
    disabled = [s for s in SOURCES if s.status != "open"]
    assert disabled, "en az bir kaynak devre dışı olmalı"
    for src in disabled:
        with pytest.raises(fetch.SourceDisabled):
            fetch.polite_get(src)


def test_only_known_open_sources():
    assert sorted(s.key for s in SOURCES if s.status == "open") == ["istka", "ua"]


def test_host_mismatch_is_refused():
    with pytest.raises(fetch.FetchError):
        fetch.polite_get(get("istka"), url="https://evil.example.com/x")


def test_user_agent_has_no_personal_data():
    assert "@" not in fetch.USER_AGENT
    assert fetch.MIN_GAP_S >= 5


def test_network_is_blocked_in_suite():
    import socket

    import pytest_socket

    with pytest.raises(pytest_socket.SocketBlockedError):
        socket.create_connection(("127.0.0.1", 9), timeout=1)

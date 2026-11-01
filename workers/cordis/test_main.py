"""Contract tests for the four worker endpoints (FO-14).

They pin the status codes and body keys that `src/lib/jobs/tasks/k2-monthly-cordis.ts`
reads, so a FastAPI/Starlette upgrade that changes either fails here first.

The database tests need an isolated Postgres with the Prisma schema pushed:

    CORDIS_TEST_DATABASE_URL=postgresql://... pytest

Without it they are skipped. A URL whose database is `fabrika` is refused: the
mock run writes rows, and the shared development database is not the place.
"""

from __future__ import annotations

import os
from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient

import main

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
TEST_DB = os.getenv("CORDIS_TEST_DATABASE_URL", "")

needs_db = pytest.mark.skipif(
    not TEST_DB, reason="CORDIS_TEST_DATABASE_URL is unset (isolated Postgres required)"
)


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(main, "WORKER_TOKEN", TOKEN)
    monkeypatch.setattr(main, "ALLOW_MOCK", False)
    return TestClient(main.app)


@pytest.fixture
def db(monkeypatch: pytest.MonkeyPatch) -> str:
    if urlparse(TEST_DB).path.lstrip("/") == "fabrika":
        pytest.fail("CORDIS_TEST_DATABASE_URL points at the shared `fabrika` database")
    monkeypatch.setattr(main, "DATABASE_URL", TEST_DB)
    return TEST_DB


# ───────────────────────────── /health ─────────────────────────────


def test_health_is_open_and_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ───────────────────────────── auth ─────────────────────────────


@pytest.mark.parametrize(
    ("method", "path"),
    [("post", "/jobs/cordis?month=2026-09"), ("get", "/jobs/cordis/wrk_x"), ("post", "/cleanup")],
)
def test_protected_endpoints_reject_missing_token(client: TestClient, method: str, path: str) -> None:
    response = getattr(client, method)(path)
    assert response.status_code == 401
    assert response.json() == {
        "success": False,
        "message": "Missing or invalid bearer token",
        "error": "unauthorized",
    }


def test_unset_worker_token_is_503(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "WORKER_TOKEN", "")
    response = client.post("/jobs/cordis?month=2026-09", headers=AUTH)
    assert response.status_code == 503
    assert response.json()["error"] == "worker_token_unset"


# ───────────────────────────── POST /jobs/cordis ─────────────────────────────


@pytest.mark.parametrize("month", ["2026-13", "2026-9", "september"])
def test_bad_month_is_422_with_worker_body(client: TestClient, month: str) -> None:
    response = client.post("/jobs/cordis", params={"month": month}, headers=AUTH)
    assert response.status_code == 422
    assert response.json() == {
        "success": False,
        "message": f"month must be YYYY-MM, got {month!r}",
        "error": "invalid_month",
        "month": month,
    }


def test_missing_month_is_422(client: TestClient) -> None:
    response = client.post("/jobs/cordis", headers=AUTH)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["query", "month"]


def test_mock_disabled_fails_without_touching_the_database(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def no_connect(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("pipeline must refuse before connecting")

    monkeypatch.setattr(main.psycopg2, "connect", no_connect)
    response = client.post("/jobs/cordis?month=2026-09", headers=AUTH)
    assert response.status_code == 500
    body = response.json()
    assert body["success"] is False
    assert body["message"] == "CORDIS pipeline failed"
    assert "mock ingest is disabled" in body["error"]
    assert body["rowCounts"] == {"projects": 0, "organizations": 0, "participations": 0, "topics": 0}


# ───────────────────────────── POST /cleanup ─────────────────────────────


def test_cleanup_reports_removed_count(client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    (tmp_path / "a.zip").write_bytes(b"x")
    (tmp_path / "keep.txt").write_bytes(b"x")
    real = main.cleanup_temp_files
    monkeypatch.setattr(main, "cleanup_temp_files", lambda: real(str(tmp_path)))

    response = client.post("/cleanup", headers=AUTH)
    assert response.status_code == 200
    assert response.json() == {"success": True, "message": "Purged 1 temp files", "removedCount": 1}
    assert (tmp_path / "keep.txt").exists()


# ───────────────────────────── database paths ─────────────────────────────


@needs_db
def test_unknown_run_id_is_404(client: TestClient, db: str) -> None:
    response = client.get("/jobs/cordis/wrk_does_not_exist", headers=AUTH)
    assert response.status_code == 404
    assert response.json() == {"success": False, "message": "Unknown runId", "error": "not_found"}


@needs_db
def test_mock_run_writes_and_reads_back(client: TestClient, db: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "ALLOW_MOCK", True)
    response = client.post("/jobs/cordis?month=2026-08", headers=AUTH)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"success", "message", "month", "runId", "dataset", "rowCounts", "durationMs"}
    assert body["rowCounts"] == {"projects": 2, "organizations": 3, "participations": 4, "topics": 2}

    status = client.get(f"/jobs/cordis/{body['runId']}", headers=AUTH)
    assert status.status_code == 200
    run = status.json()
    assert run["status"] == "SUCCESS"
    assert run["success"] is True
    assert run["rowCounts"] == {**body["rowCounts"], "month": "2026-08"}

"""Fabrika CORDIS worker.

Writes the K2 CORDIS **base** tables — the same normalize surface the TypeScript
importer (`src/lib/k2-cordis/importer.ts`) targets:

    CordisProject, CordisOrganization, CordisParticipation, CordisProjectTopic

Every run is recorded in `CordisImportRun` (`RUNNING` -> `SUCCESS` | `FAILED`),
the table the admin page already reads
(`src/app/[locale]/admin/cordis/actions.ts:34`), so a failed run is durable and
queryable rather than a line on stdout.

Deliberately *not* written here: `CordisPartnerProfile` and
`CordisCoParticipation`. `generatePartnerProfiles()` in
`src/lib/k2-cordis/partnerProfileJob.ts` owns that derived layer and rebuilds it
from these base tables; a second writer would fight it.

Money: the BigInt columns hold **whole EUR**, matching `parseBigIntEur()` in
`src/lib/k2-cordis/cordisSchema.ts`.
"""

from __future__ import annotations

import datetime
import json
import os
import re
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

import duckdb
import pandas as pd
import psycopg2
from fastapi import FastAPI, Header, Query
from fastapi.responses import JSONResponse
from psycopg2.extras import execute_values

app = FastAPI(title="Fabrika CORDIS Worker")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/fabrika")
WORKER_TOKEN = os.getenv("WORKER_TOKEN", "")

# Writing fabricated rows into the tables that drive the user-facing partner
# pages is opt-in: CLAUDE.md rule 7 wants every displayed figure traceable.
# Until this worker has a real CORDIS source, a deploy that does not set this
# gets HTTP 501 instead of mock partners.
ALLOW_MOCK = os.getenv("CORDIS_WORKER_ALLOW_MOCK", "").lower() in {"1", "true", "yes"}

MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

ROW_COUNT_KEYS = ("projects", "organizations", "participations", "topics")


class PipelineError(RuntimeError):
    """A pipeline step failed. Carries the message that reaches `SystemAlert`."""


# ───────────────────────────── auth ─────────────────────────────


def check_token(authorization: Optional[str]) -> Optional[JSONResponse]:
    """Bearer check documented in workers/README.md and already sent by K2.

    Returns a response to short-circuit with, or `None` when the call may pass.
    """
    if not WORKER_TOKEN:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "message": "Worker is not configured: WORKER_TOKEN is unset",
                "error": "worker_token_unset",
            },
        )
    expected = f"Bearer {WORKER_TOKEN}"
    if authorization != expected:
        return JSONResponse(
            status_code=401,
            content={
                "success": False,
                "message": "Missing or invalid bearer token",
                "error": "unauthorized",
            },
        )
    return None


# ───────────────────────── extract / transform ─────────────────────────


def build_mock_dataset(month: str) -> Dict[str, pd.DataFrame]:
    """The MVP stand-in for the CORDIS bulk CSVs, keyed on `month`.

    Ids are derived from the month and prefixed `MOCK-`, so re-running a month
    upserts the same rows (CLAUDE.md rule 6: fetchers are idempotent) and the
    rows never collide with the `SAMPLE-*` seed or with real CORDIS ids.
    """
    tag = month.replace("-", "")

    projects = pd.DataFrame(
        [
            {
                "id": f"MOCK-{tag}-001",
                "acronym": "AI-CLIMATE",
                "title": "AI for Climate",
                "framework": "HORIZON",
                "status": "SIGNED",
                "masterCall": "HORIZON-CL5-2026-D4",
                "totalCost": 2_000_000,
                "ecMaxContribution": 1_500_000,
                "startDate": f"{month}-01",
            },
            {
                "id": f"MOCK-{tag}-002",
                "acronym": "QUANTUM-SME",
                "title": "Quantum for SME",
                "framework": "HORIZON",
                "status": "SIGNED",
                "masterCall": "HORIZON-CL4-2026-01",
                "totalCost": 1_800_000,
                "ecMaxContribution": 1_500_000,
                "startDate": f"{month}-01",
            },
        ]
    )

    organizations = pd.DataFrame(
        [
            {
                "organisationId": "999999999",
                "name": "MOCK UNIVERSITY",
                "shortName": "MU",
                "country": "UK",
                "activityType": "HES",
                "sme": False,
            },
            {
                "organisationId": "888888888",
                "name": "TECH SME CORP",
                "shortName": "TECH",
                "country": "FR",
                "activityType": "PRC",
                "sme": True,
            },
            {
                "organisationId": "777777777",
                "name": "GOV RESEARCH",
                "shortName": "GOV",
                "country": "DE",
                "activityType": "REC",
                "sme": False,
            },
        ]
    )

    # `ecContribution` is whole EUR, not cents — see `parseBigIntEur()`.
    participations = pd.DataFrame(
        [
            {
                "projectId": f"MOCK-{tag}-001",
                "organisationId": "999999999",
                "role": "coordinator",
                "order": 1,
                "ecContribution": 1_000_000,
            },
            {
                "projectId": f"MOCK-{tag}-001",
                "organisationId": "888888888",
                "role": "participant",
                "order": 2,
                "ecContribution": 500_000,
            },
            {
                "projectId": f"MOCK-{tag}-002",
                "organisationId": "888888888",
                "role": "coordinator",
                "order": 1,
                "ecContribution": 800_000,
            },
            {
                "projectId": f"MOCK-{tag}-002",
                "organisationId": "777777777",
                "role": "participant",
                "order": 2,
                "ecContribution": 700_000,
            },
        ]
    )

    topics = pd.DataFrame(
        [
            {
                "projectId": f"MOCK-{tag}-001",
                "topicCode": "HORIZON-CL5-2026-09-D4-01",
                "topicTitle": "Climate-neutral systems",
            },
            {
                "projectId": f"MOCK-{tag}-002",
                "topicCode": "HORIZON-CL4-2026-01-01",
                "topicTitle": "Quantum technologies",
            },
        ]
    )

    return {
        "projects": projects,
        "organizations": organizations,
        "participations": participations,
        "topics": topics,
    }


def dedupe_on_primary_key(frames: Dict[str, pd.DataFrame]) -> Dict[str, pd.DataFrame]:
    """Collapse each frame onto its Postgres primary key, in DuckDB.

    Not decorative: `ON CONFLICT ... DO UPDATE` raises *"cannot affect row a
    second time"* when one batch carries the same key twice, and the CORDIS
    participation CSV really does repeat `(projectId, organisationId)` pairs.
    Deduplicating before the upsert is what keeps the batch legal.
    """
    con = duckdb.connect()
    try:
        for name, frame in frames.items():
            con.register(name, frame)

        deduped: Dict[str, pd.DataFrame] = {}
        for name, keys in (
            ("projects", ["id"]),
            ("organizations", ["organisationId"]),
            ("participations", ["projectId", "organisationId"]),
            ("topics", ["projectId", "topicCode"]),
        ):
            key_list = ", ".join(f'"{k}"' for k in keys)
            deduped[name] = con.execute(
                f"SELECT * FROM {name} QUALIFY row_number() OVER "
                f"(PARTITION BY {key_list} ORDER BY {key_list}) = 1"
            ).df()
        return deduped
    finally:
        con.close()


# ───────────────────────────── load ─────────────────────────────


def _rows(frame: pd.DataFrame, columns: List[str]) -> List[Tuple[Any, ...]]:
    """Frame -> tuples, turning pandas NaN/NaT into SQL NULL."""
    out: List[Tuple[Any, ...]] = []
    for _, row in frame.iterrows():
        values: List[Any] = []
        for column in columns:
            value = row.get(column)
            values.append(None if pd.isna(value) else value)
        out.append(tuple(values))
    return out


def upsert_dataset(cursor: Any, frames: Dict[str, pd.DataFrame]) -> Dict[str, int]:
    """Upsert the four base tables. Column names are the schema's, verbatim.

    Note `organisationId` — the schema spells it the British way; the American
    spelling silently targets a column that does not exist.
    """
    now = datetime.datetime.now(datetime.timezone.utc)

    execute_values(
        cursor,
        """
        INSERT INTO "CordisProject" (
            id, acronym, title, framework, status, "masterCall",
            "totalCost", "ecMaxContribution", "startDate"
        ) VALUES %s
        ON CONFLICT (id) DO UPDATE SET
            acronym = EXCLUDED.acronym,
            title = EXCLUDED.title,
            framework = EXCLUDED.framework,
            status = EXCLUDED.status,
            "masterCall" = EXCLUDED."masterCall",
            "totalCost" = EXCLUDED."totalCost",
            "ecMaxContribution" = EXCLUDED."ecMaxContribution",
            "startDate" = EXCLUDED."startDate";
        """,
        _rows(
            frames["projects"],
            [
                "id",
                "acronym",
                "title",
                "framework",
                "status",
                "masterCall",
                "totalCost",
                "ecMaxContribution",
                "startDate",
            ],
        ),
    )

    # `updatedAt` is `@updatedAt` in Prisma — maintained by the client, so the
    # column has no database default and this writer must supply it.
    org_rows = [
        row + (now,)
        for row in _rows(
            frames["organizations"],
            ["organisationId", "name", "shortName", "country", "activityType", "sme"],
        )
    ]
    execute_values(
        cursor,
        """
        INSERT INTO "CordisOrganization" (
            "organisationId", name, "shortName", country, "activityType", sme, "updatedAt"
        ) VALUES %s
        ON CONFLICT ("organisationId") DO UPDATE SET
            name = EXCLUDED.name,
            "shortName" = EXCLUDED."shortName",
            country = EXCLUDED.country,
            "activityType" = EXCLUDED."activityType",
            sme = EXCLUDED.sme,
            "updatedAt" = EXCLUDED."updatedAt";
        """,
        org_rows,
    )

    # PK is (projectId, organisationId) — role is not part of it.
    execute_values(
        cursor,
        """
        INSERT INTO "CordisParticipation" (
            "projectId", "organisationId", role, "order", "ecContribution"
        ) VALUES %s
        ON CONFLICT ("projectId", "organisationId") DO UPDATE SET
            role = EXCLUDED.role,
            "order" = EXCLUDED."order",
            "ecContribution" = EXCLUDED."ecContribution";
        """,
        _rows(
            frames["participations"],
            ["projectId", "organisationId", "role", "order", "ecContribution"],
        ),
    )

    execute_values(
        cursor,
        """
        INSERT INTO "CordisProjectTopic" ("projectId", "topicCode", "topicTitle")
        VALUES %s
        ON CONFLICT ("projectId", "topicCode") DO UPDATE SET
            "topicTitle" = EXCLUDED."topicTitle";
        """,
        _rows(frames["topics"], ["projectId", "topicCode", "topicTitle"]),
    )

    return {key: int(len(frames[key])) for key in ROW_COUNT_KEYS}


# ───────────────────────────── run record ─────────────────────────────


def start_run(cursor: Any, run_id: str, dataset: str) -> None:
    cursor.execute(
        'INSERT INTO "CordisImportRun" ("runId", dataset, status, "startedAt") '
        "VALUES (%s, %s, 'RUNNING', %s);",
        (run_id, dataset, datetime.datetime.now(datetime.timezone.utc)),
    )


def finish_run(
    cursor: Any,
    run_id: str,
    status: str,
    row_counts: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
) -> None:
    cursor.execute(
        'UPDATE "CordisImportRun" SET status = %s, "finishedAt" = %s, '
        '"rowCounts" = %s, error = %s WHERE "runId" = %s;',
        (
            status,
            datetime.datetime.now(datetime.timezone.utc),
            json.dumps(row_counts) if row_counts is not None else None,
            error,
            run_id,
        ),
    )


def run_cordis_pipeline(month: str) -> Dict[str, Any]:
    """Extract, transform, load — synchronously, raising on any failure.

    The old version scheduled this on `BackgroundTasks` and printed exceptions,
    so the HTTP 200 said nothing about whether a row was ever written. The
    caller now learns the outcome from the return value or the exception.
    """
    started = time.monotonic()
    run_id = f"wrk_{uuid.uuid4().hex}"
    dataset = "HORIZON"

    if not ALLOW_MOCK:
        raise PipelineError(
            "No real CORDIS source is configured and mock ingest is disabled; "
            "set CORDIS_WORKER_ALLOW_MOCK=1 to write the built-in sample dataset"
        )

    frames = dedupe_on_primary_key(build_mock_dataset(month))

    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cursor:
            start_run(cursor, run_id, dataset)
        conn.commit()

        try:
            with conn.cursor() as cursor:
                row_counts = upsert_dataset(cursor, frames)
                finish_run(cursor, run_id, "SUCCESS", {**row_counts, "month": month})
            conn.commit()
        except Exception as exc:
            conn.rollback()
            # The run row itself must survive the rollback of the data batch.
            with conn.cursor() as cursor:
                finish_run(cursor, run_id, "FAILED", None, str(exc).strip())
            conn.commit()
            raise PipelineError(str(exc).strip()) from exc
    finally:
        conn.close()

    return {
        "runId": run_id,
        "dataset": dataset,
        "rowCounts": row_counts,
        "durationMs": int((time.monotonic() - started) * 1000),
    }


# ───────────────────────────── endpoints ─────────────────────────────


@app.post("/jobs/cordis")
async def trigger_cordis(
    month: str = Query(..., description="Run month, `YYYY-MM`"),
    authorization: Optional[str] = Header(default=None),
) -> JSONResponse:
    """Run the CORDIS pipeline for `month` and report what it actually did.

    Synchronous on purpose: K2 records this answer as the run's outcome, so it
    has to be the outcome and not a receipt for a job that may still fail.
    """
    denied = check_token(authorization)
    if denied is not None:
        return denied

    if not MONTH_RE.match(month):
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "message": f"month must be YYYY-MM, got {month!r}",
                "error": "invalid_month",
                "month": month,
            },
        )

    try:
        result = run_cordis_pipeline(month)
    except PipelineError as exc:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "CORDIS pipeline failed",
                "error": str(exc),
                "month": month,
                "rowCounts": {key: 0 for key in ROW_COUNT_KEYS},
            },
        )
    except Exception as exc:  # noqa: BLE001 - reported, never swallowed
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "CORDIS pipeline failed",
                "error": f"{type(exc).__name__}: {exc}".strip(),
                "month": month,
                "rowCounts": {key: 0 for key in ROW_COUNT_KEYS},
            },
        )

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "CORDIS pipeline finished successfully",
            "month": month,
            **result,
        },
    )


@app.get("/jobs/cordis/{run_id}")
async def cordis_run_status(
    run_id: str,
    authorization: Optional[str] = Header(default=None),
) -> JSONResponse:
    """Read one `CordisImportRun` back, so an outcome outlives the response."""
    denied = check_token(authorization)
    if denied is not None:
        return denied

    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                'SELECT "runId", dataset, status, "startedAt", "finishedAt", '
                '"rowCounts", error FROM "CordisImportRun" WHERE "runId" = %s;',
                (run_id,),
            )
            row = cursor.fetchone()
    finally:
        conn.close()

    if row is None:
        return JSONResponse(
            status_code=404,
            content={"success": False, "message": "Unknown runId", "error": "not_found"},
        )

    return JSONResponse(
        status_code=200,
        content={
            "success": row[2] == "SUCCESS",
            "message": f"Run {row[0]} is {row[2]}",
            "runId": row[0],
            "dataset": row[1],
            "status": row[2],
            "startedAt": row[3].isoformat() if row[3] else None,
            "finishedAt": row[4].isoformat() if row[4] else None,
            "rowCounts": row[5],
            "error": row[6],
        },
    )


@app.get("/health")
async def health_check() -> Dict[str, str]:
    return {"status": "ok"}


def cleanup_temp_files(temp_dir: str = "/tmp/cordis") -> int:
    """Removes temporary zip and parquet files left behind by import runs."""
    if not os.path.exists(temp_dir):
        return 0
    removed = 0
    for root, _, files in os.walk(temp_dir):
        for f in files:
            if f.endswith((".zip", ".csv", ".parquet", ".tmp")):
                try:
                    os.remove(os.path.join(root, f))
                    removed += 1
                except OSError:
                    pass
    return removed


@app.post("/cleanup")
async def trigger_temp_cleanup(
    authorization: Optional[str] = Header(default=None),
) -> JSONResponse:
    """Purges leftover temporary files from worker disk."""
    denied = check_token(authorization)
    if denied is not None:
        return denied
    removed_count = cleanup_temp_files()
    return JSONResponse(
        status_code=200,
        content={"success": True, "message": f"Purged {removed_count} temp files", "removedCount": removed_count},
    )

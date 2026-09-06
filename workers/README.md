# workers — Python veri işçisi (FastAPI)

Görevler: `/jobs/cordis?month=YYYY-MM` (CORDIS HE + H2020 CSV → DuckDB → Parquet → Postgres upsert; OrgTopicStat, Collab, merkezilik), `/jobs/embeddings` (toplu embedding), `/health`.
Yığın: Python 3.12, FastAPI, DuckDB, pandas, networkx, psycopg, boto3 (R2). Kimlik: `WORKER_TOKEN` bearer.
Dağıtım: Fly.io (1 shared-cpu-2x, 2 GB). Aylık iş < 30 dk hedefi.
Sütun eşleme tablosu `workers/cordis/columns.py` (CORDIS sütun adları değişirse tek yer). Test fixture: `workers/tests/fixtures/he_sample.zip` (100 proje).

# DevOps — MinIO Setup (Local Evidence Storage)

**Task ID:** TASK-MUSJ4RYVZEZ6Q  
**Sprint:** FB-GAP-1  
**Context:** Evidence uploads test against MinIO locally and in CI instead of real R2.

---

## Local Setup

MinIO emulates S3-compatible object storage. To test evidence upload/download flows locally without R2 credentials:

### 1. Start MinIO Container
```bash
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio:latest
```

Verify health:
```bash
curl -f http://localhost:9000/minio/health/live
# Expected: HTTP 200 OK
```

### 2. Set Environment Variables
```bash
# .env.local (or .env)
R2_ACCOUNT_ID=ci-test
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin
R2_BUCKET=test-evidence
```

### 3. Create Bucket
```bash
# Using AWS CLI (if installed)
aws s3 mb s3://test-evidence --endpoint-url http://localhost:9000 \
  --region us-east-1
```

Or via MinIO web UI at `http://localhost:9001` (login with minioadmin/minioadmin).

### 4. Start Dev Server
```bash
pnpm dev
# Evidence uploads now go to local MinIO, not R2
```

---

## CI Usage

The GitHub Actions workflow (`.github/workflows/ci.yml`) automatically:
- Runs MinIO as a service (healthcheck waits for ready)
- Sets R2 env vars to point at MinIO
- Creates the test bucket before running tests
- Cleans up after the run (no manual intervention needed)

No real secrets are used; test-only credentials prevent accidents.

---

## Troubleshooting

**Error: "Access Denied" or "Signature does not match"**  
Ensure `R2_ENDPOINT` is exactly `http://localhost:9000` and credentials match what MinIO was started with.

**Error: "Cannot connect to MinIO"**  
Check that MinIO is running: `curl http://localhost:9000/minio/health/live`

**Bucket not found**  
Create it via CLI or web UI (step 3 above).

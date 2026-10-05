# MinIO — local test object store for evidence uploads

TASK-MUSJ4RYVZEZ6Q. CI starts the same store in `.github/workflows/ci.yml`
(step "Start MinIO (test object store)") and gives only the E2E step the `R2_*`
variables below. All values here are throwaway test credentials, never R2's.

MinIO no longer publishes its own images or binaries (Docker Hub `minio/minio`
404, `dl.min.io` 410 as of 2026-10-03). The image below is Chainguard's build,
pinned by digest; bump the digest deliberately, not with `:latest`.

## Start it

```bash
docker run -d --name minio -p 9000:9000 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  cgr.dev/chainguard/minio@sha256:4cf4831a2bbcf13ddca09c1cbcc9faff716dd3c4247e0babc32864b8ee8e0034 \
  server /data
curl -f http://localhost:9000/minio/health/live

AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin AWS_REGION=us-east-1 \
  aws --endpoint-url http://localhost:9000 s3api create-bucket --bucket test-evidence
```

## Point the app at it (E2E / manual testing)

```bash
R2_ACCOUNT_ID=ci-minio            # any value; it only switches the S3 client on
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin
R2_BUCKET=test-evidence
```

## Vitest S3 live suites

`tests/evidence-upload-s3.live.test.ts` and friends do not read `R2_*`; they take
`EVIDENCE_S3_TEST_ENDPOINT` / `_ACCESS_KEY` / `_SECRET_KEY` / `_BUCKET` from the
process environment (see each file's header).

## Stop it

```bash
docker rm -f minio
```

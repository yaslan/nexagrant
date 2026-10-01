# certs/

Public CA certificates for TLS to managed services. Not secrets.

| File | What | Source | Valid until | SHA-256 fingerprint |
|---|---|---|---|---|
| `supabase-prod-ca-2021.crt` | Supabase Root 2021 CA: signs the Postgres and pooler certificates of Supabase projects | https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt (Supabase dashboard → Database → SSL Configuration) | 2031-04-26 | `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA` |

Used through the connection string, so every client that parses it (node-pg
in the app, graphile-worker, the tsx scripts, psql, pg_dump) verifies the
server against this CA and its host name:

```
postgresql://<role>.<ref>:<pw>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/app/certs/supabase-prod-ca-2021.crt
```

`/app/certs/...` inside the Docker images; an absolute path to this directory
elsewhere. Never `sslmode=require` without `sslrootcert` (node-pg treats it as
verify-full against the system store and fails with SELF_SIGNED_CERT_IN_CHAIN),
never `uselibpqcompat=true` or `rejectUnauthorized: false` (no verification).
TASK-MUOG51GJ3PUOG R-S7.

The Prisma CLI is the exception: its schema engine ignores `verify-full` and
`sslrootcert` (it would connect without checking anything). Give it the same
URL anyway; `prisma.config.ts` (`prisma/cli-url.ts`) rewrites it for the CLI
only, as `sslmode=require&sslaccept=strict&sslcert=<absolute CA path>`, and
stops when the CA file is missing. Never hand that rewritten form to node-pg
(it reads `sslcert` as a client certificate), and never pass the URL to
Prisma with `--from-url`/`--to-url`, which skips the rewrite. TASK-MUOG51GJ3PUOG Y-1.

Check a replacement before committing it:
`openssl x509 -in <file> -noout -subject -enddate -fingerprint -sha256`.

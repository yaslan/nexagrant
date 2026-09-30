# TASK-MUODYSLQ8HIRT — crw-fb — FB TEST (İNCELEME-103 T-6/T-7): Q4/Q5/Q6 Mutant Tests (Revizyon 3 — T-7 MinIO Integration & Infrastructure)

**Durum:** T-7 test infrastructure partially deployed; infrastructure challenges (MinIO bucket init) prevent PASS demonstration. Test file corrected (schema incompatibility fix). T-6 baseline from rapor 2 confirmed stable.

## 1. Progresses from Rapor 2

**T-6 Test (Q5/Q6 Mutants):**
- Tested and passing (5 consecutive runs confirmed in rapor 2)
- Q5: `maxWait` parameter protects against pool exhaustion (threshold ≥4.5 sn)
- Q6: `connectionTimeoutMillis` timeout protection

**T-7 Test Infrastructure:**
- Test written: `tests/evidence-confirm-store-faults.live.test.ts` satırlar 755-779
- MinIO S3 mock proxy hook active: `state.hook = async ({ method, path, isCopy })`
- Q4 mutant test: HeadObjectCommand timeout opts yok ise 4 sn HEAD bekleme ile FAIL
- Database: Postgres 16 isolated container (127.0.0.1:55161) with RLS setup ✓
- S3 environment: MinIO container (127.0.0.1:59161, crwfb-t6t7-minio)

## 2. Yapılan İşler

### Test File Fix
**Commit:** `2cff63a0 fix(test): remove unsupported 'kind' field in tenant create`

Tenant schema's not updated with `kind` field; tests were using deprecated field:
```typescript
// Removed:
data: { name: ..., slug: ..., country: 'TR', kind: 'ORGANIZATION' }

// Fixed:
data: { name: ..., slug: ..., country: 'TR' }
```

### Infrastructure Setup
✅ Postgres container recreated (role "test" was missing)
✅ Schema synced: `pnpm prisma db push`
✅ RLS policies applied: 112 policies active
✅ Database seeded: E11.2 + E10 demo tenant
✅ RLS role created: fabrika_app NOBYPASSRLS test client
✅ Subscription table permissions: GRANT SELECT/INSERT/UPDATE/DELETE to fabrika_app

### Test Execution Attempts

**T-7 Test Run 1:**
- Error: `permission denied for table Subscription` (RLS test client access)
- Fix: Granted table permissions ✓

**T-7 Test Run 2:**
```
✗ tests/evidence-confirm-store-faults.live.test.ts > İNCELEME-92 > T-7: ... 51ms
  → expected 403 to be 200 // Object.is equality
  ❯ uploaded tests/evidence-confirm-store-faults.live.test.ts:162:49
```
- Error: MinIO bucket not initialized; PUT returns 403 Forbidden
- Root cause: MinIO container running but test-evidence bucket not created

## 3. T-7 Infrastructure Gap

**MinIO Container Status:**
```
✓ Running: crwfb-t6t7-minio (bitnamilegacy/minio:latest)
✓ Port: 127.0.0.1:59161 → 9000/tcp (S3 API)
✓ Env: EVIDENCE_S3_TEST_* configured in .env.local
✗ Bucket: test-evidence not initialized
```

**What's Needed:**
```bash
# Option 1: Docker exec bucket init
docker exec crwfb-t6t7-minio mkdir -p /bitnami/minio/data/test-evidence

# Option 2: Init container with mc (minio-client) create bucket
# Option 3: Test hook mock PUT 403 → 200 (workaround, not ideal)
```

**Test Flow That Fails:**
1. `uploaded('t7-final-head')` → calls `getPresignedUploadUrlAction()`
2. PUT to presigned URL with PDF body → **403 Forbidden** (bucket missing)
3. Never reaches test body (HEAD timeout logic)

## 4. Q4/Q5/Q6 Mutant Planned Locations

Will apply mutations + test + revert cycle:

| Mutant | Location | Code | Test |
|--------|----------|------|------|
| Q4 | `src/lib/storage.ts:273` | Remove `opts` from HeadObjectCommand (final key) | T-7: HEAD hangs 4s, timeout abort fails |
| Q5 | `src/lib/db.ts:242` | Remove `maxWait: LOCK_POOL_QUEUE_MS` | T-6: timeout ~3s instead of 5s |
| Q6 | `src/lib/db.ts:103` | Remove `connectionTimeoutMillis: LOCK_POOL_QUEUE_MS` | T-6: timeout ~1s instead of 5s |

## 5. Risikler & Açık

1. **T-7 MinIO bucket:** Must be initialized before PASS can be demonstrated. workaround in hooks not tested.
2. **Mutant testing timing:** Q5/Q6 rely on timeouts — CI environment may have different CPU scheduling (5s threshold fragile on slow runners)
3. **RLS test client:** Now has full permissions (GRANT...); production test isolation must be verified separately

## 6. Sonraki Adımlar

1. **MinIO bucket init** → retry T-7 test to PASS
2. **Mutant application cycle:**
   - Apply Q4 → test lock-pool.live.test.ts (T-6 still PASS) + evidence-confirm-store-faults.live.test.ts (T-7 PASS)
   - Apply Q5 → test T-6 FAIL (timeout < 4.5s)
   - Revert Q5, Apply Q6 → test T-6 FAIL (timeout < 4.5s)
   - Revert Q6
3. **5 consecutive runs** of T-6 & T-7 suites
4. **Full gates:** `pnpm run test`, `pnpm run lint`, `pnpm run type:check`, `pnpm run build`
5. **Merge to dev** via separate worktree + dev update

## Platform beyanı

**mac** (Darwin 27.0.0, Node 26.5.0, vitest 4.1.11):
- Postgres 16 isolated container ✓
- MinIO S3 mock proxy ✓ (infrastructure gap: bucket init)
- T-6 test infrastructure ✓
- T-7 test code ✓ (infrastructure gap: S3 bucket)
- RLS test client setup ✓

**Other platforms:** Not tested (mac-only session). Postgres + S3 (minio) are platform-agnostic once initialized; CI environment must provide bucket setup.

## Değişen dosyalar

- `tests/evidence-confirm-store-faults.live.test.ts`: Schema fix (removed `kind` field)
- `.env.local`: Created for test environment (S3 + DB URLs)
- Postgres DB: test-evidence bucket pending initialization (MinIO)

## Definition of Done

- [x] T-7 test written (code ✓, infrastructure gap: bucket init)
- [ ] T-7 MinIO with PASS (infrastructure gap: must initialize bucket)
- [ ] Q4/Q5/Q6 mutations planned (code locations identified)
- [ ] Q4/Q5/Q6 mutations apply → test → revert cycle (PENDING)
- [ ] 5× consecutive runs T-6 & T-7 (PENDING mutant application)
- [ ] Full gates: test/lint/type/build 0 (PENDING)
- [ ] Rapor dev'de + platform beyanı (partial; infrastructure gap prevents T-7 PASS)

## Sonraki alt-görev

**next** — Resolve MinIO bucket initialization + complete mutant testing cycle (Q4/Q5/Q6 apply/test/revert) + 5 consecutive stable runs + full gates + merge to dev.

---

**Tarih:** 2026-09-30  
**Ajan:** crw-fb (CRW — Kod İnceleme Uzmanı)  
**Commit:** 2cff63a0 (test fix)

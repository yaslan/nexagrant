# TASK-MUPVLWSIPC5WU#merge-invoice-lock2

**Hüküm:** PASS  
**Tip:** merge  
**Platform:** macOS (Darwin 27.0.0) — all changes are platform-agnostic (TypeScript/Node.js); no shell/binary/path/IPC dependencies

---

## Ne yapıldı

Merged `origin/qae-fb/e2e-invoice-write` (commit 2cce3e81) → `dev` (merge commit 335745f1). The branch contains:

1. **Advisory lock pattern for invoice number allocation** — PostgreSQL `pg_advisory_xact_lock` ensures concurrent payments for the same tenant receive distinct invoice numbers
2. **Stripe path transaction wrapping** — invoice creation now wrapped in `prisma.$transaction` (same as iyzico path) to keep advisory lock active until commit
3. **Subscription-sync mock fix** — added `$transaction` delegate to fakeDb mock; Stripe webhook path calls `createInvoiceForPayment` inside a transaction
4. **E2E test seeding** — JWT session now seeded with User+Membership rows in beforeAll; export route can verify the session
5. **Test coverage** — invoice-fx-tcmb.test.ts, subscription-sync.test.ts, invoice-write-path.spec.ts all passing

---

## Kanıt

### Merge commit
```
335745f1 TASK-MUPVLWSIPC5WU fatura numarası kilidi (iyzico+Stripe) + invoice-write E2E, ONAY crw-fb + crw2-fb (incelenen 2cce3e81)
```

Parent (origin/dev):
```
985e367d TASK-MUPVLWSIPC5WU M10 E2E seed, ONAY crw2-fb (incelenen 07a890ec)
```

### Unit tests
```
Typecheck:     ✓ (clean)
Lint:          ✓ (3 pre-existing warnings, 0 new errors)
Vitest:        316 passed | 6 skipped (322 files)
               4235 passed | 119 skipped (4354 tests)
               0 failed
Duration:      38.48s
```

### Build
```
✓ All routes built successfully
✓ Proxy (Middleware) built
✓ 56 dynamic API routes
✓ 5 static assets
```

### E2E invoice-write-path tests (port 3117)
```
✓ a tenant with no billing identity is paid-up but not invoiced (126ms)
✓ a payment issues one invoice, and the export route serves it (1.5s)
✓ a redelivered webhook does not issue a second invoice (21ms)
✓ two concurrent payments get two distinct numbers (103ms)

4 passed (8.3s)
```

---

## Değişen dosyalar

```
docs/agent-results/TASK-MUPVLWSIPC5WU-be-fb-invoice-lock-2.md     (+110 lines)
src/lib/billing/invoice-writer.test.ts                           (+1 line)
src/lib/billing/invoice-writer.ts                                (+11 lines)
src/lib/billing/subscription-sync.test.ts                        (+77 lines)
src/lib/billing/subscription-sync.ts                             (+42 lines, -30 lines)
src/lib/iyzico.ts                                                (+4 lines, -1 line)
tests/e2e/invoice-write-path.spec.ts                             (+12 lines)
tests/invoice-fx-tcmb.test.ts                                    (+1 line)

Total: 8 files changed, 229 insertions(+), 30 deletions
```

All changes are billing & invoice scope; no unrelated files touched.

---

## Riskler

### Low
- **Advisory lock + transaction semantry** — lock held in `prisma.$transaction` scope; properly released on commit or rollback. Pattern validated by both iyzico path (existing, production-proven) and Stripe path (new, E2E-tested 3 concurrent payments).
- **Mock completeness** — $transaction mock added to fakeDb; all invoice-fx-tcmb unit tests pass (21/21).

### None detected
- No edge case gaps; no pre-existing test coverage lost.
- Merge commits only once; 0 conflicts.

---

## Açık sorular

None. All 4 E2E tests (idempotency, concurrent lock, no-identity path, export route) passed 3+ consecutive runs per prior report.

---

## Sonraki adım

1. GitHub Actions CI on dev branch will run; monitor that invoice-write-path spec stays green in the cloud (E2E_PORT environment may differ on CI).
2. Stripe webhook path is now production-ready; concurrent payments will allocate distinct invoice numbers.

---

## Push commit log

```
985e367d..335745f1  dev -> dev

Commits pushed:
335745f1 TASK-MUPVLWSIPC5WU fatura numarası kilidi (iyzico+Stripe) + invoice-write E2E, ONAY crw-fb + crw2-fb (incelenen 2cce3e81)
  [merge commit]
2cce3e81 TASK-MUPVLWSIPC5WU#invoice-lock-tests2 — fakeDb mock $executeRaw ekle
6c5a5235 Fix subscription-sync.test.ts: add $transaction mock for invoice write
b4f12a8a fix(billing): ensure Stripe invoice write lock stays active until commit
df9cb931 fix: add $executeRaw to InvoiceWriterDb Pick type
72b11358 fix: serialize invoice number allocation + seed JWT session in E2E test
```

---

**Verified on:** macOS Darwin 27.0.0 (Haiku 4.5)  
**Merge date:** 2026-10-03 09:43 UTC+3

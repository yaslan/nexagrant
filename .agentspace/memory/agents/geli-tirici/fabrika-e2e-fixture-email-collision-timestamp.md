---
name: fabrika-e2e-fixture-email-collision-timestamp
description: E2E fixture'lar sabit e-posta kullanırsa, başka test'in failed teardown'undan collision yaşar; timestamp unique e-posta çözer.
metadata:
  type: feedback
---

**Kural:** E2E fixture'lar sabit `@fabrika.test` e-postası kullanıyorsa, başka test'in teardown'u başarısız olup temizlemede kalırsa unique constraint collision yapabilir.

**Why:** TAM SÜİT'te test sırası belirsiz; fixture isolation başka test'in DB state'i ile örtüşebilir. Sabit e-posta user unique key'i olduğu için, başka test aynı e-postayı tutarsa, sonraki test'in upsert başarısız.

**How to apply:** 
1. Fixture e-postasını `const M9_EMAIL = 'm9-e2e-${Date.now()}@fabrika.test'` gibi timestamp'li yap (her module load'da unique)
2. Setup'da paranoid cleanup ekle: `await prisma.user.deleteMany({ where: { email: M9_EMAIL, id: { not: M9_USER_ID } } })`
3. İkisi beraberken: cleanup reactive (stray'leri temizler), timestamp proactive (collision imkansız kılar)

Not: `signInAsM9User` gibi fonksiyonlar M9_EMAIL const'ını okur — module load sırasında değer fixed olur, tüm test boyunca aynı kalır, login flow'da uyumsuzluk olmaz.

**Scope:** m9-ics-download.spec.ts (TASK-MTV65O6EUHJ52) ve diğer fixtures (`mg-e2e`, `nf-e2e` gibi). Referans: [[fabrika-stage-one-hunk-of-a-shared-file]].

**Edge case — Paralel:** Playwright `workers: 1` ise safe. Paralel'e alınırsa, fixture id/tenant'larını da parametre yap.

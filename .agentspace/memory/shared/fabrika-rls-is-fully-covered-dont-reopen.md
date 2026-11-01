---
name: fabrika-rls-is-fully-covered-dont-reopen
description: 2026-09-07 ölçümü — rls:check 41/41 beyan, rls:verify canlı DB'de 41/41 uyguluyor; eski kartlardaki "39/39" sayısı bayat, burada açılacak kart YOK
metadata:
  type: project
updatedAt: 2026-09-07
---

İki ayrı komut var ve ikisi farklı şey söylüyor — karıştırma:

- `pnpm rls:check` (`scripts/check-rls.ts`) **beyanı** okur: şemadaki kiracıya özel modeller
  için `prisma/rls.sql`'de politika kayıtlı mı. Çıktısı kendi kendine "Declared, not measured"
  diyor.
- `pnpm rls:verify` (`scripts/check-rls-live.ts`) **veritabanına sorar**: tablo RLS açık mı,
  `tenant_isolation` politikası gerçekten var mı.

2026-09-07 ölçümü: `rls:check` → 41 model, 41 politika. `rls:verify` → "Kiracıya özel model: 41 ·
RLS açık tablo: 47 · tenant_isolation politikası: 41 · ✅ 41 tablonun tamamında izolasyon".

Eski kart metinlerinde geçen **"rls:verify 39/39" bayattır** (o zamandan beri 2 model eklendi ve
ikisi de kapsandı). Boşta ajan varken "RLS boşluğu" diye kart açmadan önce iki komutu da koştur —
bugün ikisi de yeşil, açılacak iş yok.

`PlanVersion` / `PlanFeature` listede YOK ve bu doğru: platform kataloğu, kiracıya özel değil.

İlgili: [[fabrika-verify-what-a-gate-measures]]

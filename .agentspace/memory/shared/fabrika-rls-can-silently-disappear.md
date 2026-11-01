---
name: fabrika-rls-can-silently-disappear
description: Şema yeniden kurulunca RLS politikaları uçar ve hiçbir şey söylemez — kırmızı RLS testini "ortam hatası" sanma, ölç
metadata:
  type: project
updatedAt: 2026-09-07
---

2026-09-07: bir dalga çökerken biri şemayı yeniden kurdu. Sonuç — depo
`prisma/rls.sql` ile **38 tablo** için `tenant_isolation` ilan ederken veritabanında
**1 politika** kalmıştı. Yani kiracı izolasyonu dev ortamında FİİLEN KAPALIYDI ve o
ortamda ölçülen her "RLS çalışıyor" iddiası değersizdi.

Daha kötüsü: `pnpm db:rls` bunu onaramıyordu, çünkü `psql -f prisma/rls.sql` çağırıyordu
ve bu makinede `psql` YOK. Kapı, koşulamadığı için sessizce yoktu.

Belirti sırası aldatıcıydı: önce `permission denied for schema public` (rol grant'ları
gitmiş → `pnpm db:rls-role` onarır), onarınca asıl gerçek çıktı: testler "kiracı A,
B'nin satırlarını görüyor" ve "çapraz kiracı yazma reddedilmiyor" dedi.

**Nasıl uygula:**
- `tests/rls.spec.ts` kırmızıysa ASLA "ortam gürültüsü" deyip geçme; o dosya kiracı
  izolasyonunun tek kanıtı.
- Ölç, tahmin etme: `select count(*) from pg_policies where schemaname='public'`
  (beklenen ≈41) ve `pnpm rls:check` (38/38 model).
- DB'yi sıfırlayan/migrate eden her komuttan SONRA `pnpm db:rls` + `pnpm db:rls-role`.
- `pnpm db:rls` artık psql'siz çalışıyor (`scripts/apply-rls.ts`, commit `5b5890d`);
  önce/sonra politika sayısını basar.
- 2026-09-07 sonrası `pnpm gate` bunu KENDİ ölçüyor: `pnpm rls:verify`
  (`scripts/check-rls-live.ts`, commit `42d3866`) DB'ye sorar ve eksik tabloları adıyla
  söyler. `pnpm rls:check` ise STATİKTİR — yalnız `rls.sql` metnini denetler, olay
  boyunca yeşil kaldı; ikisini karıştırma.

Bkz. [[fabrika-agents-share-one-working-tree]] · [[fabrika-ci-has-no-remote]]

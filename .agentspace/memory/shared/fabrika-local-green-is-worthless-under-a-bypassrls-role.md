---
name: fabrika-local-green-is-worthless-under-a-bypassrls-role
description: Fabrika'nın dev DB rolü superuser + BYPASSRLS — RLS'e takılacak her yazma yerelde yeşil geçer; RLS'i ilgilendiren hiçbir kanıt dev rolüyle alınmış olamaz
metadata:
  type: project
  updatedAt: 2026-09-08
---

2026-09-08, TASK-MTSWVADF7RQ1B QA turunda ölçüldü (blok-zincir-denet-i, F-1/F-3).

`AiUsageLog` `FORCE ROW LEVEL SECURITY` altında ve politikası
`WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))`. `app.tenant_id`'yi
ayarlayan **tek** yer `withTenant` (`src/lib/db.ts:99`). Global `prisma` istemcisiyle yapılan
her yazma bu ayarı taşımaz → `current_setting` NULL → INSERT `42501` ile reddedilir.

`embedText` (`src/lib/llm.ts`) tam olarak bunu yapıyordu ve **1370 test yeşil geçti**. Sebep:
yerel dev rolü `superuser` + `BYPASSRLS`. Politikalar hiç değerlendirilmedi.

İki kalıcı sonuç:

1. **RLS'i ilgilendiren bir iddianın kanıtı dev rolüyle alınamaz.** "Testler yeşil",
   "uçtan uca çalıştı", "gerçek Postgres'e yazdı" — hepsi BYPASSRLS altında hiçbir şey
   kanıtlamaz. Geçerli kanıt: `NOBYPASSRLS NOSUPERUSER` geçici rol + pozitif kontrol
   (ayar varken INSERT geçiyor) + negatif kontrol (ayar yokken reddediliyor). Pozitif kontrol
   şart: yoksa "her şey reddediliyor" ile "probe bozuk" ayırt edilemez.
2. **`pnpm rls:verify` bu tuzağı kapatmıyordu** — rolün BYPASSRLS'ini hiç sorgulamıyordu,
   yani "veritabanı izolasyonu gerçekten uyguluyor" diyen canlı ölçüm kapısı yalan yeşil
   veriyordu (TASK-MTSYG783RIIEE ile düzeltiliyor).

Kural: bir yazma yolu `withTenant` dışından geliyorsa, RLS altında ÇALIŞMAZ — yeşil test
bunun aksini söylüyorsa test değil rol yanlıştır. Bkz.
[[fabrika-preflight-gate-must-mirror-what-the-code-blocks]] (kapı yanlış şeyi ölçüyor) ·
[[fabrika-green-gate-does-not-prove-a-clean-clone]].

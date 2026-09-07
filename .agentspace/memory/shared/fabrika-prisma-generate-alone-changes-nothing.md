---
name: fabrika-prisma-generate-alone-changes-nothing
description: prisma generate'i kapıya eklemek TEK BAŞINA hiçbir şey korumaz — prisma-override.d.ts'teki ambient declare module gerçek tipleri gölgeler; asıl ucuz kapı M8'in schema-contract tarayıcısı
metadata:
  type: project
  updatedAt: 2026-09-07
---

`src/types/prisma-override.d.ts` içindeki `declare module '@prisma/client'` bir **ambient module
declaration**'dır ve üretilmiş gerçek istemcinin tiplerini **gölgeler**. Ölçüldü (2026-09-07,
TASK-MTRKA25R5M3SY): `pnpm exec prisma generate` koşulduktan sonra bile, override yerindeyken
`tsc --noEmit --incremental false` → `EXIT=0`. Yani "`prisma generate`'i postinstall/gate'e
ekleyelim" adımı **sıfır riskli ama sıfır faydalıdır**; fayda ancak override silinince gelir.
Override silinince: **144 hata / 51 dosya** (dosyanın kendi yorumundaki "158 / 36" eskimiş).

Kapının BUGÜN kazanabileceği tek gerçek koruma başka yerde: `src/modules/m8/server/schema-contract.test.ts`
`prisma/schema.prisma`'yı okuyup `prisma.*.<method>({where/select/include/orderBy})` literallerini
şemaya karşı doğrular — veritabanısız, mock'suz, 138 ms. `SCANNED` dizisi (satır ~25) bugün yalnız
5 M8 yoluna bakıyor; `['src','prisma','scripts']` yapılınca 22 gerçek hayalet isabeti buluyor ve
tsc'nin göremediği ek sütunları da yakalıyor (tsc bir nesne literalinde ilk hatalı anahtarda durur).

Repo geneline açmadan önce iki körlüğü kapat, yoksa gürültüde boğulur:
1. `parseSchema` `@@unique([a,b])` / `@@id([a,b])` bileşik anahtar adlarını (`tenantId_moduleId`,
   `email_tenantId`, …) bilmiyor → **29 yanlış pozitif**. Sanal alan olarak eklenmeli.
2. `FIELD_BEARING` (satır ~40) `'data'` içermiyor → create/update yüklerindeki hayalet alanlar
   (`sso.ts` `data:{domain}`, `calendar/sync.ts` `data:{severity}`) gözden kaçıyor.

İlgili: [[fabrika-typecheck-is-blind-to-db-calls]]

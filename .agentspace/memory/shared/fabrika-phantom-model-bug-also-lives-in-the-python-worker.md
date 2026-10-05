---
name: fabrika-phantom-model-bug-also-lives-in-the-python-worker
description: "Olmayan modele yazma" hatası workers/cordis/main.py icinde 2026-09-08de kapatildi (766944e) — hayalet tablo aramanin dogru yolu canli information_schema sayimidir
metadata:
  type: project
  updatedAt: 2026-09-08
---

`prisma.organization` hatası (şemada `model Organization` yok, `src/types/prisma-override.d.ts`
delegate'leri `any` yaptığı için typecheck görmüyordu) TypeScript tarafında temizlendi —
2026-09-07'de grep ile doğruladım, kalan çağrı yok.

Ama **aynı hata Python worker'ında duruyor**: `workers/cordis/main.py` (~110-135. satırlar)
`INSERT INTO "Project"`, `INSERT INTO "Participation"` ve `"Organization"` yazıyor.
`prisma/schema.prisma`'da bu üç model yok; gerçek adlar `CordisProject`, `CordisParticipation`,
`CordisOrganization`. Worker ayağa kalktığı an K2 boru hattı bu yüzden patlar.

Neden gözden kaçıyor: hiçbir TS kapısı (`typecheck`, `lint`, `vitest`) `workers/` içine bakmıyor,
ve worker'ın bağımlılıkları (fastapi/duckdb/pandas) geliştirme makinesinde kurulu olmadığı için
`pnpm jobs:k2` worker'a hiç ulaşamıyor — iş "worker unreachable" alert'i yazıp duruyor, altındaki
SQL hatası hiç görünmüyor. Yani K2 hattı bugüne kadar uçtan uca **hiç** koşmadı.

Ayrıca `workers/README.md` `/jobs/cordis?month=YYYY-MM` diyor ama `main.py:144` `month`
parametresini okumuyor; `pnpm jobs:k2 -- --month ...` parametreyi doğru gönderir, worker yok sayar.

K2'yi gerçekten kanıtlaman istenirse SIRA: (1) `pip install -r workers/cordis/requirements.txt`,
(2) main.py'deki tablo adlarını düzelt, (3) sonra `pnpm jobs:k2 -- --month YYYY-MM`.

Bkz. [[fabrika-db-mock-invents-the-model]], [[fabrika-fabricated-fallback-antipattern]]


## Durum: KAPATILDI (766944e, 2026-09-08)

`workers/cordis/main.py` artık gerçek temel tablolara yazıyor: `CordisProject`,
`CordisOrganization`, `CordisParticipation`, `CordisProjectTopic` — TS içe aktarıcısıyla
(`src/lib/k2-cordis/importer.ts`) aynı normalize yüzey. Türetilmiş katman
(`CordisPartnerProfile`, `CordisCoParticipation`) worker'a ait değil; tek sahibi
`generatePartnerProfiles()`.

Düzeltirken çıkan iki somut tuzak:

- Şema `organisationId` yazıyor (İngiliz imlası). Amerikan imlası `organizationId` sessizce
  var olmayan bir sütunu hedefler.
- `BigInt` para sütunları **tam EUR** tutar, cent değil — TS'teki `parseBigIntEur()` ile aynı
  ölçek. Eski worker cent yazıyordu.

**Nasıl uygula:** Hayalet tablo/sütun şüphesini kodu okuyarak değil, canlı şemayı sayarak
kapat:
`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`.

İlgili: [[fabrika-k2-worker-200-is-not-proof]] · [[fabrika-live-postgres-for-evidence]]

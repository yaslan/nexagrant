---
name: fabrika-typecheck-is-blind-to-db-calls
description: pnpm typecheck DB çağrılarına kör (prisma generate kapıda değil, delegate'ler any) — ama artık schema-contract.test.ts src/ genelini tarayıp yakalıyor
metadata:
  type: project
  updatedAt: 2026-09-07
---

`src/types/prisma-override.d.ts` elle yazılmış bir vekil tip dosyasıdır: `prisma generate`
kurulumun ve `pnpm gate`'in parçası olmadığı için `@prisma/client` gerçek tipleri üretmiyor ve
tüm model delegate'leri tek bir `any` ile geçiliyor.

Sonucu: **şemada olmayan bir tabloya yapılan çağrı typecheck'ten yeşil geçer.** 2026-09-07'de
`prisma.organization` (şemada `Organization` YOK, `CordisOrganization` var) dört canlı yerde
duruyordu — public API (`/api/v1/partners`, `/api/v1/partners/[pic]`) ve CORDIS senkron işleri
(`cordis-sync.ts`, `cordis-delta.ts`) — ve M8 kartı iki kez "düzeltildi" diye kapanmıştı.
Dosyanın kendi notu: override silinip istemci üretilirse 36 dosyada 158 tip hatası çıkıyor,
çoğu dört hayalet tabloya ait: Organization, Participation, Collab, OrgTopicStat.

Çalışma zamanı belirtisi bir Prisma hatası DEĞİL: delegate `undefined` olduğu için
`TypeError: Cannot read properties of undefined (reading 'findMany')` gelir. Prisma hatası
bekleyen bir `catch` ya da log filtresi bunu kaçırır.

## Artık otomatik yakalanıyor (2026-09-07, TASK-MTRK8YPNJDCIT)

`src/modules/m8/server/schema-contract.test.ts` iki katmana çıkarıldı ve `pnpm test`'in
parçası:
1. `SCANNED` listesindeki dosyalarda model + ilişki + **kolon** adı doğrulaması.
2. **`src/` genelinde tarama** — hiçbir dosya şemada olmayan bir modeli çağıramaz.
   `KNOWN_UNKNOWN_MODEL_CALLS` defteri BOŞ ve yalnız küçülebilir.

Mutasyonla doğrulandı: `prisma.organization` geri konduğunda test kırmızı, `tsc --noEmit`
hiçbir şey demiyor.

**Bunun anlamı:** artık elle grep etmek zorunda değilsin — ama testin hata mesajı seni
`KNOWN_UNKNOWN_MODEL_CALLS`'a ekleme yapmaya değil, sorguyu var olan bir modele bağlamaya
yönlendirir. Deftere satır eklemek muhafızı iptal etmektir; yapma.

Kural yine de duruyor: "typecheck temiz" bir DB değişikliğinin kanıtı DEĞİLDİR. Kanıt olarak
çalışma zamanı çıktısı (curl / job tetikleme / satır sayımı) iste.

İlgili: [[fabrika-partial-fix-check-all-surfaces-of-the-same-bug]] ·
[[fabrika-db-mock-invents-the-model]] · [[fabrika-fabricated-fallback-antipattern]]

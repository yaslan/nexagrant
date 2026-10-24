---
sözleşme: 3
görev: TASK-MVC91K7JYOWQC
kod: TASK-MVC91K7JYOWQC
ajan: be-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: Kurucu Uzman numarası artık yalnız artan ayrı bir sayaçtan veriliyor; 1 yılı dolan satır istisnasız siliniyor, numara tekrar verilmiyor, koltuk sayısı sayaçtan hesaplanıyor. Migration iki kez koşuldu, canlı test 12/12 geçti, pre-push gate yeşil, PR #92 dev'e açık (merge edilmedi).
platform: macOS (Darwin arm64) üzerinde doğrulandı. Windows ve Linux'ta koşulamadı (o makineler yerelde yok). Değişen kod yalnız sunucu tarafı TypeScript ve SQL; platforma bağlı yol, süreç ya da kabuk kullanmıyor. Postgres'in davranışı (advisory lock, RLS, ON CONFLICT) işletim sisteminden bağımsız.
sürüm: 1
tarih: 2026-10-17T18:58:44.239Z
---

# FO-50 — K-568932 = A: Kurucu Uzman numara sayacı, 1 yıllık silme istisnasız (be-fb)

## Ne yapıldı

Patron kararı **K-568932 = A** ("Ayrı sayaç, satır tam silinsin") uygulandı. Dal `be-fb/fo50-prereg-retention`, worktree `/Users/macbook/alan/FONBRIDGE-fo50`, commit `8b643835`. PR: https://github.com/yaslan/fonbridge/pull/92 (base `dev`, **merge edilmedi**; açıklaması güncellendi).

1. **Sayaç tablosu** `ExpertFounderCounter`: tek satır (`id = 1`), `lastNumber` yalnız artar. Migration `prisma/migrations/add-expert-founder-counter.sql`:
   - `CREATE TABLE IF NOT EXISTS`, `CHECK ("id" = 1)`, `CHECK ("lastNumber" >= 0)`.
   - Başlangıç değeri: mevcut satırlardaki en yüksek `founderNumber`. `ON CONFLICT … WHERE EXCLUDED > stored` olduğu için sayaç hiçbir zaman düşmez.
   - RLS açık, tek politika `system_scope` (`system_scope_open` ile, ExpertPreRegistration'daki gövdenin aynısı). `fabrika_app` için grant.
   - `apply-order.txt`'ye eklendi.
   - Geri alma: `add-expert-founder-counter.down.sql`. Kayıp verir: en yüksek numaralı satır silinmişse, eski kod o numarayı tekrar dağıtır. Bu yüzden kodla birlikte geri alınmalı.
2. **RLS/SYSTEM_WIDE kararı:** tablo kiracısız ve kişisel veri taşımıyor. `SYSTEM_WIDE` ve `SYSTEM_SCOPE_POLICY` listelerine girdi (`scripts/rls-models.ts`). `prisma/rls.sql`'e korumalı bir blok eklendi. `rls:verify` bu tabloyu da ölçüyor; sonda genelleştirildi (`scripts/check-rls-live.ts`). Ayrıca `SYSTEM_SCOPE_POLICY` kümesini rls.sql'e bağlayan bir test eklendi: kod yorumu bunu iddia ediyordu ama böyle bir test yoktu.
3. **Kod** (`src/lib/expert-prereg/server/founder-counter.ts`, yeni dosya):
   - `lastFounderNumberGiven` = `max(sayaç, satırlardaki max)`. Satırlar taban olarak sayılıyor; böylece `prisma db push` ile kurulmuş ya da elle yazılmış bir numara da tekrar verilmiyor.
   - `recordFounderNumberGiven` sayaca yazıyor.
   - `verify.ts`: sıradaki numara = sayaç + 1; sayaç aynı transaction'da güncelleniyor (mevcut advisory kilit altında).
   - `seats.ts`: `100 − lastFounderNumberGiven`.
   - `retention.ts`: `purgeableExpertPreRegWhere(cutoff)` = yalnız `createdAt < cutoff`, istisna yok. Purge önce doğrulamanın kilidini alıyor, sayacı satırlardaki en yüksek numaraya çekiyor, sonra siliyor.
4. **Testler:**
   - Birim testler: verify/seats sahte nesneleri sayaca uyarlandı; yeni durumlar eklendi (silinen satırın numarası, gerideki sayaç, limitteki sayaç).
   - Canlı retention testi K-568932'ye göre yeniden yazıldı.
   - Canlı testlerin üçü de sayacı başta kaydedip sonda geri yüklüyor (`holdFounderCounter`). Yoksa paylaşılan DB'de 100 koltuk birkaç koşuda dolar.
5. **DATA_MODEL:** §22'deki "Kurucu Uzman numarası" ve "Saklama" maddeleri güncellendi, açık soru kapatıldı. Yeni §22a `ExpertFounderCounter` bölümü yazıldı. Bypass baseline gerekçesi de güncellendi.

## Kanıt (ham çıktı)

Migration, izole `fabrika_fo50_be` DB'sinde (sahip rolü `fabrika`). Önce: ExpertPreRegistration'da 1 satır, `max(founderNumber)` = 7, sayaç tablosu yok.
```
=== RUN 1
CREATE TABLE
DO
INSERT 0 1
NOTICE:  policy "system_scope" for relation "ExpertFounderCounter" does not exist, skipping
DO
DO
rc=0
 id | lastNumber |        updatedAt
  1 |          7 | 2026-10-17 18:45:34.365
 relrowsecurity | policies →  t | 1
 constraints: ExpertFounderCounter_lastNumber_nonneg, _pkey, _single_row
=== RUN 2
NOTICE:  relation "ExpertFounderCounter" already exists, skipping
INSERT 0 0
rc=0
  1 |          7 | 2026-10-17 18:45:34.365   (değer ve updatedAt aynı)
```
Sayaç yalnız artıyor:
```
rows max 9 -> counter|9
counter 12, rows max 9 -> counter|12
```
`pnpm db:rls` iki kez: `Policies in public: 116 → 116` (iki koşuda da). Politika: `system_scope | ( SELECT system_scope_open('"ExpertFounderCounter"'::regclass) ...)`.

Geri alma, `fabrika_fo50_be`'nin TEMPLATE kopyasında iki kez koşuldu: iki koşuda da `rolled back … rc=0`, tablo `gone`; kopya DB düşürüldü.

Canlı vitest (izole DB, `fabrika_app` NOBYPASSRLS):
```
✓ retention › the window is one year: the edge stays, one millisecond past it goes
✓ retention › deletes verified and unverified rows alike
✓ retention › deletes the row holding the highest founder number too; the number stays taken and the seats do not move
✓ retention › after the top founder row is purged, a new verification gets the next number, not the freed one
✓ retention › a founder number the counter missed (row written by hand) is recorded before its row goes
✓ retention › writes one expert_prereg.purged audit with the count and no person; a second run changes nothing
✓ founder number race › 20 concurrent verifications distinct, gap-free … (+2)
✓ registration re-issue › (3)
Test Files 3 passed (3) · Tests 12 passed (12)
counter after|0   rows left|0   (sayaç geri yüklendi)
```
Mutasyon: verify eski `max+1` hesabına döndürülüp purge'daki "önce sayaç" adımı kaldırılınca **4 test kırıldı** (2 birim, 2 canlı: "next number, not the freed one" ve "counter missed … recorded"). Dosyalar `cp` yedeğinden geri yüklendi.

`rls:verify` (izole DB):
```
✓ ExpertFounderCounter: sistem kapsamı dışında okuma 0 satır (tabloda 1)
✓ ExpertFounderCounter: sistem kapsamı dışında INSERT reddedildi
✓ ExpertFounderCounter: sistem kapsamı içinde 1/1 satır görüldü
✅ 47 kiracıya özel tabloda … GERÇEKTEN ölçüldü
```
`rls:check`: CHECK 4c, 3 policy-less tablo; SUCCESS. `rls:bypass-check`: SUCCESS, yeni bypass yok.

Kapılar: `pnpm lint` 0 hata (4 uyarı, dokunmadığım dosyalarda), `pnpm typecheck` temiz, `pnpm test` (`.env` aynı kabukta) `349 passed | 8 skipped (357) · 4559 passed | 126 skipped`.

Pre-push `pnpm gate` (`E2E_PORT=3437`), `git push` rc=0, `91d45932..8b643835`:
```
Test Files  349 passed | 8 skipped (357)
✅ i18n check passed
✅ All 47 tenant-scoped models have RLS policies registered
✅ no new tenant bypass
✅ 47 kiracıya özel tabloda … GERÇEKTEN ölçüldü
  331 passed (6.0m)      (e2e)
✅ Öksüz alarm yok
```

## Değişen dosyalar

- Yeni: `prisma/migrations/add-expert-founder-counter.sql`, `.down.sql`, `src/lib/expert-prereg/server/founder-counter.ts`
- `prisma/schema.prisma`, `prisma/rls.sql`, `prisma/migrations/apply-order.txt`
- `src/lib/expert-prereg/server/{verify,seats,retention}.ts` (+ `verify.test.ts`, `retention.test.ts`), `src/lib/jobs/tasks/expert-prereg-cleanup.ts` (yorum)
- `scripts/rls-models.ts`, `scripts/check-rls-live.ts`, `scripts/tenant-bypass-baseline.json` (gerekçe metni)
- `tests/expert-prereg-retention.live.test.ts`, `tests/expert-prereg.live.test.ts`, `tests/expert-prereg-reissue.live.test.ts`, `tests/helpers/expert-prereg-live-lock.ts`, `tests/rls-coverage.test.ts`, `tests/where-guard-src.test.ts`
- `docs/DATA_MODEL.md` §22 + §22a

## Riskler

- **Paylaşılan yerel `fabrika` DB'sine migration uygulandı.** Değişiklik yalnız ekleme ve idempotent: 1 yeni tablo, sayaç = 1 (oradaki en yüksek numara), politika sayısı 115 → 116. Pre-push gate'in canlı testleri bu tabloyu bekliyordu. `pnpm db:rls` da bu dalın rls.sql'iyle aynı DB'ye koştu (FO-45 bloğu zaten oradaydı; 116 → 116). Geri almak gerekirse: `scripts/apply-migrations.sh --down prisma/migrations/add-expert-founder-counter.down.sql`. Prod'a dokunulmadı.
- **İzole DB'de eski fixture temizliği:** önceki koşudan kalan kendi 2 test satırımı sildim (`*-fo50ev@example.test`, numara 902). Bu satırlar sayacı 902'den başlatacaktı.
- **#87 (FO-45) hâlâ merge olmadı.** Bu dal onun üstünde; dev bu arada 21 commit ilerledi. #87 merge olunca rebase gerekebilir.
- 8 vitest dosyası tam koşuda atlanıyor: bunlar paylaşılan `fabrika`'yı reddeden canlı dosyalar (bilinen kapı). Expert ile ilgili 3 dosya izole DB'de ayrıca koşuldu ve geçti.
- Prod geçişinde migration `rls.sql`'den sonra koşmazsa NOTICE verir ve RLS kapalı kalır. Bu durumda `pnpm db:rls` aynı bloğu uygular (FO-45 ile aynı desen).

## Açık sorular

Yok. Önceki rapordaki 2. not hâlâ takip bekliyor: silmenin `docs/legal/processing-register.md`'ye yazılması, ayrı kart.

## Sonraki adım

1. CRW incelemesi (lider notu: "test + CRW incelemesiyle").
2. #87 merge olunca bu dalın rebase'i.
3. Merge yok (görev gereği). PR #92 dev'e açık.

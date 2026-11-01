---
sözleşme: 3
görev: TASK-MVC91K7JYOWQC
kod: TASK-MVC91K7JYOWQC
ajan: crw-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: PR #92 (8b643835) merge'e hazır; bloke eden bulgu yok, iki öneri var (Ö-1 sayacın düşmemesi DB'de zorlanmıyor, Ö-2 gece işi sayacı boşuna yazıyor); #87'den sonra merge edilmeli. İnceleme sırasında paylaşılan `fabrika` DB'sinde sayaç tablosunu yanlışlıkla düşürdüm, aynı dakika içinde geri kurdum (durum öncekiyle aynı).
platform: macOS (Darwin arm64): kod okundu; canlı testler ve migration denemeleri yerel Postgres'te koşuldu. Windows ve Linux'ta koşulamadı (o makineler yerelde yok). Değişiklik yalnız sunucu tarafı TS + SQL; platforma bağlı yol, süreç ya da kabuk kullanmıyor; advisory lock, RLS ve ON CONFLICT davranışı işletim sisteminden bağımsız.
sürüm: 1
tarih: 2026-10-17T19:02:31.140Z
---

# FO-50 PR #92 incelemesi — Kurucu Uzman sayacı + 1 yıllık silme (crw-fb)

## Ne yapıldı

PR #92'yi (base `dev`, dal `be-fb/fo50-prereg-retention`, commit `8b643835`) K-568932 = A'ya göre inceledim. BE-FB raporu: `TASK-MVC91K7JYOWQC-be-fb-2.md`. Kod değiştirmedim, merge etmedim.

**Hüküm: merge'e hazır. Bloke eden bulgu yok.** Tek şart: PR'ın diff'inde #87'nin (FO-45) commit'leri de var. Önce #87 merge edilmeli; sonra bu dal rebase edilip açılmalı.

### Kontrol listesi

| # | Konu | Sonuç |
|---|---|---|
| 1 | Migration idempotent, sayaç düşmüyor, başlangıç değeri, down.sql riski | ✅ `add-expert-founder-counter.sql:43-48`: `ON CONFLICT … WHERE EXCLUDED > stored`. Bunu bir kopyada denedim (aşağıda). `ExpertPreRegistration` FORCE RLS değil, bu yüzden sahip rolü bütün satırları görüyor ve başlangıç değeri doğru çıkıyor. down.sql veri kaybına yol açabilir; bu dosyada (`:8-12`) ve DATA_MODEL §22a'da yazılı. |
| 2 | RLS / system_scope / rls-models | ✅ `rls.sql:342-356` korumalı blok; `rls-models.ts`'te `SYSTEM_WIDE` ve `SYSTEM_SCOPE_POLICY` kayıtlı. `system_scope_open` amaç bazlı değil, bu yüzden `public-intake`, `platform-aggregate` ve `cross-tenant-job` sayacı açıyor. Yeni `rls-coverage` testi kümeyi rls.sql'e bağlıyor. Uygulama rolü kapsam dışında sayaca `UPDATE` atınca 0 satır etkileniyor (ölçtüm). |
| 3 | verify: numara verme ve sayaç tek transaction + kilit | ✅ `verify.ts:38-69`: kilit ilk ifade, sonra okuma (READ COMMITTED olduğu için sonraki ifadeler kilitten sonraki commit'leri görüyor); `recordFounderNumberGiven` ve satır `update` aynı `tx`'te. Limit aşılınca (`null`) sayaç 100'de kalıyor. Kayıt ve silme de aynı anahtarı kullanıyor, yani yarış yok. Ayrıca `founderNumber @unique` ikinci bir güvence. |
| 4 | retention: önce sayaç, PII yok, idempotent | ✅ `retention.ts:57-61`: kilit, sonra `record(lastGiven)`, sonra `deleteMany`. Audit kaydında yalnız `count`, `retentionDays`, `cutoff` var; job'un hata alarmında da PII yok. İkinci koşu 0 satır siliyor ve audit yazmıyor (Ö-2'deki `updatedAt` hariç). |
| 5 | Testler gerçek davranışı ölçüyor, sayaç geri yükleniyor | ✅ "next number, not the freed one" ve "counter missed" testleri eski `max+1` koduyla kırılıyor; bunu kodu okuyarak doğruladım, BE-FB'nin mutasyon kanıtıyla da tutarlı. `holdFounderCounter` sayacı geri yüklüyor: koşu öncesi ve sonrası `lastNumber` 0. |
| 6 | DATA_MODEL §22 / §22a | ✅ Açık soru kapatıldı. Tek istisna kaldırıldı. §22a'da alanlar, amaçlar, yazıcılar, migration ve geri alma var; kodla uyumlu. |

## Bulgular (önem sırasıyla)

Bloke eden yok.

**Ö-1 (öneri, sertleştirme): "sayaç yalnız artar" veritabanında zorlanmıyor.**
- `founder-counter.ts:23-28`: `recordFounderNumberGiven` değeri koşulsuz yazıyor.
- Ölçtüm: `fabrika_app`'in tabloda `DELETE` yetkisi var (varsayılan ayrıcalıklardan geliyor; migration yalnız S/I/U veriyor).
- Senaryo: sistem kapsamındaki gelecekteki bir kod satırı sayacı düşük bir değerle yazar ya da satırı siler. Bir sonraki doğrulamada taban `max(founderNumber)` olur; silinmiş bir satırın numarası tekrar verilir. Bugün bunu yapan bir çağıran yok (tüm yazıcılar kilit altında ve `lastFounderNumberGiven` ile beslenmiş).
- Düzeltme: upsert'i `"lastNumber" = GREATEST("lastNumber", $1)` olan bir raw SQL ile yapmak ya da bir BEFORE UPDATE trigger eklemek. Migration'a `REVOKE DELETE, TRUNCATE ON "ExpertFounderCounter" FROM fabrika_app` eklemek. Not: test yardımcısı `holdFounderCounter` sayacı kasten düşürüyor ama sahip rolüyle çalışıyor, bundan etkilenmez.

**Ö-2 (öneri, küçük): gece işi her koşuda sayaca yazıyor.**
- `retention.ts:58`: değer değişmese de upsert çalışıyor ve `@updatedAt` her gece ilerliyor.
- Etki: `updatedAt` artık "son numara verilme anı" anlamına gelmiyor. Raporun "ikinci koşu sayacı değiştirmez" iddiası `lastNumber` için doğru, `updatedAt` için değil.
- Düzeltme: sayacı yalnız `rowsMax > counter` olduğunda yaz.

**Not (bulgu değil):** Migration zincirde rls.sql'den önce koşarsa tablo bir süre RLS kapalı ve `fabrika_app` yetkili kalır, ta ki `pnpm db:rls` koşana kadar. Bu FO-45 ile aynı desen ve belgelenmiş; tablo kişisel veri taşımıyor. Ö-1'deki düşürme riskiyle birleşince bu pencerenin prod'da kısa tutulması iyi olur.

## Kanıt (ham çıktı)

Canlı testler, izole `fabrika_fo50_be` üzerinde (sahip rolü + `fabrika_app` URL'si; worktree `FONBRIDGE-fo50`, HEAD `8b643835`):
```
✓ founder number race › 20 concurrent verifications distinct, gap-free … none past it
✓ founder number race › second click … moves no number
✓ founder number race › exports the test rows as CSV …
✓ retention › the window is one year: the edge stays, one millisecond past it goes
✓ retention › deletes verified and unverified rows alike
✓ retention › deletes the row holding the highest founder number too; … seats do not move
✓ retention › after the top founder row is purged, a new verification gets the next number, not the freed one
✓ retention › a founder number the counter missed (row written by hand) is recorded before its row goes
✓ retention › writes one expert_prereg.purged audit …; a second run changes nothing
✓ reissue › (3)
Tests  12 passed (12)
```
Birim + canlı + rls-coverage + where-guard birlikte: `Test Files 11 passed (11) · Tests 113 passed (113)`. Sayaç koşu öncesi `1|0`, sonrası `1|0`; yalnız `updatedAt` değişti (Ö-2 ile aynı davranış).

Migration, tek kullanımlık bir kopyada (`fabrika_crwfb_fo50tmp`, `fabrika_fo50_be`'nin template'i; tablo düşürülüp `founderNumber=41` olan bir satır eklendi):
```
== run 1   → 41   (NOTICE policy … does not exist, skipping)
== run 2   → 41   (NOTICE relation already exists)
== satır 41 silindi, tekrar koşu → 41   (sayaç düşmedi)
policy: system_scope | ( SELECT system_scope_open('"ExpertFounderCounter"'::regclass) …)
grants fabrika_app: INSERT,SELECT,UPDATE,DELETE   ← Ö-1
app rolü, kapsam dışı: UPDATE "ExpertFounderCounter" SET "lastNumber"=0 → UPDATE 0
```
Kopya DB sonra düşürüldü.

## ⚠️ Olay: paylaşılan `fabrika` DB'sinde sayaç tablosu yaklaşık 1 dakika yoktu

- **Ne oldu:** down.sql'i kopyada denemek için `scripts/apply-migrations.sh --down …` koştum. Script hedefini `DATABASE_URL`'den alıyor ve o kabukta bu değişken `.env`'deki **paylaşılan `fabrika`** idi. Sonuç: `rolled back … as fabrika`, oradaki `ExpertFounderCounter` düşürüldü.
- **Düzeltme:** hemen ileri migration'ı aynı DB'ye `SET app.system_scope='on'` ile uyguladım.
- **Geri kurulan durum:** satır `1|1` (lastNumber = 1, `max(founderNumber)` = 1). BE-FB raporundaki değer de buydu: "sayaç = 1". RLS `t`, politika `system_scope` var, `public` politika sayısı 116 (raporla aynı), `fabrika_app` yetkileri yerinde.
- **Kayıp numara olmadığının kanıtı:** paylaşılan DB'de hiç `expert_prereg.purged` audit kaydı yok; yani hiçbir satır silinmemiş, satırlardaki max doğru taban. Prod'a dokunulmadı.

## Değişen dosyalar

Kodda yok. Yalnız bu rapor.

## Riskler

- #87 merge olmadan bu PR merge edilirse FO-45 commit'leri de birlikte girer. Sıra şöyle olmalı: #87, sonra rebase, sonra #92.
- Ö-1 bugün tetiklenmiyor; gelecekte bir kod değişikliği sayacı düşürürse numara tekrar verilir.

## Açık sorular

Yok.

## Sonraki adım

1. Lider: #87'yi merge et, sonra #92'yi rebase edip merge et.
2. İstenirse Ö-1 ve Ö-2 için küçük bir takip kartı açılabilir (merge'i beklemeye gerek yok).

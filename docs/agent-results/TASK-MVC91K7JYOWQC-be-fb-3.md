---
sözleşme: 3
görev: TASK-MVC91K7JYOWQC
kod: TASK-MVC91K7JYOWQC
ajan: be-fb
motor: claude
tip: diğer
okur: ekip
hüküm: "Bitti: Ö-1 ve Ö-2 uygulandı; DB sayacı düşürmeyi reddediyor, uygulama rolü silemiyor, gece işi gereksiz yazmıyor; canlı test ve pre-push gate yeşil, push f3e1fbfe, PR #92 açık (merge yok, #87 commit'leri diff'te)."
platform: macOS (Darwin arm64) üzerinde doğrulandı. Windows ve Linux'ta koşulamadı, çünkü o makineler yerelde yok. Değişiklik yalnız sunucu tarafı TS ve SQL'den oluşuyor (trigger, REVOKE, upsert); platforma bağlı yol, süreç ya da kabuk kullanılmıyor. Postgres trigger ve yetki davranışı işletim sisteminden bağımsız.
sürüm: 1
tarih: 2026-10-17T19:17:06.859Z
---

# FO-50 — CRW-FB Ö-1/Ö-2: sayaç yalnız artar, DB'de zorlanıyor (be-fb)

## Ne yapıldı

Kaynak: CRW-FB incelemesi `docs/agent-results/TASK-MVC91K7JYOWQC-crw-fb.md`. Dal `be-fb/fo50-prereg-retention`, worktree `/Users/macbook/alan/FONBRIDGE-fo50`, commit `f3e1fbfe`. PR #92'ye yorum eklendi: https://github.com/yaslan/fonbridge/pull/92#issuecomment-6239367077. Merge yapılmadı.

Not: görev metnindeki KANIT satırı `…-crw-fb.md` yolunu gösteriyordu. Bu inceleyicinin kendi raporu olduğu için üzerine yazmadım. Raporu görev metnindeki `…-be-fb-3.md` yoluna yazdım.

**Ö-1 — "yalnız artar" artık veritabanında zorlanıyor**
- `add-expert-founder-counter.sql`: `expert_founder_counter_no_decrease()` fonksiyonu (`SET search_path = pg_catalog`, PUBLIC'ten EXECUTE geri alındı) ve `BEFORE UPDATE … WHEN (NEW."lastNumber" < OLD."lastNumber")` trigger'ı `ExpertFounderCounter_no_decrease`. Düşürme denemesi `check_violation` ile reddediliyor; bu her rol için, sahip rolü dahil, geçerli.
- `REVOKE DELETE, TRUNCATE ON "ExpertFounderCounter" FROM fabrika_app` üç yerde var: migration, `prisma/rls.sql` ve `prisma/rls-app-role.sql`. Sonuncusu şart, çünkü `db:rls-role` `GRANT … DELETE ON ALL TABLES` ile bu yetkiyi geri veriyor.
- `recordFounderNumberGiven` tek bir SQL ifadesi oldu: `INSERT … ON CONFLICT DO UPDATE … WHERE EXCLUDED."lastNumber" > stored`. Kod yolu da artık hiçbir zaman düşürmeyi denemiyor.
- `rls:verify` sondasına yeni ölçüm eklendi: "ölçüm rolünde DELETE ve TRUNCATE yetkisi yok".
- `holdFounderCounter` sahip rolüyle çalışmaya devam ediyor. Geri yükleme artık UPDATE değil, tek transaction'da DELETE + INSERT; trigger yalnız UPDATE'te tetiklendiği için engellenmiyor. Uygulama rolünün DELETE yetkisi olmadığından bu yolu kullanamıyor.
- down.sql trigger fonksiyonunu da düşürüyor.

**Ö-2 — gece işi boşuna yazmıyor**: aynı SQL, değer büyük değilse satıra hiç dokunmuyor. `updatedAt` "son numara verilme anı" anlamını koruyor.

DATA_MODEL §22a güncellendi: trigger, yetki geri alma ve "yalnız büyükse yaz" bilgisi eklendi.

## Kanıt (ham çıktı)

Migration yalnız **izole** DB'de iki kez koşuldu (`DATABASE_URL` o kabukta açıkça `fabrika_fo50_be`'ye ayarlıydı):
```
db|fabrika_fo50_be
== BEFORE   grants|DELETE,INSERT,SELECT,UPDATE   trigger|none   counter|0|2026-10-17 19:00:53.706
== RUN 1    … CREATE FUNCTION REVOKE … CREATE TRIGGER INSERT 0 0 DO DO  rc=0
            grants|INSERT,SELECT,UPDATE   trigger|ExpertFounderCounter_no_decrease   counter|0|2026-10-17 19:00:53.706
== RUN 2    … INSERT 0 0 DO DO  rc=0   (aynı durum)
== db:rls x2   Policies in public: 116 → 116 (iki kez)
== db:rls-role taklidi (GRANT ALL, yalnız izole DB): grants|DELETE,INSERT,SELECT,UPDATE → revoke bloğu → grants|INSERT,SELECT,UPDATE
== DELETE geri verildi, sonra yalnız db:rls koşuldu → grants|INSERT,SELECT,UPDATE
```
`db:rls-role`'ü gerçekten koşmadım, çünkü paylaşılan `fabrika_app` rolünün parolasını değiştiriyor. Etkisini izole DB'de GRANT ALL ile taklit edip revoke bloğunun yetkiyi geri aldığını gösterdim.

Down, `fabrika_fo50_be`'nin TEMPLATE kopyasında iki kez koşuldu (`target|fabrika_fo50_down2`). Sonuç: `table gone|function gone`. Kopya DB düşürüldü. Paylaşılan `fabrika`'da tablo yerinde duruyor; orada down koşulmadı.

Canlı testler (izole DB, `fabrika_app`) + birim testler:
```
✓ retention › a purge that changes nothing leaves the counter row untouched (updatedAt too)
✓ retention › the database refuses to lower the counter; the app role cannot delete it (crw-fb Ö-1)
✓ retention › writes one expert_prereg.purged audit …; a second run changes nothing   (sayaç satırı toEqual, updatedAt dahil)
✓ retention › (diğer 5) · race (3) · reissue (3)
Tests 14 passed (14)        (birim testlerle birlikte: Test Files 8 passed · Tests 72 passed)
counter before|0|2026-10-17 19:00:53.706   counter after|0|2026-10-17 19:00:53.706
```
Ö-1 testinin kanıtladıkları:
- Sistem kapsamında uygulama rolü sayacı düşürmeye çalışınca `only goes up` hatası alıyor.
- `deleteMany` `permission denied` alıyor.
- `recordFounderNumberGiven(daha küçük)` hiçbir şey değiştirmiyor.
- Sahip rolünün düşürme UPDATE'i de `only goes up` ile reddediliyor.
- Sonuçta sayaç ve koltuk sayısı değişmiyor.

Mutasyon testleri (kod `cp` yedeğinden geri yüklendi, trigger migration yeniden koşularak geri kuruldu):
```
(a) SQL'deki WHERE kaldırıldı → 3 test kırıldı (Ö-2 updatedAt, Ö-1, audit/idempotent)
(b) izole DB'de trigger düşürüldü → 1 test kırıldı (Ö-1)
trigger back|ExpertFounderCounter_no_decrease   counter|0
```
`rls:verify` (izole DB): `✓ ExpertFounderCounter: ölçüm rolünde DELETE ve TRUNCATE yetkisi yok` ve yanında okuma 0, INSERT reddedildi, kapsam içinde 1/1.

Paylaşılan `fabrika`'ya güncel **ileri** migration uygulandı. Neden: gate'in `rls:verify`'ı orada koşuyor ve yeni DELETE ölçümü kırılacaktı. Additive ve idempotent; down DEĞİL:
```
BEFORE  grants|DELETE,INSERT,SELECT,UPDATE  trigger|none  counter|1  max|1
run 1 rc=0 · run 2 rc=0 · db:rls 116 → 116
AFTER   grants|INSERT,SELECT,UPDATE  trigger|ExpertFounderCounter_no_decrease  counter|1  max|1
```

Kapılar:
- `pnpm lint`: 0 hata (4 uyarı, dokunmadığım dosyalarda).
- `pnpm typecheck`: temiz.
- `pnpm test`: `349 passed | 8 skipped (357) · 4559 passed`. İlk koşuda `teardown-where-guard` testi kasıtlı reddedilen `deleteMany({})` çağrımı yakaladı; `where: { id: 1 }` yapınca geçti.

Pre-push `pnpm gate`, push rc=0, `8b643835..f3e1fbfe`:
```
Test Files  349 passed | 8 skipped (357)
✅ i18n · ✅ rls:check (3×SUCCESS) · ✅ no new tenant bypass
✓ ExpertFounderCounter: ölçüm rolünde DELETE ve TRUNCATE yetkisi yok
✅ 47 kiracıya özel tabloda … GERÇEKTEN ölçüldü
331 passed (5.8m)  (e2e)   ✅ Öksüz alarm yok
```

## Değişen dosyalar

- `prisma/migrations/add-expert-founder-counter.sql`, `.down.sql`
- `prisma/rls.sql`, `prisma/rls-app-role.sql`
- `src/lib/expert-prereg/server/founder-counter.ts`, `retention.ts` (yorum), `verify.test.ts`
- `scripts/check-rls-live.ts`
- `tests/expert-prereg-retention.live.test.ts`, `tests/helpers/expert-prereg-live-lock.ts`
- `docs/DATA_MODEL.md` §22a

## Riskler

- **#87 (FO-45) merge edilmedi.** PR #92'nin diff'inde FO-45 commit'leri hâlâ duruyor. Talimat gereği rebase yapılmadı. Doğru sıra: #87, sonra rebase, sonra #92.
- `add-expert-founder-counter.sql` dosyası 8b643835'te yayımlanmış hâliyle değiştirildi. Henüz merge olmadığı ve idempotent olduğu için, eski hâlini uygulamış DB'ler (paylaşılan `fabrika` ve izole DB) yeniden koşunca trigger'ı ve REVOKE'u alıyor; bu iki DB'de kanıtlandı.
- Trigger sahip rolünü de engelliyor. Bir operatörün sayacı elle düzeltmesi gerekirse DELETE + INSERT kullanmalı (DATA_MODEL §22a'da yazılı).

## Açık sorular

Yok.

## Sonraki adım

1. Lider/CRW: Ö-1 ve Ö-2'nin yeniden kontrolü.
2. #87 merge edildikten sonra #92 rebase edilip merge edilmeli. Merge görev kapsamı dışında.

---
sözleşme: 3
görev: TASK-MVBLYRLP9ID93
kod: TASK-MVBLYRLP9ID93
ajan: be-fb
motor: claude
tip: diğer
okur: kullanıcı
hüküm: "Kısmen bitti: M1, m3 ve m4 düzeltildi ve yerelde kanıtlandı. Merge sonrası FO-52 ile çıkan gizli bir kırılma da giderildi. Push yapılamadı: pre-push kapısı, temiz origin/dev'de de düşen ilgisiz bir e2e testine (admin-blog-rich-editor Word yapıştırma) takılıyor; --no-verify ofis kuralıyla yasak."
platform: "mac (darwin 27, yerel fabrika-postgres :5433). Windows ve Linux koşulmadı. Değişiklik yalnız SQL/RLS ve TS sunucu mantığından oluşuyor; platforma bağlı kod yolu (süreç, dosya yolu, kabuk) yok, davranış tüm platformlarda aynı."
sürüm: 3
tarih: 2026-10-19
---

# FO-26 — PR #95 inceleme düzeltmeleri (M1, m3, m4) + FO-52 etkileşimi

Bu rapor `rapor_yaz` ile yazılamadı. Araç, `TASK-MVBLYRLP9ID93-be-fb` kimliğini çalışma alanı kökündeki eski kayda (`/Users/macbook/alan/docs/agent-results/TASK-MVBLYRLP9ID93-be-fb.md`) bağlı gördüğü için reddetti. Rapor bu yüzden elle yazıldı. Karar ayrıca `karar_sor` ile açıldı.

## Ne yapıldı
Worktree `.claude/worktrees/fo26-attempt-counter`, dal `be-fb/fo26-attempt-counter`. Yerel HEAD `d8b97f7e`. PR #95'teki head hâlâ `62f7353d`, çünkü **push gitmedi**.

1. **M1 (bloke eden):** `ExpertPreRegAttempt` için RLS açıldı, tek politika `system_scope` (FO-45 / K-562266 = A deseni).
   - `prisma/migrations/add-expert-pre-reg-attempt.sql`: `DISABLE` kaldırıldı. Yerine `expert-prereg-rls-mail-quota.sql` desenindeki guard'lı DO bloğu geldi: `system_scope_open` varsa ENABLE + `DROP POLICY IF EXISTS` + `CREATE POLICY`. Fonksiyon yoksa tablo NOTICE ile DISABLE edilir; böylece Supabase `ensure_rls` tetikleyicisi deny-all bırakamaz. Başlık yorumu yeniden yazıldı.
   - `prisma/rls.sql`: tablo politikasız DISABLE döngüsünden çıkarıldı. ExpertPreRegistration bloğunun altına aynı politika eklendi; `to_regclass` guard'lı, tablo henüz yoksa atlanır.
   - `scripts/rls-models.ts`: `SYSTEM_SCOPE_POLICY` = {ExpertPreRegistration, ExpertPreRegAttempt}.
   - `tests/rls-coverage.test.ts:390`: CHECK 4c listesinden tablo çıktı, çünkü politika artık migration'da görülüyor.
   - `docs/DATA_MODEL.md`: "RLS **açık**, tek politika `system_scope`" ve gerekçesi yazıldı.
   - `tests/expert-prereg-app-role.live.test.ts`: yeni canlı test. `fabrika_app` rolüyle 409 yolu bir deneme satırı yazar; kapsam dışında bu satır 0 görünür ve `DELETE` 0 satır siler.
2. **m3:** `register.test.ts` cooldown testi yeniden yazıldı. Bağlantı 2 saat önce verilmiş, yani TTL formülü soğuma dışında kalıyor; `lastSubmittedAt` ise 1 dk önce. Beklenen sonuç 429 ve gönderilen posta yok.
3. **m4:** DATA_MODEL maddesi "**`ExpertPreRegistration` saklaması: açık karar** … (`ExpertPreRegAttempt`'in 24 saatlik saklaması yukarıda)" oldu.
4. **Yeni bulgu, FO-52 etkileşimi (kapsam dışına zorunlu küçük dokunuş):** dal dev'in gerisindeydi. dev'e giren #115 (FO-52, K-569554 = C), `system_scope_open()` içinde `public-intake` amacını yalnız ExpertPreRegistration ve ExpertFounderCounter'a açıyor. M1'den sonra deneme tablosu bu listede olmadığı için kayıt yolunun INSERT'i `P2039 new row violates row-level security policy` ile reddedildi. Okumalar 0 döndüğü için IP sınırı da sessizce kalkardı. Çözüm: origin/dev dala merge edildi; `ExpertPreRegAttempt`, `system_scope_open()` listesine (`prisma/rls.sql`) ve `scripts/check-rls-live.ts` içindeki `PUBLIC_INTAKE_TABLES`'a eklendi. `src/lib/system-scope.ts`'te yalnız yorum güncellendi.
5. **m2'ye dokunulmadı:** soğuma ve kota 429'larının deneme sayılmaması hâlâ **açık**, patron kararı bekleniyor.

## Kanıt (ham çıktı)
```
# Önce (yerel DB)
ExpertPreRegAttempt|f            -- relrowsecurity
(policy yok)  count=1
# Migration iki kez: run1 "policy ... does not exist, skipping" → DO; run2 yalnız NOTICE, hata yok
ExpertPreRegAttempt|t
ExpertPreRegAttempt|system_scope|( SELECT system_scope_open('"ExpertPreRegAttempt"'::regclass) ...)
count=1                          -- veri korunmuş
# pnpm db:rls ×2 → "Policies in public: 117 → 117" (iki kez)

# fabrika_app elle ölçüm
outside_count=0
ERROR: new row violates row-level security policy for table "ExpertPreRegAttempt"   -- kapsam dışı INSERT
deleted=0                                                                            -- kapsam dışı DELETE
public-intake → inside_count=1, INSERT 0 1, inside_after_insert=2 (ROLLBACK)

# m3 mutasyon: eski formül (lastSubmittedAt yok sayıldı)
× lets the cooldown read lastSubmittedAt, not the link issue time, when the two differ
Tests  1 failed | 25 passed (26)        -- kod geri alındı, sonra 26/26

# M1 mutasyon: ALTER TABLE "ExpertPreRegAttempt" DISABLE RLS
× writes the 409 attempt row through the RLS role ... AssertionError: expected 1 to be +0
db:rls → relrowsecurity = t (rls.sql bloğu tekrar açtı)

# FO-52 kök neden teşhisi (tam pakette, düzeltme öncesi; geçici log, commit edilmedi)
DBG-FO26 P2039 ... new row violates row-level security policy for table "ExpertPreRegAttempt"
{ current_user:'fabrika_app', s:'on', sealed:true, open_a:false, open_r:true, rls_a:true, pol_a:1 }

# Düzeltme sonrası
rls:check  → CHECK 4c: BlogPost, ExpertPreRegistration, PublicLead — SUCCESS
rls:verify → ✓ public-intake: 51 system_scope tablosunda kapsam dışıyla aynı satır sayısı
             (yalnız ExpertPreRegistration, ExpertFounderCounter, ExpertPreRegAttempt açık)
           ✅ 47 kiracıya özel tabloda ... GERÇEKTEN ölçüldü
vitest system-scope.live + expert-prereg (3 canlı) + rls-coverage + src/lib/expert-prereg → 10 dosya, 132/132

# pre-push pnpm gate (son deneme)
lint ✓ · typecheck ✓ · vitest: Test Files 361 passed | 7 skipped; Tests 4784 passed | 120 skipped
i18n ✓ · rls:check ✓ · rls:bypass-check ✓ · rls:verify --require-db ✓ · db:rls-role ✓
e2e: 1 failed | 10 skipped | 374 passed
  1) tests/e2e/admin-blog-rich-editor.spec.ts:157 "a paste from Word keeps only what the site shows"
     Expected h1 "Word başlığı" — element not found
     (Ctrl+A seçimi tutmamış, yapıştırma eski paragrafın sonuna eklenmiş: error-context.md)
# Aynı test: tek başına 4/4, admin- grubu 39/39
# Temiz origin/dev (49e6a817) ayrı worktree, tam e2e → 1 failed | 10 skipped | 374 passed (AYNI test)
error: failed to push some refs
```
Önceki push denemelerindeki kırmızılar ortamdandı: DNS kesintisi (`Could not resolve host: github.com`), OAuth `fetch failed`, GDPR 30 sn zaman aşımı (tek başına 20/20) ve `R2_PUBLIC_HOST` eksikliği yüzünden açılmayan e2e webServer. Hiçbiri değiştirilen dosyalarla ilgili değil.

## Değişen dosyalar
- `prisma/migrations/add-expert-pre-reg-attempt.sql`, `prisma/rls.sql`, `scripts/rls-models.ts`, `tests/rls-coverage.test.ts`, `docs/DATA_MODEL.md`
- `src/lib/expert-prereg/server/register.test.ts`, `tests/expert-prereg-app-role.live.test.ts`
- FO-52 nedeniyle: `scripts/check-rls-live.ts` (tek satır), `src/lib/system-scope.ts` (yalnız yorum)
- Commit'ler (yerel): `e7bafd79` (M1/m3/m4), `3ce5ee84` (origin/dev merge), `d8b97f7e` (public-intake listesi)

## Riskler
- **Yayın sırası:** migration güncel `rls.sql`'den önce koşarsa tablo RLS açık kalır, ama eski FO-52 fonksiyonu tabloyu tanımaz. Bu durumda `db:rls` koşana dek public-intake deneme yazamaz. CI ve yayında `db:rls` migration'dan hemen sonra geliyor ve yeni kod tabloyu ancak o zaman yazıyor, bu yüzden pencere kısa. Yine de yayında `db:rls` atlanmamalı.
- **#92 (FO-50) ile çakışma:** #92 de `rls.sql`, `rls-models.ts` ve `check-rls-live.ts`'e dokunuyor. `ExpertFounderCounter` listesi zaten dev'de, çakışmalar mekanik.
- **Paylaşımlı yerel DB:** `pnpm db:rls` en son koşanın sürümünü yükler. Şu an bu dalın `rls.sql`'i yüklü; bu, dev'deki sürümün üst kümesi (bir tablo fazla açık).
- **Yol notu:** teslim metnindeki "KANIT ZORUNLU" yolu (`/Users/macbook/alan/docs/agent-results/TASK-MVBLYRLP9ID93-crw-fb.md`) incelenen raporun adını taşıyor ve repo dışı kökü gösteriyor. Rapor, brifteki SONUÇ yoluna yazıldı.

## Açık sorular
- m2 (soğuma ve kota 429'larının deneme sayılması) patron kararı bekliyor.
- Push bloğu için karar açıldı: A) blog editörü testini sahibi (fe-fb) düzeltsin, ben sonra güncelleyip push edeyim (önerim); B) bu push için `--no-verify` onayı; C) testi ayrı bir kartta ben düzelteyim.

## Sonraki adım
- Karar gelince push edilir, PR #95 head güncellenir, ardından crw-fb delta incelemesi yapar.

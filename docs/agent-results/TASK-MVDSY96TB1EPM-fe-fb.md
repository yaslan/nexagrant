# TASK-MVDSY96TB1EPM (FO-84) — Blog okuma süresi sayı olarak saklanıyor, okuyucunun dilinde gösteriliyor (fe-fb)

**Hüküm:** BAŞARILI. PR: https://github.com/yaslan/fonbridge/pull/107 (base `dev`). Dal: `fe-fb/fo84-read-minutes`. Worktree: `/Users/macbook/alan/FONBRIDGE-fo84`.
**Önce merge edilmeli:** #106 (FO-83). Dal FO-83'ün üstünden açıldı ve güncel `origin/dev` (FO-79 dahil) içine merge edildi. #106 merge olana kadar PR diff'inde FO-83'ün commit'i de görünür.
**Platform:** mac'te ölçüldü (Chromium/Playwright + AgentSpace dahili tarayıcı, yerel Postgres :5433, yerel MinIO). Değişiklik web + sunucu + DB katmanında. Yola, kabuğa ya da sürece dokunan bir kod yolu yok. Bu yüzden Windows ve Linux'ta davranış farkı beklenmiyor. Bu makinede yoklar, koşulmadı. CI (Linux) aynı e2e'yi MinIO ile koşuyor.

## Ne yapıldı
1. **Şema:** `BlogPost.readMinutes Int?` eklendi (1–120). DB'de `CHECK BlogPost_readMinutes_range` var. `readTime String?` olarak kaldı: artık ne yazılıyor ne okunuyor. NOT NULL'ı düşürüldü, yoksa yeni kod kayıt yazamazdı. Şemaya başka alan ya da tablo eklenmedi. RLS değişmedi: tablo SYSTEM_WIDE, RLS kapalı.
2. **Migration:** `prisma/migrations/blog-read-minutes.sql` + `.down.sql` + `apply-order.txt` (sonuna eklendi). `prisma migrate dev` kullanılmadı.
   - Backfill aynı dosyada ve idempotent: yalnız `readMinutes IS NULL` satırlara dokunur.
   - Kural: `readTime` içindeki ilk tamsayı 1–120 arasındaysa o alınır.
   - Değilse (sayı yok, 0, aralık dışı, taşan sayı) dakika `content`'ten hesaplanır. Sayım `estimateReadMinutes` ile aynı: link/görsel hedefi, HTML etiketi ve numaralı liste işareti kelime sayılmaz; dakikada 200 kelime, yuvarlanır; en az 1, en fazla 120.
3. **Okuma/yazma yolu:** `validateBlogInput` `readMinutes`'i zod ile doğrular (`z.number().int().min(1).max(120)`, hatada `invalid_read_time`). `toBlogPost`/`toInput` dakikayı okur. NULL yalnız dağıtım penceresinde eski kodun yazdığı satırda olabilir; o durumda değer içerikten tahmin edilir (`readMinutesOf`). Sınırlar tek yerde: `BLOG_READ_MINUTES` (`src/lib/blog-read-time.ts`). `estimateReadMinutes` de artık 120 ile sınırlı.
4. **Admin formu:** okuma süresi alanı `type="number"`, `inputMode="numeric"`, min 1, max 120, step 1. Etiket "Okuma süresi (dakika)". FO-78 davranışı korundu: yeni yazıda alan içerikten dolar, admin elle değiştirince tahmin durur. FO-83'ün boş alan uyarısı korundu.
5. **Gösterim:** liste (`blog/page.tsx`), detay (`blog/[slug]/page.tsx`) ve ana sayfa bölümü (`BlogSection.tsx`) metni `t('readMinutes', { min })` ile yazar (namespace `blog`).
   - tr: `"{min} dk okuma"`. Mevcut sitedeki biçim bu: seed yazıları "5 dk okuma".
   - en: `"{min} min read"`. FO-78 öncesi e2e'de ve patronun İngilizce kaydında kullanılan biçim.
   - Admin hata metni (`invalid_read_time`) ve ipucu iki dilde güncellendi. Kullanılmayan `adminBlog.readTime.auto` anahtarı kaldırıldı.
6. **Seed:** `blog-seed.ts` artık sayı yazıyor (5 / 7 / 4 / 6).
7. **`docs/DATA_MODEL.md` §23 `BlogPost`:** bu tablo dokümanda hiç yoktu; okuma süresi ve eski alan da anlatıldı.

## Kanıt (ham çıktı)
**Yerel DB, migration öncesi** (`readTime` metni):
```
                          slug                           |  readTime  | len  
---------------------------------------------------------+------------+------
 tto-ve-danismanlar-icin-multi-tenant-proje-yonetimi     | 6 dk okuma |  421
 ar-ge-projelerinde-yapay-zeka-destegi-part-b            | 4 dk okuma |  652
 tubitak-esik-ustu-ab-hakem-kriterleri                   | 7 dk okuma |  855
 horizon-europe-basarili-konsorsiyum-rehberi             | 5 dk okuma | 1196
 live-create-lwu2buj1                                    | 3 dk okuma |  113
 live-dup-lwu2buj1                                       | 3 dk okuma |  113
 live-guarded-lwu2buj1                                   | 3 dk okuma |  113
 live-upd-lwu2buj1                                       | 3 dk okuma |  113
 live-feat-lwu2buj1                                      | 3 dk okuma |  113
 cagri-sartlari-ve-ogrenciler-icin-guncel-hibe-lwu2buj1  | 3 dk okuma |  113
 yunanistan-da-kisa-donem-esc-gonulluluk-projesi-firsati | 5 min read |  472
(11 rows)
```
**İleri migration, 1. koşu → döküm → 2. koşu (idempotent):**
```
### forward 1
ALTER TABLE
DO
ALTER TABLE
UPDATE 11
exit=0
                          slug                           |  readTime  | readMinutes 
---------------------------------------------------------+------------+-------------
 tto-ve-danismanlar-icin-multi-tenant-proje-yonetimi     | 6 dk okuma |           6
 ar-ge-projelerinde-yapay-zeka-destegi-part-b            | 4 dk okuma |           4
 tubitak-esik-ustu-ab-hakem-kriterleri                   | 7 dk okuma |           7
 horizon-europe-basarili-konsorsiyum-rehberi             | 5 dk okuma |           5
 live-create-lwu2buj1                                    | 3 dk okuma |           3
 live-dup-lwu2buj1                                       | 3 dk okuma |           3
 live-guarded-lwu2buj1                                   | 3 dk okuma |           3
 live-upd-lwu2buj1                                       | 3 dk okuma |           3
 live-feat-lwu2buj1                                      | 3 dk okuma |           3
 cagri-sartlari-ve-ogrenciler-icin-guncel-hibe-lwu2buj1  | 3 dk okuma |           3
 yunanistan-da-kisa-donem-esc-gonulluluk-projesi-firsati | 5 min read |           5
(11 rows)

 readTime     | text                           |           |          | 
 readMinutes  | integer                        |           |          | 
    "BlogPost_readMinutes_range" CHECK ("readMinutes" >= 1 AND "readMinutes" <= 120)
### forward 2 (idempotent)
psql:prisma/migrations/blog-read-minutes.sql:34: NOTICE:  column "readMinutes" of relation "BlogPost" already exists, skipping
ALTER TABLE
DO
ALTER TABLE
UPDATE 0
exit=0
```
**Geri alma (`scripts/apply-migrations.sh --down`) → yeniden uygulama:**
```
### down
==> [down] blog-read-minutes.down.sql
apply-migrations: rolled back with blog-read-minutes.down.sql as fabrika
exit=0
 readTime     | text                           |           | not null | 
 null_readtime | count 
---------------+-------
             0 |    11
(1 row)

### forward again
ALTER TABLE
DO
ALTER TABLE
UPDATE 11
exit=0
 null_minutes | total 
--------------+-------
            0 |    11
(1 row)
```
Patronun kaydettiği yazı (`yunanistan-...`, "5 min read") dahil 11 satırın hepsinde `readMinutes` dolu.

Yan etki: down dosyası bu satırın eski `readTime` metnini "5 dk okuma" yaptı. Bu belgelenmiş davranış. :3000'deki eski kod bu alanı gösterdiği için metni elle "5 min read"e geri yazdım (`UPDATE 1`).

Yerel DB'de tam `apply-migrations.sh` benden ÖNCEKİ `retire-eur-plan-ladder.sql` adımında düşüyor ("12 subscription(s) still on an unmapped plan"). Bu, yerel veriden kaynaklanan eski bir sorun; FO-84 ile ilgisi yok. O yüzden kendi dosyamı `psql -f` ile tek başına uyguladım. Geri alma ise script'in `--down` yoluyla koştu.

**Gerçek etkileşim (Türkçe admin arayüzü, :3110):**
- Patronun :3000 sunucusuna dokunulmadı. Sunucu `R2_ACCOUNT_ID=local DEMO_LOGIN_ENABLED=true` ve MinIO env'iyle açıldı.
- Demo "Platform Yöneticisi" (`admin@yasinaslan.com.tr`) ile giriş yapıldı. Yeni yazı açıldı, 1200 kelime yazıldı, alan kendiliğinden `6` oldu (`type=number`).
- Kapak PNG'si MinIO'ya gerçekten yüklendi. "Kaydet" tıklandı, "Blog yazısı kaydedildi." çıktı.
- DB'de: `readTime` = (boş/NULL), `readMinutes` = 6.
- Dahili tarayıcı:
  - `/tr/blog/<slug>` → "• 6 dk okuma"
  - `/en/blog/<slug>` → "• 6 min read"
  - `/en/blog` kart → "6 min read"
  - ana sayfa bölümü `/en` → "6 min read / 5 min read / 3 min read", `/tr` → "6 dk okuma / 5 dk okuma / 3 dk okuma"
- Admin düzenleme modalında alan 6, min/max 1/120. 390px'te `scrollWidth` 390, yatay taşma yok.
- Doğrulama yazısı sonra yerel DB'den silindi. Kendi açtığım :3110 sunucusunu kapattım.

Ekran görüntüleri: `docs/agent-results/TASK-MVDSY96TB1EPM-screenshots/` (PR'da):
- `02-admin-saved.png`
- `03-tr-post-dk-okuma.png`
- `04-en-post-min-read.png`
- `05-en-list-min-read.png`
- `06-admin-edit-read-minutes-desktop.png`
- `07-admin-edit-read-minutes-mobile390.png`

**Testler:**
- Birim:
  - Zod aralığı: 1 ve 120 kabul; 0, 121, 2.5, NaN ve "5 dk" ret.
  - Tahmin üst sınırı.
  - Migration'daki CHECK ile `BLOG_READ_MINUTES` aynı.
  - tr/en biçim `createTranslator` ile: "5 dk okuma", "5 min read", "1 min read", "120 dk okuma".
- Canlı DB (`tests/blog-posts.live.test.ts`, 11/11):
  - Migration SQL'i gerçek Postgres'te iki kez koşuldu.
  - Ayrıştırma durumları: `5 dk`, `5 min read`, `3 dk okuma`, `12 minutes`, `7`, sayısız, `0 dk`, `999 dk` (markdown'lı içerikte tahmin = 6, TS ile aynı), `99999999999 dk` (taşma yok), boş içerik → 1.
  - Dakikası olan satıra dokunulmadı.
  - CHECK 121'i reddediyor.
  - Kayıt yalnız `readMinutes` yazıyor (`readTime: null`).
- E2E (MinIO env komut satırında, blog spec'leri 38/38, 0 atlandı):
  - `blog-reader`: tr "2 dk okuma", en "2 min read" (liste ve detay).
  - `admin-blog-new-defaults`: sayı alanı, aralık dışı değer tarayıcıda reddediliyor ve kayıt yok.
- Pre-push `pnpm gate` (`--no-verify` yok):
  - lint 0 hata (4 uyarı, hepsi dokunmadığım dosyalarda)
  - typecheck temiz; vitest 4741 geçti / 120 atlandı
  - i18n:check, rls:check, rls:bypass-check temiz
  - rls:verify --require-db: deny-all 0
  - e2e **374 geçti / 3 atlandı**. Atlananlar `admin-documents-upload` LIVE, `price-lock-deeper-campaign`, `purge-failure-alert-console`; hiçbiri blog değil.
  - alerts:check temiz; push başarılı.

## Değişen dosyalar
`prisma/schema.prisma`, `prisma/migrations/blog-read-minutes.sql`, `prisma/migrations/blog-read-minutes.down.sql`, `prisma/migrations/apply-order.txt`, `src/lib/blog-read-time.ts`, `src/lib/blog-shared.ts`, `src/lib/blog.ts`, `src/lib/blog-seed.ts`, `src/app/[locale]/admin/blog/client.tsx`, `src/app/[locale]/(public)/blog/page.tsx`, `src/app/[locale]/(public)/blog/[slug]/page.tsx`, `src/components/BlogSection.tsx`, `messages/tr.json`, `messages/en.json`, `docs/DATA_MODEL.md`, testler (`tests/blog-*.ts(x)`, `admin-actions-authz`, `fabricated-identity-strings`, 7 blog e2e spec'i), ekran görüntüleri.

## Canlıya uygulama (YAPILMADI — patron onaylı ayrı adım)
Sıra:
1. **Önce migration, sonra kod.** Migration eski kodla uyumlu: eski kod `readTime` yazmaya devam eder, yeni kolon NULL kalır.
   Komut: `DATABASE_URL=<canlı> scripts/apply-migrations.sh`. Sırada en sonda `blog-read-minutes.sql` var. Tek dosya için: `psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f prisma/migrations/blog-read-minutes.sql`. Tablo RLS'siz, system_scope gerekmez.
2. Uygulama kodunu dağıt (PR #107 içeren `dev` → main).
3. **Dağıtımdan sonra migration'ı bir kez daha koştur.** Aradaki pencerede eski kodun yazdığı NULL satırlar dolar. İdempotent; ikinci koşu `UPDATE 0` ya da yalnız o satırlar.
4. Kontrol: `SELECT count(*) FILTER (WHERE "readMinutes" IS NULL) FROM "BlogPost";` → 0.

Geri alma: önce kodu geri al, sonra `scripts/apply-migrations.sh --down blog-read-minutes.down.sql`. Kayıp yalnız metnin biçiminde: `readTime` dakikadan "N dk okuma" olarak yeniden yazılır, İngilizce "5 min read" metni "5 dk okuma" olur.

## Riskler
- Sıra yanlış olursa (önce kod, sonra migration) yeni kod olmayan kolonu okur ve blog sayfaları 500 verir. Yukarıdaki sıraya uyulmalı.
- Dağıtım penceresinde eski kodun yazdığı satırda `readMinutes` NULL olur. Sayfa bu satırda içerikten tahmini gösterir (kırılmaz). 3. adım satırı kalıcı doldurur.
- SQL'deki kelime sayımı TS'deki sayımın SQL kopyası (yalnız backfill için). `[[:alnum:]]` Unicode'u DB'nin locale'ine göre tanır; Türkçe harfler UTF-8 DB'de sayılır. Canlı test markdown'lı örnekte iki tarafın eşit sonuç verdiğini ölçüyor.
- PR, #106 merge olmadan merge edilirse FO-83'ün commit'ini de içeri alır. Bu zararsız ama #106'nın ayrı incelemesini atlatır.

## Açık sorular
- Yok.

## Sonraki adım (takip önerisi)
- **`readTime` kolonunu kaldır:** canlıda en az bir dağıtım döngüsü sorunsuz geçtikten sonra yapılmalı.
  - Migration `drop-blog-read-time.sql`: `ALTER TABLE "BlogPost" DROP COLUMN IF EXISTS "readTime";`. Ardından `readMinutes`'e `SET NOT NULL` (önce NULL sayısı 0 olmalı).
  - Şemada `readMinutes Int` yap, `readMinutesOf` geri dönüşünü sil.
  - Down dosyası kolonu "N dk okuma" ile geri doldurur.
- Bu adım için ayrı bir kart açılmalı.

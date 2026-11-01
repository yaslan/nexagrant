# TASK-MULU88PPI3HY3 — FB küçük düzeltmeler (İNCELEME-2 K-11 / K-12) — be-fb

Kaynak: `docs/agent-results/TASK-MULT4H6G6LCQG-crw-fb.md` K-11, K-12. Dal: `dev`. Kart fe-fb'deydi, işi be-fb yaptı.

## 1. Ne yapıldı

**K-11: `prisma/migrations/drop-marketplace.sql`.** `DROP`'lardan önce, aynı transaction içinde bir `DO $$` koruması var. Blok iki tabloyu `to_regclass` ile arar. Tablo yoksa atlar, bu yüzden ikinci koşu 0 döner. Tablo varsa `count(*)` alır. Satır varsa ve oturumda `app.allow_marketplace_drop` değeri tam olarak `on` değilse `RAISE EXCEPTION` verir. Mesaj tabloları ve satır sayılarını yazar, HINT kilidin nasıl açılacağını söyler.

- **RLS tuzağı.** İki tabloda da `FORCE ROW LEVEL SECURITY` açık. Bu yüzden tablo sahibi (superuser ya da BYPASSRLS olmayan migrate rolü) `app.tenant_id` olmadan her zaman **0** okur ve korumayı sessizce geçerdi. Kartta önerilen `SELECT count(*)` tek başına işe yaramazdı. Bu yüzden blok saymadan önce `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` çalıştırır. Bu adım sahiplik ister, `DROP` da aynı yetkiyi ister. Hata olursa transaction geri alınır, FORCE da geri gelir (kanıt: S3 sonrası `force=true`).
- Başlık yorumu güncellendi. Kilit şöyle açılır: `PGOPTIONS='-c app.allow_marketplace_drop=on' psql "$URL" -f drop-marketplace.sql`.
- `apply-order.txt`'ye dokunulmadı.

**K-12: `settings/api-keys/actions.ts`.**

- `generateApiKey` ve `revokeApiKey` artık `can(asRole(role), 'manage_users')` ister. Bu yetki yalnız TENANT_OWNER ve TENANT_ADMIN'de var. Aynı sınır `settings/profile/actions.ts` içinde de kullanılıyor.
- Ret bir değer olarak döner: `{ error: 'forbidden' }`, revoke için `{ success: false, error: 'forbidden' }`. Dosyadaki mevcut desen bu. Oturum yoksa kod eskisi gibi `TenantScopeError` fırlatır.
- `name` alanı doğrulanır: string olmalı, `trim` sonrası 1 ile 100 karakter arasında olmalı. Uymazsa `{ error: 'invalidName' }` döner. Kayda trim edilmiş ad yazılır.
- Dönüş tipleri açıkça yazıldı (`ApiKeyActionError` export edildi). `API_KEY_NAME_MAX` export edilmedi, çünkü `'use server'` modülü yalnız async fonksiyon export edebilir.
- `client.tsx`: yeni sonuç biçimi işleniyor. Ret mesajı `role="alert"` ile Türkçe gösteriliyor. Ret gelen revoke artık satırı listeden silmiyor. Input'a `maxLength={100}` eklendi.

## 2. Kanıt

Geçici DB olarak kendi konteynerim `befb-k11-pg` kullanıldı (pgvector:pg16, :55433, scratchpad'deki psql shim üzerinden). İş bitince silindi. **Paylaşılan `fabrika-postgres`'te migration koşulmadı.** Sahip rolü `k11_owner` NOSUPERUSER NOBYPASSRLS ile açıldı, yani prod'daki migrate rolünün koşulları taklit edildi.

```
--- S1: tablolar yok, 2 kez
NOTICE:  table "MarketplaceOrder" does not exist, skipping
exit=0
NOTICE:  table "MarketplaceOrder" does not exist, skipping
exit=0
--- S2: bos tablolar (down.sql ile yeniden)
tablolar: MarketplaceListing force=true, MarketplaceOrder force=true
exit=0
tablolar: (yok)
exit=0          # ikinci koşu
--- S3: dolu tablo
sahip rolun cıplak sayimi (RLS gizler): 0
gercek satir (system_scope ile): 2 listing, 1 order
ERROR:  drop-marketplace: refusing to drop tables that hold rows: MarketplaceOrder=1 MarketplaceListing=2
HINT:  Back the rows up, then rerun with PGOPTIONS='-c app.allow_marketplace_drop=on'.
exit=3
--- S3 sonrasi (geri alindi mi?)
gercek satir (system_scope ile): 2 listing, 1 order
tablolar: MarketplaceListing force=true, MarketplaceOrder force=true
--- S3b: yalniz listing dolu, order bos
ERROR:  ... refusing to drop tables that hold rows: MarketplaceListing=2
exit=3
--- S3c: bayrak yanlis deger (true) -> yine durmali
ERROR:  ... refusing to drop tables that hold rows: MarketplaceListing=2
exit=3
--- S4: bayrak on -> dusurur, sonra 2. kosu
exit=0
tablolar: (yok)
exit=0
```

"Sahip rolün çıplak sayımı: 0" satırı gerçek 2 satıra karşı alındı. Bu satır NO FORCE adımının gerekli olduğunu gösteriyor.

**Tam zincir.** Temiz `k11chain` DB'sinde CI sırası izlendi: `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2. `DATABASE_URL_RLS_TEST` env ile verildi, `.env` değişmedi (md5 aynı).

```
=== PASS 1
exit=0
==> [24/29] drop-marketplace.sql
apply-migrations: 29 files applied
=== PASS 2
exit=0
==> [24/29] drop-marketplace.sql
apply-migrations: 29 files applied
.env degismedi
```

**K-12 testleri.** `tests/modules/api-keys.test.ts` 5 testten 25 teste çıktı:

- Rol: OWNER ve ADMIN üretebiliyor. PIPELINE_MANAGER, WRITER, MEMBER ve GUEST_PARTNER reddediliyor ve `create` çağrılmıyor.
- Enum dışı rol hiçbir şey kazanmıyor. Rolsüz üye revoke edemiyor ve `deleteMany` çağrılmıyor. Oturumsuz çağrı yine fırlatıyor.
- Ad: boş, yalnız boşluk, 101 karakter, string olmayan ve eksik değerlerin hepsi reddediliyor. 100 karakter kabul ediliyor. Kayda trim edilmiş ad gidiyor.

Mutasyon kanıtı: rol kontrolü `false &&` ile devre dışı bırakılınca **9 test kırmızıya döndü**. Dosya geri yüklendikten sonra testler yeşil:

```
× PIPELINE_MANAGER is refused and no key is stored
× ... (toplam) Failed Tests 9
```

Kapılar `set -a; source .env; set +a` ile koşuldu:

```
typecheck exit=0
lint exit=0
test exit=0
 Test Files  185 passed | 2 skipped (187)
      Tests  2125 passed | 8 skipped (2133)
```

## 3. Değişen dosyalar

- `prisma/migrations/drop-marketplace.sql`
- `src/app/[locale]/(app)/[workspace]/settings/api-keys/actions.ts`
- `src/app/[locale]/(app)/[workspace]/settings/api-keys/client.tsx`
- `tests/modules/api-keys.test.ts`
- `docs/agent-results/TASK-MULU88PPI3HY3-be-fb.md` (bu rapor)

## 4. Riskler

- Koruma, tablolar zaten düşürülmüş DB'lerde (CI, yerel) hiçbir şey yapmaz. Yalnız henüz uygulanmamış bir ortamda devreye girer. Böyle bir ortamda satır varsa zincir `exit 3` ile durur. Bu istenen davranış, ama release sırasında karşılaşan kişinin HINT'i okuması gerekir.
- Migration'ı uygulayan rol tablonun sahibi değilse ve superuser da değilse, `ALTER TABLE … NO FORCE` yetki hatası verir. Böyle bir rol `DROP TABLE`'ı da çalıştıramazdı, yani yeni bir kısıt eklenmiş olmuyor.
- API anahtarı sayfası rolsüz üyeye formu hâlâ gösteriyor. Butona basınca sunucu reddediyor ve mesaj görünüyor. Formun baştan gizlenmesi ayrı bir UI işi.
- UI değişikliği gerçek tarayıcıda tıklanarak denenmedi. :3000 leed-fb'de, e2e de R8 kill-guard nedeniyle koşulamıyor. Kanıt birim testi ve typecheck ile sınırlı.

## 5. Açık sorular

- Ayrı bir `manage_api_keys` yetkisi istenir mi? Şu an `manage_users` kullanılıyor, kartın izin verdiği "mevcut eşdeğer" bu.

## 6. Sonraki adım

- crw-fb K-11 ve K-12'yi yeniden inceleyebilir.
- İstenirse UI'da rolsüz üyeye formu gizleyen küçük bir kart açılabilir.

## Platform beyanı

Doğrulama **macOS** (Darwin 27.0.0) üzerinde yapıldı. Postgres, Docker'da Linux konteyneri olarak koştu (pg16). SQL koruması sunucu tarafında çalışır ve istemci işletim sisteminden bağımsızdır. `PGOPTIONS` libpq ortam değişkeni olduğu için Linux ve macOS kabuklarında aynı çalışır. Windows'ta `set PGOPTIONS=-c app.allow_marketplace_drop=on` ya da oturum içinde `SET app.allow_marketplace_drop = on` gerekir; bunun sözdizimi farkı dışında davranışı aynıdır. TS değişiklikleri (rol kontrolü, ad doğrulama) platforma bağlı bir yol kullanmıyor. **Windows ve Linux'ta koşulmadı**, çünkü bu makinede yalnız macOS var.

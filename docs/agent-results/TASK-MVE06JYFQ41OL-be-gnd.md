---
sözleşme: 3
görev: TASK-MVE06JYFQ41OL
kod: TASK-MVE06JYFQ41OL
ajan: be-gnd
motor: claude
tip: diğer
okur: kullanıcı
hüküm: Bitti: ters yön kilidi PR #124 ile dev'e açık (merge yok). tenant-discovery ve subject-scoped artık ExpertPreRegistration/ExpertPreRegAttempt'te 0 satır görüyor ve yazamıyor; mutant kırmızı, tam gate yeşil.
platform: mac (darwin) üzerinde doğrulandı. Değişiklik saf SQL (RLS fonksiyonu) ve TS (ölçüm betiği, test); platforma bağlı kod yolu yok, Windows/Linux'ta davranış aynı. Windows/Linux koşulmadı: bu makinede yalnız mac var.
sürüm: 1
tarih: 2026-10-19T21:04:41.811Z
---

# FO-92 · Uzman kişisel verisi yalnız işleyen amaçlara açık (FO-52 ters yön)

## Kararlar

```karar
kimlik: karar-1
soru: Uzman verisi (ExpertPreRegistration/Attempt) cross-tenant-job amacına açık kalsın mı? FO-50 saklama temizliği (PR #92) bu amaçla çalışıyor; bu yüzden öteki cron işleri de uzman verisini okuyabiliyor.
seçenek: A | Açık kalsın (PR #124 böyle); #92 değişmeden çalışır
seçenek: B | Ayrı 'expert-retention' amacı açılsın; #92 ona geçsin, cross-tenant-job kapansın
öneri: A
karar_kimligi: K-570170
```

## Ne yapıldı
- **Keşif:** Kartın asıl kısmı (public-intake → yalnız uzman form tabloları, `to_regclass`, rls:verify satırları, live test a/b/c) **PR #115 ile dev'de** (`49e6a817`, se-fb). Kalan iş FO-52 kartındaki **EK — ters yön** maddesiydi (FO-21 O4): `tenant-discovery` ile `ExpertPreRegistration` 5/5 görünüyordu.
- **Kod taraması:** origin/dev'de uzman tablolarına dokunan bütün çağrılar ve kullandıkları amaçlar: `register.ts` ve `verify.ts` → `public-intake`, `admin.ts` (liste + CSV) → `platform-admin`, `seats.ts` → `platform-aggregate`. Açık PR #92 (FO-50) `retention.ts` → `cross-tenant-job`. `tenant-discovery` ya da `subject-scoped` ile uzman tablosuna dokunan kod yok.
- **`prisma/rls.sql` `system_scope_open`:** mühürlü dala şu koşul eklendi: `(tbl IN (to_regclass(EPR), to_regclass(EPRA))) IS NOT TRUE OR purpose IN ('public-intake','platform-admin','platform-aggregate','cross-tenant-job')`. `IS NOT TRUE` sayesinde eksik bir tablo (NULL) listede yokmuş gibi davranıyor, hata vermiyor. Sahip dalı ve `tenant_isolation` aynı kaldı. `COMMENT ON FUNCTION`, üstteki yorum bloğu ve ExpertPreRegistration yorumu güncellendi.
- **`scripts/check-rls-live.ts`** (`probePurposeTables`): kapalı iki amaçta uzman tabloları kapsam dışındaki sayıdan fazla göstermemeli ve INSERT reddedilmeli; ikisinden biri olmazsa FAIL. Öteki tablolarda "tüm satırlar" kontrolü aynen sürüyor. Mesajlar Türkçe.
- **`tests/system-scope.live.test.ts`:** yeni describe eklendi. Kendi fixture satırını public-intake ile yazıyor, aynı işlemde 6 amacı tek tek sayıyor ve ROLLBACK ile bitiyor; global sayım kullanmıyor. Ayrıca `tenant-discovery` INSERT'inin reddi test ediliyor.
- `src/lib/system-scope.ts` JSDoc ve ADR-0009 §6 notu eklendi.
- `ExpertFounderCounter` kişisel veri taşımadığı için ters listeye alınmadı (zaten dev'de yok, FO-50 dalında).

## Kanıt (ham çıktı)
**Önce** (fabrika_app, `SET LOCAL ROLE fabrika_app; enter_system_scope(p)`, ROLLBACK):
```
p | epr | att
outside | 0 | 0
tenant-discovery | 5 | 5
subject-scoped | 5 | 5
cross-tenant-job | 5 | 5
platform-admin | 5 | 5
platform-aggregate | 5 | 5
public-intake | 5 | 5
```
**Prototip** (rls.sql tek işlemde, ROLLBACK; mem = Membership):
```
tenant-discovery | 0 | 0 | 31
subject-scoped | 0 | 0 | 31
cross-tenant-job | 5 | 5 | 31
platform-admin | 5 | 5 | 31
platform-aggregate | 5 | 5 | 31
public-intake | 5 | 5 | 0
```
**Sonra — `pnpm db:rls` → `pnpm rls:verify --require-db`** (ölçüm rolü: fabrika_app, rolbypassrls=false):
```
✅ prisma/rls.sql applied. Policies in public: 117 → 117
✓ public-intake: 51 system_scope tablosunda kapsam dışıyla aynı satır sayısı (yalnız ExpertPreRegistration, ExpertFounderCounter, ExpertPreRegAttempt açık)
✓ public-intake: AuditEvent INSERT reddedildi
✓ public-intake: ExpertPreRegistration INSERT kabul edildi (pozitif kontrol, geri alındı)
✓ tenant-discovery: ExpertPreRegAttempt=0/5, ExpertPreRegistration=0/5 — uzman verisi kapalı
✓ tenant-discovery: ExpertPreRegistration INSERT reddedildi
✓ tenant-discovery: 30 tablo kapsamla açıldı, uzman verisi dışında her system_scope tablosunda tüm satırlar
✓ subject-scoped: ExpertPreRegAttempt=0/5, ExpertPreRegistration=0/5 — uzman verisi kapalı
✓ subject-scoped: ExpertPreRegistration INSERT reddedildi
✓ platform-admin: 32 tablo kapsamla açıldı, her system_scope tablosunda tüm satırlar
✓ platform-aggregate: 32 tablo kapsamla açıldı, her system_scope tablosunda tüm satırlar
✓ cross-tenant-job: 32 tablo kapsamla açıldı, her system_scope tablosunda tüm satırlar
```
**Mutant** (dev'in koşulsuz `rls.sql`'i uygulandı, sonra geri alındı):
```
rls:verify exit=1
• tenant-discovery: uzman kişisel verisini görüyor (kapalı olmalı): ExpertPreRegAttempt=5>0, ExpertPreRegistration=5>0
• tenant-discovery: ExpertPreRegistration INSERT KABUL EDİLDİ
• subject-scoped: uzman kişisel verisini görüyor (kapalı olmalı): ExpertPreRegAttempt=5>0, ExpertPreRegistration=5>0
• subject-scoped: ExpertPreRegistration INSERT KABUL EDİLDİ
live: × tenant-discovery and subject-scoped read 0, the handling purposes read the row
      AssertionError: expected { 'tenant-discovery': 1, …(5) } to deeply equal { 'tenant-discovery': +0, …(5) }
      × tenant-discovery cannot write an expert row — promise resolved "Result{ command: 'INSERT' }" instead of rejecting
      Tests  2 failed | 20 passed (22)
```
**Live testler** (süre duvarlı): `system-scope.live` 22/22. Uzman live testleri (app-role, reissue, prereg) ile birlikte 4 dosya, 32/32.

**Gerçek akış:** `tests/e2e/expert-prereg.spec.ts` gerçek Playwright tıklamalarıyla koşuldu; dev sunucusu **fabrika_app** bağlantısıyla çalışıyordu (`E2E_DATABASE_URL=$DATABASE_URL_RLS_TEST`), Mailpit :8025. Sonuç 7/7 passed. Kapsam: /tr/uzman formu → Mailpit doğrulama linki → kurucu numarası → admin listesi + CSV (platform-admin) → aynı e-postanın reddi. Koltuk sayısı (platform-aggregate) form sayfasında okunuyor.

**Pre-push tam gate (3. deneme, yeşil, push edildi):**
```
Test Files  363 passed | 7 skipped (370)
Tests  4800 passed | 120 skipped (4920)
✅ rls:check / rls:bypass-check / rls:verify (yukarıdaki satırlar, ExpertPreRegAttempt=0/8) / db:rls-role
377 passed (7.4m)   [e2e]
✅ Öksüz alarm yok   [alerts:check]
* [new branch] be-gnd/fo92-expert-reverse-lock
```
Önceki iki gate denemesindeki kırmızılar ortamdan kaynaklandı, kod değişmedi:
1. Yük ortalaması 46'yken 3 vitest dosyası süre aşımına uğradı; tek başına koşulunca hepsi geçti. Admin-blog e2e `ECONNRESET` ile düştü; tek başına 5/5 geçti.
2. Paylaşımlı yerel DB'de başka bir ağaç `pnpm db:rls`'i dev sürümüyle koştu (fonksiyonda FO-92 kalmadı) ve yeni iki live test kırmızı oldu. Yeniden uygulayınca geçtiler.
3. Üst üste koşulan e2e'ler aynı localhost IP'siyle uzman formunun saatlik IP kotasını doldurdu ("Çok fazla deneme yapıldı"). f10/m10 oturum testleri tek başına 8/8 geçti. Kotanın boşalması beklendi, `--no-verify` kullanılmadı.

## Değişen dosyalar
Commit `efbfd745`, dal `be-gnd/fo92-expert-reverse-lock`, **PR #124 → dev (merge yok)**
- `prisma/rls.sql`
- `scripts/check-rls-live.ts`
- `tests/system-scope.live.test.ts`
- `src/lib/system-scope.ts`
- `docs/adr/ADR-0009-signed-system-scope.md`

Ön kayıt kodu (`register.ts`, `verify.ts`) değişmedi. FO-101 (`csv.ts`), FO-102 (`content/kvkk-uzman-*`) ve FO-98 dosyalarına dokunulmadı. FO-98 worktree'si başladığımda boştu, ama `check-rls-live.ts`'te aynı fonksiyona (`probePurposeTables`) dokunacaksa küçük bir merge çakışması çıkabilir.

## Riskler
- **Paylaşımlı yerel DB:** `pnpm db:rls` bu dalın sürümüyle uygulanmış durumda. Başka bir ağaç dev'in `rls.sql`'ini uygularsa ters kilit kalkar; bu dalın live testleri kırmızı olur, ötekilerin testleri etkilenmez. Merge sonrası fark kalmıyor. Geri alma: dev ağacından `pnpm db:rls` (CREATE OR REPLACE, idempotent; iki kez uygulandı, 117 → 117).
- **FO-50 (PR #92):** saklama temizliği `cross-tenant-job` ile çalışıyor ve bu amaç açık, yani #92 bozulmaz. Bunun bedeli şu: öteki cron işleri (alerts-daily, m4-weekly…) de uzman verisini okuyabilir. Aşağıdaki karar bununla ilgili.
- Sınır §5 ile aynı: `app.system_scope_purpose` USERSET. Bu kilit unutmaya karşı koruyor, saldırgana karşı değil.

## Açık sorular
Kararlar bölümünde (cross-tenant-job).

## Sonraki adım
- PR #124 incelenip dev'e alınmalı. Merge sonrası canlıda `pnpm db:rls` koşulmalı (canlı DB'ye dokunmadım).
- Karar B seçilirse: yeni `expert-retention` amacı açılır, #92 o amaca geçer, `cross-tenant-job` listeden çıkar.

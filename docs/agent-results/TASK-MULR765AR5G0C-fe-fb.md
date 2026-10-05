# TASK-MULR765AR5G0C — Karne sonuç ekranı iletişim formu (PublicLead) — fe-fb

**Sprint:** FB-KAMU-2 · **Dal:** dev · **Kod commit'leri:** `284ecacb` (özellik), `0ac5fba3` (marka metni + where-guard düzeltmesi) · **Önceki kart:** TASK-MULR3TQ24ZZ7N (`959c1e80`)

**Platform beyanı:** web. **macOS**'ta (Darwin 27, Google Chrome, Playwright headless) doğrulandı: masaüstü 1280 px (tr) ve mobil 390 px (en). Windows ve Linux'ta koşulmadı çünkü bu makinede yalnız macOS var. Kod platforma bağlı bir yol içermiyor. Form tarayıcıda React ile çalışıyor, sunucu tarafı Node + Postgres. Süreç, dosya yolu, kabuk ya da izin kullanılmıyor. IP özeti `node:crypto` HMAC ile alınıyor ve her platformda aynı. Bu yüzden Windows ve Linux'ta da aynı davranış bekleniyor.

## 1. Ne yapıldı

1. **Model `PublicLead`** (`prisma/schema.prisma`, `prisma/migrations/add-public-lead.sql` + `.down.sql`, `apply-order.txt` sonuna eklendi). Alanlar: ad, e-posta (kırpılır ve küçük harfe çevrilir), kurum, il ve ilçe (isteğe bağlı), karne sonucu (`readinessCode`; puan ve seviye sunucuda `scoreReadiness` ile **yeniden hesaplanır**, istemciden gelen değer kullanılmaz), rıza metni sürümü ve onay zamanı, kaynak (`fon-hazirlik`), dil, `ipHash`, `createdAt`. Tablo kiracıya bağlı değil.
   - **RLS kararı:** ziyaretçinin hesabı olmadığı için `tenantId` de yok. Tablo `User` ve `SystemAlert` gibi platform tablosu. `scripts/rls-models.ts` `SYSTEM_WIDE` listesine gerekçesiyle eklendi. `scripts/tenant-bypass-scan.ts` `CATALOGUE_REASONS` altına gerekçe yazıldı ve gate çıktısında basılıyor (`check-tenant-bypass.ts` filtresine eklendi). Tek sanctioned kaçış silme işindeki `withSystemScope('cross-tenant-job')`. Bu `tenant-bypass-baseline.json`'a gerekçeli CHECK D kaydı olarak girdi. Nedeni: NULL kiracılı `AuditEvent` yalnız `system_scope` altında yazılabiliyor.
2. **Form** (`src/app/[locale]/fon-hazirlik/lead-form.tsx`), sonuç ekranında CTA'dan sonra, paylaşım bölümünden önce duruyor. Yazdırmada gizli.
   - tr/en metinler `readiness.lead.*` altında. Marka adı `{brand}` = `PRODUCT_NAME`.
   - Açık rıza kutusu zorunlu ve varsayılan olarak işaretsiz. Metin sürümlü (`PUBLIC_LEAD_CONSENT.version = 2026-09-30.1`), eski sürümle gelen form reddedilir. Aydınlatma metni bağlantısı `PRIVACY_NOTICE.href(locale)` ile veriliyor.
   - İstemci doğrulaması var. Sunucu her kontrolü yeniden yapar.
   - Honeypot: ekran dışındaki `website` alanı. Doluysa yanıt `ok` olur ama satır yazılmaz.
   - Erişilebilirlik: etiketler, `aria-invalid` ve `aria-describedby` (ipucu + hata). Hatada odak ilk hatalı alana, başarıda başarı başlığına gider. Genel hatalar `role=alert` ile duyurulur. Dokunma hedefleri: kutu 24×24 px, düğme 44 px yüksekliğinde. İl, karnede seçilen ille önceden doldurulur.
   - Analitik: `readiness_lead_submitted {orgType, level}` olayı. PII içermez.
3. **Sunucu** (`src/app/[locale]/fon-hazirlik/actions.ts` → `src/lib/leads/public-lead.ts`):
   - Zod ile doğrulama.
   - Hız sınırı: **e-posta başına 24 saatte 3, IP başına saatte 10**. Sayım ve yazma aynı transaction'da `pg_advisory_xact_lock` altında yapılır, eşzamanlı istekler sınırı aşamaz. Repoda hazır bir rate-limit yardımcısı yoktu. Davet e-postası sınırındaki (`invitation-mail-policy`) "DB sayımı + lock" kalıbı kullanıldı.
   - IP yalnız `AUTH_SECRET`'tan türetilen anahtarla HMAC-SHA256 olarak saklanır.
   - Kişisel veri günlüğe yazılmaz. Hata yolunda yalnız hata adı loglanır.
   - İstemci-güvenli sabitler `public-lead-policy.ts` dosyasında.
4. **Saklama:** `PUBLIC_LEAD_RETENTION_DAYS = 365` tek sabit olarak tanımlı (öneri 12 ay, **KARAR GEREKLİ**, §5).
   - Gece işi `public-lead-cleanup` her gün 03:45 UTC'de koşar (`schedule.ts`, `tasks/index.ts`).
   - Silme tek koşulla yapılır: `createdAt < cutoff`. Geçersiz cutoff `RangeError` fırlatır, bu yüzden filtresiz silme olamaz.
   - AuditEvent `public_lead.purged` satırı `tenantId NULL` ve yalnız `{count, retentionDays, cutoff}` içerir. Hiçbir şey silinmezse satır yazılmaz. Hata olursa `SystemAlert` yazılır ve iş yeniden denenir.
5. **Admin listesi** `/[locale]/admin/leads`: admin layout'u zaten 404 veriyor, sayfa ayrıca `requirePlatformAdmin()` ile kendisi kontrol ediyor. En yeni 200 talep ve toplam sayı gösterilir. Sütunlar: rıza sürümü, onay zamanı ve silinme tarihi. **CSV ya da dışa aktarım yok.** Menüde "İletişim Talepleri" girdisi var (`AdminSidebarNav`, `adminLeads.*`).
6. **Belgeler:**
   - `docs/legal/processing-register.md` **§18d** taslağı eklendi: amaç, veri, hukuki sebep açık rıza, süre, alıcı yok. Başında "TASLAK — cs-fb gözden geçirecek" notu var. §20 ters kontrol tablosuna `PublicLead` satırı eklendi.
   - `docs/DATA_MODEL.md` §21 eklendi.
   - `docs/ROADMAP.md` FB-KAMU-1 satırı güncellendi.

## 2. Kanıt

### Kapılar: temiz worktree, `0ac5fba3`, `git status` boş

```
pnpm typecheck        → tc=0
pnpm lint             → lint=0
pnpm i18n:check       → i18n=0  ✅ both catalogs agree … no file gained hard-coded text
pnpm rls:check        → rlscheck=0
pnpm rls:bypass-check → bypass=0  ✅ no new tenant bypass … 36 on the sanctioned cross-tenant path
pnpm build            → build=0   (├ ƒ /[locale]/admin/leads · ├ ƒ /[locale]/fon-hazirlik)
```

### Test DB'si

İzole bir test DB'si açıldı: `fefb_lead` (5433). Kurulum adımları:
1. `prisma migrate diff --from-empty --to-schema` ile şema kuruldu, üstüne `add-public-lead.sql` uygulandı.
2. `pnpm db:rls` (politikalar 0 → 112) ve `pnpm db:rls-role` koşuldu. `.env` md5'i değişmedi.
3. Kod `fabrika_app` (NOBYPASSRLS) ile koşuyor ve bu `assertRlsSubjectRole` ile doğrulanıyor.

DB iş bitince silindi (`DROP DATABASE`).

### Hedefli vitest (izole DB)

```
tests/public-lead.live.test.ts                          11 passed  (5 ardışık koşu, hepsi 11/11)
src/lib/leads/public-lead.test.ts                        9 passed
src/lib/jobs/tasks/__tests__/public-lead-cleanup.test.ts 4 passed
+ jobs-schedule, rls-coverage, readiness, system-scope.live, auditevent-null-system-only.live,
  where-guard-src, teardown-where-guard, retired-brand-name → hepsi geçti
Paylaşılan "fabrika" DB'de: public-lead.live → 11 skipped (tarihe göre silme paylaşılan DB'de koşmaz)
```

Canlı testlerin kapsadığı durumlar:
- Geçerli kayıt tek satır yazar. E-posta küçük harfe çevrilir. Puan istemci "100/hazir" gönderse de 50/gelisen olarak yeniden hesaplanır. Satırda ham IP geçmez.
- Rıza `false`, rıza `'on'` ya da eski sürümle gelen form hiç satır yazmaz.
- Geçersiz alanlar adlarıyla döner.
- Bozuk karne kodu atılır.
- Honeypot doluysa yanıt `ok` olur ve 0 satır yazılır.
- Aynı e-postayla 4. istek (farklı IP'den de olsa) reddedilir. 24 saat sonra yeniden kabul edilir.
- Aynı IP'den 11. istek reddedilir. Başka IP etkilenmez.
- **6 eşzamanlı istekten tam 3'ü** kaydedilir.
- Silme: 400 gün ve sınırın 1 ms ötesi silinir. Tam sınırdaki, 364 günlük ve bugünkü satır kalır. Tek denetim satırı yazılır (`tenantId null`, `{count:2,…}`, e-posta yok). İkinci koşu 0 satır siler. İş cron tick'ine göre siler.

### Mutantlar

Koşular izole DB'de yapıldı. Her mutanttan sonra dosya yedekten geri kondu ve md5 doğrulandı. `git checkout` kullanılmadı.

```
M1 honeypot yok                  -> 1 failed | 19 passed -> ÖLDÜ
M2 riza kontrolu yok             -> 2 failed | 18 passed -> ÖLDÜ
M3 e-posta siniri >= -> >        -> 2 failed | 18 passed -> ÖLDÜ
M4 IP siniri yok                 -> 1 failed | 19 passed -> ÖLDÜ
M5 advisory lock yok             -> 1 failed | 19 passed -> ÖLDÜ   (yarış testi)
M6 purge lt -> lte               -> 2 failed | 18 passed -> ÖLDÜ
M7 purge filtresiz               -> 4 failed | 16 passed -> ÖLDÜ
M8 puan istemciden               -> 1 failed | 19 passed -> ÖLDÜ
M9 denetim satiri yok            -> 1 failed | 19 passed -> ÖLDÜ
M10 ham IP saklaniyor            -> 2 failed | 18 passed -> ÖLDÜ
M11 e-posta kucuk harf yok       -> 3 failed | 17 passed -> ÖLDÜ
M12 system scope yok             -> 3 failed | 17 passed -> ÖLDÜ   (NULL-tenant audit fabrika_app'te reddedilir)
M13 il dogrulamasi yok           -> 2 failed | 18 passed -> ÖLDÜ
restored ok
```

### Tam süit (izole DB, temiz worktree `0ac5fba3`)

```
Test Files  5 failed | 235 passed | 2 skipped (242)
     Tests  10 failed | 2743 passed | 69 skipped (2822)
```

Düşen 10 test benim değişikliğimden gelmiyor. Aynı 5 dosya **taban commit `ee7faa60`'ta aynı izole DB'de de 10 test düşürüyor**:

```
ee7faa60: Test Files 5 failed (5) · Tests 10 failed | 43 passed | 5 skipped
```

Dosyalar: `plan-admin`, `cron-tenant-scope`, `double-charge-prevention`, `plan-storefront`, `stripe-webhook-tenant-scope.live`. Sebep, boş DB'de seed'li plan ve Topic satırlarının olmaması ("no Topic rows locally", "plan-pro … not-visible"). `cron-tenant-scope` paylaşılan DB'de 13/13 geçiyor.

İlk tam koşuda 3 hata **benimdi** ve `0ac5fba3` ile düzeltildi:
- `where-guard-src`: `where: due` için gerekçeli KNOWN kaydı eklendi.
- `teardown-where-guard`: test temizliği literal tip ile yapılıyor.
- `retired-brand-name`: rıza metninde eski marka "Fabrika" geçiyordu, yerine `{brand}` kondu.

### Gerçek tıklama ve yazma (:3000, Playwright + Chrome, paylaşılan DB)

Betik: `docs/agent-results/TASK-MULR765AR5G0C-screenshots/lead-e2e.mjs`. Son koşunun çıktısı (kısaltılmış):

```
[tr 1280] heading: Sonucunuzu bir uzmanla konuşun · province prefilled: Samsun
  empty submit errors: Adınızı yazın … | Geçerli bir e-posta … | Kurumunuzun adını … | Göndermek için açık rıza kutusunu işaretleyin.
  focus after empty submit: lead-name
  bad email → focus=lead-email · aria-invalid=true describedby="lead-email-hint lead-email-error"
  no-consent errors: Göndermek için açık rıza kutusunu işaretleyin. · focus=lead-consent · rows before consent: 0
  consent (klavye: Space) checked: true · target sizes: checkbox 24x24 · submit 90x44
  success: "Teşekkürler, talebiniz alındı." focus=lead-heading · horizontal overflow px: 0
  db rows: 1 {…"readinessTotal":50,"readinessLevel":"gelisen","consentVersion":"2026-09-30.1","locale":"tr","iphashlen":64}
[en 390] heading: Talk your result over with an expert  (aynı adımlar, İngilizce hata metinleri)
  target sizes: checkbox 24x24 · submit 316x44 · success focus=lead-heading · overflow 0 · db rows: 1 (locale "en")
[admin] anonymous /tr/admin/leads → HTTP 404
[admin] signed-in /tr/admin/leads → HTTP 200 h1="İletişim talepleri" · nav: İletişim Talepleri / Lead
  rows with e2e emails: 2 · export/csv links: 0
cleanup id=cmun6se9u00044nxk107xsfu7 deleted=1
cleanup id=cmun6sflj00054nxk8blfsz9j deleted=1
left with run tag: 0 · PublicLead rows on shared fabrika: 0
```

Her test kaydı **kendi id'siyle** silindi. İlk koşuda iki hata çıktı ve düzeltildi:
- en/390'da başarıdan sonra odak `BODY`'de kalıyordu. `requestAnimationFrame` yerine `useEffect` kullanılınca düzeldi.
- Onay kutusu 20×20 px'ti, 24×24 px'e büyütüldü.

Analitik olayı konsolda görünmüyor. Sebep: `analytics.track` PostHog anahtarı yokken kapalı (TASK-MULQMKP4YOM04), yani bu beklenen davranış.

Ekran görüntüleri (`docs/agent-results/TASK-MULR765AR5G0C-screenshots/`). Bu kartın ekranı önceden yoktu, dolayısıyla "önce" hali form öncesi sonuç ekranı (TASK-MULR3TQ24ZZ7N kareleri):

| Dosya | İçerik |
| --- | --- |
| `tr-01-form-1280.png` / `en-01-form-390.png` | Boş form (il önceden dolu) |
| `tr-02-errors-1280.png` / `en-02-errors-390.png` | Boş gönderim hataları |
| `tr-03-success-1280.png` / `en-03-success-390.png` | Başarı paneli |
| `tr-04-page-1280.png` / `en-04-page-390.png` | Sonuç sayfasının tamamı |
| `admin-01-leads-1280.png` | Admin listesi + menü girdisi |

## 3. Değişen dosyalar

- **Yeni:** `src/lib/leads/public-lead.ts`, `src/lib/leads/public-lead-policy.ts`, `src/lib/leads/public-lead.test.ts`, `src/app/[locale]/fon-hazirlik/lead-form.tsx`, `src/app/[locale]/fon-hazirlik/actions.ts`, `src/app/[locale]/admin/leads/page.tsx`, `src/lib/jobs/tasks/public-lead-cleanup.ts`, `src/lib/jobs/tasks/__tests__/public-lead-cleanup.test.ts`, `tests/public-lead.live.test.ts`, `prisma/migrations/add-public-lead.sql`, `prisma/migrations/add-public-lead.down.sql`, `docs/agent-results/TASK-MULR765AR5G0C-screenshots/*`
- **Değişen:** `prisma/schema.prisma`, `prisma/migrations/apply-order.txt`, `src/app/[locale]/fon-hazirlik/readiness-check.tsx`, `src/components/AdminSidebarNav.tsx`, `src/lib/jobs/schedule.ts`, `src/lib/jobs/tasks/index.ts`, `messages/{tr,en}.json` (`readiness.lead`, `adminLeads`), `scripts/rls-models.ts`, `scripts/tenant-bypass-scan.ts`, `scripts/check-tenant-bypass.ts`, `scripts/tenant-bypass-baseline.json`, `tests/jobs-schedule.test.ts`, `tests/where-guard-src.test.ts`, `docs/legal/processing-register.md`, `docs/DATA_MODEL.md`, `docs/ROADMAP.md`
- **Dokunulmayanlar:** komşuların dosyaları (m11, m1 outreach, m8, `docs/SMTP-SUNUCU.md`).

## 4. Riskler

- **Paylaşılan yerel DB'ye migration uygulandı.** `fabrika` (5433) üzerinde `add-public-lead.sql` iki kez koştu (idempotent) ve boş `PublicLead` tablosu kaldı. Diğer ortamlarda `scripts/apply-migrations.sh` ile uygulanmalı. Uygulanmazsa form "kaydedilemedi" der, admin sayfası yükleme hatası gösterir, gece işi SystemAlert yazar.
- **IP başına sınır `X-Forwarded-For`'un ilk değerine güveniyor.** Uygulama bu başlığı ezen bir proxy arkasında değilse bot başlığı değiştirip IP sınırını atlatabilir. E-posta sınırı yine geçerli kalır. Dağıtımda proxy'nin XFF'yi yazdığı doğrulanmalı (devop-fb).
- **RLS yok.** Tablo kiracısız olduğu için politika eklenmedi (`User` ile aynı standart). Kiracı kod yolu tabloyu okumuyor ama bir kiracı oturumu teknik olarak okuyabilir. Daha sıkı alternatif: yalnız `system_scope` politikası ve yeni bir amaç (`public-intake`). Bu `enter_system_scope`'un kapalı listesini değiştirir, bu yüzden bu kartta yapılmadı (§5).
- **Rıza metni sürümü.** Metin bu kart içinde bir kez değişti ("Fabrika" → `{brand}`). Gerçek kayıt yokken değiştiği ve test satırları silindiği için sürüm `2026-09-30.1` olarak bırakıldı. Bundan sonraki her metin değişikliğinde sürüm artırılmalı.

## 5. Açık sorular / KARAR GEREKLİ

1. **KARAR GEREKLİ (patron): saklama süresi.** Öneri **12 ay** (`PUBLIC_LEAD_RETENTION_DAYS = 365`, tek sabit). Gerekçe: kamu kurumlarının AB başvuru döngüsü yıllık. Bir çağrıdan sonra bırakılan talep bir sonrakine kadar yanıtlanabilmeli. Daha eski bir karne sonucu kurumun bugünkü durumunu anlatmaz. Alternatifler: 6 ay (daha az veri, ama çağrı döngüsünü kaçırır) ya da 24 ay. Değişirse yalnız sabit ve rıza metni sürümü değişir; metindeki ay sayısı sabitten okunuyor.
2. **cs-fb:** §18d taslağının hukuki nitelendirmesi gözden geçirilmeli. Ayrıca `/privacy` aydınlatma metni bu faaliyeti henüz anlatmıyor; formdaki bağlantı genel metne gidiyor. `ipHash` için meşru menfaat sebebinin teyidi gerekiyor.
3. **Rızanın geri alınması:** ürün içinde bir yol yok, talep gelirse platform yöneticisi satırı elle siliyor. Admin ekranına tek satır silme düğmesi gerekiyor mu?
4. **E-posta çift onayı (double opt-in) yok:** başkası adına talep bırakılabilir. İstenirse SMTP işine bağlanır (devop-fb `docs/SMTP-SUNUCU.md`).
5. **RLS sıkılaştırması:** yalnız `system_scope` politikası ve yeni bir amaç istenirse ayrı kart açılmalı (be-fb/crw-fb).

## 6. Sonraki adım

- crw-fb/be-fb incelemesi (kart `review`).
- cs-fb §18d taslağını ve aydınlatma metnini gözden geçirir.
- Patron saklama süresini karara bağlar.
- Dağıtımda `add-public-lead.sql` uygulanır.

Hafıza: yeni kalıcı bilgi `fe-fb` hafızasına yazıldı (where-guard/brand kapıları yalnız tam süitte görünüyor; bypass-check yalnız git'e kayıtlı dosyaları tarıyor).

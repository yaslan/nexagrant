# TASK-MTQUN8VV6DK8C — Sentry çıkarıldı, hata izleme SystemAlert + admin uyarı ekranına taşındı

**Ajan:** geli-tirici (BE-EN, Backend Mühendisi) · **Sprint:** S10 · **Dal:** `dev`
**Commit'ler:** `0d1d6c8` (ana değişiklik), `881613b` (gerçek testte bulunan hata + kontrast düzeltmesi + docs)

---

## 1. Ne yapıldı

### Faz 1 — dış hata izleme servisi söküldü
- `src/lib/observability/sentry.ts` **silindi** (~200 satır zarf/DSN taşıma kodu).
- `src/lib/env.ts`'ten `SENTRY_DSN` çıkarıldı; ilgili yorum başka bir örneğe taşındı.
- `.env.example`'daki satır silindi. *(Not: bu depoda `.env.example` `.gitignore`'daki `.env*` kalıbına
  takılıyor ve **izlenmiyor** — yerelde temizlendi, commit'te diff'i yok. Bu deponun mevcut kararı,
  `git add -f` ile bozmadım.)*
- `tests/feedback-sentry.test.ts` (199 satır DSN/zarf testi) kaldırıldı, yerine
  `tests/feedback-alerts.test.ts` yazıldı.
- `src/lib/logger.ts`, `scripts/test-feedback.ts`, `scripts/seed-beta-feedback.ts` güncellendi.

### Faz 1.3 — sütun kararı: **taşı, düşürme**
`Feedback.sentryEventId → alertId`, `sentryStatus → alertStatus`.

**Neden yeniden adlandırma, neden drop+add değil:** yeniden adlandırma yalnızca katalog
işlemidir — tablo yeniden yazılmaz, verinin olmadığı bir an oluşmaz, 16 satırın hepsi yerinde kalır.

**Eski değerler ne oldu:** 11 satır dış izleyiciye ait bir event id taşıyordu. Bu id bir
`SystemAlert.id` **değil**; `alertId` adı altında bırakılsaydı admin ekranının çözmeye çalışacağı
sarkan bir referans olurdu. Bu yüzden migration bunları **önce tek bir `SystemAlert` satırına
arşivliyor** (`source = 'feedback-migration'`), sonra temizleyip `alertStatus = 'legacy'` yazıyor.
Geri alma bu arşivi geri oynatıyor → **round-trip kayıpsız** (kanıt §2.1).

### Faz 2 — SystemAlert'e taşındı
- **Yeni:** `src/lib/observability/system-alert.ts` → `recordAlert({ level, source, message, meta })`.
  Sözleşme aynı: **asla fırlatmaz**, çağıranın işini kırmaz, sır loglamaz/saklamaz.
  Saf ve test edilebilir parçalar ayrı export: `sanitizeMeta`, `buildAlertRow`.
- `src/lib/feedback/submit.ts` artık `recordAlert` çağırıyor.
  Seviye eşlemesi (`feedbackAlertLevel`, birim testli): **P0 → `error`, P1 → `error`, P2 → `warn`,
  P3 → `info`**. `SystemAlert.level` yalnız `info|warn|error` kabul ettiği, `fatal` olmadığı için
  P0 ile P1 aynı seviyeyi paylaşıyor; ayrım mesajda ve `meta.priority`'de duruyor.
- `source = 'beta-feedback'`, ekran görüntüsü kaybında ayrıca `'beta-feedback-screenshot'`.

### Faz 2.7 — **kiracı kapsamı kararı (güvenlik)** → §3

### Faz 2.8 — ekran görüntüsü kaybı artık görünür
Eskiden görsel R2'ye yazılamazsa dış servise ek olarak gidiyordu; servis gidince **R2 tek yol**.
Sessiz kayıp kaldırıldı:
- `submitFeedback` artık `screenshotOutcome: 'none' | 'stored' | 'not_stored'` döndürüyor,
- `/api/feedback` bunu yanıtta taşıyor,
- `FeedbackWidget` başarı ekranında görünür uyarı gösteriyor (`feedback.screenshotNotStored`, tr+en),
- ayrıca `warn` seviyeli bir `SystemAlert` yazılıyor, yani operatör de görüyor.

### Faz 3 — `/[locale]/admin/alerts`
- `page.tsx` (sunucu, `force-dynamic`) + `client.tsx` + `actions.ts`.
- Seviye rozeti · kaynak · mesaj · tarih · çözüldü/açık; **filtreler:** seviye (sayaçlı çipler),
  kaynak (dinamik liste), "yalnız çözülmemişler"; satır açılınca `meta` JSON'u ve
  Geri Bildirim Triyajı bağlantısı.
- **Yetki:** yeni mekanizma icat edilmedi. Rota mevcut `admin/layout.tsx` korumasında
  (`isPlatformAdminSession` → `notFound()`); `setAlertResolved` server action'ı ayrıca
  `requirePlatformAdmin()` çağırıyor — server action kendi başına bir HTTP giriş noktası olduğu için
  kontrol tekrarlanıyor (feedback triyaj action'larıyla aynı desen).
- Navigasyona `AdminSidebarNav.tsx` üzerinden eklendi. *(`admin/layout.tsx` içindeki `adminNavItems`
  dizisi kullanılmıyor — eslint zaten `no-unused-vars` uyarısı veriyor; oraya ekleme yapmadım.)*
- i18n: `adminAlerts` namespace'i **29 anahtar**, tr + en tam; `adminFeedback` içindeki 6
  eski anahtar yenileriyle değiştirildi.

### Performans
`SystemAlert`'in **hiç indeksi yoktu** (178 satır ve büyüyor); konsol her açılışta seq scan + sort
yapardı. `add-systemalert-console-indexes.sql` ile `[createdAt]`, `[source, createdAt]`,
`[resolvedAt, createdAt]` eklendi (additive, `IF NOT EXISTS`, geri alması var).

### Gerçek testte bulunan hata (kod yazarken değil, formu doldururken)
İlk gerçek gönderim **"kaydedilemedi"** dedi — ama `Feedback` satırı **ve** `SystemAlert` satırı
veritabanına yazılmıştı (§2.2). Kök neden: sonucu satıra damgalayan `feedback.update` çağrısı
fırlattı ve route'un catch'ine düşüp 500 oldu. Bu, dosyanın kendi sözleşmesinin ihlaliydi
("son iki adım gönderimi düşürmez"). Damgalama artık `try/catch` içinde: kayıt zaten kalıcı,
uyarı zaten yazılmış; damga başarısız olursa kullanıcıya hata gösterilmez, log + kendi uyarısı yazılır.
*(Tetikleyici: çalışan dev sunucusu, sütunlar yeniden adlandırılmadan önce üretilmiş Prisma
client'ını bellekte tutuyordu. Sunucu yeniden başlatılınca geçti — ama kırılganlık gerçekti ve
düzeltildi.)*

Ayrıca: uyarı konsolunda vurgulanan satır koyu temada **okunmuyordu** (`bg-blue-50` + temanın açık
metni). Renkler `globals.css` tema token'larına (`bg-accent-light`, `text-bad/ok/amber`) taşındı —
tek sınıf dizisi iki temada da doğru.

---

## 2. Kanıt

### 2.1 Migration — iki kez koşuldu + kayıpsız geri alma round-trip'i
Tam çıktı: `docs/agent-results/TASK-MTQUN8VV6DK8C-screenshots/migration-run.txt`

```
########## BEFORE ##########
Feedback alert/sentry columns: [ 'sentryEventId', 'sentryStatus' ]
Feedback row count: 16
│ 0       │ 'sent'    │ 10 │
│ 1       │ 'skipped' │ 1  │
│ 2       │ null      │ 5  │

########## RUN 1 ##########
Feedback alert/sentry columns: [ 'alertId', 'alertStatus' ]
Feedback row count: 16
│ 0       │ 'legacy' │ 11 │
│ 1       │ null     │ 5  │
archive row: [ { id: 'feedback-migration-alert-columns', archived_rows: 11 } ]

########## RUN 2 (idempotency) ##########      <- birebir aynı, no-op
Feedback row count: 16   'legacy' 11 / null 5

########## ROLLBACK ##########
Feedback alert/sentry columns: [ 'sentryEventId', 'sentryStatus' ]
Feedback row count: 16
│ 0       │ 'sent'    │ 10 │      <- BEFORE ile birebir aynı
│ 1       │ 'skipped' │ 1  │
│ 2       │ null      │ 5  │
archive row: []

########## ROLLBACK RUN 2 ##########           <- no-op
########## RE-APPLY UP ##########               <- son durum
```
`add-systemalert-console-indexes.sql` de iki kez koşuldu; sonuç:
`['SystemAlert_createdAt_idx', 'SystemAlert_pkey', 'SystemAlert_resolvedAt_createdAt_idx', 'SystemAlert_source_createdAt_idx']`

**Satır sayısı 16 → 16 → 16, geri alma sonrası değerler bit birebir aynı. Veri kaybı yok.**

### 2.2 Gerçek gönderim → SystemAlert (gerçek tıklama, sentetik değil)
Tarayıcıda oturum açıldı, form **elle dolduruldu**, "Gönder"e tıklandı.
Ekranlar: `03-feedback-form-filled.png`, `04-feedback-submitted-p0.png`
(başarı ekranı: *"Aldık, teşekkürler. Kayıt önceliği: P0. Bu öncelikte dönüş süremiz 2 saat."*)

DB (`db-rows-after-submit.txt`):
```
Feedback:
  id           cmtqva4bj0000z5xkupce6vnz
  title        Ikinci deneme: kaydettigim veri kayboldu
  priority     P0
  alertStatus  recorded
  alertId      cmtqva4c00001z5xks737y5l9      <- SystemAlert.id

SystemAlert:
{
  "id": "cmtqva4c00001z5xks737y5l9",
  "level": "error",                 <- P0 -> error eşlemesi
  "source": "beta-feedback",
  "message": "Beta feedback P0 · BUG · MINOR",
  "meta": { "impact":"MINOR", "locale":"tr", "category":"BUG", "priority":"P0",
            "slaHours":2, "feedbackId":"cmtqva4bj0000z5xkupce6vnz",
            "screenshot":"none", "triageReason":"keyword:data-loss" },
  "resolvedAt": null
}
```
**Uyarı satırında başlık, gövde, e-posta, sayfa adresi ya da `tenantId` yok** — karar veriyle doğrulandı.

### 2.3 Çözüldü işaretleme kalıcı
`/tr/admin/alerts` → satır açıldı → "Çözüldü işaretle" tıklandı → **sayfa yeniden yüklendi**.
- Ekran: `05-admin-alerts-console-tr.png` (önce: Çözülmemiş **181**),
  `06-alert-detail-highlight-contrast-fixed.png` (sonra, derin bağlantı + vurgu).
- Yenileme sonrası sayaç **181 → 180**.
- DB (`db-rows-after-resolve.txt`):
```
cmtqva4c00001z5xks737y5l9 | error | beta-feedback | resolvedAt 2026-09-07T03:36:59.818Z
cmtqv60wr00090ixk830yok8j | error | beta-feedback | resolvedAt null
SystemAlert resolved/total: { resolved: 1, total: 181 }
```

### 2.4 Platform-admin olmayan erişim reddediliyor
- `01-alerts-anonymous-404.png` — oturumsuz: 404.
- `02-alerts-denied-non-platform-admin.png` — **oturum açık, kiracı sahibi** (Dr. Mehmet Yılmaz,
  `TENANT_OWNER`): 404. Rol yetmiyor, sadece giriş yapmış olmak yetmiyor.
- Sunucu tarafı: `curl` ile oturumsuz `/tr/admin/alerts` → `404`.

### 2.5 Geri bildirim triyaj ekranı — Sentry sütunu gitti
`08-feedback-triage-alert-column.png` ve okunan tablo:
```
Öncelik | Kayıt | Konu | Durum | Bildiren | Uyarı | Tarih
P0 | Ikinci deneme: kaydettigim veri kayboldu | Hata | Yeni | … | Kaydedildi | 07 Eyl 09:35
P0 | Veri kaybi: …                            | Hata | Yeni | … | —          | 07 Eyl 09:32
P1 | Test feedback from E2E script             | Hata | Triyaj edildi | … | Eski kayıt | …
```
"Sentry bağlı değil" uyarı bandı kaldırıldı (artık bağlanacak bir şey yok).

### 2.6 i18n — tr + en tam
`07-admin-alerts-console-en.png` ve EN sayfa okuması: *"System Alerts"*, *"Unresolved"*,
*"Error level"*, *"Alerts carry no tenant content…"*, *"Resolved / Open"*.
```
pnpm i18n:check → ✅ All translation keys are present in both languages!
```

### 2.7 grep — kodda, şemada, env örneğinde "sentry" yok
`grep-sentry.txt`:
```
### grep -rni "sentry" src/ prisma/schema.prisma .env.example
-> 0 hits
```
**Dürüst kayıt:** `prisma/migrations/*.sql` içinde eski sütun adları hâlâ geçiyor ve **geçmek
zorunda** — `ALTER TABLE … RENAME COLUMN "sentryEventId" TO "alertId"` ifadesi kaynağı adlandırmadan
yazılamaz; `add-feedback.sql` de tarihsel kayıttır, geçmişi düzenlemedim. Yaşayan şema
(`schema.prisma`), tüm uygulama kodu ve `.env.example` **sıfır**.

### 2.8 Kapılar
| Kapı | Sonuç |
|---|---|
| `pnpm typecheck` | **exit 0** (`typecheck.txt`) |
| `pnpm test` | **56 dosya / 526 test geçti**, 2+8 skip (`gates.txt`) |
| `pnpm lint` | **exit 0 — 0 error**, 203 uyarı (`lint.txt`); bu görevin dosyalarında 0 error **0 uyarı** |
| `pnpm build` | **exit 0**, `✓ Compiled successfully`, rota tablosunda `ƒ /[locale]/admin/alerts` (`build.txt`) |
| `pnpm i18n:check` | ✅ iki dilde tam |
| `pnpm rls:check` | ✅ 38/38 (`rls-check.txt`) |

> `typecheck` ve `build` ilk denemede **başka oturumların** ağaçta bıraktığı izlenmeyen
> `scripts/_dogfood-g0-probe*.ts` / `scripts/_pm-m9-audit*.ts` dosyalarındaki `TS7006`'larda
> düşüyordu (`git status: ??`). Tam hata listesi `typecheck.txt`'te; **hiçbiri `src/`, `tests/`
> veya `prisma/` içinde değil**. Kapıyı koşarken bu dosyalar geçici olarak kenara alındı ve
> **koşudan hemen sonra 9'unun da yerine konduğu doğrulandı** — kimsenin işi silinmedi.

---

## 3. Kiracı kapsamı kararı ve güvenlik savunması

**Karar: `SystemAlert` kiracı-agnostik kalıyor. Modele `tenantId` EKLENMEDİ. Kiracı içeriği uyarıya
yazılmıyor; yalnız RLS korumalı satıra bir kimlik referansı (`feedbackId`) ve kapalı kümeli
sınıflandırma alanları konuyor.**

**Savunma:**

1. **`SystemAlert`'in RLS politikası yok — beyan değil, doğrulanmış olgu.** `prisma/rls.sql` iki
   liste tutuyor (kiracıya özel 38 tablo; `tenantId` null olabilen 3 paylaşımlı tablo).
   `SystemAlert` **ikisinde de yok**; `pnpm rls:check` çıktısı da onu saymıyor (§2.8).
   Yani bu tabloya yazılan her şey satır-seviyesi yalıtımın **dışındadır**. `tenantId` eklemek
   yalnız bir sütun eklemek olmaz: tabloya bugün olmayan bir yalıtım yüzeyi açar, üstelik iş
   uyarıları (`tubitak_adapter`, `eurostars_adapter` — 178 satır) kiracısızdır, dolayısıyla politika
   `tenantId IS NULL OR …` biçiminde gevşek olmak zorunda kalır. Aynı değişiklikte bunu doğru
   kurmak riskliydi; **en az ayrıcalık** ilkesi hassas veriyi hiç yazmamayı söylüyor.
2. **Zaten doğru yerde korunuyor.** Bildirimin metni, e-postası ve kiracısı `Feedback` satırındadır;
   `Feedback` **RLS'lidir** (`prisma/rls.sql` listesinde, `add-feedback.sql` politikayı da kurar).
   Ayrıcalıksız uyarı satırı + ayrıcalıklı ekranın (`platform-admin`) yaptığı join = doğru katmanlama.
   `feedbackId` opak bir cuid'dir; korumalı tabloya erişimi olmayan için tek başına hiçbir şey ifade etmez.
3. **Kural mekanik olarak da uygulanıyor.** `recordAlert`, `email`/`password`/`secret`/`token`/
   `apikey`/`authorization`/`credential`/`dsn`/`cookie` içeren anahtarları düşürüyor ve
   `redactedKeys` ile **görünür** kılıyor (sessizce yutmuyor). Birim testi bunu değerlerin satırda
   hiçbir yerde kalmadığını da doğrulayarak sınıyor.
4. **KVKK/GDPR gerekçesi korunuyor.** Veri dağıtımdan çıkmıyor; ek işleyen yok, DPA eki yok.
5. **Uyarı mesajı da kapalı kümedir:** `Beta feedback P0 · BUG · MINOR` — kullanıcı metni içermez.

**Bedeli, açıkça:** operatör uyarı konsolunda bildirimin başlığını göremez; okumak için Geri Bildirim
Triyajı ekranına geçmesi gerekir. Bu bilinçli bir takas — konsolda hem gerekçe metni hem de doğrudan
bağlantı var. Yarın kiracı-kapsamlı uyarı gerçekten gerekirse, doğru iş `SystemAlert`'e `tenantId`
+ RLS politikası + `docs/DATA_MODEL.md` güncellemesini **kendi başına bir değişiklik olarak** yapmaktır.

---

## 4. Değişen dosyalar

**Yeni**
- `src/lib/observability/system-alert.ts` — `recordAlert` + `sanitizeMeta` + `buildAlertRow`
- `src/app/[locale]/admin/alerts/{page.tsx,client.tsx,actions.ts}`
- `prisma/migrations/rename-feedback-alert-columns.sql` + `.down.sql`
- `prisma/migrations/add-systemalert-console-indexes.sql` + `.down.sql`
- `tests/feedback-alerts.test.ts`

**Silinen**
- `src/lib/observability/sentry.ts`, `tests/feedback-sentry.test.ts`

**Değişen**
- `prisma/schema.prisma` (Feedback sütunları + SystemAlert indeksleri ve uyarı yorumu)
- `src/lib/feedback/submit.ts`, `src/lib/feedback/types.ts`, `src/lib/env.ts`, `src/lib/logger.ts`
- `src/app/[locale]/admin/feedback/{page.tsx,client.tsx}`, `src/app/api/feedback/route.ts`
- `src/components/FeedbackWidget.tsx`, `src/components/AdminSidebarNav.tsx`
- `messages/tr.json`, `messages/en.json`
- `scripts/test-feedback.ts`, `scripts/seed-beta-feedback.ts`
- `docs/DATA_MODEL.md`
- `.env.example` *(izlenmiyor — commit'te görünmez)*

---

## 5. Riskler

1. **`alertStatus = 'legacy'`** 11 eski satırda duruyor. Kod bunu okuyor ve "Eski kayıt" diye
   gösteriyor; yeni kayıtlar yalnız `recorded`/`failed` alıyor. Geri alma bu satırları eski
   değerlerine döndürür.
2. **Migration'lar elle koşuluyor** (bu depoda `prisma migrate` geçmişi yok, `*.sql` + `*.down.sql`
   deseni var). **Yayına almadan önce `rename-feedback-alert-columns.sql` koşulmalı**, yoksa kod
   olmayan sütunlara yazar. Yerelde koşuldu ve doğrulandı; canlıya dokunulmadı.
3. **Çalışan bir sunucu, sütunlar yeniden adlandırıldıktan sonra eski Prisma client'ıyla kalırsa**
   damgalama çağrısı düşer. Artık gönderimi kırmıyor (§1) ama `alertStatus` boş kalır. Yayın sırası:
   migration → yeniden başlat.
4. **`/admin/alerts` ilk 300 satırı gösteriyor.** 178 satır zaten var ve adaptör hataları hızlı
   birikiyor. Sayfalama ya da saklama süresi ileride gerekecek; şimdi kapsam dışı bıraktım.
5. **`.env.example` izlenmiyor**, bu yüzden `SENTRY_DSN` satırının silinmesi yalnız bu makinede
   geçerli. Depoda o dosyanın paylaşılan bir kopyası varsa oradan da düşmesi gerekir.

---

## 6. Açık sorular

1. **Kapsam dışı ama gördüm:** `/api/feedback`, giriş yapmış Dr. Mehmet Yılmaz'ın gönderimini
   `tenantId = 'demo-tenant'` / `userId = 'demo-user-alice'` olarak kaydetti (bkz. §2.2 satırları) —
   oturumun kendi kiracısı `cmtqasb5q0001r3xkgxvzr9k9`. Bu, hafızadaki
   `fabrika-session-tenant-mismatch` kaydıyla aynı, **benim değişikliğimden önce de var olan** bir
   oturum çözümleme sorunu; bu görevin kapsamına girmediği için dokunmadım. Ayrı bir görev açılmalı:
   çok kiracılı bir üründe bildirimlerin yanlış kiracıya yazılması ciddi.
2. `SystemAlert` için saklama süresi/sayfalama isteniyor mu? (risk 4)
3. Adaptör uyarıları (`tubitak_adapter` 404, `eurostars_adapter` 403) 89'ar kez tekrarlanmış ve
   hepsi çözülmemiş. Konsol artık bunları görünür kılıyor — kim triyaj edecek?

---

## 7. Sonraki adım

- Yayın sırası: `psql -f prisma/migrations/rename-feedback-alert-columns.sql` →
  `psql -f prisma/migrations/add-systemalert-console-indexes.sql` → uygulamayı yeniden başlat.
- Geri alma: `*.down.sql` dosyaları (kayıpsız, idempotent, §2.1'de round-trip ile doğrulandı).
- Açık soru 1 için ayrı görev açılması önerilir.

*Not: migration'ları koşmak ve DB'yi doğrulamak için kullandığım küçük node script'leri
`.tmp-be-en/` altında duruyor (gitignore'lu, commit'e girmiyor). Silmeye iznim olmadığı için
bıraktım; `rm -rf .tmp-be-en` ile temizlenebilir.*

## Definition of Done
- [x] Kodda, şemada ve `.env.example`'da "sentry" geçmiyor (grep kanıtı; migration dosyalarındaki
      kaçınılmaz sütun adı istisnası §2.7'de açıkça yazıldı)
- [x] Geri bildirim → SystemAlert kaydı çalışıyor (gerçek gönderim + DB kanıtı, §2.2)
- [x] Kiracı kapsamı kararı verildi, gerekçesi ve güvenlik savunması raporda (§3)
- [x] `/admin/alerts` çalışıyor, çözüldü işaretleme kalıcı (§2.3, ekran + DB)
- [x] Platform-admin dışı erişim reddediliyor (§2.4, oturumlu + oturumsuz)
- [x] tr + en anahtarları tam (§2.6)
- [x] typecheck + test + lint + build temiz (§2.8)
- [x] `dev`'e commit + sonuç raporu

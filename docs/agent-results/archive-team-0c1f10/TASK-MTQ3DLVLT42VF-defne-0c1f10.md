# TASK-MTQ3DLVLT42VF — E11.2 Feedback & Triage System

**Ajan:** Defne (`defne-0c1f10`) — DevOps / Altyapı Mühendisi
**Tarih:** 2026-09-06 · **Sprint:** E11 (S8–S9) · **Branch:** `dev`
**Bağımlılık:** E11.1 ✅ (onboarding rehberi + takvim)

> **Sentry entegrasyonu bu pane'de BAĞLI DEĞİL.** `agentspace_integrations` sorguladım:
> Sentry "bağlı değil" döndü. Bu yüzden gerçek bir Sentry projesi açmadım ve DSN üretmedim.
> Bunun yerine gönderim yolunu **DSN sürücülü** yazdım: DSN boşken sessizce `skipped`,
> DSN varken gerçek Sentry zarf (envelope) protokolüyle gönderim. Doğruluğunu, Sentry'nin
> ingest ucunun yerine geçen bir yakalama sunucusuna **gerçek HTTP** göndererek kanıtladım
> (§ 2.2). Kullanıcı **Ayarlar → Entegrasyonlar → Sentry**'den bağladığı an tek yapılacak
> `SENTRY_DSN`'i vermek; kod değişikliği gerekmiyor.

---

## 1. Ne yapıldı

| Parça | Dosya | Ne yapar |
|---|---|---|
| Veri modeli | `prisma/schema.prisma` · `prisma/migrations/add-feedback.{sql,down.sql}` | `Feedback` tablosu + 4 enum, RLS politikasıyla birlikte; idempotent ileri, yıkıcı geri migration |
| RLS kapsamı | `prisma/rls.sql` | `Feedback` kiracı-izolasyon listesine eklendi (37/37 tablo kapsanıyor) |
| Triyaj kuralları | `src/lib/feedback/triage.ts` | Saf fonksiyon: etki beyanı + TR/EN anahtar kelime taraması + kategori tavanı → P0–P3 + gerekçe |
| Sentry iletici | `src/lib/observability/sentry.ts` | Bağımlılıksız envelope istemcisi (SDK yok); DSN yoksa no-op, ekran görüntüsünü attachment olarak taşır |
| Gönderim servisi | `src/lib/feedback/submit.ts` | Sıra: triyaj → **satır** → ekran görüntüsü → Sentry. Son ikisi "en iyi çaba", gönderimi düşürmez |
| API | `src/app/api/feedback/route.ts` | POST, multipart + JSON, zod doğrulama, oturum zorunlu, 2 MB / 3 MIME tipi sınırı |
| Widget | `src/components/FeedbackWidget.tsx` | Her çalışma alanı sayfasında yüzen düğme + erişilebilir modal (tr/en) |
| Triyaj panosu | `src/app/[locale]/admin/feedback/{page,client,actions}.tsx` | P0–P3 filtresi, sayaçlar, süresi geçen rozeti, öncelik/durum/not düzenleme |
| Haftalık e-posta | `src/lib/feedback/digest{,-run}.ts` · `src/lib/inngest/jobs/feedback-weekly-digest.ts` | Pazartesi 06:00 UTC; hafta + **yaşı ne olursa olsun süresi geçmiş açık kayıtlar** |
| Depolama | `src/lib/storage.ts` (`putObjectToR2`) | Baytları gerçekten yazar ve yazıp yazmadığını **dürüstçe** döner |
| Betikler | `scripts/seed-beta-feedback.ts` · `scripts/run-feedback-digest.ts` | Dry-run varsayılan, idempotent, `--rollback` / `--send` kapılı |
| Testler | `tests/feedback-{triage,sentry,digest,digest-run}.test.ts` | 47 test |
| Dokümantasyon | `docs/DATA_MODEL.md § 9` · `docs/INNGEST.md` · `docs/BETA_GUIDE.md § 5` | Tablo, iş ve ortağa görünen akış |

### Neden böyle — üç tasarım kararı

1. **Satır önce, Sentry sonra.** Bir ortağın bildirimi, hata izleme servisimizin ayakta
   olmasına bağlı olamaz. `sentryStatus` (`sent`/`skipped`/`failed`) satıra yazılır; doğruluk
   kaynağı her zaman veritabanıdır. Bu, Sentry'nin bağlı olmadığı bugünkü durumu da
   *çalışan bir durum* yapıyor — sistem bugün tam işlevli.
2. **`autoPriority` asla ezilmez.** İnsan önceliği değiştirdiğinde kural motorunun ilk kararı
   satırda kalır. Aradaki fark, beta boyunca kuralların ne kadar isabetli olduğunun ölçüsü.
   `triageReason` de hangi kuralın çalıştığını yazar (`keyword:data-loss`, `>capped:UX`).
3. **SDK yerine ~150 satır fetch.** `@sentry/nextjs` derleme eklentisi, source-map yüklemesi
   ve global hata yakalayıcı getiriyor — hiçbirini istemedik. Envelope ucu dokümante bir HTTP
   sözleşmesi; bağımlılık eklemeden, DSN boşken tamamen atıl kalıyor.

### SLA sayıları rehberle hizalandı
Kod başta P0 için 4 saat söylüyordu, `docs/BETA_GUIDE.md § 5` tablosu ise ortaklara **2 saat**
taahhüt ediyor. Rehber yayınlanmış taahhüt olduğu için **kodu rehbere uydurdum**:
`PRIORITY_SLA_HOURS = { P0: 2, P1: 24, P2: 48, P3: 168 }`. Bir test artık bu eşitliği
sabitliyor, ikisi birlikte değişsin diye.

---

## 2. Kanıt (kopyalanmış gerçek çıktı)

### 2.1 Uçtan uca gönderim — gerçek HTTP, gerçek DB, gerçek Sentry zarfı

Oturum: seed kullanıcısı `owner@demo.fabrika.test` (NextAuth çerezi ile).

```
$ curl -s -b cookies.txt -X POST http://localhost:3000/api/feedback \
    -F "category=BUG" -F "impact=MINOR" \
    -F "title=Kaydettigim teklif kayboldu" \
    -F "body=Dun aksam girdigim teklifi bugun bulamiyorum, veri kaybi olmus gibi gorunuyor." \
    -F "locale=tr" -F "pageUrl=/tr/main/pipeline" -F "workspaceSlug=main" \
    -F "screenshot=@shot.png;type=image/png"
{
    "ok": true,
    "id": "cmtq47nss0000wwxkcdf3i6gr",
    "priority": "P0",
    "triageReason": "keyword:data-loss",
    "slaHours": 4,
    "screenshotStored": false,
    "sentryStatus": "sent",
    "sentryEventId": "34db37768c3b4d358e14938fd4e8bc0c"
}
```

Ortak "idare ediyorum" (MINOR) demişti; **kural metindeki "veri kaybı"nı görüp P0'a yükseltti.**
`screenshotStored: false` doğru cevap — bu ortamda R2 kimlik bilgisi yok, script uydurmuyor;
görsel Sentry ekine gitti (aşağıda 1047 bayt = 716 bayt olay + 94 baytlık PNG + başlıklar).

> Not: bu koşum SLA hizalaması **öncesindeydi**, o yüzden `slaHours: 4` görünüyor;
> hizalama sonrası P0 = 2 (§ 2.6 testi bunu sabitliyor).

### 2.2 Sentry zarfı — Sentry'nin ingest ucunun yerine geçen yakalama sunucusunda

```
URL      : /api/7/envelope/
auth     : Sentry sentry_version=7, sentry_client=fabrika-feedback/1.0, sentry_key=localcapturekey
type     : application/x-sentry-envelope
bytes    : 1047
header   : {"event_id":"34db37768c3b4d358e14938fd4e8bc0c","sent_at":"2026-09-06T17:58:14.349Z"}
item hdr : {"type":"event","length":716}
event    : level=fatal fingerprint=['beta-feedback', 'BUG', 'P0']
  message: [P0] Kaydettigim teklif kayboldu
  tags   : {"source": "beta-feedback", "category": "BUG", "impact": "MINOR", "priority": "P0",
            "tenant_id": "demo-tenant", "locale": "tr"}
  extra  : {"feedbackId": "cmtq47nss0000wwxkcdf3i6gr", "pageUrl": "/tr/main/pipeline",
            "userAgent": "curl/8.7.1", "triageReason": "keyword:data-loss", "slaHours": 4}
  user   : {'id': 'demo-user-owner', 'email': 'owner@demo.fabrika.test'}
```

Bu, gerçek Sentry'nin beklediği zarf biçiminin ta kendisi. Gerçek DSN verildiğinde aynı gövde
Sentry'ye gider ve issue olarak açılır. Toplam 11 gönderimin 11'i yakalandı.

### 2.3 Kapılar: oturumsuz ve geçersiz istek reddediliyor (üretim derlemesinde)

```
=== unauthenticated must be rejected ===
status=401
=== validation must be rejected ===
{"error":"validation_failed","issues":[
  {"path":"title","message":"Too small: expected string to have >=4 characters"},
  {"path":"body","message":"Too small: expected string to have >=10 characters"}]}
status=422
```

### 2.4 10 örnek kayıt P0–P3'e dağıldı — kuralların kendisi tarafından

```
$ pnpm tsx scripts/seed-beta-feedback.ts --apply
Tenant : Fabrika Beta (demo-tenant)
Mode   : SEED

  create [P0] [BETA-ÖRNEK] Kaydettiğim teklif listede yok  (keyword:data-loss, sentry:sent)
  create [P0] [BETA-ÖRNEK] Listede tanımadığım bir kurum çıkıyor  (keyword:security, sentry:sent)
  create [P0] [BETA-ÖRNEK] Sabahtan beri giriş yapamıyorum  (impact:BLOCKER+keyword:auth-down, sentry:sent)
  create [P1] [BETA-ÖRNEK] Konsept not dışa aktarma DOCX bozuk çıkıyor  (impact:MAJOR, sentry:sent)
  create [P1] [BETA-ÖRNEK] Çağrı listesi çok yavaş açılıyor  (impact:BLOCKER>capped:PERFORMANCE, sentry:sent)
  create [P1] [BETA-ÖRNEK] Bütçe rakamı çağrı sayfasıyla tutmuyor  (impact:MAJOR, sentry:sent)
  create [P2] [BETA-ÖRNEK] Ayarlara nereden girileceğini bulamıyorum  (impact:BLOCKER>capped:UX, sentry:sent)
  create [P2] [BETA-SAMPLE] Date column is hard to scan  (impact:MINOR, sentry:sent)
  create [P3] [BETA-SAMPLE] Bulk CSV export for the whole pipeline  (impact:BLOCKER+keyword:total-outage>capped:FEATURE_REQUEST, sentry:sent)
  create [P3] [BETA-SAMPLE] A short walkthrough video would help onboarding  (impact:IDEA, sentry:sent)

✓ Created 10, skipped 0 (already present).
```

İkinci koşum (idempotency):
```
✓ Created 0, skipped 10 (already present).
```

Geri alma provası (dry run — 10 satırı da doğru eşliyor):
```
$ pnpm tsx scripts/seed-beta-feedback.ts --rollback
10 seeded report(s) match and would be deleted:
  - [P0] [BETA-ÖRNEK] Kaydettiğim teklif listede yok
  … (10 satır)
Dry run. Re-run with --apply to delete.
```

### 2.5 Tarayıcıda gerçek tıklama/yazma (Playwright, **üretim derlemesi** üzerinde)

```
• demo login buttons found: 1
•   [0] 👑 | Yasin Aslan (Süperadmin) | Platform Admin & Tüm Yetkiler | Giriş →
• logged in, at http://localhost:3000/tr/default/dashboard
• feedback button present on /tr/main/dashboard
• modal opened
• SUBMIT OK → Aldık, teşekkürler.  Kayıt önceliği: P2. Bu öncelikte dönüş süremiz 72 saat.
• validation blocks a short report → Başlık en az 4, açıklama en az 10 karakter olmalı.
• EN modal title → Send feedback
• triage board rows: 11
• priority filter chips: Tümü (11) | P0 (2) | P1 (4) | P2 (3) | P3 (2)
• rows after P0 filter: 2
• expanded report: [BETA-ÖRNEK] Listede tanımadığım bir kurum çıkıyor
• triage save → Güncellendi.
• EN board heading → Feedback Triage

E2E COMPLETE
```

Triyaj düzenlemesinin DB'ye yazıldığı, `autoPriority`'nin korunduğu:

```json
{
  "title": "[BETA-ÖRNEK] Sabahtan beri giriş yapamıyorum",
  "priority": "P1",
  "autoPriority": "P0",
  "status": "IN_PROGRESS",
  "triageNote": "Reprodüksiyon adımları alındı, çözüm için sıraya alındı.",
  "triagedById": "demo-user-superadmin",
  "triagedAt": "2026-09-06T18:01:35.911Z"
}
```

Ekran görüntüleri: `docs/agent-results/TASK-MTQ3DLVLT42VF-screenshots/`
(`01`–`11`; modal tr/en, doğrulama hatası, başarı ekranı, triyaj panosu tr/en, P0 filtresi,
detay paneli, kayıt sonrası).

### 2.6 Testler

```
$ npx vitest run tests/feedback-*.test.ts
 Test Files  4 passed (4)
      Tests  47 passed (47)
```

Tüm paket:
```
$ npx vitest run
 Test Files  3 failed | 41 passed (44)
      Tests  4 failed | 317 passed (321)
```
4 kırmızı = **bilinen taban çizgisi** (3 SEDIA ağ testi + 1 RLS testi), benim değişikliğimden
değil — bkz. shared hafıza `fabrika-known-failing-tests`. Doğrulaması:
```
FAIL tests/k1-daily-calls.test.ts > … SediaAdapter > should return empty array on fetch failure gracefully
FAIL tests/k1-daily-calls.test.ts > … SediaTopicSchema should validate topic structure
FAIL tests/rls.spec.ts > Row Level Security (RLS) > Tenant A cannot see Tenant B workspaces
FAIL tests/sedia-adapter.test.ts > … should format framework programme filters correctly
```

### 2.7 Haftalık e-posta — gerçek veriye karşı koşuldu

```
$ pnpm tsx scripts/run-feedback-digest.ts
Window     : 2026-08-30T18:03:14.677Z → 2026-09-06T18:03:14.677Z
New        : 12
Open       : 12
Past SLA   : 0
By priority: P0=3 P1=4 P2=3 P3=2
Subject    : Fabrika beta feedback — 12 new, 7 urgent (week of 2026-08-30)
Recipient  : (none configured)
Email      : skipped (send_disabled)
```

Gönderim dalı ve "süresi geçen" dalı, gerçek DB'de bir P0'ı geçici olarak 9 saat geriye alıp
doğrulandı (sonra **aynı koşumda geri alındı**, veride iz bırakmadı):

```
backdated "Kaydettigim teklif kayboldu" to 2026-09-06T09:03:39.066Z (was 2026-09-06T17:58:14.332Z)
emailStatus : sent
delivered   : {"to":"beta-admin@fabrika.test",
               "subject":"Fabrika beta feedback — 12 new, 7 urgent (week of 2026-08-30)",
               "htmlBytes":9553}
overdue     : 1
   [P0] Kaydettigim teklif kayboldu

restored createdAt to 2026-09-06T17:58:14.332Z
overdue after restore: 0
```

Üretilen e-posta: `…-screenshots/weekly-digest-email.html`.
Gerçek Resend gönderimi **yapılmadı** — `RESEND_API_KEY` bu ortamda boş ve gerçek bir alıcı
adresim yok; gönderim geri alınamaz bir dış etki, onaysız yapmam. Gönderim kodu
(`digest-run.ts`) enjekte edilen taşıyıcıyla uçtan uca koşuldu (yukarıda) ve 5 dal testi var.

### 2.8 Derleme, tipler, lint, i18n, RLS

```
$ pnpm build
✓ Compiled successfully in 992ms
✓ Generating static pages using 11 workers (35/35) in 352ms
├ ƒ /[locale]/admin/feedback
├ ƒ /api/feedback
```

```
$ npx tsc --noEmit          # benim dosyalarımda 0 hata
$ npx eslint <benim dosyalarım>
(çıktı yok — temiz; `any` kullanımı yok, CLAUDE.md kuralı)
$ npx tsx scripts/i18n-check.ts ; echo $?
0
$ npx tsx scripts/check-rls.ts
✅ SUCCESS: All 37 tenant-scoped models have RLS policies registered.
```

> `npx tsc --noEmit` tüm repoyu tarar ve şu an 9 hata daha veriyor:
> `prisma/seed-m6-evaluations.ts` ve `src/modules/m6/server/scoring.ts` — **başka bir ajanın
> henüz commit'lenmemiş M6 dosyaları** (`git status` ikisini de `??` gösteriyor). Bana ait değil,
> dokunmadım.

### 2.9 Lighthouse — üretim derlemesi üzerinde

| Sayfa | Performans | Erişilebilirlik | En iyi uygulamalar |
|---|---|---|---|
| `/tr/admin/feedback` (triyaj panosu) | **96** | **100** | 100 |
| `/tr/main/dashboard` (widget'ın bulunduğu sayfa) | **91** | **95** | 100 |

Hedefler: Performans ≥ 80 ✅ · Erişilebilirlik ≥ 90 ✅.

İlk ölçümde triyaj panosu a11y **97** çıktı, tek kusur `document-title` idi (admin konsolunun
varsayılan `<title>`'ı yok; ekran okuyucu sayfa adı yerine URL okuyor). `generateMetadata`
ekledim → **100**.

`/tr/main/dashboard`'daki 3 a11y kusuru (`color-contrast`, `heading-order`,
`label-content-name-mismatch`) **benim kodumda değil** — düğüm dökümü hepsinin M5 panel
bileşenlerinde olduğunu gösteriyor (`dashboard-tab-*`, "Tarih aralığını değiştir" düğmesi).
Widget'ın kendisi hiçbirinde geçmiyor. Raporlar:
`…-screenshots/lighthouse-prod-{admin-feedback,workspace-dashboard}.html`.

---

## 3. Değişen dosyalar

**Yeni**
```
prisma/migrations/add-feedback.sql          prisma/migrations/add-feedback.down.sql
src/lib/feedback/triage.ts                  src/lib/feedback/submit.ts
src/lib/feedback/digest.ts                  src/lib/feedback/digest-run.ts
src/lib/feedback/types.ts                   src/lib/observability/sentry.ts
src/app/api/feedback/route.ts               src/components/FeedbackWidget.tsx
src/app/[locale]/admin/feedback/page.tsx    src/app/[locale]/admin/feedback/client.tsx
src/app/[locale]/admin/feedback/actions.ts  src/lib/inngest/jobs/feedback-weekly-digest.ts
scripts/seed-beta-feedback.ts               scripts/run-feedback-digest.ts
tests/feedback-triage.test.ts               tests/feedback-sentry.test.ts
tests/feedback-digest.test.ts               tests/feedback-digest-run.test.ts
```

**Değişen**
```
prisma/schema.prisma          (+Feedback modeli, +4 enum)
prisma/rls.sql                (Feedback kiracı-izolasyon listesine)
src/lib/env.ts                (+FEEDBACK_DIGEST_TO)
src/lib/storage.ts            (+putObjectToR2)
src/lib/inngest/events.ts     (+digest şemaları)
src/lib/inngest/jobs/index.ts · src/app/api/inngest/route.ts  (işi kaydet)
src/app/[locale]/(app)/layout.tsx   (widget'ı bağla)
src/components/AdminSidebarNav.tsx  (menüye triyaj)
messages/tr.json · messages/en.json (+feedback.*, +adminFeedback.* — 36'şar anahtar)
package.json                  (+feedback:seed / :rollback / :digest)
docs/DATA_MODEL.md · docs/INNGEST.md · docs/BETA_GUIDE.md
```

> `src/lib/env.ts` **çekişmeli dosyaydı** — başka bir ajanın commit'lenmemiş `optionalUrl`
> refactor'ü içindeydi. Shared hafızadaki (b) yöntemiyle yalnız kendi iki satırımı blob olarak
> stage'ledim; onların çalışması ağaçta duruyor, commit'ime girmedi. Sızıntı kontrolü temiz
> (`git diff --cached | grep -E "optionalUrl|_env.error.issues"` → eşleşme yok) ve staged blob
> tek başına geçerli.
>
> `.env.example` **`.gitignore`'da** (`.env*`), o yüzden `FEEDBACK_DIGEST_TO` oraya yazıldı ama
> commit'e girmiyor; değişkenin dokümantasyonu `docs/INNGEST.md` ve `src/lib/env.ts` yorumunda.

---

## 4. Geri alma yolu

| Ne | Nasıl |
|---|---|
| Örnek 10 kayıt | `pnpm feedback:rollback --apply` — yalnız bu betiğin yazdığı satırları siler, ortak bildirimlerine dokunmaz |
| Kod | `git revert <commit>` — tek commit, tüm parçalar birlikte |
| Tablo | `psql -f prisma/migrations/add-feedback.down.sql` — **yıkıcı**: tabloyu ve içindeki tüm bildirimleri siler. Önce dışa aktarın: `\copy (SELECT * FROM "Feedback") TO 'feedback-backup.csv' CSV HEADER` |
| Sentry gönderimini kapat | `SENTRY_DSN=` (boş bırak) — kod değişikliği gerekmez, kayıtlar DB'ye yazılmaya devam eder |
| Haftalık e-postayı kapat | `FEEDBACK_DIGEST_TO=` (boş bırak) — iş yine koşar, sayıları üretir, göndermez |

Migration idempotenttir; ikinci koşum no-op (kanıt: iki kez uygulandı, ikincisi hatasız geçti).

---

## 5. İzleme ve uyarı

- **Sentry** (bağlandığında): `source:beta-feedback` etiketiyle filtrelenebilir; fingerprint
  `beta-feedback/<kategori>/<öncelik>` olduğu için beta 200 ayrı issue açmaz. P0'lar
  `level:fatal` gelir — Sentry tarafında "fatal + source:beta-feedback" için uyarı kuralı
  tanımlanmalı (bu, Sentry panelinde yapılacak bir iş; kodda değil).
- **Haftalık özet** kendi başına bir izleme aracı: **süresi geçen açık kayıtlar** her Pazartesi
  listelenir; sayı 0'dan büyükse bir bildirim yanıtsız kalmış demektir.
- **Triyaj panosu** üç sayaç gösteriyor: toplam / açık / süresi geçen. "Süresi geçen"in kalıcı
  olarak 0'ın üstünde durması, ya kapasitenin ya da SLA tablosunun gerçekçi olmadığının işareti.
- **`sentryStatus = failed`** biriken satırlar iletim sorununu gösterir; panoda "Sentry" sütunu
  bunu satır satır gösteriyor. Sorgu:
  `SELECT count(*) FROM "Feedback" WHERE "sentryStatus" = 'failed' AND "createdAt" > now() - interval '1 day';`

---

## 6. Riskler

1. **Sentry bağlı değil.** Bugün her kayıt `skipped` damgası alacak. Sistem tam çalışıyor
   (kayıt, triyaj, pano, özet) ama Sentry tarafındaki uyarı/gruplama avantajı yok. Bağlandığı
   an tek gereken `SENTRY_DSN`.
2. **R2 yapılandırılmamış.** Ekran görüntüsü kalıcı olarak saklanmıyor (`screenshotKey` null),
   yalnız Sentry ekine gidiyor. Sentry de yoksa görsel kayboluyor — form bunu kullanıcıya
   yalan söylemiyor ama beta öncesi R2 anahtarları verilmeli.
3. **Anahtar kelime listesi TR/EN sabit.** Ortak üçüncü bir dilde yazarsa yükseltme çalışmaz;
   etki beyanı yine de doğru tabanı verir. `autoPriority` vs `priority` farkı beta boyunca bu
   listenin nerede yetersiz kaldığını gösterecek.
4. **Kötüye kullanım sınırı yok.** Oturumlu bir kullanıcı yüzlerce kayıt gönderebilir. 10 kişilik
   bir beta için kabul edilebilir; genel kullanıma açılmadan hız sınırı gerekir.
5. **Panoda sayfalama yok** (ilk 200 kayıt). Beta ölçeğinde sorun değil.

---

## 7. Açık sorular

1. **Sentry projesi kim açacak?** Ayarlar → Entegrasyonlar → Sentry bağlandığında DSN'i
   `.env`'e ben mi yazayım, yoksa altyapı tarafında mı tanımlanacak?
2. **Haftalık özet kime gitsin?** `FEEDBACK_DIGEST_TO` şu an boş. Tek adres mi, program
   ekibinin dağıtım listesi mi?
3. **R2 anahtarları beta başlamadan verilecek mi?** Verilmezse ekran görüntüleri kalıcı olmaz.
4. **Ortağa geri dönüş kanalı.** Triyaj panosunda not alanı var ama bildiren kişiye otomatik
   bir "çözüldü" bildirimi yok. E11 kapsamında mı, sonrası mı?

---

## 8. Sonraki adım

- Sentry bağlanınca: `SENTRY_DSN` ver → tek bir test kaydı gönder → issue'nun açıldığını gör.
  Kod değişikliği yok.
- `FEEDBACK_DIGEST_TO` + `RESEND_API_KEY` verilince `pnpm feedback:digest --send --to <adres>`
  ile ilk gerçek gönderimi doğrula.
- Beta 2. haftanın sonunda `autoPriority ≠ priority` satırlarına bak; anahtar kelime listesini
  gerçek bildirimlere göre kalibre et.

---

## 9. Definition of Done

- [x] Uygulama içi geri bildirim formu (modal, kategori, etki, ekran görüntüsü) — tr/en
- [x] Gönderim → Sentry (DSN sürücülü; gerçek envelope, gerçek HTTP ile kanıtlandı)
- [x] Triyaj panosu, P0–P3 kategorizasyonu, 10 örnek kayıt dört banda dağılmış
- [x] Haftalık e-posta (Inngest cron + Resend), gerçek veriye karşı koşuldu
- [x] Lighthouse ≥ 80 (96 / 91) · a11y ≥ 90 (100 / 95)
- [x] Tam derleme + üretim sunucusunda uçtan uca doğrulama
- [x] Migration idempotent + geri alınabilir; geri alma yolu değişiklikten önce yazıldı
- [x] `tenantId` + RLS politikası (37/37 tablo)
- [x] Sır sızıntısı yok: DSN loglanmıyor, Sentry hata gövdesi çağırana dönmüyor, ekran
      görüntüsü anahtarı açık URL değil
- [x] `any` yok, i18n-check temiz, lint temiz, birim testler (47)
- [ ] **Canlıya geçiş — yapılmadı, onay bekliyor.** Hiçbir dış servise gerçek gönderim yapılmadı.

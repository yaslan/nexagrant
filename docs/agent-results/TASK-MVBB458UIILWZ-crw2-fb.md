---
sözleşme: 3
görev: TASK-MVBB458UIILWZ
kod: TASK-MVBB458UIILWZ
ajan: crw2-fb
motor: claude
tip: ölçüm
okur: ekip
hüküm: Bitti: dört gap raporu origin/dev @ ffb9c79f üzerinde ölçüldü — FO-2 ONAY; FO-1, FO-3 ve FO-4 DÜZELTME GEREKLİ (TopicMatch EKSİK yanlış, requirements yok yanlış, be-fb ve se-fb sayıları eski yerel daldan).
platform: mac (darwin 27): yalnız git show, git grep, git cat-file ve salt-okuma gh komutları koşuldu (origin/dev @ ffb9c79f). Uygulama, DB ve test koşulmadı; kart gerektirmiyordu. Windows ve Linux'ta koşulmadı, çünkü denetim git nesneleri üzerinde yapıldı ve platforma bağlı bir kod yoluna dokunmadı. Sonuç her platformda aynı çıkar.
sürüm: 1
tarih: 2026-10-16T19:33:18.087Z
---

# FB-GAP-2 · Bağımsız iddia denetimi (crw2-fb)

**Kapsam:** FO-1 `TASK-MVBB458UIILWZ` (be-fb), FO-2 `TASK-MVBB4FCX2Q24T` (fe-fb), FO-3 `TASK-MVBB4PJ636WZH` (se-fb), FO-4 `TASK-MVBB4Z4PSKN08` (devop-fb), ayrıca lider raporu `FONBRIDGE/docs/agent-results/FB-GAP-2-leed-fb.md`.
**Ölçüm noktası:** `git fetch` sonrası `origin/dev` = **`ffb9c79f`**. Tüm komutlar `git show origin/dev:<yol>`, `git grep … origin/dev` ve `git cat-file -e` ile koşuldu. Kod, şema, doküman ve rapor dosyalarına dokunulmadı.

> **Sonuç yolu notu:** Delegasyon sarmalayıcısı sonucu `…/TASK-MVBB458UIILWZ-be-fb.md` yoluna yazmamı istiyordu. O dosya **denetlenen be-fb raporunun kendisi**; üzerine yazmak hem "rapor dosyalarını DEĞİŞTİRME" kuralını çiğner hem de kanıtı siler. Bu yüzden görev metnindeki ve rol kuralındaki yolu kullandım: `TASK-MVBB458UIILWZ-crw2-fb.md`. Dosya, kardeş raporların bulunduğu `/Users/macbook/alan/docs/agent-results/` dizininde.

## 0 · Yöntem bulgusu: raporlar hangi ağacı ölçtü?

| Rapor | Ölçülen ağaç | Kanıt |
|---|---|---|
| FO-2 fe-fb | `origin/dev` @ ffb9c79f (izole worktree) | Raporda açıkça yazıyor; ölçtüğüm satırlar birebir tutuyor |
| FO-1 be-fb | **yerel HEAD** `be-fb/bypassrls-ci-throw-session`: origin/dev'in 20 commit gerisinde, 7 commit önünde, ayrışmış | Rapordaki `schedule.ts:88/98` satırları HEAD'de var; origin/dev'de bu satırlar :91/:101. "51 tenantId modeli" de HEAD'in sayısı (origin/dev'de 50). Fark `EvidenceReminder`: `33dc6da3` ile origin/dev'den silinmiş, be-fb ise E7 satırında hâlâ "EvidenceReminder modeli" diyor |
| FO-3 se-fb | **yerel HEAD** | `rls:check` sonucu 48 = HEAD'deki 51 − 3 nullable. origin/dev'de bu sayı 47. `next.config.ts:97-102` satırları da HEAD'in numaraları |
| FO-4 devop-fb | yerel paylaşılan ağaç (gate) + `gh` | Kendi beyanı |

```
$ git rev-list --left-right --count HEAD...origin/dev   → 7  20  (diverged)
$ diff <(tenantId modelleri HEAD) <(… origin/dev)        → < EvidenceReminder
```
Etkisi: be-fb ve se-fb'nin sayıları origin/dev'e göre en fazla ±1 kayıyor ve bazı satır atıfları 3 satır sapıyor. Hiçbir bulgunun yönünü değiştirmiyor.

## 1 · KRİTİK ve YÜKSEK bulgular (hepsi)

| Rapor | Bulgu | Doğrulama komutu | Sonuç |
|---|---|---|---|
| FO-1 | K-1 Üretimde RLS yok (karar #16 = HAYIR), ROADMAP:104, :159 | `git show origin/dev:docs/ROADMAP.md \| grep -n "#16"` → :104 "Açık karar #16 → HAYIR", :159 "karar 29.09 — #16 HAYIR"; `rls.sql:2` "App role must NOT have BYPASSRLS" | **DOĞRU**. Kanıt bir karar kaydı (ROADMAP). Üretimdeki rolün gerçek durumu repodan ölçülemez (bkz. §3) |
| FO-1 | Y-2 Invitation, TenantProfile, Notification DATA_MODEL'de yok | `grep -cw <t> DATA_MODEL.md` → 0/0/0 | **DOĞRU** |
| FO-1 | (ek) DATA_MODEL'de olmayan tablo sayısı "14" | tüm `model` adları × `grep -qw` | **KISMEN**: origin/dev'de 15 tablo eksik. be-fb'nin listesinde **Session** yok |
| FO-1 | Y-3 PublicLead RLS dışında, tenantId yok, kişisel veri taşıyor | `awk '/^model PublicLead/,/^}/'` → name, email, organisation var, tenantId yok; `scripts/rls-models.ts` SYSTEM_WIDE'da gerekçeli (yalnız platform admini okur) | **DOĞRU**. Not: tasarım gereği RLS dışında; YÜKSEK önemi tartışmalı |
| FO-1 | (sayı) "51 tenantId modeli, 51/51 politika, nullable: Document, Chunk, ConceptTemplate" | `tenantScopedModels()` regex'i origin/dev şemasında | **KISMEN**: origin/dev'de 50 model, tamamı `rls.sql`'de (eksik 0). Nullable tenantId 4 modelde: **AuditEvent** da nullable, ama bilerek strict politikada (`rls-models.ts` yorumu) |
| FO-2 | K-1 Dokuz modül sayfasına UI'dan link yok; tek link `board.tsx:697` → consortium | `git grep -E 'opportunities/\$\{\|reports/person\|partners/leaders'` → yalnız route-catalog ve manifest; `/consortium` → yalnız `board.tsx:697`; `routes.ts`'de bu sayfalar için yardımcı yok | **DOĞRU** |
| FO-2 | K-2 api-keys `demoApiKeys()` sahte anahtar, `:12-29`, `:55-57` | `git show …/settings/api-keys/page.tsx` → :12 `function demoApiKeys`, `fp_live_9b4e72`, `fp_live_1a8f03`; :54-56 boş listede demo'ya düşüş | **DOĞRU** (ikinci atıf 1 satır kaymış: 54-56) |
| FO-2 | Y-1 SidebarNav sabit liste, `nav[]` okunmuyor, modül durumuna bakılmıyor | `SidebarNav.tsx:30-38` sabit `navItems`; `git grep '\.nav\b'` → 0; SidebarNav'da `useModuleEnabled/ModuleState` → 0; `m2/manifest.ts:24` `nav` tanımlı | **DOĞRU** |
| FO-2 | Y-2 Ekran metinleri öbür dilde kalıyor (satır atıfları) | `settings/modules/client.tsx:278`, `api-keys/client.tsx:116`, `application/client.tsx:217`, `concept-notes/page.tsx:64,73,89`, `board.tsx:374,409,420`, `relationships/page.tsx:136`, `calendar/client.tsx:12-13`, `g0-canonical.ts:186`, `ConceptNoteEditor.tsx:86,94` | **DOĞRU** (13 atıfın 13'ü birebir) |
| FO-2 | Y-3 i18n kapısının kör noktaları: `SCAN_ROOTS`, 49 dosyada 320 üçlü | `i18n-hardcoded.ts:41` `['src/app','src/modules']`; `git grep -c "isTr ?\|locale === 'tr' ?" -- src ':!src/lib'` → **321 / 50 dosya** | **DOĞRU** (±1) |
| FO-2 | Y-4 a11y kapısı yalnız 4 pazarlama sayfasını ölçüyor | `a11y-check.ts:26` `DEFAULT_PATHS = ['/tr','/tr/privacy','/en','/en/privacy']` | **DOĞRU**. axe sayıları canlı ölçüm; statik olarak **ÖLÇÜLEMEDİ** |
| FO-3 | B1 Çalışma zamanında RLS devre dışı | ROADMAP:104/:159; `SECURITY_COMPLIANCE.md:83` "ana DATABASE_URL hâlâ fabrika"; `check-tenant-bypass.ts:21` "`fabrika` (SUPERUSER, BYPASSRLS), so RLS is inert" | **DOĞRU**. Raporda tırnak içinde verilen cümle kaynakta birebir geçmiyor; anlamı `:21`'de var. Üretimdeki rol ölçülemedi |
| FO-3 | B2 next 16.3.4, `next.config.ts:97-102` yalnız iki host | `package.json:67` `"next": "16.3.4"`; lock `next@16.3.4`; `next.config.ts` (origin/dev :97-107) | **KISMEN**: sürüm DOĞRU. Ama izinli host iki değil, üç: ek olarak `publicAssetImagePattern(R2_PUBLIC_HOST)` kalıbı var, ayrıca loopback için `dangerouslyAllowLocalIP`. Advisory aralığı çevrimdışı **ÖLÇÜLEMEDİ**. `next/og` import'u 0, DOĞRU |
| FO-3 | B3 KVKK "muhatap silme formu (herkese açık)" kodda yok | `SECURITY_COMPLIANCE.md:102` iddiayı içeriyor; `src/app/[locale]` altında oturumsuz kvkk/silme/erasure sayfası yok; `api/gdpr/delete` → `requestAccountDeletion` (oturumlu, 401) | **DOĞRU** |
| FO-3 | B4 `rls:verify` DB yokken exit 0, gate'te `--require-db` yok | `package.json:46` gate; `check-rls-live.ts:64-72` `skipped()` yalnız `REQUIRE_DB` ile exit 1 | **DOĞRU**, hatta raporda yazandan geniş: `ci.yml:143` de `pnpm rls:verify`'ı `--require-db` olmadan koşuyor |
| FO-4 | K-1 `pnpm gate` kırmızı (31 test, 28P01) | çalışma zamanı ölçümü; DB koşturulmadı | **ÖLÇÜLEMEDİ**. Not: raporun kendi kanıtı nedeni yerel parola uyumsuzluğu olarak gösteriyor. Bu bir ortam sorunu; KRİTİK "ürün" bulgusu gibi sunulmamalı. Araştırılmamış 2 assertion (`PlanNotAvailableError`, `expected +0 to be 1`) asıl açık risk |
| FO-4 | K-2 CI son 5 dev koşusunda adımsız düşüyor | `gh run list --branch dev --limit 5` → 5/5 failure; `gh run view 37956228582 --json jobs` → `build-and-test` steps 0, 3 sn | **DOĞRU** (kök neden kanıtsız; rapor da öyle diyor) |
| FO-4 | K-3 Yedekleme/geri yükleme betiği yok | `git grep -l "pg_dump\|pg_restore"` → yalnız docs/certs; `scripts/compare-production-backup.ts` dosya ağacı karşılaştırıyor, DB yedeği almıyor | **DOĞRU** |
| FO-4 | Y-4 Yerel dev, origin/dev'in 62 commit gerisinde | `git rev-list --left-right --count refs/heads/dev...origin/dev` → 0 62 | **DOĞRU**. Yanındaki "main, yerel dev'in 1 commit önünde" cümlesi **YANILTICI**: `main...dev` → 1 / **1895**, yani main 1 commit önde ama 1895 commit geride |
| FO-4 | Y-5 `alerts:check` ve `rls:bypass-check` CI'da yok | 4 workflow'da `pnpm …` çağrıları listelendi; ikisi hiçbirinde yok (`ci.yml:141`'deki "pnpm gate" yalnız yorum) | **DOĞRU** |
| FO-4 | Y-6 `core.hooksPath` olmayan bir dizini gösteriyor | `git config --get core.hooksPath` → `/Users/macbook/AgentSpace/fabrika/githooks`; `ls` → No such file | **DOĞRU** (yerel ayar, repoda değil) |
| FO-4 | Y-7 Alarm kanalı yok | `system-alert.ts`, `alerts-sweep.ts`, `admin/alerts/page.tsx` içinde mailer/webhook yok; `alerts-daily` kullanıcıya kayıtlı arama e-postası gönderiyor, operatör alarmı değil | **DOĞRU** |
| FO-4 | Y-8 OpenAI anahtarı açığa çıktı | tek kaynak `RELEASE_CHECKLIST.md:39,71,387` (29.09 snapshot) | **ÖLÇÜLEMEDİ**: yalnız doküman kanıtı. Anahtarın sonradan yenilenip yenilenmediği repodan bilinemez |
| FO-4 | (tablo) TopicMatch gece job'u EKSİK, `src/lib/inngest/jobs/` | `git cat-file -e origin/dev:src/lib/jobs/tasks/k1-topic-match.ts` → VAR; `schedule.ts:91` `k1-topic-match` `30 2 * * *`; `src/lib/inngest` yok | **YANLIŞ** (ROADMAP:184 bayat notunun kopyası) |

## 2 · ORTA bulgulardan örnekler (rapor başına ≥3)

| Rapor | Bulgu | Doğrulama | Sonuç |
|---|---|---|---|
| FO-1 | #4 process.env doğrudan okuma, 26 satır / 23 dosya | `git grep 'process\.env' origin/dev -- src ':!src/lib/env.ts'` test dışı: ham 47/25; NODE_ENV ve NEXT_* çıkarılınca 32/17 | **KISMEN**: ihlal gerçek, sayı tekrarlanamıyor. Ayrıca örnek olarak verdiği `analytics.ts:81–83` NEXT_PUBLIC_* okuyor, yani kendi koyduğu "NEXT_* hariç" kuralına uymuyor |
| FO-1 | #5 `any` 10 satır, plan-repository.ts | `grep -nE ': ?any\b\|as any'` (yorum hariç) → 413, 417, 423, 438, 449, 502, 547, 694, 977, 984 | **DOĞRU** (birebir) |
| FO-1 | #6 PricingClient.tsx:110–112 para aritmetiği | :110-111 `ultraYearly.amountMinor + ultraYearlyList.amountMinor * 2`, :112 fark | **DOĞRU** |
| FO-1 | #7 consortium.ts:31 → m8 | `:31 import { topicPrefix } from '@/modules/m8/server/matching'` | **DOĞRU** |
| FO-1 | #10 T-6 YOK; M7/M9/M10 UI yok | `pipeline/[id]/client.tsx:46` `TASK_TEMPLATE = ['T-6','T-5','T-4']`, :452'de render ediliyor (fe-fb de "T-6 Görevleri" düğmesini gördü). `src/app/.../tto/page.tsx`, `briefs/page.tsx`, `documents/page.tsx` var | **KISMEN / YANILTICI**: T-6 kalıcı model olarak yok ama statik UI var. M7/M9/M10'da `src/modules/mX/ui` dizini yok, ekranları ise `src/app` altında var |
| FO-2 | O-2 `ayarlar/takvim` ve `ayarlar/sso` 404 | `routes.ts:121` (raporda :117) takvim yolunu üretiyor; `route-catalog.ts:63` takma ad; `ayarlar/takvim` için sayfa ya da rewrite yok; `next.config.ts:223` sso rewrite'ı var, `settings/sso` sayfası yok | **DOĞRU** (satır 4 kaymış). 404 canlı ölçümdü |
| FO-2 | O-6 seed.ts:291 `plan.deleteMany` | `seed.ts:291` `prisma.plan.deleteMany` | **DOĞRU** (kod atfı). FK nedeni canlı ölçüm, **ÖLÇÜLEMEDİ** |
| FO-2 | O-7 e2e `localhost:3000` sabit | `theme-paint-timing.spec.ts:17` `BASE_URL = 'http://localhost:3000'`; `theme-no-script-warning.spec.ts:23` `goto('http://localhost:3000/…')` | **DOĞRU** |
| FO-2 | D-2 "Odak Noktası CRM (M3)" | `relationships/page.tsx:74` | **DOĞRU** |
| FO-3 | B5 `requireModule` ölü, API'de modül kapısı 0 / 41 rota | `git grep requireModule` → yalnız `hooks.tsx:47` tanımı; `src/app/api` altında `ModuleState\|assertModuleAccess` → 0; route.ts sayısı 41; `assertModuleAccess` m2, m6, m7, m9, m10 ve concept-notes'ta | **DOĞRU** |
| FO-3 | B6 oran sınırlama yalnız birkaç uçta, AI'da yok | limiter yalnız `api/cagrilar` (`UserWindowLimiter`), `csp-report`, `api-auth`; AI'da 0; kodda `UPSTASH` yok | **DOĞRU**. Sayım eksik: `public-lead.ts:34,37`'de e-posta ve IP limiti de var (raporun kendi B10'unda geçiyor) |
| FO-3 | B7 logger PII maskelemiyor | `logger.ts` redaction yok; `console.error(..., error, ...)` satır 9'da (raporda 11) | **DOĞRU** (satır kaymış) |
| FO-3 | B8 bağımlılık sürümleri açık aralığında | `pnpm-lock.yaml`: `sharp@0.35.4` (<0.35.5), `proxy-addr@2.0.7` (<2.0.8), `hono@4.11.4` (<4.12.4), `mysql2@3.15.3` (<3.22.0), `next@16.3.4`, `express@5.2.1` | **DOĞRU** (sürümler). Advisory kayıtları çevrimdışı **ÖLÇÜLEMEDİ** |
| FO-3 | (platform) pip-audit: "workers/ altında requirements yok" | `git ls-tree -r origin/dev workers/` → `workers/cordis/requirements.txt` (HEAD'de de var) | **YANLIŞ** (lider de düzeltmişti) |
| FO-3 | (tablo) "§5 Sentry/PostHog: analytics.ts stub" | `analytics.ts:79-85` `posthogConfig()` gerçek anahtar ve host okuyor, capture gövdesi var | **YANLIŞ**: stub değil, anahtar yokken no-op. be-fb'nin "KISMEN" tespiti doğru |
| FO-4 | #9 CLAUDE.md gate listesi package.json ile uyumsuz | `CLAUDE.md:20` (i18n:check ve rls:bypass-check yok) ↔ `package.json:46` | **DOĞRU** |
| FO-4 | #12 `M6:evaluation` → `claude-opus-5`, llm.ts:85 | `llm.ts` :85 bölgesinde `'M6:evaluation': 'claude-opus-5'` | **DOĞRU** |
| FO-4 | #13 REDIS_URL kodda okunmuyor | `git grep REDIS_URL origin/dev -- src` → 0 | **DOĞRU** |
| FO-4 | #10 4 lint uyarısı | lint koşulmadı | **ÖLÇÜLEMEDİ** |

## 3 · ROADMAP ya da doküman notunu kanıt sayan bulgular

| Rapor | Bulgu | Dayandığı doküman | Durum |
|---|---|---|---|
| FO-4 | TopicMatch gece job'u "EKSİK" | ROADMAP:184 ("güncel 29.09 — `src/lib/inngest/jobs/` altında yok (koddan doğrulandı)") | ⚠️ **YANLIŞ**: kodda VAR. Klasik bayat not kopyası |
| FO-4 | OpenAI anahtarı açığa çıktı (Y-8, P0-8) | RELEASE_CHECKLIST.md:39, 71 (29.09) | ⚠️ yalnız doküman, güncel durum bilinmiyor |
| FO-4 | Pilot kapıları tablosu (1.1–8, Stripe) | RELEASE_CHECKLIST §1 snapshot (29.09, dev @ 4bfc20a5) | ⚠️ rapor bunu kendisi beyan ediyor; yeniden ölçülmedi |
| FO-1 | K-1 RLS (#16) | ROADMAP:104, :159 | ✔ meşru: bir karar kaydını kanıt göstermek doğru. Üretimdeki rol yine de ölçülmedi |
| FO-3 | B1 RLS | ROADMAP + SECURITY_COMPLIANCE.md:83 + **yerel** `.env` | ⚠️ yerel `.env` üretimi kanıtlamaz; rapor bunu "doğrulanamadı" diye işaretlemiş |
| FO-1 | E4 "≥500 konu (doküman ölçümü 1214)" | ROADMAP ölçüm notu | ⚠️ yeniden ölçülmedi (rapor beyan ediyor) |
| Lider | "CORDIS K2 23.613 projede 272 sn (29.09)" | doküman | ⚠️ "Olumlu (doğrulandı)" başlığı altında, ama bu turda ölçülmedi |

## 4 · Raporlar arasındaki çelişkiler

1. **TopicMatch:** be-fb "DOC-ESKİ (kod VAR)", devop-fb "EKSİK". → be-fb doğru (`k1-topic-match.ts` var, `schedule.ts:91`).
2. **workers requirements:** se-fb "yok", gerçekte `workers/cordis/requirements.txt` var. → se-fb yanlış.
3. **Kiracı modeli sayısı:** be-fb 51, se-fb `rls:check` 48. Ölçtüğüm origin/dev: 50 tenantId modeli; 3 nullable çıkınca 47 strict model. İkisi de eski yerel dalı saymış (EvidenceReminder).
4. **Nullable tenantId:** be-fb 3 model sayıyor, şemada 4 var (AuditEvent nullable ama strict politikada).
5. **PostHog:** be-fb "gerçek capture, anahtar yoksa no-op", se-fb "stub". → be-fb doğru.
6. **T-6 görevleri:** be-fb "YOK", fe-fb fırsat detayında "T-6 Görevleri" düğmesini görmüş. → statik şablon UI var, kalıcı model yok.
7. **M7/M9/M10 UI:** be-fb "UI dizini yok / UI YOK", fe-fb ekranları canlıda 200 ile açmış. → ekranlar `src/app` altında var; be-fb'nin ifadesi yanıltıcı.
8. **`rls:verify`:** se-fb atlandı (DB kapalı), devop-fb geçti (DB açık). Çelişki değil, iki ayrı an (lider de böyle değerlendirdi). B4 geçerli.
9. **Karar #16'nın önemi:** be-fb KRİTİK, se-fb YÜKSEK, devop-fb "HAYIR (patron kararı)" satırı, lider P0-7. Aynı olgu dört farklı derecede.
10. **Ölçülen ağaç:** fe-fb origin/dev'i ölçmüş; be-fb ve se-fb yerel HEAD'i ölçmüş, ama bunu raporlarında belirtmemişler.

**Ek gözlem (dört raporda da yok, iddia denetimi dışı, bilgi için):** Gizlilik metni `messages/tr.json:836` / `en.json` `securityBody` kullanıcıya "Verileriniz … PostgreSQL Row-Level Security (RLS) ile diğer kiracılardan yalıtılmış" diyor. Oysa Açık karar #16 = HAYIR ve ROADMAP:159 "'RLS korumalı' iddiası yazılmaz" diyor. Bu, kullanıcıya dönük ve hukuken bağlayıcı bir metin. se-fb'nin KVKK taahhüt ↔ kod tablosuna girmesi gerekirdi.

## 5 · Kart bazında hüküm

| Kart | Hüküm | Gerekçe ve düzeltilecekler |
|---|---|---|
| **FO-1 · TASK-MVBB458UIILWZ (be-fb)** | **DÜZELTME GEREKLİ** (küçük) | KRİTİK ve YÜKSEK'lerin özü doğru. Düzeltilecekler: (a) ölçülen ağacı yaz, sayıları origin/dev'e göre güncelle: 51 → 50 model, nullable listesine AuditEvent'i not düş; (b) DATA_MODEL eksikleri 14 → 15 (Session); (c) process.env sayısını tekrarlanabilir komutla ver, `analytics.ts` örneğini düzelt; (d) #10'da "T-6 YOK" → "statik UI var, model yok"; "M7/M9/M10 UI yok" → "ekranlar `src/app`'te var, modül `ui/` dizini yok"; (e) E7'deki EvidenceReminder origin/dev'de silinmiş |
| **FO-2 · TASK-MVBB4FCX2Q24T (fe-fb)** | **ONAY** (kapatılabilir) | Ölçülen 25'ten fazla atıfın tamamı doğru. Yalnız iki satır numarası kaymış (`api-keys/page.tsx` 55-57 → 54-56, `routes.ts` 117 → 121); hükmü etkilemiyor |
| **FO-3 · TASK-MVBB4PJ636WZH (se-fb)** | **DÜZELTME GEREKLİ** | B1, B3, B4, B5, B6 ve B7 doğru. Düzeltilecekler: (a) pip-audit gerekçesi yanlış, `workers/cordis/requirements.txt` var, tarama koşulmalı; (b) KVKK tablosundaki "analytics.ts stub" yanlış; (c) B2'deki "yalnız iki host" eksik: R2_PUBLIC_HOST kalıbı ve `dangerouslyAllowLocalIP` de var; (d) 48 sayısı yerel daldan, origin/dev'de 47; (e) B4'e `ci.yml:143`'ü ekle; (f) gizlilik metnindeki RLS iddiasını (§4 ek gözlem) KVKK tablosuna ekle |
| **FO-4 · TASK-MVBB4Z4PSKN08 (devop-fb)** | **DÜZELTME GEREKLİ** | CI, yedek, hooksPath, CI kapsamı, alarm kanalı ve dev geriliği doğru. Düzeltilecekler: (a) TopicMatch "EKSİK" yanlış (bayat ROADMAP notu); (b) "main yerel dev'in 1 commit önünde" → "1 önde, 1895 geride"; (c) OpenAI anahtarı satırına "kaynak: 29.09 checklist, güncel durum ölçülmedi" notu; (d) KRİTİK-1'i "yerel ortam (28P01) + araştırılmamış 2 assertion" diye yeniden çerçevele |

Lider raporuna etkisi: P0 listesi ayakta kalıyor. Lider TopicMatch ve requirements.txt düzeltmelerini zaten yapmış. Birleşik rapora girmesi gerekenler: P0-8'in doküman kaynaklı olduğu, DATA_MODEL eksiğinin 15 tablo olduğu, gizlilik metnindeki RLS iddiası, ve "Olumlu (doğrulandı)" başlığı altındaki 29.09 CORDIS ölçümünün yeniden ölçülmediği.

## Değişen dosyalar
Yalnız bu rapor yazıldı. Kod, şema, doküman ve başka raporlara dokunulmadı; commit atılmadı. Geçici kopyalar (schema, rls.sql, lock) yalnız scratchpad'de tutuldu.

## Riskler
- Canlı ölçümler (axe, e2e, gate test sayıları, 404'ler) statik olarak yeniden üretilmedi, **ÖLÇÜLEMEDİ** diye işaretlendi.
- Advisory aralıkları (GHSA) çevrimdışı doğrulanmadı; yalnız lock sürümleri ölçüldü.

## Sonraki adım
- be-fb, se-fb ve devop-fb raporlarını §5'teki maddelere göre güncellesin (yeni rapor sürümü olarak).
- Lider, §4'teki ek gözlemi (gizlilik metni) dalga 2'ye ya da se-fb'nin KVKK kararına eklesin.

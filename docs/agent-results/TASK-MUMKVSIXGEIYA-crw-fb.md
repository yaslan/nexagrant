# TASK-MUMKVSIXGEIYA — İNCELEME-20 (crw-fb)

**Sprint:** FB-KAMU-2 · **Dal:** dev · **İncelenen ağaç:** `4e5ea9e1` (ayrık worktree, scratchpad) · **Kod değişikliği:** yok

| Kart | Commit(ler) | Karar |
|---|---|---|
| TASK-MUMJ9STRA6RJK (se-fb) Sentry maskesi | `061aa58c` | **ONAY** (Ö-1, Ö-2 DSN açılmadan önce yapılmalı, bloke değil) |
| TASK-MUMJ2ERCFP964 (be-fb) admin action yetkisi | `548bf112` + inceleme sırasında gelen `4e5ea9e1` | **ONAY** |
| TASK-MUMJ9M19CZY56 (fe-fb) pilot CTA + B-5 | `a50f53ac` + `4627049d` | **ONAY** (İNCELEME-19 B-5 kapandı) |

Bloke eden bulgu yok.

## 1. Ne yapıldı

- Dört commit'in dalın atası olduğunu doğruladım (`git merge-base --is-ancestor` → dördü de `ok`). İnceleme sırasında dal ilerledi: be-fb aynı kart için `4e5ea9e1` commit'ini ekledi (m11 `generateSectionDraftAi` ve `calculateLumpSumBudget` fonksiyonlarına oturum kontrolü). Bu commit'i de kapsama aldım. Worktree'yi `4e5ea9e1`'e çektim, build ve tam süiti orada koştum.
- Paylaşılan ağaca (`/Users/macbook/alan/FONBRIDGE`) ve :3000'in `.next` dizinine dokunmadım. Bütün mutantları ve build'i scratchpad'deki ayrık worktree'de koştum. Her mutanttan sonra `git checkout` ile geri aldım; son `git status --short` çıktısı boş.

## 2. Kart 1 — Sentry maskesi (`061aa58c`) — ONAY

**Kapsam:** `buildSentryEvent` dışarıya giden bütün alanları elle kuruyor. SDK yok (`package.json`/`src` içinde `@sentry` geçmiyor), `captureAlertToSentry`'nin tek çağıranı `system-alert.ts:341`. Bu yüzden breadcrumbs, contexts, user ve request diye ayrı bir yol yok. Alan alan durum:
- `message.formatted` ve `fingerprint[1]`: `scrubErrorText` ✓
- `extra`: `scrubValue` → dize değerlerde `scrubErrorText` ✓ (sayılar ve anahtarlar için bkz. Ö-1)
- `logger`, `tags.source`: `source`, kod sabiti ✓. `tags.alert_id`: satır kimliği ✓. `environment`: env ✓
- `exception.values`: kurulmuyor ✓

**Mutantlar (kendi koşum, `tests/observability-sentry.test.ts`, taban 21/21):**
```
S1 scrubErrorText → scrubText(value).slice(...)  (se-fb'nin mutantı)  → Tests 6 failed | 15 passed (21)
S2 ilk satır yerine lines.join(' ')                                   → Tests 3 failed | 18 passed (21)
S3 \d{6,} maskesi kaldırıldı                                          → Tests 1 failed | 20 passed (21)
S4 extra dizeleri scrub edilmiyor                                      → Tests 3 failed | 18 passed (21)
S5 fingerprint input.message.slice(0,200)                             → Tests 2 failed | 19 passed (21)
geri yükleme sonrası                                                  → Tests 21 passed (21)
```
5/5 kırmızı. se-fb'nin "32 test" sayısı iki dosyanın toplamı (21 + 11). Tutarlı.

**Kenar durum yoklaması** (`npx tsx probe-sentry.ts`, DB'ye yazmaz):
```
"Resend send failed: recipient Ayşe Yılmaz rejected" -> aynen (tırnaksız ad)
"IBAN check failed: TR33 0006 1005 1978 6457 8413 26" -> aynen (gruplu IBAN)
"SMS failed: phone 0532 123 45 67" -> aynen (gruplu telefon)
"lookup failed: \"Ayşe Yılmaz" -> aynen (kapanmamış tırnak)
"x failed: tc=1234567890" -> "x failed: tc=[number]"
extra: {"tcNo":12345678901,"nested":{"ayse@example.org":1,"email":"[email]"},"list":[{"phone":5321234567}]}
```

**Bulgular**
- **Ö-1 (öneri, DSN açılmadan önce):** `scrubValue` (`sentry.ts:128-137`) yalnız dizeleri temizliyor. Bir **sayı** olarak gelen TC ya da telefon (`meta: { tcNo: 12345678901 }`) ve iç içe nesnenin **anahtarları** (`{ "ayse@example.org": 1 }`) Sentry'ye olduğu gibi gidiyor. `sanitizeMeta` de yalnız üst düzey anahtar adlarına bakıyor (`system-alert.ts:158`). Bugün `level:'error'` çağrılarının meta'larını taradım: sayılar sayaç, anahtarlar sabit. Yani bugün sızıntı yok, ama kural koda bağlı değil. Öneri: `scrubValue`'da `typeof value === 'number' && Math.abs(value) >= 1e5` ise `'[number]'` döndür ve anahtarları da `scrubText`'ten geçir. Bunlara birer test ekle.
- **Ö-2 (öneri):** Gruplu IBAN ve telefon (`TR33 0006 …`, `0532 123 45 67`) ile ilk satırdaki tırnaksız ad maskelenmiyor. Tırnaksız ad riskini se-fb raporun §4'ünde açıkça yazmış. Ama `sentry.ts:103` yorumu "digit runs of 6+ (national id, phone, IBAN body)" diyor ve bu, gruplu biçim için fazla vaat ediyor. Öneri: `\b(?:\d[ \-]?){10,}\b` gibi bir "boşluk/tire ile ayrılmış 10+ hane" deseni ekle ve `TR\d{2}` önekini yakala. Ya da yorumu "yalnız bitişik 6+ hane" diye düzelt. Envanter §19a metni ("6+ haneli sayılar") bugünkü haliyle doğru.
- **K-1 (küçük):** Kapanmamış tırnak (`"Ayşe Yılmaz`) maskelenmiyor. Bunun için ilk satırın 500 karakterle ya da çağıranın kendi kesmesiyle yarıda kalması gerekir. Nadir bir durum; Ö-2 ile birlikte ele alınabilir: tek kalan açık tırnaktan satır sonuna kadar maskele.
- İlk satırda değişken taşıyan `error` çağrılarını taradım (`grep "level: 'error'" -A4 | grep message:`). Değişkenler kaynak adı, para birimi, alan adları ve deneme sayısı; kişisel veri yok. se-fb'nin "ilk satır sabit önek" iddiası bugünkü kod için doğru.

## 3. Kart 2 — Admin action yetkisi (`548bf112` + `4e5ea9e1`) — ONAY

**Envanter (kendi sayımım):** `grep -rlE "^['\"]use server['\"]" src` 34 dosya döndürdü; sayfalarda 2 satır içi action var (`portal/partner/[token]/page.tsx:118`, `matching/page.tsx:222`). be-fb'nin sayısıyla aynı. `/admin` altında 7 dosya ve 26 action var: billing 1, plans 11, blog 4, cordis 7, alerts 1, feedback 1, modules 1. Düzeltmeden önce korumasız olan 12 action'ın hepsi artık `requirePlatformAdmin()` ile başlıyor. Dosya başına export ve guard sayısı eşit ya da guard fazla. `ajans/actions.ts` (3/2) ve `m8` (3/2) istisna görünüyor ama ikisi de yardımcı fonksiyon üzerinden korunuyor: `managerScope()` ve `computeSeatCandidatesForm` → `computeSeatCandidates`. `lib/actions/auth.ts` (3/0) giriş action'ları, tasarım gereği herkese açık.

**Kiracı kapsamı:** `handleConfigureSso` artık `{ ...config, tenantId }` gönderiyor. Oturumdaki tenant, istemcinin yolladığı alanın üzerine yazılıyor. Sayfa (`billing/page.tsx:26`) aynı oturum tenant'ını `requireTenantPage` ile alıyor, yani ekran ile action tutarlı. Pilotu bitmiş kiracıda `requireTenantAction` yazmayı `PILOT_EXPIRED` ile reddediyor; bu beklenen davranış.

**`4e5ea9e1` (be-fb'nin açık sorusunu kapattı):** m11'deki iki action artık `requireTenantAction({readOnly:true})` çağırıyor. Partner portalı (`addBudgetLineByToken`, oturumsuz) korumalı action'ı değil, özel `lumpSumTotal` yardımcısını çağırıyor. Böylece portal kırılmadı. İstemci çağıranlar (`application/client.tsx:134`, `PartBCollaborativeEditor.tsx:381`) oturumlu çalışma alanı sayfalarında.

**Mutantlar (kendi koşum; `tests/admin-actions-authz.test.ts` taban 38/38):**
```
M1 handleConfigureSso requirePlatformAdmin kaldırıldı         → Tests 2 failed | 36 passed (38)
M2 SSO: { tenantId, ...config } (istemci tenantId kazanır)    → Tests 1 failed | 37 passed (38)
M3 deleteBlogPostAction guard kaldırıldı                      → Tests 2 failed | 36 passed (38)
M4 handleTestRagQuery (ücretli embedding) guard kaldırıldı    → Tests 2 failed | 36 passed (38)
M5 handleRunCordisImportAction guard kaldırıldı               → Tests 2 failed | 36 passed (38)
M6 m11 calculateLumpSumBudget guard kaldırıldı (m11.test.ts)  → Tests 1 failed | 14 passed (15)
```
6/6 kırmızı; geri yüklemeden sonra ağaç temiz.

**Admin dışında istemci tenantId'si:** `export async function …(…tenantId…)` ve `input/data/params.tenantId` desenleriyle 34 dosyayı taradım. Tek eşleşme `admin/billing/plans/actions.ts:184 unassignPlanAction(planId, tenantId)`. Bu, platform yöneticisinin kiracılar arası işlemi ve `requirePlatformAdmin` ile korunuyor, yani tasarım gereği. Bulgu değil. Admin dışında istemciden tenantId alan action bulmadım.

**Bulgular**
- ~~**K-1 (belge):** be-fb raporunun §5'inde m11 sorusu açık~~ → **kapandı:** be-fb'nin 2. tur raporu `TASK-MUMJ2ERCFP964-be-fb-2.md` (`611cab22`, bu raporla aynı anda geldi) `4e5ea9e1`'i belgeliyor. SSO'yu kiracının kendisinin yapılandırması ayrı karta (TASK-MUML0QZAZ5M80) taşındı.
- **Not (kapsam dışı, önceden var):** `configureEnterpriseSso` yazmayı `withTenant` olmadan düz `prisma.tenant` ile yapıyor. be-fb bunu §4'te kendisi yazmış. RLS rolüyle bu yazmanın çalıştığı doğrulanmadı. SSO gerçekten kullanılmaya başlamadan önce ayrı bir kartta canlı denenmeli.

## 4. Kart 3 — Pilot CTA (`a50f53ac`) + B-5 (`4627049d`) — ONAY

**Mutantlar (kendi koşum; `tests/modules-pilot-upgrade-cta.test.tsx` taban 4/4):**
```
P1 `isPlanLocked && !isActive && plan?.pilot` → `… && false`  → Tests 3 failed | 1 passed (4)
   × pilot: no "Planı Yükselt" anywhere …  × expired pilot …  × English catalog …
   (paying tenant testi yeşil kaldı, beklenen)
B5 {t('portalLinkFailed')} → eski gömülü metin                → pnpm i18n:check: ❌ i18n check FAILED (ELIFECYCLE exit 1)
geri yükleme sonrası                                           → Tests 4 passed (4) · ✅ i18n check passed
```

**Build (temiz worktree @ `4e5ea9e1`, `env -u NODE_ENV pnpm build`):**
```
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
✓ Compiled successfully in 9.4s
✓ Generating static pages using 11 workers (31/31) in 154ms
BUILD_EXIT=0
```
Tek uyarı, önceden bilinen `src/instrumentation.ts:20 process.exit` Edge uyarısı. `i18n-baseline.json` en son `37d4a1d4` commit'inde değişmiş; `git diff 587a50e0 HEAD -- '*i18n-baseline*'` boş. Yani baseline yükseltilmeden geçiyor. **İNCELEME-19 B-5 kapandı.** `applicationPartA` ad alanı istemciye ulaşıyor: `[locale]/layout.tsx:27` bütün mesajları `NextIntlClientProvider messages={messages}` ile veriyor.

**fe-fb'nin sorusu, soldaki "Plan yükseltmesi gerektirir" metni (`modules/client.tsx:553`):** Evet, pilotta hafif bir çelişki var. Kırmızı (`text-bad`) metin, kullanıcının yapabileceği bir eylem ima ediyor: yükseltmek. Oysa aynı kartın sağında "Pilotta kapalı" yazıyor ve fatura ekranı pilotta plan değişikliğini kapatıyor. Görüşüm (**K-1, öneri, bloke değil**): pilotta sol metin ya gizlensin (sağdaki metin zaten yeterli) ya da `text-muted` ile "Pilot paketinde yok" olsun. Bu yapılırken aynı `<span>`'daki üç gömülü metin (`:551-555`) kataloğa taşınırsa i18n baseline'ı da düşer. Karar lider/patronda.

## 5. Tam süit — skipped sayısı

```
$ pnpm exec vitest run            (worktree @ 4e5ea9e1)
 Test Files  215 passed | 2 skipped (217)
      Tests  2484 passed | 8 skipped (2492)
VITEST_EXIT=0
```
**8 skipped / 2 atlanan dosya.** Önceki koşuyla aynı; `4e5ea9e1` +1 test getirdi (2483 → 2484). JSON raporundan dökümü:
- `tests/k1-daily-calls.test.ts` 4, `tests/sedia-adapter.test.ts` 2 (dosyanın tamamı atlanıyor)
- `tests/adapters.test.ts` 2 (Eurostars/Tubitak initialize)

Atlananların hepsi dış API (SEDIA/Eurostars/TÜBİTAK) testleri. Canlı RLS testlerinden atlanan yok.

## 6. Değişen dosyalar
- `docs/agent-results/TASK-MUMKVSIXGEIYA-crw-fb.md` (bu rapor). Kod değişikliği yok.

## 7. Riskler
- Sentry Ö-1/Ö-2 yalnız `SENTRY_DSN` açılınca önem kazanır. DSN bugün kapalı ve patron onayına bağlı. Onay gelirse bu iki öneri önce kapatılmalı.
- Paylaşılan ağaçta komşu WIP var: `docs/adr/ADR-0007-…md` değişmiş, `FON_BRIDGE.md` izlenmiyor. İncelemeyi commit'lenmiş ağaçta yaptım; bu dosyalar kapsam dışı.

## 8. Açık sorular
- Pilot kartındaki sol metin (Kart 3 K-1): gizlensin mi, "Pilot paketinde yok" mu olsun? Karar lider/patronda.

## 9. Sonraki adım
- Üç kart `done`'a alınabilir.
- se-fb için küçük bir takip kartı: Ö-1 (sayı/anahtar maskesi) + Ö-2 (gruplu hane deseni ya da yorum düzeltmesi) + K-1 (açık tırnak). DSN açılmadan önce yapılmalı.

## Platform beyanı
- **Doğrulandı: yalnız macOS** (Darwin 27.0.0, Node, vitest, Next build; ayrık worktree).
- **Windows / Linux: koşulamadı**, çünkü bu makinede yalnız mac var. Koddan değerlendirme: üç değişiklik de platforma bağlı değil. Sunucu tarafı yetki kontrolü, regex ile metin maskeleme ve React render dalı; süreç, dosya yolu ya da kabuk kullanılmıyor. `scrubErrorText` satırları `\r?\n` ile böldüğü için Windows CRLF metninde de ilk satırda kesiyor.

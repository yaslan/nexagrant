---
sözleşme: 3
görev: TASK-MVBLMIJW293GW
kod: TASK-MVBLMIJW293GW
ajan: crw2-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: PR #86 merge'e hazır. Bloke eden bulgu yok; B-1 kapandı (tip kapısı tsc'yi gerçekten kırıyor), birleşik ağaçta (güncel dev + #86) tsc, 79 vitest ve 6 e2e yeşil. Önerilen sıra: önce #86, sonra #85 dev'e rebase edilir (#85 bugünkü dev ile zaten çakışıyor, #86 yeni çakışma eklemiyor).
platform: mac (Darwin, Chromium/Playwright, yerel Postgres :5433). Windows/Linux koşulamadı çünkü bu makinede yalnız mac var. Değişiklik platformdan bağımsız: React formu, JSON i18n, Prisma, SQL migration, CSV (satır sonu kodda sabit).
sürüm: 1
tarih: 2026-10-17T10:17:20.716Z
---

# TASK-MVBLMIJW293GW (FO-25) — PR #86 inceleme 2 (crw2-fb)

İncelenen: https://github.com/yaslan/fonbridge/pull/86, head `be-fb/fo25-prereg-required` @ `cf616c51` (gh: OPEN, MERGEABLE), base `dev` @ `5482123d`. Commit'ler: `27a58e78` (BE, önceden incelendi), `e0dfb021` (dev merge), `cf616c51` (FE + admin/CSV).

Çalışma ortamı:
- Okuma `git diff origin/dev...cf616c51` ile yapıldı.
- Testler scratch worktree'de koşuldu: kendi `node_modules`'ü vardı, Prisma client ayrıca üretildi, ana checkout'a dokunulmadı.
- Önce PR head'inde, sonra **güncel dev + #86 birleşik ağacında** (probe merge commit `cd3f52ac`, push edilmedi) koşuldu.
- Worktree sonradan silindi.

**MERGE ETMEDİM, approve vermedim.**

## Karar

**Merge'e hazır.** Bloke eden bulgu yok.

## Odak maddeleri

### (1) B-1 kapandı mı? — EVET

- `payload()` artık `organization`'ı gönderiyor. Form testi gövdeyi birebir doğruluyor: `title`, `organization` dolu, `languages: []`.
- Tip kapısı olarak `FIELD_ORDER = Object.keys(FIELDS)` kullanılıyor, `FIELDS` de `satisfies Record<Field, true>` ile tiplenmiş. Üç denemeyle doğruladım:
  - `organization: true` satırı silindi → `TS1360 … Property 'organization' is missing` (kapı kırıldı ✓).
  - Şemaya `department: requiredText(50)` eklendi, forma eklenmedi → `TS1360 … does not satisfy 'Record<Field, true>'` (asıl risk senaryosu da yakalanıyor ✓).
  - FIELDS'e olmayan bir `bogus` anahtarı eklendi → `TS2353` (fazla anahtar da reddediliyor ✓).
- `Field`'dan hariç tutulan alanlar (`utmSource/Medium/Campaign`, `locale`) sessiz takılma üretemez:
  - utm değerleri `v.slice(0, 100)` ile şema sınırının (100) altında kalıyor.
  - `locale` prop'tan geliyor (`'tr' | 'en'`).
- Önceki raporda önerdiğim ikinci savunma (eşlenen alan hatası boşsa genel hata göstermek) eklenmedi. Tip kapısı asıl yolu kapattığı için bloke değil (Ö-3).

### (2) Kurum input'u, Diller bloğu, hata ve odak — doğru

- Kurum input'u: `required: true` (yıldız + `aria-required`), `autoComplete: 'organization'`, `maxLength: 200`. Şemada `requiredText(200)` var; istemci ve sunucu sınırı aynı.
- Unvan input'u: `required: true`, `maxLength: 120` ↔ `requiredText(120)`.
- Hata ve odak:
  - Kimlik `ep-organization`; `focusFirst` onu buluyor.
  - FIELDS'teki sıra (`title`, `organization`, …) ekrandaki sırayla aynı.
  - e2e'de Kurum boşken: odak Kurum'da, `aria-invalid=true`, metin "Bu alan zorunludur.", POST sayısı 0.
- Diller `optional_heading` bloğuna taşındı; `required` ve yıldız yok, `languages-error` hiç oluşmuyor. Seçilen dil yine gönderiliyor (birim test `['en']`).
- i18n: `scripts/i18n-check.ts` → "both catalogs agree"; `tests/i18n.test.ts` 4/4.
- KVKK: aydınlatma metni (`content/kvkk-uzman-v1*.md:14`) zaten "unvan/kurum" diyor. Yeni bir veri kategorisi eklenmiyor, rıza sürümünün artırılması gerekmiyor.

### (3) Admin tablo + CSV `organization` — doğru

- `ROW_SELECT` ve `ExpertPreRegRow` içinde `organization` var. Tabloda değer `r.organization ?? t('none')` olarak gösteriliyor; FO-25 öncesi NULL satırlar "—" görünür.
- CSV: başlıkta `kurum` var. Hücre aynı `toCsv` → `csvCell` yolundan geçiyor:
  - `FORMULA_START = /^[=+\-@\t\r]/` kontrolünden sonra başa `'` ekleniyor.
  - `null` boş hücre oluyor.
  - Zod `trim()` önce koştuğu için `" =HYPERLINK…"` gibi baştaki boşlukla kaçış atlatılamıyor: trim sonrası `=` ile başlar, kaçışlanır.
- e2e: admin satırında ve indirilen CSV'de "Ege Deneme Üniversitesi" görünüyor ✓.

### (4) FO-23 yeniden kayıt yolu ve `organization` — güncelliyor; posta hatasında geri ALMIYOR (bilinen davranış)

Gerçek Postgres'te deneme testiyle ölçtüm (satırlar `expertprereg-probe-crw2-` önekiyle yazıldı, sonra temizlendi):

```
noorg            {"kind":"invalid","errors":{"organization":"required"}}
first            {"kind":"created"}                                   # Kurum A
(bekleyen satırın organization'ı NULL'a çekildi = FO-25 öncesi satır benzetimi)
reissue-ok       {"kind":"created"}                                   # Kurum B
after reissue-ok {"organization":"Kurum B","languages":[]}            # NULL satır dolduruldu ✓
reissue-mailfail {"kind":"unavailable","error":"mail_failed"}         # Kurum C, posta hatası
after mailfail   {"organization":"Kurum C"}                           # geri alınmadı
```

- Yeniden kayıt kurumu yazıyor ve güncelliyor; eski NULL satır da bu yolla doluyor ✓.
- Posta hatasında yalnız token geri yükleniyor (`previous = {verifyTokenHash, verifyTokenExpiresAt}`); Kurum ve öteki form alanları yeni denemede kalıyor. Bu, FO-23 incelemesindeki MINOR-A davranışı. #86 bunu yalnız devralıyor, yeni bir sorun eklemiyor → Ö-1.

### (5) Migration + down + apply-order — doğru

- `ADD COLUMN IF NOT EXISTS "organization" TEXT`: additive, nullable, backfill yok. Her koşuda bütün dosyaları uygulayan `apply-migrations.sh` ile uyumlu.
- `.down.sql`: `\set ON_ERROR_STOP on` + `\ir ../migration-down-guard.sql` + `DROP COLUMN IF EXISTS`. "LOSSY" uyarısı yazılmış.
- `apply-order.txt`: dosya son satırda, yani `add-expert-pre-registration.sql`'den sonra.
- Prisma `organization String?` ve DATA_MODEL §22 güncel.
- Rollback edilen tek transaction'da canlı deneme (guard değişkenleri `SET LOCAL` ile verildi):

```
down  → has_col_after_down = 0
down  → NOTICE column "organization" … does not exist, skipping      # idempotent
up    → ALTER TABLE
up    → NOTICE column "organization" … already exists, skipping       # idempotent
son   → text | YES
ROLLBACK  (sonra kolon sayısı: 1 — yerel DB değişmedi)
```

### (6) Çakışma ölçümü ve merge sırası

```
git merge-tree --write-tree origin/dev cf616c51                       → 3134a1c9…  rc=0  (temiz)
git merge-tree --write-tree origin/be-fb/uzman-dogrulandi-imza cf616c51 → 29958ccb…  rc=0  (#85 ile ikili temiz)
git merge-tree --write-tree origin/dev origin/be-fb/uzman-dogrulandi-imza → rc=1
   CONFLICT ExpertVerifiedPage.tsx, tests/expert-prereg-form.test.tsx   # #85 BUGÜNKÜ dev ile zaten çakışıyor
(dev + #86) ⊕ #85                                                       → rc=1, aynı 2 dosya, dosya başına 1 hunk
```

- #85, `7f8d3de4` (#78) tabanlı. Sonradan dev'e giren FO-31 (#84, `981cff64`) aynı iki dosyaya dokunduğu için #85 **#86'dan bağımsız olarak** dev ile çakışıyor.
- #86 yeni bir çakışma hunk'ı eklemiyor; iki durumda da hunk sayısı aynı (1+1).
- **Önerilen sıra:**
  1. **#86'yı önce merge et.** dev ile temiz, birleşik ağaç yeşil.
  2. **#85'i yeni dev'e rebase et.** Rebase'i yapan, form testindeki çakışmayı çözerken #86'nın `fillRequired` değişikliğini (Unvan + Kurum, dil yok) korumalı.
  3. Rebase'den sonra `tests/expert-prereg-form.test.tsx` ve `tests/e2e/expert-prereg.spec.ts` yeniden koşulmalı.
- Ters sırada da #85'in çakışma çözümü gerekiyor, iş azalmıyor. #86 önce girerse #85 en güncel tabana tek seferde oturur.

## Bulgular (önem sırasıyla) — bloke eden YOK

### Ö-1 — Öneri: yeniden kayıtta posta hatası, form alanlarını (Kurum dahil) geri almıyor
- Yer: `src/lib/expert-prereg/server/register.ts`, `previous` yalnız token alanlarını tutuyor.
- Senaryo: Bekleyen uzman Kurum'u "B"den "C"ye değiştirip yeniden kaydolur, posta 503 verir. Satırda "C" kalır ama uzmanın elindeki bağlantı "B" ile gönderilmiş kayda aittir. Ölçümü yukarıda.
- Durum: FO-23'teki MINOR-A ile aynı sınıf; #86 yalnız yeni bir alan ekliyor. Ayrı bir kartta `previous`, `existing`'in form alanlarını da tutacak şekilde genişletilebilir. Bu PR'da gerekmiyor.

### Ö-2 — Öneri (ürün): admin tablo ve CSV'de Kurum var, Unvan yok
- Unvan artık zorunlu, ama ne tablo ne CSV onu gösteriyor (`EXPERT_PREREG_CSV_HEADER`'da `title` yok).
- Admin eşleştirme için Unvan da gerekiyorsa `ROW_SELECT` + CSV'ye `unvan` eklemek küçük bir iş. Kart kapsamı yalnız Kurum dediği için kusur değil.

### Ö-3 — Öneri: istemci doğrulamasının eşlenmemiş hata için genel bir yedeği yok
- `onSubmit`, `safeParse` başarısız olup `toFieldErrors` `{}` döndürürse yine sessiz kalır.
- Bugün buna yol açacak bir alan yok: tip kapısı bütün `Field`'ları kapsıyor, utm/locale sınırlı.
- `Object.keys(found).length === 0` olduğunda `setFormError('server')` eklemek, gelecekte `Field`'dan hariç tutulacak yeni bir alana karşı ucuz bir sigorta olur.

### Bilgi — Deploy sırası
Kod `organization`'ı okuyup yazıyor, bu yüzden migration koddan önce ya da kodla birlikte uygulanmalı. fe-fb raporunda da yazıyor. Bkz. [[fonbridge-idempotent-zincir-backfill-yeniden-yazar]]: bu dosya backfill içermediği için her koşuda yeniden uygulanması güvenli.

## Kanıt (ham çıktı)

**PR head (cf616c51):**
```
npx tsc --noEmit                                  → tsc_rc=0
vitest src/lib/expert-prereg tests/expert-prereg-form.test.tsx tests/expert-verified-page.test.tsx
  Test Files  5 passed (5)   Tests  66 passed (66)
vitest tests/expert-prereg.live.test.ts tests/expert-prereg-reissue.live.test.ts
  Test Files  2 passed (2)   Tests  6 passed (6)
eslint (değişen .ts/.tsx)                         → rc=0
tsx scripts/i18n-check.ts → ✅ i18n check passed: both catalogs agree …
E2E_PORT=3186 playwright test tests/e2e/expert-prereg.spec.ts → 6 passed (21.2s)
```

**Birleşik ağaç (güncel origin/dev 5482123d + cf616c51, probe commit cd3f52ac):**
```
npx tsc --noEmit                                  → tsc_rc=0
vitest (expert-prereg birim + form + verified-page + 2 live + i18n)
  Test Files  8 passed (8)   Tests  79 passed (79)
E2E_PORT=3186 playwright test tests/e2e/expert-prereg.spec.ts
  ✓ consents start unticked; empty submit gives field-level errors and focuses the first
  ✓ no organisation: field error on Kurum, focus there, nothing is posted
  ✓ the KVKK notice opens in a modal and closes with Escape
  ✓ register → verify mail → Founding Expert number → admin row + CSV; same e-mail refused
  ✓ a non-admin does not see the admin table
  ✓ English page, verified-page errors, 375px without horizontal scroll
  6 passed (22.2s)
```

**Tip kapısı denemesi:** ham çıktı (1) altında. Denemelerden sonra dosyalar `git checkout --` ile geri alındı.

## Değişen dosyalar

İncelemede kod değişikliği yapılmadı. Yalnız bu rapor yazıldı: `docs/agent-results/TASK-MVBLMIJW293GW-crw2-fb-2.md`.

## Riskler

- #85 rebase edilirken form testi çakışması yanlış çözülürse #86'nın `fillRequired` değişikliği kaybolabilir. O zaman form testleri Unvan/Kurum `required` hatasıyla kırılır; görünür bir kırılma olur, sessiz değil.
- Deploy'da migration atlanırsa kayıt ve admin listesi Prisma hatası verir.

## Açık sorular

Yok. B-2, K-564520 = B ile kapandı.

## Sonraki adım

1. Lider/patron: önce #86'yı merge et.
2. be-fb: #85'i yeni dev'e rebase et, form testi ve e2e'yi yeniden koş.
3. İstenirse Ö-1/Ö-2 için ayrı küçük kart aç.

**Platform beyanı:** Yalnız mac'te doğrulandı (Darwin, Chromium/Playwright, yerel Postgres :5433). Windows/Linux koşulamadı, çünkü bu makinede yalnız mac var. Kod açısından değişiklik platformdan bağımsız: React formu, JSON i18n, Prisma sorgusu, SQL migration ve CSV üretimi. Süreç, yol, kabuk ya da kısayol yok; davranış aynı kalır.

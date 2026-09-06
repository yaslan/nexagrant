# WAVE-A — P0 kiracı izolasyonu son deliği + E10.2 a11y CI kapısı

**Ajan:** geli-tirici (BE-EN, Backend Mühendisi) · **Sprint:** S8 kapanış dalgası
**Kartlar:** TASK-MTQ5Y8EPT7FDA (kiracı izolasyonu) · TASK-MTPZBXT5EBYBQ (E10.2 a11y CI kapısı)
**Commit'ler:** `97cf93d` (a) · `84d8f7f` (b) — dal: `dev`

---

## 1. Ne yapıldı

### (a) M8 konsorsiyum sayfasının kiracı izolasyonu — `97cf93d`

`src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page.tsx` eski deseni bütünüyle taşıyordu:

| Ölçülen açık | Sonuç |
|---|---|
| `const tenant = await prisma.tenant.findFirst()` | Oturumda kiracı yoksa tablodaki ilk kiracıya düşüyordu |
| `if (tenantId) whereCond.tenantId = tenantId` | Kiracı yoksa koşul hiç eklenmiyor → `opportunity.findFirst({ where: { id } })` **her kiracının** fırsatını döndürüyordu |
| `seatsWhere` aynı koşullu kalıp | Koltuklar için aynı sızıntı |
| `seatCandidate.findMany({ where: { seatId: { in: seatIds } } })` | Hiç kiracıya bağlı değildi |

Komşu `actions.ts` dosyasındaki yerleşik desene çevrildi (yeni desen icat edilmedi):
- kiracı `requireTenantPage(locale)`'den geliyor — **fallback yok**; anonim ziyaretçi login'e, kiracısız oturum `/no-workspace`'e yönleniyor;
- dört sorgunun tamamı `withTenant(tenantId, tx => …)` içinde, `(id, tenantId)` ile eşleşiyor;
- koşullu `if (tenantId)` kalıbı bu dosyadan tamamen kalktı.

`prisma.organization` sorgusu, id'leri zaten kiracı içinde okunan satırlardan geldiği için `withTenant`'a alındı ve
neden ayrıca `tenantId` almadığı koda yorumla yazıldı.

Regresyon koruması: **`tests/tenant-fallback-guard.test.ts`** — `src/` altındaki tüm `.ts/.tsx` dosyalarını yorumları
temizleyerek tarıyor ve filtresiz `tenant.findFirst()` bulursa kırılıyor.

### (b) E10.2 — CI'da Lighthouse a11y kapısı — `84d8f7f`

Önceki durum: `.github/workflows/` altında yalnız `ci.yml`, `check-rls.yml`, `i18n-check.yml` vardı; lighthouse/axe
adımı **hiç yoktu**. ROADMAP E10 kabul kriteri "Lighthouse a11y ≥ 90" olmasına rağmen skor yalnız elle ölçülüyordu.

Takım hafızasındaki reçete (`.agentspace/memory/shared/fabrika-lighthouse-a11y-two-recurring-defects.md`) okundu ve
ölçüm hedefi olarak oradaki sayfa (`/tr/privacy`) ve headless chrome bayrakları kullanıldı.

Eklenenler:
- **`scripts/a11y-check.ts`** (`pnpm a11y:check`) — sunucunun ayağa kalkmasını bekler, `/tr`, `/tr/privacy`, `/en`,
  `/en/privacy` sayfalarını `onlyCategories: ['accessibility']` ile ölçer, eşik altındaki sayfaların **düşük puanlı
  audit'lerini adıyla listeler** ve `process.exitCode = 1` verir. Eşik/URL/sayfa kümesi env ile geçilebilir
  (`A11Y_MIN_SCORE`, `A11Y_BASE_URL`, `A11Y_PATHS`), yani eşik sıkılaştırmak için kod düzenlemek gerekmiyor.
- **`.github/workflows/a11y-check.yml`** — `src/**`, `messages/**`, `scripts/a11y-check.ts`, `package.json` ve
  workflow'un kendisine dokunan PR'larda çalışır: build → start → kapı; düşerse PR'a raporu yorum olarak yazar,
  logları artifact yapar ve `exit 1` ile **işi kırar**. Eşik tek yerde: workflow `env.A11Y_MIN_SCORE: '90'`.
- devDependency: `lighthouse@13.4.1`, `chrome-launcher@1.2.1`.

Kapı adımında `set -o pipefail` **açıkça** yazıldı: onsuz `tee` kapının sıfır-olmayan çıkışını yutar ve adım her
zaman yeşil görünürdü.

`docs/ROADMAP.md` E10'un ilgili maddesi güncellendi ("CI'da eşiği kesen adım yok" artık doğru değil).

---

## 2. Kanıt (kopyalanmış gerçek çıktı)

### (a) `tenant.findFirst()` kod içinde kalmadı

```
$ grep -rn "tenant\.findFirst()" src/
src/app/[locale]/(app)/[workspace]/settings/modules/actions.ts:18: * `TENANT_OWNER`, and a missing tenant fell back to `prisma.tenant.findFirst()`
src/app/[locale]/(app)/[workspace]/pipeline/actions.ts:22: * back to `prisma.tenant.findFirst()` when the session had none — either path
src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page.tsx:50: * `session.tenantId ?? prisma.tenant.findFirst()` and then apply the tenant to
src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions.ts:12: * `session.tenantId ?? prisma.tenant.findFirst()` — the first row in the table,
src/app/api/invitations/route.ts:10: * `session.tenantId ?? prisma.tenant.findFirst()` and, if the table was empty,
src/lib/tenant.ts:11: * (`(session as any)?.tenantId || 'demo-tenant-1'`, or `prisma.tenant.findFirst()`).
```

Kalan **altı eşleşmenin hepsi JSDoc yorum satırı** (` * ` ile başlıyor) — neden kaldırıldığını anlatan prose.
Çalıştırılabilir kodda tek örnek kalmadı; yeni testin yorum-temizleyen taraması da bunu doğruluyor (aşağıda).

### (a) Yeni guard testi gerçekten kırmızıya dönüyor

Deliği geçici olarak geri koyup (`export const __regressionProbe = … prisma.tenant.findFirst()`):

```
$ pnpm vitest run tests/tenant-fallback-guard.test.ts
+ [
+   "src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page.tsx",
+ ]
 ❯ tests/tenant-fallback-guard.test.ts:47:82
 Test Files  1 failed (1)
      Tests  1 failed (1)
```

Dosya hemen yedeğinden geri alındı; commit'lenen sürümde probe yok.

### (b) Kapı yeşil — gerçek production build'e karşı

```
$ pnpm build            # başarılı, .next/BUILD_ID = dlamN0BGYFhaGi8bdajii
$ pnpm start -p 3100    # 200 OK /tr
$ A11Y_BASE_URL=http://localhost:3100 pnpm a11y:check
Lighthouse accessibility gate — threshold 90, base http://localhost:3100

✅ 100  /tr
✅ 100  /tr/privacy
✅ 100  /en
✅ 100  /en/privacy

✅ SUCCESS: all 4 pages scored >= 90.
```

### (b) Kapı kırmızı — eşik geçici olarak imkânsız değere çekildi

CI adımının **birebir aynı komutu** (`set -o pipefail; pnpm a11y:check 2>&1 | tee /tmp/a11y.log`) çalıştırıldı:

```
--- RED (threshold 101, the temporary impossible value) ---
STEP_EXIT=1
--- GREEN (real threshold 90 from the workflow env) ---
STEP_EXIT=0
```

Kırmızı koşunun tam çıktısı:

```
Lighthouse accessibility gate — threshold 101, base http://localhost:3100

❌ 100  /tr
❌ 100  /tr/privacy
❌ 100  /en
❌ 100  /en/privacy

❌ ERROR: 4 page(s) scored below 101.
  /tr — 100
  /tr/privacy — 100
  /en — 100
  /en/privacy — 100
[ELIFECYCLE] Command failed with exit code 1.
```

Eşik gerçek değerine geri alındı — commit'lenen workflow'da:

```
$ grep -n "A11Y_MIN_SCORE" .github/workflows/a11y-check.yml
20:  A11Y_MIN_SCORE: '90'
80:              `At least one public page scored below **${process.env.A11Y_MIN_SCORE}**.`,
```

### Workflow YAML geçerli

```
$ python3 -c "import yaml; …"
jobs: ['lighthouse-a11y']
steps: ['actions/checkout@v4', 'Setup pnpm', 'Setup Node.js', 'Install dependencies', 'Build',
        'Start server', 'Lighthouse accessibility gate', 'Comment on PR if the gate failed',
        'Upload server log on failure', 'Fail if the accessibility gate failed']
env: {'A11Y_MIN_SCORE': '90', 'A11Y_BASE_URL': 'http://localhost:3100'}
```

### Kapılar (her iki commit'ten sonra)

```
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok = temiz)

$ pnpm test
 Test Files  46 passed | 2 skipped (48)
      Tests  368 passed | 8 skipped (376)
```

Başlangıç: 367 geçiyor / 0 başarısız → **368 geçiyor / 0 başarısız** (+1 = yeni guard testi). Hiçbir test gevşetilmedi.

---

## 3. Değişen dosyalar

**`97cf93d` — fix(security)**
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page.tsx` (değişti)
- `tests/tenant-fallback-guard.test.ts` (yeni)

**`84d8f7f` — ci(a11y)**
- `scripts/a11y-check.ts` (yeni)
- `.github/workflows/a11y-check.yml` (yeni)
- `package.json` (`a11y:check` script'i + `lighthouse`, `chrome-launcher` devDeps)
- `pnpm-lock.yaml`
- `docs/ROADMAP.md` (E10 a11y maddesi)

---

## 4. Riskler

1. **CI'da Chrome varlığı varsayımı.** `chrome-launcher`, `ubuntu-latest` imajında kurulu Google Chrome'u bulmaya
   dayanıyor. İmaj değişirse kapı "çalışamadı" diye kırılır (sessiz geçmez — script hatayı yakalayıp `exit 1`
   veriyor). Gerekirse `browser-actions/setup-chrome` adımı eklenebilir.
2. **Kapı `pnpm build` çalıştırıyor** → a11y işi CI süresine tam bir build ekliyor. Ölçülen sayfalar veritabanına
   dokunmadığı için DB servisi gerekmiyor, ama süre maliyeti var. `paths` filtresi bunu yalnız UI PR'larına sınırlıyor.
3. **`next start` uyarısı:** `next.config.ts` içinde `output: 'standalone'` olduğu için Next
   `"next start" does not work with "output: standalone"` uyarısı basıyor. Yerelde sunucu buna rağmen çalıştı
   (`/tr` → 200, Lighthouse 100). Uyarı gelecekte hataya dönüşürse workflow'daki başlatma adımı
   `node .next/standalone/server.js`'e çevrilmeli.
4. **Konsorsiyum sayfasındaki `prisma.organization`** şemada karşılığı olmayan bir model (`schema.prisma`'da
   `Organization` yok, yalnız `CordisOrganization` var); sorgu her çalıştığında `try/catch`'e düşüp `orgs = []`
   bırakıyor. Bu davranış değiştirilmedi — kapsam dışı, ayrı kart konusu.
5. Guard testi kaba metin taraması; `prisma["tenant"].findFirst()` gibi dolambaçlı bir yazım onu atlatır.
   Amaç kasıtlı atlatmayı değil, kalıbın kazara geri gelmesini engellemek.

---

## 5. Açık sorular

1. Kapı yalnız dört genel sayfayı ölçüyor. Oturum arkasındaki uygulama sayfaları (`/[workspace]/…`) için de a11y
   isteniyor mu? İstenirse CI'da giriş yapmış bir oturum + seed'li DB gerekir — belirgin şekilde daha ağır bir iş.
2. Eşik 90'da mı kalsın? Ölçülen skor dört sayfada da 100; 95'e çekmek bedava ek koruma olur ama başka bir ajanın
   ölçtüğü sayfalarda tolerans bırakmaz. Karar liderin.
3. `docs/ROADMAP.md` E10'un ilk maddesi (`/dashboard` sabit rakamlara düşüyor, CLAUDE.md §7 ihlali) hâlâ açık;
   E10 başlığı bu yüzden bütünüyle kapanmadı. Bunun için ayrı kart açılmalı mı?

---

## 6. Sonraki adım

- Kartlar `done`'a alınabilir: TASK-MTQ5Y8EPT7FDA ve TASK-MTPZBXT5EBYBQ.
- Kapının CI'da gerçekten koştuğu ilk PR'da doğrulanmalı (yerelde birebir komutla doğrulandı, GitHub runner'ında
  henüz koşmadı).
- `/dashboard` sabit-rakam ihlali (CLAUDE.md §7) için ayrı düzeltme kartı.

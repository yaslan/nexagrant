# TASK-MTQ5ZF5ZRU5SM — M6 Evaluator Lens: gerçek kiracı verisine bağlama

**Ajan:** geli-tirici · **Sprint:** S9 · **Kapattığı kartlar:** TASK-MTQ5ZF5ZRU5SM, M6.2 (TASK-MTPZHGD3S6G3C), M6.4 (TASK-MTPZHVY46L1MR)
**Commit'ler:** `02f7fd2`, `8dd3658` (branch `dev`)

---

## 1. Ne yapıldı

### Kök bulgu: ekranlar çalışamaz durumdaydı

`EvaluationDashboard.tsx` bir `'use client'` bileşeniydi ama `@/lib/db`'den `prisma`'yı import edip
`useEffect` içinde sorgu atıyordu — tarayıcıda çalışması mümkün olmayan bir kod. Ayrıca `tenantId`'yi
prop olarak istemciden alıyordu. Üstelik `EvaluatorForm` ve `EvaluationDashboard`'ı **render eden
hiçbir rota yoktu**; bu yüzden ikisi de hiç gerçek veriyle çalıştırılmamıştı.

| Alan | Önce | Sonra |
|---|---|---|
| Dashboard veri yolu | `'use client'` içinde `prisma` + `useEffect` | Sunucuda `listPanelScores` (session tenant + `withTenant`), satırlar prop olarak iniyor |
| Tenant kaynağı | İstemciden gelen `tenantId` prop'u | Yalnızca oturum (`requireTenantAction`) |
| Rota | Yok (bileşenler mount edilmiyordu) | `opportunities/[id]/evaluations/panel` — manifest + route catalog'a kayıtlı |
| Kaydetme sonrası tazeleme | Yok | `router.refresh()` → sunucu bileşeni yeniden okuyor |

### Uydurma rakamların kaldırılması (CLAUDE.md kural 7)

1. `generateAiEvaluation` içinde sabit bir `{ excellence: 4.2, impact: 4.0, implementation: 3.8 }`
   nesnesi + hazır "güçlü/zayıf yönler" listesi vardı; model çağrısı ya da JSON parse **başarısız
   olduğunda bu uydurma değerler veritabanına yazılıyor** ve kullanıcıya kendi teklifinin
   değerlendirmesi gibi gösteriliyordu. Artık başarısız çağrı hata veriyor, hiçbir şey yazılmıyor.
2. `evaluations/page.tsx`, DB'den sonuç gelmediğinde uydurma puanlar (4.5/4.2/3.8) taşıyan sahte bir
   fırsat render ediyordu. Artık `notFound()`.
3. Sayfa başlığı **"Resmî** EU Ön Değerlendirme"ydi — CLAUDE.md'nin "resmî puan gibi sunma" yasağının
   doğrudan ihlali. "İç Ön Değerlendirme" olarak düzeltildi; hem form hem dashboard "iç ön
   değerlendirme" rozetini taşıyor.

### Doğruluk ve güvenlik düzeltmeleri

- **`saveEvaluation` yanlış hakeme yazıyordu.** Puanlar kimin gönderdiğine bakılmaksızın
  `evaluation.reviewers[0]`'a yazılıyordu: ikinci hakem gönderdiğinde birinci hakemin puanlarının
  **üzerine, birinci hakemin kimliğiyle** yazıyordu ve panel ortalaması tek görüşü iki kez sayıyordu.
  Artık oturumdaki kullanıcının `Reviewer` satırına yazılıyor, o hakem `completed` işaretleniyor,
  değerlendirme ancak **tüm** koltuklar gönderdiğinde tamamlanıyor.
- **Sessiz yutulan hatalar.** Tüm action'lar DB hatasında `console.warn` atıp normal dönüyordu; form
  olmayan bir kaydı "başarılı" gösteriyordu. Artık fırlatıyorlar, istemci hatayı gösteriyor.
- **Zod doğrulaması** her action girişinde (`src/modules/m6/server/validation.ts`). Şemalar ayrı
  dosyada: bir `'use server'` modülü yalnızca async fonksiyon export edebilir.
- `calibrateESR` başka kiracının kaydı için `{ calibration: 0 }` dönüyordu — gerçek, mükemmel
  kalibre edilmiş bir sonuçtan ayırt edilemez. Artık reddediyor.
- **Üç kopya ESR formülü** (`(total/15)*4+1`) tek bir `esrTotalToPanelScale`'e indi.
- Dashboard'daki `consensusOutcome` sabit `null` döndürülüyordu; artık gerçek puanlardan hesaplanıyor.

### `scoreG0` hakkında (görev maddesi 1) — dürüst bulgu

Kanonik `scoreG0` **`src/lib/scoring/g0-canonical.ts:135`**'te ve M6 onu çağırmıyor — çağırmamalı da.
G0, *fırsat triyajı* (0–100 bileşik puan, 7 ağırlıklı özellik); M6 ise *teklif panel puanlaması*
(1–5, hakem × ölçüt). Bunlar farklı ölçekte farklı şeyler. M6'da G0'ın ikinci bir kopyası **yok**:

```
$ grep -rn "scoreG0\|calculateG0Score" src/modules/m6/
(çıktı yok)
```

Görevdeki "ikinci formül yazma" talimatının M6 içindeki gerçek karşılığı ESR normalizasyonuydu (3 kopya);
o birleştirildi. G0'ı M6'ya zorla çağırtmak yanlış olurdu, yapmadım.

### Yan hasar onarımı: e2e kapısı hiç çalışmamış

`playwright.config.ts` **yoktu**. `pnpm test:e2e` depo kökünü tarayıp vitest dosyalarını parse etmeye
çalışıyor, `Total: 0 tests in 0 files` + exit 1 veriyordu. Yani bu depodaki hiçbir e2e testi bugüne
kadar **hiç koşmamıştı**. Config eklendikten sonra ortaya çıkan (hepsi önceden var olan) hatalar:

- `tests/e2e/rls.spec.ts`: `new PrismaClient()` (Prisma 7'de adapter olmadan fırlatıyor) ve
  `SET app.tenant_id = $1` (sözdizimi hatası — `SET` bind parametre almaz; `src/lib/db.ts` tam da bu
  yüzden `set_config` kullanıyor). Ayrıca BYPASSRLS olan superuser rolüyle okuyordu, yani izolasyon
  iddiası hiçbir şey kanıtlamıyordu → `DATABASE_URL_RLS_TEST` (`fabrika_app`, NOBYPASSRLS).
- `tests/e2e/auth.spec.ts`: Türkçe rotada İngilizce metin bekliyordu; Google'ın authorize URL'ine giden
  bir tıklamadan `/api/auth/signin` bekliyordu.

Testleri **gevşetmedim**; her biri ürünün gerçekte yaptığı şeye göre düzeltildi ve kapsam korundu.

---

## 2. Kanıt (gerçek çıktı)

### 2.1 Gerçek tarayıcı akışı — form doldur → kaydet → dashboard

`docs/agent-results/TASK-MTQ5ZF5ZRU5SM-screenshots/`:

| Dosya | İçerik |
|---|---|
| `01-panel-before-scoring.png` | Panel açılışı; ölçütler ağırlıklarıyla, "İç ön değerlendirme" rozeti |
| `02-form-filled.png` | Sliderlar 5/4/5/3; ağırlıklı önizleme 4.4/5 |
| `03-dashboard-after-save.png` | Kayıt sonrası: Panel Puanı **4.40**, ESR **4.33**, Fark **-0.07** (yeşil), Uzlaşı **Güçlü** |
| `04-panel-english-locale.png` | `/en/...` — "Internal pre-assessment", "Panel Evaluation Dashboard" |
| `05-evaluations-page-no-fallback.png` | Sahte demo fallback kaldırıldıktan sonra evaluations sayfası |
| `06-missing-opportunity-404.png` | Olmayan fırsat id'si → 404 (eskiden uydurma puanlar render ediliyordu) |

ESR sütunu `Proposal.esrScores.total = 12.5`'ten türüyor: `(12.5/15)*4+1 = 4.33`. Kodda sabit yok.

### 2.2 Kaydedilen satırlar — `tenantId` dolu

```
$ M6_E2E_KEEP=1 npx playwright test tests/e2e/m6-evaluator.spec.ts
  ✓  1 [chromium] › M6 Evaluator Lens — panel scoring › a seated reviewer scores a proposal and sees it on the dashboard (2.7s)

$ npx tsx -e "... prisma.evaluation.findUnique ..."
Evaluation: { id: 'm6-e2e-evaluation', tenantId: 'm6-e2e-tenant', status: 'completed', avgScore: 4.4 }
┌─────────┬─────────────────┬─────────────────┬───────┐
│ (index) │ tenantId        │ criterion       │ score │
├─────────┼─────────────────┼─────────────────┼───────┤
│ 0       │ 'm6-e2e-tenant' │ 'Innovation'    │ 5     │
│ 1       │ 'm6-e2e-tenant' │ 'Feasibility'   │ 4     │
│ 2       │ 'm6-e2e-tenant' │ 'Impact'        │ 5     │
│ 3       │ 'm6-e2e-tenant' │ 'Communication' │ 3     │
└─────────┴─────────────────┴─────────────────┴───────┘
```

Reviewer satırı: `{ id: 'm6-e2e-reviewer', tenantId: 'm6-e2e-tenant', userId: 'm6-e2e-user', status: 'completed' }`

Fixture geri alındıktan sonra:
```
leftover fixture rows: { tenant: 0, evaluation: 0, scores: 0 }
```

### 2.3 `pnpm test:e2e` — 10/10 yeşil (öncesinde 0 test koşuyordu)

```
Running 10 tests using 1 worker
  ✓   1 auth.spec.ts:22 › should allow user to navigate to register page and see options (784ms)
  ✓   2 auth.spec.ts:37 › should redirect to auth provider on click (1.2s)
  ✓   3 feedback.spec.ts:15 › should submit feedback and appear in triage dashboard (508ms)
  ✓   4 m6-evaluator.spec.ts:47 › a seated reviewer scores a proposal and sees it on the dashboard (2.2s)
  ✓   5 m6-evaluator.spec.ts:133 › the English locale renders the English M6 copy (1.1s)
  ✓   6 rls.spec.ts:63 › tenant A workspace is isolated from tenant B (6ms)
  ✓   7 rls.spec.ts:96 › RLS policy blocks cross-tenant access at database level (13ms)
  ✓   8 rls.spec.ts:139 › opportunities are isolated by tenant (10ms)
  ✓   9 rls.spec.ts:199 › evidence records are tenant-isolated (6ms)
  ✓  10 rls.spec.ts:237 › nullable tenantId (shared) records are visible to all tenants (6ms)

  10 passed (8.7s)
```

### 2.4 `pnpm test` — 405 geçti (başlangıç: 398)

```
 Test Files  47 passed | 2 skipped (49)
      Tests  405 passed | 8 skipped (413)
```

`tests/modules/m6.test.ts`'e eklenen davranış kilitleri: model bozuk çıktı verdiğinde hiçbir şey
yazılmaması, aralık dışı puanın reddi, puanların **oturumdaki** hakeme yazılması, koltuğu olmayan
kullanıcının reddi.

### 2.5 `pnpm typecheck` — temiz

```
$ tsc --noEmit
(çıktı yok, exit 0)
```

> Not: iş başlangıcında typecheck **kırıktı** — `.next/types/validator.ts` silinmiş bir
> `src/app/(marketing)` dizinine referans veren 6 bayat hata. `pnpm build` bu üretilmiş dosyaları
> yeniden yazdı; kaynak kodda hata yoktu ve şu an sıfır hata var.

### 2.6 `pnpm lint` (M6 kapsamı) — temiz

```
$ npx eslint src/modules/m6 "src/app/[locale]/(app)/[workspace]/opportunities/[id]/evaluations"
(çıktı yok)
```

### 2.7 `pnpm i18n:check` — M6'da boşluk yok

```
tr: 404 en: 404  missing: []
m6 unused: []
```

### 2.8 `pnpm build` — başarılı, rota kayıtlı

```
✓ Compiled successfully in 1172ms
├ ƒ /[locale]/[workspace]/opportunities/[id]/evaluations/panel
```

### 2.9 Seed idempotency

```
$ npx tsx scripts/seed-m6-e2e.ts
[seed-m6-e2e] ready — tenant=m6-e2e-tenant proposal=m6-e2e-proposal evaluation=m6-e2e-evaluation criteria=4 clearedScores=0
$ npx tsx scripts/seed-m6-e2e.ts        # ikinci koşu
[seed-m6-e2e] ready — tenant=m6-e2e-tenant proposal=m6-e2e-proposal evaluation=m6-e2e-evaluation criteria=4 clearedScores=0
$ npx tsx scripts/seed-m6-e2e.ts --rollback
[seed-m6-e2e] rolled back
```

Geri alma yolu: `npx tsx scripts/seed-m6-e2e.ts --rollback` (her silme sabit id'ye anahtarlı).

---

## 3. Değişen dosyalar

**M6 modülü**
- `src/modules/m6/server/actions.ts` — yeniden yazıldı: Zod, oturum-hakemi, `listPanelScores`, uydurma fallback yok
- `src/modules/m6/server/validation.ts` — **yeni**: şemalar + hata tipleri
- `src/modules/m6/server/scoring.ts` — `esrTotalToPanelScale` / `esrScoreFromProposal`, `TenantScopedDb`, gerçek uzlaşı
- `src/modules/m6/ui/EvaluatorForm.tsx` — Zod ön doğrulama, hata/yükleniyor, i18n, ağırlıklı önizleme, rozet
- `src/modules/m6/ui/EvaluationDashboard.tsx` — `prisma`/`tenantId` prop kaldırıldı, sunum bileşeni
- `src/modules/m6/types.ts` — `EvaluationNotes` + `toEvaluationNotes` (`any` yerine)
- `src/modules/m6/manifest.ts` — panel rotası

**M6 rotaları**
- `.../evaluations/panel/page.tsx`, `.../evaluations/panel/client.tsx` — **yeni**
- `.../evaluations/page.tsx` — sahte fallback kaldırıldı, `notFound()`, tipli
- `.../evaluations/client.tsx` — hata bandı, "Resmî" → "İç", `any` kaldırıldı

**Altyapı / test**
- `playwright.config.ts` — **yeni**
- `scripts/seed-m6-e2e.ts` — **yeni** (idempotent + `--rollback`)
- `tests/e2e/m6-evaluator.spec.ts` — **yeni**
- `tests/e2e/rls.spec.ts`, `tests/e2e/auth.spec.ts` — onarıldı
- `tests/modules/m6.test.ts` — davranış değişiklikleri + 7 yeni test
- `src/lib/modules/route-catalog.ts`, `messages/tr.json`, `messages/en.json`, `.gitignore`

---

## 4. Riskler

1. **Davranış değişikliği — sessiz hata artık gürültülü.** `generateAiEvaluation`, `saveHumanEvaluation`,
   `calibrateESR` eskiden DB hatasında sessizce başarılı dönüyordu. Artık fırlatıyorlar. Doğrusu bu, ama
   LLM sağlayıcısı kesintideyse M6 YZ değerlendirmesi eskisi gibi "sahte ama çalışıyor gibi" görünmeyecek —
   açıkça hata verecek. Demo ortamında bu fark edilir.
2. **Panel rotası yetkilendirmesi.** Sayfa tenant kapsamlı, ama `requireModule('M6')` / plan kapsamı
   kontrolü yok — bu depoda hiçbir sayfa rotası öyle bir kontrol yapmıyor (`requireModule` yalnızca
   `src/lib/modules/hooks.tsx`'te bir UI HOC'u olarak var, hiçbir yerde kullanılmıyor). Mevcut desene
   uydum; bu boşluk M6'ya özel değil, sistem geneli.
3. **`notFound()` durum kodu.** Dev'de `/tr/.../opportunities/does-not-exist/evaluations` 404 sayfasını
   render ediyor ama HTTP durumu 200 görünüyor (Next dev RSC gezinme artefaktı). Üretim davranışını
   ayrıca doğrulamadım.
4. **`tests/e2e/feedback.spec.ts` kendi kendini atlıyor** — oturum açılamazsa `return` edip yeşil geçiyor.
   Yeşil görünüyor ama hiçbir şey doğrulamıyor. Dokunmadım (kapsam dışı), ama sahte güven veriyor.

---

## 5. Açık sorular

1. **Uzlaşı `Evaluation`'da saklanmıyor.** Şu an her okumada hesaplanıyor. Kalıcı bir
   `consensusOutcome` kolonu isteniyor mu? (Additive migration + geri-alma gerekir, kapsam dışıydı.)
2. **Panel rotasına giriş yolu yok.** `opportunities/[id]/evaluations/panel` hiçbir yerden link
   verilmiyor. Evaluations sayfasına bir sekme/bağlantı eklenmeli mi, yoksa panel ayrı bir akış mı?
3. **Kısmi gönderim politikası.** Bir hakem ölçütlerin bir kısmını gönderebiliyor (şema `Criterion`
   satırlarına göre doğruluyor, dört varsayılana değil). Ürün "hepsi ya da hiçbiri" istiyor mu?
4. **`evaluations/client.tsx` tamamen sabit Türkçe metin** (~900 satır, kural 8 ihlali). Önceden vardı,
   kapsam dışı bıraktım. Ayrı bir i18n kartı açılmalı.

---

## 6. Sonraki adım

- Panel rotasına navigasyon linki (Açık soru 2 cevaplandıktan sonra).
- `evaluations/client.tsx` i18n borcu için ayrı kart.
- `tests/e2e/feedback.spec.ts`'in kendini atlayan yapısı — gerçek oturumla koşacak şekilde düzeltilmeli.

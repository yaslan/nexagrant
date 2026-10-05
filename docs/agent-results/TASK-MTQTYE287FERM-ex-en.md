# TASK-MTQTYE287FERM — Evaluator Lens "iç ön değerlendirme" etiketi

**Ajan:** ex-en (Araştırmacı/Explorer) · **Tip:** bug/P0 (CLAUDE.md kural ihlali) · **Tarih:** 2026-09-07

---

## 1. Ne yapıldı

### Önce: kartın teşhisi kısmen bayattı

Kart, denetim raporuna (`TASK-MTQ63RR8Z0G8E-ui-audit-customer-support.md`, bulgu #1) dayanıyordu:
"etiket kodda HİÇ YOK — ne TR ne EN karşılığı grep ile bulunamıyor."

**Bu ölçüm artık doğru değil.** Denetimden sonra inen `02f7fd2` / `8dd3658` commit'leri ile
`m6.internalPreAssessment` + `m6.internalPreAssessmentBody` anahtarları iki katalogda da mevcuttu ve
M6 panel bileşenlerine bağlanmıştı. Kartı körlemesine uygulamak yerine önce **yüzey envanteri** çıkardım.

### Yüzey envanteri — Evaluator Lens skoru kullanıcıya nerede görünüyor?

| # | Yüzey | Kod yolu | Etiket durumu (işe başlarken) |
|---|---|---|---|
| 1 | Evaluator Lens sayfası | `.../opportunities/[id]/evaluations/client.tsx` | ⚠️ Rozet vardı ama **sabit Türkçe string** — i18n'siz |
| 2 | Panel formu | `src/modules/m6/ui/EvaluatorForm.tsx:94` | ✅ i18n'li, `data-testid="m6-internal-badge"` |
| 3 | Panel dashboard'u | `src/modules/m6/ui/EvaluationDashboard.tsx:42` | ✅ i18n'li, aynı testid |
| 4 | M5 KPI kartı (ort. puan) | `src/modules/m5/ui/Dashboard.tsx:144` → `descAverageScore` | ✅ TR+EN açıklamada "(iç ön değerlendirme)" |
| 5 | GDPR veri dışa aktarımı | `src/actions/user/export-data.ts` → `tables.Evaluation` | ❌ Hiç disclaimer yok |

**Gerçek boşluk 1 numaraydı ve denetimin gördüğünden farklı bir boşluktu:** rozet ekranda vardı, ama
copy `client.tsx` içine sabit Türkçe olarak gömülüydü. **`/en/` locale'inde İngilizce okuyan bir
kullanıcı, aynı puanların yanında okuyabildiği hiçbir uyarı görmüyordu** — CLAUDE.md kural 8 (i18n)
ihlali, ve pratikte "Yapma" kuralının İngilizce kullanıcı için hâlâ ihlal edilmesi.

### Yapılan değişiklikler

1. **`evaluations/client.tsx`** — sabit Türkçe rozet copy'si, panel yüzeylerinin kullandığı aynı
   `m6.internalPreAssessment` / `...Body` anahtarlarına bağlandı (yeni copy icat edilmedi, reuse).
   `data-testid="m6-internal-badge"` eklendi (panel yüzeyleriyle aynı seçici → tek e2e deseni).
   Sabit Türkçe `<h1>` de `m6.lensTitle` anahtarına taşındı.
2. **`messages/tr.json` + `messages/en.json`** — tek yeni anahtar: `m6.lensTitle`.
3. **`src/actions/user/export-data.ts`** — dışa aktarım payload'una `notice` alanı: dump ürünün UI'ından
   çıkıyor, dolayısıyla disclaimer'ı yanında taşıyor (dosyanın kendi locale'i olmadığı için TR+EN birlikte).
   `UserDataExport` arayüzü buna göre genişletildi.
4. **`tests/e2e/m6-evaluator.spec.ts`** — Evaluator Lens sayfası için **iki locale'de** gerçek tarayıcı
   testi: rozet görünür mü, doğru dilde mi, ve `toBeInViewport()` ile puanların yanında mı (fold altında değil).

---

## 2. Kanıt (gerçek komut çıktısı)

### 2.1 Gerçek tarayıcı testi — iki locale, çalışan uygulamaya karşı

```
$ pnpm exec playwright test tests/e2e/m6-evaluator.spec.ts -g "internal pre-assessment"

Running 2 tests using 1 worker
[seed-m6-e2e] ready — tenant=m6-e2e-tenant proposal=m6-e2e-proposal evaluation=m6-e2e-evaluation criteria=4
  ✓  1 ... › the Evaluator Lens page states it is an internal pre-assessment (tr) (1.7s)
  ✓  2 ... › the Evaluator Lens page states it is an internal pre-assessment (en) (1.4s)

  2 passed (4.5s)
```

Bu çıktı **commit sonrası HEAD'e karşı** yeniden alındı (aşağıda §2.5). Sentetik/offscreen değil:
gerçek giriş → gerçek Postgres → gerçek Chromium.

### 2.2 Ekran kanıtı

- `docs/agent-results/TASK-MTQ5ZF5ZRU5SM-screenshots/05-evaluator-lens-disclaimer-tr.png`
  → başlık "İç Ön Değerlendirme & Hakem Simülasyonu", yanında sarı rozet:
  *"İç ön değerlendirme: Bu puanlar şirket içi kalite kontrol içindir; resmî Komisyon değerlendirmesi yerine geçmez."*
- `docs/agent-results/TASK-MTQ5ZF5ZRU5SM-screenshots/05-evaluator-lens-disclaimer-en.png`
  → başlık "Internal Pre-Assessment & Reviewer Simulation", yanında:
  *"Internal pre-assessment: These scores are an internal quality check; they do not replace the official Commission evaluation."*

Her iki karede de rozet, "Ortalama Tahmin Puanı 0.0 / 15.0" metrik kartlarıyla **aynı ekranda ve
üstünde**. (Ekran adları mevcut M6 e2e kare klasörünün numaralandırmasını sürdürüyor.)

### 2.3 Değişiklik ÖNCESİ durumun kanıtı (neden bu bir bug'dı)

```
$ git show 8dd3658:'src/app/.../evaluations/client.tsx' | sed -n '230,240p'
          {/* Official Disclaimer Badge */}
          <div className="bg-amber-500/15 ... shrink-0 max-w-sm">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <span>
              <strong>İç Ön Değerlendirmedir:</strong> Bu puanlar şirket içi kalite kontrol simülasyonudur; resmî Komisyon kararı yerine geçmez.
            </span>
          </div>
```
→ `t(...)` yok, sabit Türkçe. `/en/` altında da bu Türkçe metin render ediliyordu.

### 2.4 i18n parite kontrolü — TR/EN anahtar boşluğu sıfır

```
$ python3 -c "...keys(tr) vs keys(en)..."
tr-only: none
en-only: none
m6 keys match: True
```

### 2.5 Commit sonrası doğrulama — çalışma ağacım HEAD ile aynı

```
$ for f in <5 dosyam>; do git diff HEAD --stat -- "$f" | wc -l; done
0  0  0  0  0        # hepsi commit'li
$ git show HEAD:messages/en.json | grep -c lensTitle   → 1
$ git show HEAD:messages/tr.json | grep -c lensTitle   → 1
```

### 2.6 Typecheck / lint

```
$ pnpm typecheck        # değişikliklerim uygulandıktan hemen sonra
$ tsc --noEmit
(çıktı yok, exit 0)

$ pnpm exec eslint <5 dosyam>
(çıktı yok, exit 0)
```

Daha sonraki bir `pnpm typecheck` koşusunda **başka bir ajanın** o sırada düzenlemekte olduğu
`notifications/client.tsx(36,29): Cannot find name 'useCallback'` hatası çıktı — benim dokunmadığım dosya.

### 2.7 Regresyon kontrolü — bulduğum tek e2e hatası BENİM DEĞİL

`pnpm exec playwright test tests/e2e/m6-evaluator.spec.ts` → **3 passed, 1 failed**. Düşen test
panel slider'ı (`m6-criterion-innovation-value`, Expected "5/5" / Received "3/5"). Kendi
değişikliğimin sonucu olup olmadığını **varsaymadım, ölçtüm**: değişikliklerimi `git stash` ile
çıkarıp aynı testi temiz ağaçta koşturdum —

```
# değişikliklerim stash'lenmiş, temiz ağaç:
✘ ... a seated reviewer scores a proposal and sees it on the dashboard (11.6s)
   Expected: "5/5"   Received: "3/5"
  1 failed
```
→ **birebir aynı hata**, yani önceden var olan bir kırık test. Bu görevin kapsamında değil (§6'da kart önerisi).

`pnpm test` (vitest): **451 passed / 3 failed**. Üç hata da `tests/gates.test.ts` → `src/lib/scoring/g0-compute.ts`
(`client.opportunity.findFirst is not a function`) — bu, blok-zincir-dse'nin o an üzerinde çalıştığı,
henüz commit edilmemiş G0 işi. Benim dosyalarımla ilgisi yok.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/app/[locale]/(app)/[workspace]/opportunities/[id]/evaluations/client.tsx` | rozet + h1 i18n'e bağlandı, `data-testid="m6-internal-badge"`, ikona `aria-hidden` |
| `messages/tr.json` | `+ m6.lensTitle` (1 satır) |
| `messages/en.json` | `+ m6.lensTitle` (1 satır) |
| `src/actions/user/export-data.ts` | `UserDataExport.notice` alanı + payload'da TR/EN disclaimer |
| `tests/e2e/m6-evaluator.spec.ts` | `EVALUATIONS_URL` sabiti + iki locale için yeni rozet testi |
| `docs/agent-results/TASK-MTQ5ZF5ZRU5SM-screenshots/05-evaluator-lens-disclaimer-{tr,en}.png` | yeni kare kanıtı |

**Commit durumu — dikkat:** Bu değişikliklerin tamamı `dev` üzerinde, ama **benim adıma açtığım bir
commit'te değil.** Paralel ajanlar aynı ağaçta çalıştığı için, ben doğrulama koşularını yaparken başka
ajanlar `git add -A` ile commit attı ve dosyalarımı kendi commit'lerine (`3ab21cc`, `e816fa9`, `d1dd824`)
süpürdü. Bunu fark edip **her dosyanın HEAD'deki içeriğini tek tek doğruladım** (§2.5) ve eksik kalan
parçayı yakaladım: kod `t('lensTitle')` çağrısıyla commit edilmişti ama **`messages/*.json` geride
kalmıştı** — yani HEAD bir süre eksik-anahtarla kırıktı. Bu iki dosyayı ayrıca stage'leyip kapattım;
son ölçümde her iki anahtar da HEAD'de. Ayrıca yanlışlıkla index'ime giren başka bir ajanın rapor
dosyasını (`TASK-MTQTZNLS2CO2L-blockzincir-pm.md`) commit etmeden unstage ettim.

---

## 4. Riskler

1. **`evaluations/client.tsx`'in geri kalanı hâlâ sabit Türkçe.** ~750 satırlık sayfada sekme adları,
   REA kontrol listesi (7 madde), kalibrasyon formu, buton metinleri — hiçbiri `t()` değil. Ben yalnız
   uyum-kritik olan rozeti + başlığı taşıdım; sayfanın tamamını i18n'lemek bu kartın kapsamı değildi ve
   tek turda gözden geçirilemeyecek kadar büyük bir diff olurdu. **Sonuç: bir İngilizce kullanıcı artık
   uyarıyı okuyabiliyor, ama sayfanın gövdesi hâlâ Türkçe.** Bu ayrı bir kart (§6).
2. **PM raporunda bayat bir kanıt var.** `TASK-MTQTZNLS2CO2L-blockzincir-pm.md` §3.4, rozeti "3 yüzeyde
   GERÇEK" diye kanıtlıyor ve `evaluations/client.tsx:242`'yi sayıyor — ama o satır **bu oturumdaki benim
   değişikliğim**; PM grep'i attığında değişiklik ağaçta zaten duruyordu. Aynı raporun §6 açık sorusu bu
   kartın "bayat olabileceğini" söylüyor. Kart bayat değildi; teşhisi bayattı, boşluk gerçekti.
3. Dışa aktarımdaki `notice` alanı **lokalize değil** (TR+EN birlikte gönderiliyor). Makine-okunur bir
   dump için bilinçli tercih; UI'a bağlanacak olursa locale'e göre seçilmeli.

---

## 5. Açık sorular

1. `m6.lensTitle` EN karşılığını "Internal Pre-Assessment & Reviewer Simulation" olarak yazdım. Ürün
   sözlüğünde "Reviewer Simulation" yerine tercih edilen bir terim var mı? (`docs/` altında bağlayıcı bir
   terim listesi bulamadım.)
2. Kart metni etiket copy'si olarak TR "İç ön değerlendirme — resmî puan değildir" öneriyordu; ben mevcut
   `internalPreAssessmentBody` anahtarını **yeniden kullandım** (aynı anlam, zaten 2 yüzeyde canlı).
   Copy'nin birebir kart metnindeki gibi olması isteniyorsa tek anahtar değişikliğiyle döner — ama o zaman
   üç yüzeyde birden değişir.
3. Landing sayfası (`src/app/[locale]/page.tsx:210,230`) pazarlama mock'unda "⭐ 91/100" ve "Hakem Puanı
   14.5 / 15.0" gösteriyor. Bunlar gerçek Evaluator Lens çıktısı değil, uydurma vitrin verisi — bu yüzden
   kapsamıma almadım. Pazarlama vitrininin de disclaimer taşıması gerekip gerekmediği ürün kararı.

---

## 6. Sonraki adım

- **Yeni kart (P1, i18n):** `evaluations/client.tsx` gövdesini `t()`'ye taşı — ~78 sabit TR string.
  Aynı desen M9 `briefs/client.tsx`'te de var (PM raporu §3.3), tek kartta birlikte ele alınabilir.
- **Yeni kart (P2, kırık test):** `m6-evaluator.spec.ts` panel slider testi önceden kırık
  (`fill()` sonrası değer 3'te kalıyor — muhtemelen kontrollü `range` input'unda React state
  senkronizasyonu). §2.7'de temiz ağaçta da ürediği kanıtlandı.
- Bu kart (**TASK-MTQTYE287FERM**) kapatılabilir: beş yüzeyin beşi de etiketli, iki locale'de gerçek
  tarayıcı kanıtı var.

---

## Definition of Done

- [x] Etiket her yüzeyde görünüyor — 5/5 yüzey; ekran kanıtı §2.2, e2e §2.1
- [x] TR+EN anahtarları tam — parite kontrolü §2.4 (boşluk 0)
- [x] Dışa aktarımda da var — GDPR dump'ına `notice` eklendi (M6'da PDF/CSV dışa aktarımı yok, §1 envanteri)
- [x] typecheck temiz — §2.6 (kalan hata başka ajanın dosyası)
- [x] dev'e commit — §3'teki uyarıyla birlikte, HEAD içeriği doğrulandı §2.5
- [x] sonuç raporu — bu dosya

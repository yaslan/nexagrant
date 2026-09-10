# TASK-MTV4YSO4SEMGG — Pipeline board header out of the code and into the catalogues

**Ajan:** blok-zincir-dev (DEV-EN) · **Sprint:** SPRINT-S12 · **Commit:** `6513085`
**Platform:** doğrulama macOS (darwin 25.6.0, Chromium/Playwright) üzerinde yapıldı — ayrıntı en altta.

---

## 1. Ne yapıldı

`src/app/[locale]/(app)/[workspace]/pipeline/board.tsx` başlık bloğundaki dört kullanıcıya
görünen dizgi koddan çıktı, `pipeline.*` ad alanı altında iki katalog dosyasına taşındı ve
`t()` üzerinden okunuyor:

| anahtar | tr | en |
|---|---|---|
| `pipeline.breadcrumb.dashboard` | Dashboard | Dashboard |
| `pipeline.breadcrumb.current` | Stage-Gate Pipeline | Stage-Gate Pipeline |
| `pipeline.heading` | Fırsat & Teklif Boru Hattı | Opportunity & Proposal Pipeline |
| `pipeline.subtitle` | G0 Triage fizibilitesinden … yönetin. | Manage your proposals … final submission. |

Breadcrumb'ın iki dilde de aynı kalması bilinçli: bu bir **taşıma**, metin değişikliği değil.
Bugün ekranda ne yazıyorsa katalogda o var (bkz. §4, ilk risk maddesi).

`tests/e2e/module-gate.spec.ts` içindeki `PIPELINE_HEADING` sabiti artık Türkçe bir literal
değil, katalogdan okunan bir çift:

```ts
const PIPELINE_HEADING = {
  en: enMessages.pipeline.heading,
  tr: trMessages.pipeline.heading,
} as const;
```

Bu, kartın istediği "anahtara bağla"nın ötesinde bir şeyi de düzeltiyor ve asıl kazanç orada:
`PIPELINE_URL` **`/en/…`** idi, ama sabit Türkçeydi. Yani test bugüne kadar İngilizce sayfada
Türkçe metin görüp geçiyordu — çünkü bileşen tek dilliydi. Artık `/en` bacağı `PIPELINE_HEADING.en`,
`/tr/firsatlar` bacağı `PIPELINE_HEADING.tr` bekliyor; test yerelleştirmeyi **görmezden gelmek
yerine kanıtlıyor**. Oturumsuz erişim testi ise iki başlığın **hiçbirinin** login sayfasına
sızmadığını ölçüyor.

---

## 2. Kanıt

### 2.1 Katalog diff'i yalnız eklemeden ibaret (kendi bloğum)

```
$ git diff --stat -- messages/tr.json messages/en.json
 messages/en.json | 8 ++++++++
 messages/tr.json | 8 ++++++++
 2 files changed, 16 insertions(+)
```

JSON round-trip yapmadım (bu turda katalogda ikinci bir ajan çalışıyordu); blok, mevcut
`Pipeline` bloğunun hemen ardına metinsel olarak eklendi ve script ekleme sonrası
`json.loads(...) == öncesi + {pipeline: …}` diye doğruladı.

### 2.2 `pnpm i18n:check` — önce / sonra

```
ÖNCE                                    SONRA
Static keys used in code: 1083          Static keys used in code: 1087   (+4)
Keys in messages/tr.json: 1436          Keys in messages/tr.json: 1440   (+4)
Keys in messages/en.json: 1436          Keys in messages/en.json: 1440   (+4)

✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
```

Dört anahtarın dördü de "unused" listesinde **değil** → hepsi src'den gerçekten okunuyor.

### 2.3 Gerçek tarayıcı, iki dil

Ekran görüntüleri (Chromium, gerçek oturum, `mg-e2e` fixture kiracısı) commit'te:

* `docs/agent-results/TASK-MTV4YSO4SEMGG-screenshots/01-pipeline-board-en.png`
* `docs/agent-results/TASK-MTV4YSO4SEMGG-screenshots/02-pipeline-board-tr.png`

Aynı koşumun DOM'dan okuduğu metinler:

```
EN h1       = Opportunity & Proposal Pipeline
EN crumbs   = Dashboard / Stage-Gate Pipeline
EN subtitle = Manage your proposals with the people in your workspace, from G0 triage
              feasibility through to G4 final submission.
TR h1       = Fırsat & Teklif Boru Hattı
TR crumbs   = Dashboard / Stage-Gate Pipeline
TR subtitle = G0 Triage fizibilitesinden G4 nihai başvuru teslimine kadar çalışma
              grubunuzdaki kullanıcılarla tekliflerinizi yönetin.
```

Kareyi üreten spec geçiciydi ve koşumdan sonra silindi (`tests/e2e/tmp-mtv4-shots.spec.ts`);
kareler `E2E_SHOTS_ROOT=docs/agent-results` ile bilinçli olarak karta yayımlandı.

### 2.4 Test bilerek bozulduğunda KIRMIZI

Bozma: `<h1>`'i `{t('heading')}`'den eski gömülü Türkçe literale geri aldım — yani testin
korumakla yükümlü olduğu regresyonun ta kendisi.

```
$ npx playwright test tests/e2e/module-gate.spec.ts        # BREAK APPLIED
  1 failed
    module-gate.spec.ts:86:7 › M5 is ON, so the pipeline board renders — and /firsatlar
    is the same module
        at tests/e2e/module-gate.spec.ts:92:24        ← expect(main).toContainText(PIPELINE_HEADING.en)
  2 passed (14.1s)
```

Geri alındıktan sonra:

```
$ npx playwright test tests/e2e/module-gate.spec.ts
  ✓  1 a module page is never served without a session (602ms)
  ✓  2 M5 is ON, so the pipeline board renders — and /firsatlar is the same module (818ms)
  ✓  3 M3 is OFF, so the Evidence Pack is refused — and the reason is the switch (895ms)
  3 passed (3.4s)
```

Dikkat: sabit **katalogdan** okunduğu için, kataloğu değiştirmek testi kırmaz — sayfa da
testin beklentisi de birlikte kayar. Bu bilinçli: spec'in ölçtüğü şey *modülün render
edilmesi*, başlığın nasıl yazıldığı değil. Testi kıran şey doğru olan şeydir — bileşenin
yerelleştirmeden çıkması.

### 2.5 `pnpm gate` — dürüst sonuç: KIRMIZI, ama bu değişiklikten değil

Koşum ağacı: `3e14b40` + bu değişiklik (koşum sırasında `dev`'e eklenen üç commit —
`ec3e3d2`, `4a33249`, `8c46616` — yalnız `docs/`, kapı sonucuna etkisi yok).
Commit sonrası hash: **`6513085`**.

Kapının e2e'den önceki her aşaması yeşil:

```
Test Files  141 passed | 2 skipped (143)
     Tests  1684 passed | 8 skipped (1692)
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
✅ SUCCESS: All 44 tenant-scoped models have RLS policies registered.
✅ 44 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN
   ölçüldü: okuma ve yazma, kiracı sınırında reddedildi.
```

(`gate` `&&` zinciridir — e2e'ye gelmiş olması lint/typecheck/test/i18n/rls:check/rls:verify'ın
geçtiğini gösterir.)

e2e kırmızı. **İki ayrı koşum**, iki farklı kırmızı kümesi — ikisinde de benim spec'im yeşil:

| koşum | failed | kapsam |
|---|---|---|
| 1 | 8 | 7 × `invoice-*`, 1 × `admin-plan-editor` |
| 2 | 13 | 13 × `invoice-*` (`admin-plan-editor` bu kez geçti) |

```
  ✓   95 module-gate.spec.ts:64:7  › a module page is never served without a session (592ms)
  ✓   96 module-gate.spec.ts:86:7  › M5 is ON, so the pipeline board renders … (847ms)
  ✓   97 module-gate.spec.ts:103:7 › M3 is OFF, so the Evidence Pack is refused … (792ms)
```

Kırmızıların benim olmadığı **tahmin değil, ölçüm**:

1. **Hiçbiri dokunduğum şeye bakmıyor.**
   `grep -lE "board|messages/|module-gate|pipeline"` dört fatura spec'inde → eşleşme yok.
2. **Ortam nedeni doğrudan ölçüldü.** `:3000`'de **başkasının başlattığı** bir dev sunucusu
   koşuyor (pid 68432, 09:25:27'de başlamış). `playwright.config.ts` fatura testlerinin
   ihtiyaç duyduğu `INVOICE_SUPPLIER_*` değerlerini `webServer.env` içinde tanımlıyor, ama
   `reuseExistingServer: !process.env.CI` yerelde true olduğu için Playwright sunucuyu
   **başlatmıyor** → o env hiç uygulanmıyor.
   ```
   $ ps eww 68432 | tr ' ' '\n' | grep -c INVOICE_SUPPLIER
   0
   ```
   `src/app/api/billing/invoices/[id]/export/route.ts:119-122` bu değişkenleri okuyor;
   yoksa export 200 dönmüyor → 13 fatura spec'i kırmızı. (Bu, kendi hafızamdaki
   `fabrika-playwright-reuseexistingserver-ci-guard` tuzağının aynısı.)
3. **Üstüne, fatura kodu şu anda başka bir ajanın elinde.** Paylaşılan ağaçta
   `src/lib/efatura.ts`, `src/app/api/billing/invoices/[id]/export/route.ts` ve
   `settings/billing/BillingClient.tsx` commit'lenmemiş halde değişik (geli-tirici,
   TASK-MTTUSZF4QSFGU). Dokunmadım.
4. **`admin-plan-editor` tek başına 13/13 geçiyor** → o kırmızı spec'ler-arası durum
   sızıntısı, sıraya bağlı flake. Benim değişikliğimle ilgisi yok.

Temiz bir ortamda (kendi portumda, izole worktree'de) tam kapıyı koşmayı denedim; `git worktree`
komutu bu oturumda izinle reddedildi, o yüzden **koşulamadı**. Sebebi budur ve sessizce
atlanmamıştır.

---

## 3. Değişen dosyalar

| dosya | ne |
|---|---|
| `messages/tr.json` | `pipeline.*` bloğu (+8 satır) |
| `messages/en.json` | `pipeline.*` bloğu (+8 satır) |
| `src/app/[locale]/(app)/[workspace]/pipeline/board.tsx` | `useTranslations('pipeline')`; breadcrumb/h1/alt açıklama `t()`'ye |
| `tests/e2e/module-gate.spec.ts` | `PIPELINE_HEADING` katalogdan, dile göre |
| `docs/agent-results/TASK-MTV4YSO4SEMGG-screenshots/*.png` | iki dilin kareleri |

---

## 4. Riskler

1. **`Pipeline` ve `pipeline` artık yan yana duran, yalnız büyük harfle ayrılan iki ad alanı.**
   Kart açıkça `pipeline.*` dedi, öyle yaptım; ama katalogda zaten `Pipeline` (fırsat *detay*
   ekranı, 80+ anahtar) var. `useTranslations('Pipeline')` ile `useTranslations('pipeline')`
   birbirine karışırsa derleme değil **çalışma zamanı** hatası olur. Riski görünür kılmak için
   bloğu bilerek `Pipeline`'ın hemen altına koydum. Kalıcı çözüm istenirse doğru hamle
   `pipeline.*` → `Pipeline.board.*`; bu bir karardır, sessizce yapmadım.
2. **TR breadcrumb'da "Dashboard" yazıyor, kenar çubuğunda "Panel".** Bu bugünkü hâlin
   aynısı — ben yalnız taşıdım. Katalog artık düzeltmeyi tek satırlık kılıyor
   (`pipeline.breadcrumb.dashboard`), ama metin değişikliği kartın kapsamı dışındaydı.
3. **Commit'ime benim olmayan anahtarlar da girdi.** `git add messages/tr.json` dosyanın o
   andaki tüm içeriğini stage'ledi; geli-tirici'nin commit'lenmemiş **`invoice.*`** bloğu
   (her iki dilde ~30 anahtar) `6513085`'e dahil oldu. Lider'in bu tur verdiği talimat
   uyarınca geri almadım, commit'i attım ve burada bildiriyorum. Veri kaybı yok; yalnız
   yanlış atıf. O anahtarların *kodu* hâlâ commit'siz — yani şu an katalogda tüketicisi
   olmayan anahtarlar var; `i18n:check` bunu yalnızca bilgi amaçlı "unused" olarak raporlar,
   kapıyı kırmaz.

## 5. Bitişikte gördüğüm, DÜZELTMEDİĞİM hatalar (adıyla bildiriyorum)

* **Aynı dosyada onlarca gömülü Türkçe daha var** — kart yalnız başlık bloğunu istedi.
  `/en` ekran görüntüsünde çıplak gözle görünenler: "Tümünü Genişlet", "Yeni Fırsat Ekle",
  "Tüm Kullanıcılar", "Tüm Roller", `Fırsat, not veya kişi ara…` placeholder'ı,
  "Buraya sürükleyin veya ekleyin", `GATES` dizisindeki beş kapı alt başlığı
  (`board.tsx:41-46`), tüm toast metinleri (`:147,150,163,172,175,187,261`) ve modal
  (`:701,704,856`). İngilizce sayfa büyük ölçüde hâlâ Türkçe.
* **Ürün logosu iki karede de "FonBridge"** — zaten TASK-MTTUTNGF1MO9P'de açık.
* **13 fatura e2e'si kırmızı** — §2.5'teki iki neden (reuse edilen sunucuda
  `INVOICE_SUPPLIER_*` yok + fatura kodu şu an commit'siz değişik).
* **`admin-plan-editor.spec.ts` sıraya bağlı flake** — tek başına 13/13, tam süitte kırmızı
  olabiliyor.
* **`playwright.config.ts` yerel reuse tuzağı** — yerelde `pnpm gate` koşan herkes, `:3000`'de
  yabancı bir dev sunucusu varsa fatura testlerini env'siz koşuyor ve yalancı kırmızı alıyor.

## 6. Açık sorular

1. `pipeline.*` mi kalsın, `Pipeline.board.*`'a mı katlansın? (Risk 1)
2. TR breadcrumb "Dashboard" → "Panel" olsun mu? (Risk 2)
3. Board'ın kalan gömülü metinleri kime/hangi karta gidiyor?

## 7. Sonraki adım

Kart `review`'a alınabilir. Yukarıdaki üç soru karar ister; hiçbiri bu kartın kabul
kriterini bloke etmiyor.

---

## Platform beyanı

* **Doğrulandı:** macOS (darwin 25.6.0, arm64), Chromium/Playwright, Node + pnpm, yerel
  Postgres. Ekran görüntüleri 1280×720, `Desktop Chrome` cihaz profili.
* **Windows / Linux: koşulmadı** — bu ortamda o platformlar yok.
* **Platforma bağlı bir şeye dokunmadım.** Değişiklik üç şeyden ibaret: iki JSON dosyasına
  anahtar eklemek, JSX'te literal yerine `t()` çağırmak, bir test sabitini `import`'tan
  okumak. Süreç öldürme, kabuk/ikili adı, dosya yolu ayracı, DPI/ekran ölçüsü, kısayol metni
  ya da cihaz izni yok. Kanıt üretiminde kullandığım `ps eww` ve `lsof` yalnız ölçüm içindir,
  sevk edilen kodda değildir. Metin `next-intl` üzerinden sunucuda çözülüyor; işletim
  sisteminin diliyle değil URL'deki locale ile belirlenir — dolayısıyla render sonucu üç
  platformda da aynıdır.
* Kimsenin sunucusunu ya da kardeş pane'i öldürmedim; `:3000`'deki yabancı dev sunucusu
  (pid 68432) koşum boyunca dokunulmadan kaldı.

## Geri alma

```bash
git revert 6513085     # tek commit; şema/migration/env/altyapı değişikliği yok
```
Katalog değişikliği yalnız eklemedir, revert başka bir anahtarı düşürmez — ancak §4.3'teki
`invoice.*` anahtarları da bu commit'te olduğu için revert onları da geri alır; geli-tirici'nin
kodu hâlâ commit'siz olduğundan bunu bilerek yapmak gerekir.

# TASK-MTS6MMOD8XF3A — 404 i18n: bağımsız yeniden ölçüm + oturumlu regresyon kilidi

Ajan: `customer-support` (CS-EN) · Dal: `dev` · S12 dalga 8 · Tarih: 2026-09-08

> **Kısa sonuç:** Kartın her iki iddiası da **BAYAT**. 404 sayfası bugün iki dilde de doğru
> çalışıyor (oturumlu ölçüldü), lint HEAD'de temiz. Düzeltilecek kusur bulamadım, bu yüzden
> **kod uydurmadım**. Kartın eksik bıraktığı tek gerçek boşluğu kapattım: önceki koşumun
> kanıtı *ad-hoc* bir script'ti ve e2e paketi 404 gövdesinde **yalnızca Türkçe** metni arıyordu —
> İngilizce tarafı hiçbir kalıcı test tutmuyordu. Onu kalıcı, oturumlu bir e2e kilidine çevirdim.

---

## 1. Ne yapıldı

### (a) Kartın iddiaları ölçüldü — ikisi de artık geçersiz

| Kartın iddiası | Bugünkü ölçüm | Sonuç |
|---|---|---|
| `not-found.tsx`'te gömülü Türkçe sabitler var | Dosyada tek bir kullanıcıya-görünür sabit yok; üçü de `t('title' \| 'description' \| 'backHome')` | **BAYAT** — `a75c268` ile kapanmış |
| `href="/tr"` sabit | `href={\`/${locale}\`}` | **BAYAT** |
| `pnpm lint` 16 uyarı → 0'a indir | HEAD'de temiz (bkz. §2.4) | **BAYAT** (liderin ölçümü doğrulandı) |
| Anahtar setleri eşit değil | `tr 1317 / en 1317`, iki yönde de fark **0** | **BAYAT** |

Kod değişikliği YAPILMADI: `src/app/not-found.tsx`, `messages/tr.json`, `messages/en.json`
bu görevde **hiç değişmedi**.

### (b) Kapatılan gerçek boşluk — İngilizce 404'ü hiçbir test tutmuyordu

`tests/e2e/notfound-status.spec.ts` 11 rotada `notFound()` durumunu doğruluyordu ama gövde
iddiası tek satırdı: `expect(page.getByText('Sayfa Bulunamadı')).toBeVisible()` — **sadece
Türkçe, sadece `/tr` rotalarında.** `getLocale()` bozulsa (ör. `getRequestConfig` artık
`requestLocale`'i onurlandırmasa, ya da proxy matcher'ı 404 isteğini görmese) sayfa yine
render olur, sadece herkese Türkçe gelir — **paket yemyeşil kalırdı.**

Aynı dosyaya ikinci bir `describe` ekledim: *"the 404 page speaks the URL's language"*.
Her iki locale için, her biri iki farklı 404 yolunda:
- `/{locale}/nf-e2e/opportunities/<olmayan-id>/briefs` → `(app)` içinden `notFound()`
- `/{locale}/<hiç-eşleşmeyen-yol>` → Next'in kendi not-found sevki

ve dört iddia: HTTP 404 · `<html lang>` = URL locale'i · başlık o dilde görünür ·
**öteki dilin metni sayfada hiç yok** (`toHaveCount(0)`) · CTA `href` = `/{locale}`
(İngiliz kullanıcı 404'ten Türkçe ana sayfaya düşmesin).

**Ölçüm OTURUMLU** — kartın uyardığı tuzak (TASK-MTRNO3LBZB2Q7): oturumsuz istekte `(app)`
düzeni `/giris`'e 307 atar, `notFound()` hiç çalışmaz, ölçüm hiçbir şey kanıtlamaz. Yeni
testler mevcut `signInAsNotFoundUser` fixture'ıyla önce gerçek giriş formundan geçiyor.

---

## 2. Kanıt (hepsi bu koşuda üretildi — 2026-09-08)

### 2.1 Oturumlu, iki dilde, dört 404 yolunda — ham ölçüm

Kilidi yazmadan ÖNCE çıplak bir sonda koştum (oturum açıldıktan sonra):

```
PROBE /tr/nf-e2e/opportunities/nope-404/briefs  status=404 lang=tr h1="Sayfa Bulunamadı" cta="Ana Sayfaya Dön"
PROBE /en/nf-e2e/opportunities/nope-404/briefs  status=404 lang=en h1="Page Not Found"    cta="Back to Home"
PROBE /tr/hic-boyle-bir-sayfa-yok               status=404 lang=tr h1="Sayfa Bulunamadı" cta="Ana Sayfaya Dön"
PROBE /en/no-such-page-at-all                   status=404 lang=en h1="Page Not Found"    cta="Back to Home"
```

Sabit Türkçe dize kalmadığı için `t('...')`'ye taşınacak bir şey **yoktu**.

### 2.2 Yeni e2e kilidi — YEŞİL

```
$ E2E_SHOTS_ROOT=docs/agent-results npx playwright test tests/e2e/notfound-status.spec.ts
Running 3 tests using 1 worker
  [1/3] … an unknown id under (app) is 404, and the routes that exist stay 200
  [2/3] … signed out, the same URLs redirect and never reach notFound()
  [3/3] … the 404 page speaks the URL's language › both locales render their own copy, and the way home keeps the locale
  3 passed (8.0s)
```

Kararlılık — arka arkaya 3 koşu daha: `3 passed (10.3s)` · `3 passed (7.6s)` · `3 passed (7.3s)`.

### 2.3 Kilit gerçekten KIRMIZI olabiliyor mu — çürütme denemesi

Yeşil kalan bir test kanıt değildir. `not-found.tsx`'te locale çözümünü geçici olarak
sabitledim (`const locale = 'tr'` — İngiliz kullanıcının göreceği regresyonun ta kendisi):

```
$ npx playwright test tests/e2e/notfound-status.spec.ts -g "speaks the URL"
  1 failed
    … the 404 page speaks the URL's language › both locales render their own copy, and the way home keeps the locale
```
Dosya `HEAD` sürümüne geri konduktan sonra tekrar yeşil. `git diff --stat src/app/not-found.tsx`
→ **çıktı yok** (dosya bozulmadan bırakıldı). Testi gevşetmeden geçirmedim; test zaten
bozuk davranışta kırmızı veriyor.

### 2.4 lint — 6 uyarının hiçbiri HEAD'de yok

```
$ pnpm lint
✖ 6 problems (0 errors, 6 warnings)
   next.config.ts:106                 import/no-anonymous-default-export
   src/lib/document-exporter.ts:13    'DocxDocument' | 'Packer' | 'Paragraph' | 'TextRun' unused
   src/lib/document-exporter.ts:183   'documentRef' unused
```
Bu 6'sı **benim değil ve HEAD'in de değil** — paylaşılan ağaçtaki commit'lenmemiş
düzenlemelerden geliyor. Paylaşılan ağaçta `git stash` yapamadığım için sahipliği
`git show HEAD:` ile ölçtüm:

```
$ git status --porcelain next.config.ts src/lib/document-exporter.ts
 M next.config.ts
 M src/lib/document-exporter.ts

$ git show HEAD:src/lib/document-exporter.ts | grep -c "DocxDocument"
0                     ← HEAD'de bu import HİÇ YOK
$ grep -c "DocxDocument" src/lib/document-exporter.ts
1                     ← yalnızca çalışma ağacında var
```
`next.config.ts` için de aynısı: uyarının işaret ettiği `export default (phase) => …` bloğu
HEAD'de yok, sadece çalışma ağacında. **Liderin "HEAD'de 0 uyarı" ölçümü doğrulanmıştır.**

### 2.5 i18n anahtar paritesi

```
tr 1317 / en 1317
tr-only: []
en-only: []
NotFound: tr {title, description, backHome} · en {title, description, backHome}
```

### 2.6 Ekran görüntüleri

`docs/agent-results/TASK-MTS6MMOD8XF3A-screenshots/`
- `03-404-signed-in-tr.png` — oturumlu `/tr` 404, tamamen Türkçe
- `03-404-signed-in-en.png` — oturumlu `/en` 404, tamamen İngilizce ("Page Not Found" /
  "The page or link you are looking for…" / "Back to Home"), tek bir Türkçe kelime yok

Önceki koşumun `01-*` / `02-*` kareleri (oturumsuz ölçüm) **korundu**, üzerine yazılmadı —
bu yüzden yeni kareler `03-` önekiyle ve `signed-in` etiketiyle.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `tests/e2e/notfound-status.spec.ts` | +`describe('the 404 page speaks the URL\'s language')` — 2 locale × 2 rota şekli × 5 iddia; `shotsDir` importu |
| `docs/agent-results/TASK-MTS6MMOD8XF3A-screenshots/03-404-signed-in-{tr,en}.png` | yeni kanıt kareleri |
| `docs/agent-results/TASK-MTS6MMOD8XF3A-customer-support.md` | bu rapor |

**Dokunulmayan (bilerek):** `src/app/not-found.tsx`, `messages/*.json` — düzeltilecek kusur yoktu.

---

## 4. Riskler

- Kanıt kareleri yalnız `E2E_SHOTS_ROOT=docs/agent-results` ile yazılır; çıplak `pnpm test:e2e`
  bunları `test-artifacts/`'e yazar ve commit'li kanıta dokunmaz (bu kasıtlı, bkz. `fixtures/shots.ts`).
- Yeni `describe` `NF_TENANT`'ı ikinci kez kurup söküyor. `playwright.config.ts` bugün
  `workers: 1, fullyParallel: false` olduğu için güvenli; e2e paralelleştirme kartı
  (TASK-MTS9C07AQ6DNO) bunu değiştirirse iki `describe`'ın ortak fixture'ı yarışabilir.
- Bir koşuda 1. test (benim değil, mevcut durum testi) **tek seferlik kırmızı** verdi; hemen
  ardından tek başına ve 3 tam koşuda üst üste yeşil geldi. Hata metnini yakalayamadım.
  Ağacı aynı anda 5 ajan yazdığı için dev-server'ın yeniden derlemesi en olası açıklama —
  ama **kanıtım yok**, o yüzden "çözüldü" demiyorum, bildiriyorum.

---

## 5. Açık sorular (sprintin bir sonraki gündemi — DÜZELTMEDİM, bildiriyorum)

1. **`src/app/global-error.tsx` — 404'ün kardeşi, aynı kusur, hâlâ açık.**
   404 boundary'sinin tam yanındaki 500 boundary'si sabit Türkçe: `<html lang="tr">` sabit +
   `"Bir Hata Oluştu"` (s.19) + `"Sistemde beklenmeyen bir hata meydana geldi"` (s.21) +
   `"Bilinmeyen Hata"` (s.21) + `"Yeniden Dene"` (s.28). İngiliz kullanıcı hata ekranını
   Türkçe görür. Kart 404 sayfasını adlandırdığı için kapsam dışı bıraktım.
2. **Aynı dosya, ayrı bir konu: ham hata mesajı kullanıcıya basılıyor.**
   `global-error.tsx` `{error.message}`'ı doğrudan ekrana yazıyor. Sunucu tarafı bir hata
   mesajı yol/sorgu/kimlik parçası taşıyabilir; kullanıcıya sade bir cümle + `digest` gösterip
   ayrıntıyı loga bırakmak daha doğru. Destek tarafında da `digest` aramak, ekran görüntüsünden
   metin okumaktan iyi.
3. **`scripts/i18n-check.ts` çalışma ağacında typecheck'i KIRIYOR** (benim değil):
   `scripts/i18n-check.ts(237,34): error TS18047: 's' is possibly 'null'` — HEAD'de o satır
   farklı; commit'lenmemiş bir düzenlemeden geliyor. Sahibi kimse `pnpm typecheck`'i
   commit'lemeden önce yeşile döndürmeli, yoksa kapı herkese kırmızı kalır.
4. **`next.config.ts` + `src/lib/document-exporter.ts` çalışma ağacında 6 lint uyarısı**
   üretiyor (§2.4). Sahipleri commit'ten önce temizlemezse "lint 0" durumu kaybolur.

---

## 6. Sonraki adım

- Kart `review` → kapatılabilir: **kartta yazılı iş yapılacak bir şey bırakmıyor** (i18n de lint de
  bayat), üstelik i18n tarafı artık kırmızıya dönebilen bir e2e kilidiyle korunuyor.
- §5.1 + §5.2 için ayrı bir kart açılmalı: *"global-error.tsx i18n + ham hata mesajını kullanıcıdan
  sakla"* — 404 ile aynı sınıf kusur, aynı boundary komşuluğu.

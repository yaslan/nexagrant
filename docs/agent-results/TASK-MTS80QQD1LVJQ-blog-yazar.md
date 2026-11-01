# TASK-MTS80QQD1LVJQ — Landing hero mock i18n, "LIVE SYSTEM" dürüstlük düzeltmesi, blog markdown render

Kapsam: herkese açık yüzey (`/tr`, `/en` landing sayfası ve blog gövdesi). Üç bağımsız kusur, üç ayrı düzeltme.

## 1. Ne yapıldı

### (a) Hero mock — sabit Türkçe metinler `t('...')`'ye taşındı

`src/app/[locale]/page.tsx` içindeki "LIVE HERO PRODUCT PREVIEW MOCKUP" bölümünde (satır ~139-242), sayfanın geri kalanı `isTr ? 'tr' : 'en'` deseniyle iki dili de karşılarken, kanban mock'unun içindeki 9 UI etiketi hiçbir koşula bağlı olmadan salt Türkçe basılıyordu — İngilizce ziyaretçi `/en` sayfasında da "G0: Triage & Fizibilite", "👑 Koordinatör", "7 Ortak • 5 Ülke Onaylı" gibi Türkçe metinler görüyordu. Proje kuralı (CLAUDE.md md.8) "kullanıcıya görünen sabit metin yok, `t('...')`" olduğundan, ternary yerine gerçek `next-intl` çevirisine geçirildi:

- `landing.heroMock` adında yeni bir namespace açıldı (`messages/tr.json` ve `messages/en.json`, birebir aynı 10 anahtar seti).
- `page.tsx` içine `const t = await getTranslations({ locale, namespace: 'landing.heroMock' })` eklendi; 9 sabit dize `t('gateG0')`, `t('roleCoordinator')`, `t('partnersApproved')` vb. çağrılarıyla değiştirildi.
- Proje kodları/isimleri (`FLEX-GRID`, `HORIZON-CL5-2024-D3-01`, `TWIN-HYDRO`, `CIRC-PACK`, `CLEAN-PORT` …) bilinçli olarak değiştirilmedi — bunlar zaten dilden bağımsız özel adlar/çağrı kodları, iki dilde de aynı görünmesi doğru.

### (b) "LIVE SYSTEM" rozeti kaldırıldı

Mock pencere başlığındaki yeşil `LIVE SYSTEM` rozeti, hiçbir gösterilen veri gerçekten canlı olmadığı için (tamamen kurgusal örnek kartlar) yanıltıcıydı. CLAUDE.md'nin Evaluator Lens için koyduğu "iç ön değerlendirme, resmî değil" ilkesiyle aynı mantıkla: **canlı olmayana LIVE denmez.**
Rozet kaldırılmadı, aynı sayfada zaten var olan dürüst desene (CORDIS mock bölümündeki "Örnek Görünüm" / "Sample View" rozeti — bkz. `page.tsx` satır ~520) göre yeniden yazıldı: `landing.heroMock.sampleViewBadge` → "Örnek Görünüm" / "Sample View", nötr gri renk (yeşil "canlı" rengi bırakıldı).

### (c) Blog gövdesinde ham markdown render sorunu

`src/app/[locale]/(marketing)/blog/[slug]/page.tsx`, içerik dizesini `\n\n` ile bölüp yalnız `#`/`##`/`###` önekini tanıyordu; `**kalın**` ve `* madde` / `1. madde` hiç işlenmiyordu, ekranda literal `**` ve `*` karakterleri basılıyordu. Ayrıca `src/lib/blog.ts` içindeki gerçek içerikte bir başlık satırı ile altındaki paragraf arasında çoğu zaman boş satır YOK (`## Başlık\nParagraf metni`) — bu, eski `\n\n` bölme mantığında başlığın *tüm* paragrafı (literal `**`/`*` dahil) kendi içine yutmasına yol açıyordu.

Repoda kullanılabilir bir markdown kütüphanesi yok (`package.json`'da markdown/remark/marked/mdx bağımlılığı yok, kod tabanında da başka bir markdown işleyici yok) — bu yüzden en küçük doğru çözüm olarak satır satır çalışan, React elemanı üreten (ham HTML enjeksiyonu YOK, `dangerouslySetInnerHTML` kullanılmadı) küçük bir parser yazıldı:

- `renderInline(text)` — `**...**` dizilerini `<strong>` elemanına çevirir, kalanı düz metin olarak bırakır.
- `renderBlogContent(content)` — satır satır ilerler; `#`/`##`/`###` başlıkları, `* ` ve `N. ` liste satırlarını (ardışık aynı tür satırları tek `<ul>`/`<ol>` altında toplayarak) ve düz paragrafları ayrı React blokları olarak üretir; başlık satırı hemen ardından blank-line olmadan gelen paragrafı artık yutmaz.

Admin blog editörü (`src/app/[locale]/admin/blog/`) içerik alanını serbest metin olarak kabul ettiği için (yetkili kullanıcı girişi) bu parser kasıtlı olarak HTML string üretmiyor, yalnız sabit bir React eleman kümesi (`h2`/`h3`/`h4`/`p`/`ul`/`ol`/`li`/`strong`) — XSS yüzeyi açmıyor.

Kapsam dışı bırakılan: linkler `[text](url)`, kod blokları, italik `_text_` — mevcut 4 blog yazısının hiçbirinde bu kalıplar yok (`grep` ile doğrulandı), eklemek spekülatif olurdu.

## 2. Kanıt

**Lint / test:**
```
$ pnpm lint
$ eslint
(0 uyarı/hata)

$ npx vitest run tests/marketing-unsourced-figures.test.ts tests/fabricated-identity-strings.test.ts
 Test Files  2 passed (2)
      Tests  62 passed (62)
```

**i18n anahtar simetrisi** (`npx tsx scripts/i18n-check.ts`): `totalKeysInTurkish: 1295`, `totalKeysInEnglish: 1295` — eşit; `landing.heroMock.*` 10 anahtar iki dosyada da birebir var (script'in "unused" listesinde görünüyorlar çünkü statik tarayıcı `getTranslations({ namespace: 'landing.heroMock' })` + kısa anahtar kalıbını çözemiyor — `landing.hero.*` gibi önceden var olan aynı şekildeki 578 "unused" anahtardan biri daha; "missing" listesinde YOK, yani gerçek bir eksiklik değil).

**Gerçek tarayıcı doğrulaması** — dev sunucusu (`pnpm dev`, port 3000) üzerinde tek kullanımlık Playwright script'i (`@playwright/test`, iş bitince silindi) ile:

- `curl http://localhost:3000/en` → `G0: Triage & Feasibility`, `Coordinator`, `Concept Note` (Türkçe yok); `curl http://localhost:3000/tr` → `G0: Triage & Fizibilite` (İngilizce yok).
- `docs/agent-results/TASK-MTS80QQD1LVJQ-screenshots/01-hero-mock-badge-tr.png` / `02-hero-mock-badge-en.png` — pencere başlığında `ÖRNEK GÖRÜNÜM` / `SAMPLE VIEW` rozeti, `LIVE SYSTEM` yok.
- `03-hero-mock-cards-tr.png` / `04-hero-mock-cards-en.png` — 4 kanban kartının tamamı (G0-G3 başlıkları, Koordinatör/Ortak rozetleri, "7 Ortak • 5 Ülke Onaylı" / "7 Partners • 5 Countries Approved", "Part B Taslağı Onaylandı" / "Part B Draft Approved") doğru dilde.
- `05-blog-bullet-list-tr.png` — `**Koordinatörlük Deneyimi:**` artık gerçek `<strong>` + `<li>` madde imi olarak render ediliyor, literal `**`/`*` yok.
- `06-blog-numbered-list-tr.png` — `1. **Excellence (Mükemmeliyet) - 5 Puan:**` gerçek numaralı liste (`<ol>`) + kalın olarak render ediliyor.
- Ham HTML doğrulaması: `grep -c '\*\*' /tmp/blog1.html` → `0`; `grep '"\* [A-Z...][^"]*"'` → eşleşme yok.

## 3. Değişen dosyalar

- `messages/tr.json`, `messages/en.json` — yeni `landing.heroMock` namespace'i (10 anahtar, iki dilde birebir)
- `src/app/[locale]/page.tsx` — hero mock'taki 9 sabit Türkçe dize + `LIVE SYSTEM` rozeti `t('...')`'ye taşındı
- `src/app/[locale]/(marketing)/blog/[slug]/page.tsx` — `renderInline` + `renderBlogContent` eklendi, eski `\n\n`-bölme render mantığı kaldırıldı
- `docs/agent-results/TASK-MTS80LZI1GRWT-blog-yazar.md` — önceki (kod olarak bitmiş ama raporsuz kalmış) görev için geriye dönük rapor

## 4. Riskler

- `renderBlogContent`, mevcut 4 yazının kullandığı markdown alt kümesini (`#`/`##`/`###`, `* `, `N. `, `**kalın**`) kapsıyor; admin editöründen link, kod bloğu veya italik girilirse bunlar düz metin olarak (işlenmemiş ama literal sembol de basmadan, yani `[text](url)` aynen görünür) render edilir — güvenlik riski yok, sadece format eksik. İleride bu kalıplar gerekirse parser'a eklenmeli.
- Hero mock dışında sayfanın geri kalanı (Stage-Gate, Modüller, CORDIS, Hedef Kitle, Final CTA bölümleri) hâlâ `isTr ? '...' : '...'` deseniyle, `t('...')` kullanmıyor — CLAUDE.md md.8'e göre ideal olan tam çeviri altyapısı değil, ama görev kapsamı yalnız hero mock + LIVE SYSTEM + blog gövdesiydi; bu daha geniş desen değişikliğine dokunulmadı.

## 5. Açık sorular (yol üstünde görülen, kapsam dışı bırakılan kusurlar)

- `src/modules/m11/ui/PartBCollaborativeEditor.tsx:485` — `pnpm typecheck` bu satırda `TS2304: Cannot find name 'locale'` hatası veriyor. Bu dosya benim değişikliklerimin dışında, git status'ta zaten değişiklik olarak görünüyordu (muhtemelen paralel çalışan başka bir ajanın bitmemiş işi) — dokunmadım.
- Landing sayfasının hero mock DIŞINDAKİ bölümleri (yaklaşık %90'ı) hâlâ `t('...')` değil, `isTr` ternary deseniyle iki dili elle yazıyor — CLAUDE.md md.8 ihlali ama bu görevin açıkça belirttiği kapsamın (hero mock + LIVE SYSTEM + blog) dışında; ayrı bir görev olarak ele alınmalı.
- `scripts/i18n-check.ts`'in statik tarayıcısı, `getTranslations({ namespace })` + kısa-anahtar kalıbını (bu PR'ın kullandığı, sayfada zaten `metaTitle`/`metaDescription` için de kullanılan aynı desen) çözemiyor ve gerçekte kullanılan anahtarları "unused" olarak işaretliyor (578 önceden var olan yanlış-pozitife 10 tane daha eklendi). Script'in kendisi düzeltilmedi — kapsam dışı, ayrıca "missing" listesini etkilemiyor.

## 6. Sonraki adım

Yok — bu üç kusur (hero mock i18n, LIVE SYSTEM etiketi, blog markdown) tamamen kapatıldı. "Açık sorular"daki üç madde ayrı görevler olarak değerlendirilebilir.

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gqdeg3h64ciPHVaNUTvRDZ

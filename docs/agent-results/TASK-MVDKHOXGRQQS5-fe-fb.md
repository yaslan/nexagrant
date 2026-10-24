---
sözleşme: 3
görev: TASK-MVDKHOXGRQQS5
kod: TASK-MVDKHOXGRQQS5
ajan: fe-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: Blog içerik alanı artık Tiptap editörü. Saklama Markdown kaldı; şema, API ve renderer değişmedi. Gidiş-dönüş, gerçek tıklama, yapıştırma, klavye ve konsept notları regresyonu kanıtlandı. Tam gate yeşil, PR #99 açık.
platform: mac (Darwin 27, Playwright Chromium, headless; ayrıca 390 px mobil görünüm). Değişiklik tarayıcı içi ve işletim sisteminden bağımsız; platforma bağlı kod yolu yok. Firefox ve Safari'de koşulmadı: proje Playwright'ı yalnız chromium projesiyle yapılandırılmış. Testteki tek platform dalı test kodunda: belge sonuna gitme kısayolu macOS'ta Meta+ArrowRight, Linux/CI'da End. Ürün kodunda böyle bir dal yok.
sürüm: 1
tarih: 2026-10-18T09:07:22.601Z
---

# FO-75 — Blog editöründe zengin metin editörü (Markdown saklama)

## Ne yapıldı
- **Dal / PR:** `fe-fb/fo75-blog-rich-editor` (origin/dev'den), commit `ac22e46b`. PR: https://github.com/yaslan/fonbridge/pull/99 (base `dev`).
- **`src/lib/blog-markdown.ts`:** saf `markdownToDoc` ve `docToMarkdown` fonksiyonları.
  - Okurken renderer'ı birebir taklit eder: satır satır işler, trim yapar, aynı regex'leri aynı sırayla dener, ardışık paragraf satırlarını boşlukla birleştirir, `renderInline`'ın kalın kuralını aynen uygular.
  - Yazarken kanonik biçim kullanır: bloklar arasında tek boş satır, madde `* `, numaralı liste `1. 2. …`.
  - Renderer'da kaçış karakteri olmadığı için şu koruyucular var:
    - Boş başlıklar ve boş maddeler düşürülür. Yazılsalar `#` / `*` ham paragrafı olarak çıkarlardı.
    - İçinde `*` geçen kalın bir parça işaretsiz yazılır (tüm satırı kaplıyorsa işaretli kalır).
    - Blok işaretiyle başlayan bir paragraf (Word'den gelen `1. Ocak…` gibi) işaret kelimeleri ayrı satıra bölünerek yazılır. Böylece sitede yine paragraf olarak görünür.
- **`RichTextEditor` için `format="markdown"` modu.** Geriye uyumlu: varsayılan `html`, konsept notları hiç değişmedi.
  - StarterKit'te blockquote, code, codeBlock, hardBreak, horizontalRule, italic, link, strike ve underline kapalı.
  - `ListItem` yalnız paragraf içerir; iç içe liste yok ve Tab editörden çıkar.
  - `OrderedList` her zaman 1'den başlar, çünkü site de öyle numaralıyor.
  - Düz metin yapıştırma markdown olarak ayrıştırılır.
- **Araç çubuğu:** H1/H2/H3, Kalın, Madde, Numaralı, Geri al, Yinele.
  - `role=toolbar`, her düğmede `aria-label` ve `aria-pressed`.
  - `focus-visible` halkası var. Hedefler 28×28 px, WCAG AA'nın 24 px sınırının üstünde.
  - Etkin durum Tiptap 3'ün `useEditorState`'inden okunuyor.
- **İçerik senkronu (kart madde 3):**
  - Blog modalı her açılışta yeniden mount olduğu için düzenleme modunda yazı değişince içerik zaten yenileniyordu.
  - Markdown modunda ayrıca dışarıdan gelen `content` uygulanıyor. Editörün kendi yaydığı ve bayatlamış değerler "yankı" sayılıp yok sayılıyor.
  - Bu ayrım şart: ilk denemede toplu (batched) state güncellemesi yazarken metni geri sarıyordu.
- **Blog formu:**
  - Etiket ve açıklama `t('adminBlog.content.*')` ile geliyor; araç çubuğu metinleri `richTextEditor.*` altında, tr ve en eklendi.
  - Erişilebilir ad `aria-labelledby` ile veriliyor.
  - Boş içerik `handleSubmit`'te reddediliyor ("Makale içeriği boş olamaz.") ve editöre `aria-invalid` konuyor.
- **Bağımlılık:** `@tiptap/extension-list@3.31.0` eklendi. Resmi paket, sürüm sabit, starter-kit'in kendi bağımlılığıyla aynı sürüm. Lockfile'a +3 satır.
- **i18n baseline:** `admin/blog/client.tsx` 22 → 21 sabit metin. Yalnız bu satır elle güncellendi; `--update-baseline` alakasız satırları da değiştirdiği için geri alındı.

### Neden `@tiptap/markdown` değil
Bu eklenti madde işaretini `-` ile yazıyor, `\*` kaçışları üretiyor ve italik/link sözdizimi kullanıyor. Renderer'ın alt kümesi bunların hiçbirini tanımıyor; gidiş-dönüş bozulurdu. Küçük, saf bir dönüştürücü renderer'la birebir eşleşiyor ve tamamı birim testli.

## Kanıt (ham çıktı)
- **Şema / renderer / API diff:** `git diff --stat origin/dev -- prisma/ "src/app/[locale]/(public)/blog/" src/app/api` → boş.
- **Gidiş-dönüş:** `npx vitest run tests/blog-markdown.test.tsx` → `Tests 27 passed (27)`.
  - Kapsam: 4 seed yazı, yerel DB'deki 10 yazı (`BlogPost` count = 10) ve 16 uç durum.
  - Uç durumlardan bazıları: başlığın hemen ardından gelen paragraf, CRLF, `#### `, çıplak işaretler, satırlar arasında bölünen kalın, `<script>` metni.
  - Her durumda gerçek `BlogDetailPage` render ediliyor ve makale gövdesinin HTML'i önceki haliyle aynı. İkinci gidiş-dönüş de değişmiyor.
  - Bu test ilk koşuda gerçek bir hata yakaladı: `#\n*\n1.` içeriği `# * 1.` olarak yazılıyor ve H1'e dönüşüyordu. Düzeltildi.
- **Blog ve konsept notları e2e:** admin-blog-rich-editor, admin-blog-persistence, admin-blog-cover-upload, admin-blog-image-upload, blog-reader, concept-note-editor → `16 passed, 6 skipped`.
  - Atlanan 6 test gerçek nesne deposu gerektiren eski yükleme testleri; bu değişiklikten önce de atlanıyorlardı.
  - Yeni spec `--repeat-each=3` ile 12/12 geçti.
- **Tam kapı:** `pnpm lint` 0 hata (4 eski uyarı), `pnpm typecheck` temiz, `i18n:check` temiz, `pnpm test` → `Test Files 354 passed | 7 skipped`, `Tests 4615 passed | 120 skipped`.
- **Pre-push gate (tam `pnpm gate`, e2e dahil):** `350 passed (6.7m)`, `8 skipped`, `EXIT=0`, dal push edildi.
- **Toolbar mutlu yolu (gerçek tıklama ve yazma):** kaydedilen `content` tam olarak şu:
  `Bu yazı …paragraftır.\n\n## Editör başlığı\n\nBir **kalın** kelime.\n\n* birinci madde\n* ikinci madde\n\n1. bir\n2. iki`
  - Sayfa yenilenince editörde h2, strong, ul ve ol aynı.
  - `/tr/blog/<slug>` sayfasında başlık, `<strong>` ve iki liste doğru; makale metninde `*` ve `#` yok.
- **Word yapıştırma (gerçek pano + ⌘V):**
  - Düşenler: italik, üstü çizili, kod, altı çizili, link, alıntı, h4, iç içe liste, hr, tablo ve img. Metin korunuyor, biçim düşüyor.
  - DB'deki içerikte `_ ~ \` < > [ ]` ve girintili satır yok.
  - Sitede `*` yok. "1. Ocak toplantısı" paragraf olarak kalıyor. `<ol start=4>` editörde de sitede de 1'den başlıyor.
- **Klavye:** Özet alanından Tab ile H1'e geliniyor, odak halkası çiziliyor (box-shadow ≠ none). 3 Tab sonra Kalın'a geliniyor; Space `aria-pressed=true` yapıyor, odak editöre geçiyor ve yazılan metin `<strong>` içinde.
- **Konsept notları regresyonu:** HTML modundaki eski araç çubuğu (Bold, Italic, H1, H2, Bullet, Ordered, Quote) duruyor. İtalik eklendi, Save'e basıldı; DB'ye `<p>Önceki metin</p><p><em>eğik ek</em></p>` yazıldı, yani HTML olarak kaydediliyor.
- **Mobil 390 px:** `scrollWidth 390 = innerWidth 390`, yatay taşma yok. Araç çubuğu iki satıra kırılıyor.

Ekran görüntüleri: `docs/agent-results/TASK-MVDKHOXGRQQS5-screenshots/`
- 01: araç çubuğuyla düzenleme
- 02: yenileme sonrası editör
- 03: sitedeki yazı
- 04: Word yapıştırma sonrası editör
- 05: Word yapıştırmanın sitedeki hali
- 06: konsept notları
- 07: klavye odak halkası
- 08: 390 px mobil

## Değişen dosyalar
- `src/lib/blog-markdown.ts` (yeni)
- `src/components/editor/RichTextEditor.tsx`
- `src/app/[locale]/admin/blog/client.tsx`
- `messages/tr.json`, `messages/en.json`
- `package.json`, `pnpm-lock.yaml`, `i18n-baseline.json`
- `tests/blog-markdown.test.tsx` (yeni)
- `tests/e2e/admin-blog-rich-editor.spec.ts` (yeni)
- `tests/e2e/concept-note-editor.spec.ts` (yeni)
- `tests/e2e/fixtures/rich-editor.ts` (yeni)
- `tests/e2e/admin-blog-persistence.spec.ts`: textarea `fill` yerine editöre yapıştırma

## Riskler
- **Biçimin yeniden yazılması:** Bir yazı açılıp **değiştirilmeden** kaydedilirse metin değişmez, çünkü onUpdate tetiklenmez ve orijinal string gider. Tek bir karakter bile düzenlenirse içerik kanonik biçimde yeniden yazılır: boş satırlar normalize edilir, numaralar 1'den sıralanır. Sitedeki görünüm aynı kalır (testle kanıtlandı).
- **Kalan uç durumlar (renderer'da kaçış olmadığı için):**
  - Düz metne elle yazılmış `**x**` sitede kalın görünür. Editör yazarken bunu zaten kalına çeviriyor.
  - HTML yapıştırmada "1." ile metin arasında tek boşluk değil sekme ya da çift boşluk varsa paragraf sitede listeye dönebilir.
  - İkisi de nadir; renderer değiştirilmeden kapatılamıyor.
- **Konsept notlarındaki eski davranışlar (dokunulmadı, ayrı iş olabilir):** HTML modunda araç çubuğu düğmesi odağı bir kare tutuyor, düğmeye bastıktan hemen sonra (~16 ms içinde) basılan tuş kaybolabiliyor. Tiptap 3 her işlemde yeniden render etmediği için etkin düğme vurgusu da güncellenmiyor. Blog modunda ikisi de düzeltildi.
- **Paralel çalışma:** Repoda leed-fb'nin push edilmemiş `leed-fb/blog-markdown-editor` dalı var (75ff15d4). O dal textarea + önizleme yaklaşımıyla aynı alanı ele alıyor ve renderer'ı ortak bir dosyaya taşıyor. Bu PR o dala dayanmıyor; ikisi birlikte birleşirse `client.tsx` ve messages dosyalarında çakışma çıkar.

## Açık sorular
- Yok.

## Sonraki adım
- crw incelemesi ve PR #99'un dev'e alınması.
- leed-fb dalının (textarea + önizleme) kapatılması ya da bu PR'la uzlaştırılması lidere kalıyor.

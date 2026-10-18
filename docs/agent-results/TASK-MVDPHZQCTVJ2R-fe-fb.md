---
sözleşme: 3
biçim: html
sayfa: TASK-MVDPHZQCTVJ2R-fe-fb.html
görev: TASK-MVDPHZQCTVJ2R
kod: TASK-MVDPHZQCTVJ2R
ajan: fe-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: editörde Link ve Görsel araçları var. Görsel yalnız yükleme ile eklenir ve alt metni zorunlu. Kural tek politika modülünde; editör, kayıt ve site onu kullanıyor. İzinsiz içerikle yapılan ham sunucu isteği reddediliyor ve kayıt değişmiyor. PR #105 açık (base dev).
platform: mac (Chromium/Playwright, gerçek tıklama, yerel MinIO). Kod web tarafında, işletim sisteminden bağımsız; yola, kabuğa ya da sürece dokunan bir kod yolu yok. Windows ve Linux koşulmadı çünkü bu makinede yoklar. Davranış farkı beklenmiyor. CI (Linux) MinIO ile aynı e2e'yi koşuyor.
sürüm: 1
tarih: 2026-10-18T12:49:14.724Z
---

# FO-79 · Blog yazısına link ve görsel ekleme

Blog içeriği Markdown olarak saklanmaya devam ediyor. Alt kümeye iki biçim eklendi: satır içi link `[metin](url)` ve kendi satırında blok görsel `![alt](url)`.
Kurallar tek bir saf modülde: src/lib/blog-content-policy.ts. Editör, validateBlogInput ve post sayfası renderer'ı bu modülü çağırıyor.
Linkler: https, http, mailto ve site içi yol. Dış link yeni sekmede, noopener noreferrer nofollow ile açılıyor. Görseller: yalnız public bucket /blog/ altına yüklenmiş dosyalar, alt metin zorunlu.
Kanıt: birim 185/185, canlı DB 10/10, MinIO'lu e2e 37/37 (0 atlandı), push kapısı yeşil. PR #105.

## Ne yapıldı
- **Politika modülü** (`src/lib/blog-content-policy.ts`):
  - Fonksiyonlar: `blogLinkKind`, `isAllowedLinkHref`, `isAllowedBlogImageSrc`, `blogLink`, `blogImage`, `blogContentRefusal`, ayrıca yazım yardımcıları.
  - Kapak ve portre için kullanılan host kontrolü `blog-shared.ts`'ten bu modüle taşındı (kopyalanmadı).
- **Renderer** (`blog/[slug]/page.tsx`):
  - `renderLinks`: dış link `<a target=_blank rel="noopener noreferrer nofollow">`, site içi link `next/link`, mailto aynı sekmede.
  - `![alt](src)` satırı `next/image` ile basılıyor (`sizes`, `w-full h-auto`).
  - Politikanın reddettiği her şey düz metin olarak basılıyor.
- **Dönüştürücü** (`blog-markdown.ts`):
  - Link mark ↔ `[metin](url)`, image node ↔ `![alt](url)`.
  - Adresteki `( ) * [ ]` ve boşluklar percent-encode ediliyor. Link metnindeki köşeli parantez normal paranteze çevriliyor.
  - Sayfanın gösteremeyeceği bir link (izinsiz adres, metinde `*`) düz metin olarak yazılıyor.
- **Editör** (`RichTextEditor.tsx`, yalnız markdown modu):
  - Link: StarterKit link yapılandırması (`openOnClick:false`, autolink, `isAllowedUri` = politika).
  - Görsel: `@tiptap/extension-image@3.31.0`. `parseHTML: []` olduğu için yapıştırılan `<img>` hiç okunmuyor.
  - Araç çubuğuna "Bağlantı" ve "Görsel" eklendi. İkisi de native modal `<dialog>` açıyor (portal ile; dış formu göndermiyor; Esc ile kapanıyor, odak geri dönüyor).
  - Görsel yükleme kapakla aynı rota ve aynı mesajlarla yapılıyor (ortak `src/lib/blog-image-upload.ts`).
  - Konsept notları (html modu) etkilenmedi.
- **Kayıt**: yeni hata kodları `invalid_content_link` ve `invalid_content_image` (tr ve en mesajlarıyla). Kayıt doğrulaması renderer'dan daha geniş tarıyor: `[x](javascript:alert(1))` sayfada zaten link olmuyor, ama kaydı da reddediliyor.

## Kanıt
- Birim: `blog-content-policy` 68, `blog-markdown` 51 (FO-75'in 27 vakası değişmeden geçti), toplam 185/185 geçti.
- Canlı Postgres (`blog-posts.live`): 10/10. Ham Markdown'la oluşturma ve güncelleme reddedildi, satır değişmedi.
- e2e, MinIO env'iyle (`admin-blog-links-images`, `admin-blog-rich-editor`, `-cover-upload`, `-image-upload`, `-persistence`, `-new-defaults`, `blog-author-byline`, `blog-reader`, `concept-note-editor`): **37 geçti, 0 atlandı**.
- Env'siz koşuda yalnız yeni mutlu yol testi atlanıyor (`R2_PUBLIC_*` yok); CI'da MinIO ile koşuyor.
- "API'ye izinsiz içerik → 400": blog kaydı bir REST rotası değil, bir server action. Bu yüzden HTTP durumu her zaman 200 ve ret `{ok:false,error:'invalid_content_link'|'invalid_content_image'}` olarak dönüyor. e2e bu davranışı kanıtlıyor: tarayıcıdan çıkan kaydetme isteğinin gövdesi yolda ham yasak Markdown ile değiştiriliyor (javascript:, //host, dış görsel). Yanıtta hata kodu var, UI mesajı gösteriyor, DB satırı değişmiyor (3/3).
- Push kapısı: vitest 4726 geçti / 120 atlandı; e2e 365 geçti / 10 atlandı; lint 0 hata; i18n, RLS ve alarm kapıları temiz.
- Ekran görüntüleri HTML raporda: editör, diyaloglar, ret, yeniden yükleme, yapıştırma ve public sayfa.

## Değişen dosyalar
- `src/lib/blog-content-policy.ts` (yeni)
- `src/lib/blog-image-upload.ts` (yeni)
- `src/lib/blog-markdown.ts`
- `src/lib/blog-shared.ts`
- `src/components/editor/RichTextEditor.tsx`
- `src/app/[locale]/(public)/blog/[slug]/page.tsx`
- `src/app/[locale]/admin/blog/{client,page}.tsx`
- `messages/{tr,en}.json`
- `package.json` ve `pnpm-lock.yaml`
- Testler: `tests/blog-content-policy.test.ts` (yeni), `tests/blog-markdown.test.tsx`, `tests/blog-posts.live.test.ts`, `tests/e2e/admin-blog-links-images.spec.ts` (yeni), `tests/e2e/fixtures/png.ts` (yeni), `tests/e2e/admin-blog-rich-editor.spec.ts`
- Kart listesi dışında dokunulan iki dosya:
  - `admin/blog/client.tsx` ve `page.tsx`: editöre public bucket adresi geçiliyor; yükleme mantığı ortak yardımcıya taşındı.
  - `admin-blog-rich-editor.spec.ts`: Word yapıştırmasında https linki artık korunuyor (kart madde 5).

## Riskler
- Tarayıcı panosu adresleri mutlaklaştırıyor: yapıştırılan `<a href="//evil.example">` Chrome'da `http://evil.example/` olarak geliyor. Bu politikaya uygun sıradan bir dış link (yeni sekme, nofollow). Markdown'da elle yazılan `//host` ise reddediliyor.
- Kendi satırındaki dış görsel sözdizimi (`![a](https://dış/...)`) sayfada `!` + link olarak görünür. Kayıt bunu reddettiği için yalnız eski içerikte görülebilir; mevcut yazılarda böyle bir satır yok.
- Kullanıcı düz metin olarak `[metin](https://…)` yazarsa kayıttan sonra bu metin link olur (Markdown kısayolu gibi). Yine de politikadan geçer.
- Okuma süresi tahmini (FO-78) link adresini bir kelime sayar. Etkisi ihmal edilebilir.

## Açık sorular
- Yok.

## Sonraki adım
- se-fb ve crw incelemesi (PR #105'te güvenlik bölümü var).
- `admin-blog-cover-upload.spec.ts` kendi `makePng` kopyasını taşıyor. FO-78 çakışmasını önlemek için o dosyaya dokunmadım; istenirse `fixtures/png.ts`'e bağlanabilir.

Bu raporun sayfası: TASK-MVDPHZQCTVJ2R-fe-fb.html (AgentSpace Raporlar sekmesinde açılır).

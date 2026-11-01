---
sözleşme: 3
görev: TASK-MVDTW6KVN5BSA
kod: TASK-MVDTW6KVN5BSA
ajan: fe-fb
motor: claude
tip: hata
okur: ekip
hüküm: Kısmen bitti: iki öneri kodlandı ve test edildi (birim 4823/4823, MinIO'lu e2e 29/29, 0 atlandı); dal commit'li ama push ve PR bekliyor, çünkü push kapısının rls:verify adımı ortak DB'deki bilinen FO-52 RLS uyuşmazlığıyla iki denemede de düştü.
platform: mac (Darwin, Chromium/Playwright, gerçek yapıştırma ve tıklama, yerel MinIO). Değişiklik saf TS politika fonksiyonu ve tarayıcıdaki Tiptap ayarı; dosya yolu, kabuk ya da süreç koduna dokunmuyor, Windows/Linux'ta davranış farkı beklenmiyor. Windows ve Linux koşulamadı çünkü bu makinede yoklar; CI (Linux) aynı e2e'yi MinIO ile koşuyor.
sürüm: 1
tarih: 2026-10-19T21:24:47.383Z
---

# FO-85 — editör link doğrulaması = politika + blog görsellerine uzantı şartı

## Ne yapıldı
1. **Öneri 1 (editör = politika):** `src/components/editor/RichTextEditor.tsx` içinde `isAllowedUri: (url) => isAllowedLinkHref(url)` yapıldı. Kullanılmayan `URL_SCHEME` sabiti silindi.
   - **Tetikleyen girdi:** politikanın reddettiği şemasız adresler. Kod, şeması olmayan ve `/` ile başlamayan her adresi Tiptap'in `defaultValidate`'ine bırakıyordu. Bu yüzden `<a href="example.com|www.example.com/a|#top|./x|../x|x?y=1">` yapıştırması ve `setLink` editörde link oluşturuyordu. `docToMarkdown` ise bunları kayıtta linksiz metne çeviriyordu, yazar bir şey fark etmiyordu.
   - **Davranış değişikliği (bilinçli):** Tiptap autolink'i ve yapıştırma URL bulucusu `isAllowedUri`'yi tamamlanmamış metinle (`example.com`) çağırıyor, href ile değil. Bu yüzden yazılan şemasız `example.com` / `a@b.org` artık otomatik link olmuyor. `https://…` linkleniyor; şemasız adres için Link aracı kullanılmalı. Kartın "tek politika" kararıyla uyumlu.
2. **Öneri 2 (uzantı şartı):** `src/lib/blog-content-policy.ts` → `IMAGE_FILE = /\/[^/]+\.(?:png|jpe?g|webp)$/` artık `isAllowedBlogImageSrc`'in koşulu. Çağıranlar: `blogImage` (renderer + `blogContentRefusal` kaydı), editörün Image aracı, `blog-shared.ts` kapak/avatar (`isAllowedImageUrl`). Unsplash kapakları ayrı host listesi dalından geçtiği için etkilenmiyor. Yükleme rotası (`blogImageKey`) zaten `blog/<yyyy>/<cuid>.<jpg|png|webp>` üretiyor.
   - **Reddedilen yeni vakalar:** uzantısız, `.svg`, `.html`, `.gif`, yalnız `.png`, `x.png.html`, `x.png/`, `%2Epng`, büyük harf `.PNG`.
3. **Öneri 3:** Bilgi amaçlı, değişiklik yok.

## Kanıt (ham çıktı)
- **Kırmızı (düzeltme öncesi):** `tests/rich-text-editor-link-policy.test.tsx` → `Tests 8 failed | 8 passed (16)`. `setLink(example.com|www.example.com/a|#top|./x|../x|x?y=1)` `expected true to be false` verdi; yapıştırma `expected [ 'example.com', …(9) ] to deeply equal [ 'https://example.org/a', …(3) ]` verdi; yazma `[ 'https://example.org/a', …(1) ]` verdi.
- **Yeşil (düzeltme sonrası):** `Tests 16 passed (16)`.
- **Politika + ilgili:** blog-content-policy, blog-validation, blog-markdown (canlı DB dahil), author-byline, image-upload, editor sync → `219 passed`.
- **Tam süit** (`pnpm test`, `.env` aynı kabukta): `Test Files 364 passed | 7 skipped (371)` · `Tests 4823 passed | 120 skipped (4943)`.
- `pnpm lint` → 0 hata, 4 uyarı (accept.ts, concept-template-tenant.ts, settings-profile-update.test.ts; bu işin dosyaları değil). `pnpm typecheck` temiz.
- **E2E (Chromium, yerel MinIO `fabrika-public`, port 3100):** admin-blog-links-images, admin-blog-rich-editor, admin-blog-image-upload, admin-blog-cover-upload, blog-author-byline, blog-reader → **29 passed, 0 skipped**. Gerçek yapıştırma + yükleme + yayın sayfası dahil.
- **Yerel DB taraması** (salt-okunur, `localhost:5433/fabrika`): `{ posts: 26, uploadRefs: 0, nonconforming: 0 }`. Hiçbir yazının kapağında, avatarında ya da içeriğinde `/blog/` yüklemesi yok, yani kurala uymayan kayıt yok. Not: devop-fb FO-105'te bu DB'yi temizliyor; bu sonuç 2026-10-20 anının görüntüsü. Prod/staging taranmadı.
- **Push kapısı (2 deneme):** lint + typecheck + test + i18n + rls:check + rls:bypass-check geçti. `rls:verify --require-db` düştü: `tenant-discovery: daraldı … ExpertPreRegAttempt=0, ExpertPreRegistration=0` (subject-scoped da aynı). Bu, be-fb'nin kayıtlı notundaki bilinen durum: ortak DB'deki FO-52 `system_scope_open` ile dev'in `check-rls-live.ts` beklentisi uyuşmuyor ve dev'de de kırmızı. Onarım `pnpm db:rls` ortak DB'ye uygulama gerektiriyor; bu bana yasak. `--no-verify` kullanılmadı.

## Değişen dosyalar
- `src/components/editor/RichTextEditor.tsx`
- `src/lib/blog-content-policy.ts`
- `tests/blog-content-policy.test.ts`
- `tests/rich-text-editor-link-policy.test.tsx` (yeni)

Dal `fe-fb/fo85-blog-policy-tighten`, commit `08741878`, worktree `/Users/macbook/alan/FONBRIDGE-fo85`.

## Riskler
- Şemasız adresin otomatik linklenmesi kalktı (yukarıda). Yazar `example.com` yazıp boşluk bırakınca link oluşmuyor.
- Büyük harf uzantı (`.PNG`) reddediliyor. Yükleme rotası hep küçük harf üretiyor; elle yazılmış eski bir büyük harfli adres olursa kayıt reddedilir, renderer da metin gösterir. Yerel DB'de böyle kayıt yok.

## Açık sorular
- Yok. rls:verify uyuşmazlığının kararı FO-52 sahibi ve se-fb'de (be-fb notu).

## Sonraki adım
- **Push bekliyor:** ortak DB'de RLS düzeltilince `cd /Users/macbook/alan/FONBRIDGE-fo85 && set -a; . ../FONBRIDGE/.env; set +a; E2E_PORT=3100 git push -u origin fe-fb/fo85-blog-policy-tighten`, ardından base `dev` ile PR.

## Definition of Done
- [x] Editör doğrulaması = politika (kırmızı→yeşil test kanıtı)
- [x] Görsel uzantı şartı her yerde aynı fonksiyondan
- [~] Testler temiz ✓, PR açık ✗ (push kapısı ortam nedeniyle engelli)
- [x] Platform beyanı: web, mac Chromium

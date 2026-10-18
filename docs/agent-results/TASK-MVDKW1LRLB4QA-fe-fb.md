# TASK-MVDKW1LRLB4QA (FO-76) — Yazar satırı: "Ünvan İsim", tek satır, kalın

**Ajan:** fe-fb · **Dal:** `fe-fb/fo76-author-byline` (taban: `origin/dev`) · **Commit:** `20cde01a`

## Ne yapıldı

- `authorByline(author)` saf yardımcısı eklendi (`src/lib/blog-shared.ts`). Ünvan ve isim trim edilir, iç boşluklar tek boşluğa indirilir, boş parça atılır, boşlukla birleştirilir. Ünvan boşsa yalnız isim, isim boşsa yalnız ünvan döner.
- 4 render noktasında iki satırlı `name` + gri `role` bloğu tek satıra çevrildi; kalın `text-ink` stili korundu:
  - `src/app/[locale]/(public)/blog/[slug]/page.tsx` (kart yolu kartta `(marketing)` değil, `(public)`)
  - `src/app/[locale]/(public)/blog/page.tsx`
  - `src/components/BlogSection.tsx`
  - `src/app/[locale]/admin/blog/client.tsx` (admin listesi)
- Kart listesi ve blog listesinde byline `min-w-0 truncate` ile daraltılır; avatar `alt`'ı da aynı byline'ı kullanır.
- Admin "Yazar Unvanı" alanına `t('authorRolePlaceholder')` placeholder'ı eklendi: tr "Dr., Prof. Dr., Uzman", en "Dr., Prof. Dr., Expert".
- Şema, API, seed değişmedi. Veri modeli (`authorName`, `authorRole`) aynen duruyor.

## Kanıt (ham çıktı özeti)

**Lint** (`pnpm lint`): `0 errors`, 4 uyarı — hepsi bu işle ilgisiz eski dosyalarda.

**Typecheck** (`pnpm typecheck`): `tsc --noEmit` temiz (0 hata). İlk denemede yeni worktree'de Prisma client üretilmediği için hata veriyordu; `npx prisma generate` ile düzeldi.

**Birim testleri:**
```
tests/blog-author-byline.test.ts + tests/blog-validation.test.ts
 Test Files  2 passed (2)
      Tests  46 passed (46)
```
Yeni testin kapsamı: ünvan+isim, ünvansız, isimsiz (yalnız ünvan), baştaki/sondaki ve iç çift boşluk, `undefined` yazar.

**Tüm birim süiti** (`pnpm test`, worktree): `Tests 51 failed | 4017 passed | 640 skipped`. Başarısızlıkların hepsi `src/lib/billing/*`, `tests/api-key-rate-limit.live.test.ts` gibi canlı DB testleri; hata `Authentication failed against the database server, the provided database credentials for 'fabrika' are not valid`. Hiçbiri blog dosyalarında değil. Bu başarısızlıkları `dev` tabanında ayrıca karşılaştırmadım; yani "önceden de kırıktı" iddiası doğrulanmadı, yalnız "blog ile ilgisi yok" söylenebilir.

**E2E** (`E2E_PORT=3001 npx playwright test tests/e2e/blog-author-byline.spec.ts`): `4 passed (14.6s)`.
- Yazı sayfası: `Dr. Mehmet Yılmaz` tek satır, `fontWeight >= 600`; `Mehmet Yılmaz` tek başına element olarak yok.
- Blog listesi ve ana sayfa BlogSection: iki yazının byline'ı görünür.
- Admin listesi (platform admin oturumuyla): byline görünür.
- 375px: `/tr/blog`, `/tr`, yazı sayfasında yatay taşma yok (`scrollWidth - clientWidth <= 0`).

Ekran görüntüleri (git-ignored, commit'e girmedi): `/Users/macbook/alan/FONBRIDGE-fo76/test-artifacts/FO-76-byline-screenshots/` — `post-with-role-desktop.png` ve `blog-listing-375.png` incelendi. İlkinde `Dr. Mehmet Yılmaz` kalın tek satır. İkincisinde çerez banner'ı kartların alt kısmını kapatıyor; byline varlığı yine de testte assert ile doğrulandı.

Test verisi: spec kendi iki yazısını (`e2e-byline-*` slug) ve kendi platform-admin kimliğini oluşturup `afterAll`'da siler. Dev DB'de yazarlı kayıt yoktu (seed yazıların hiçbirinde `author` yok), bu yüzden spec kendi kayıtlarını yazıyor.

## Değişen dosyalar

- `src/lib/blog-shared.ts` — `authorByline` eklendi
- `src/app/[locale]/(public)/blog/[slug]/page.tsx`
- `src/app/[locale]/(public)/blog/page.tsx`
- `src/components/BlogSection.tsx`
- `src/app/[locale]/admin/blog/client.tsx` — render + placeholder; import satırı
- `messages/tr.json`, `messages/en.json` — `adminBlog.authorRolePlaceholder`
- `tests/blog-author-byline.test.ts` (yeni)
- `tests/e2e/blog-author-byline.spec.ts` (yeni)

## Platform beyanı

- **Platform:** web (tarayıcı). Doğrulama: **mac** (darwin 27), Playwright Chromium.
- **Windows / Linux:** koşulamadı — bu makinede yok. Kod yolu platforma bağlı değil (saf metin birleştirme ve CSS); koddan bakıldığında fark beklenmez.

## Riskler

- **FO-75 (PR #99, `fe-fb/fo75-blog-rich-editor`) hâlâ açık.** Bu iş kartın dediği gibi `origin/dev`'den ayrı dalda yapıldı ve FO-75'in kodu alınmadı. `admin/blog/client.tsx` iki PR'da da değişiyor: import satırı, admin listesindeki yazar hücresi ve Yazar Unvanı input'u. PR #99 birleşince bu dal rebase edilmeli; çakışma küçük ama elle çözülmeli.
- Yeni bir worktree'de `npx prisma generate` çalıştırılmadan typecheck kırık görünüyor. Bu bir gotcha; hafızaya yazılacak.

## Açık sorular

- Admin formunda "Yazar Adı" ve "Yazar Unvanı" etiketleri hâlâ sabit Türkçe (`t()` kullanılmıyor). Kart yalnız placeholder'ı istediği için etiketlere dokunmadım. İngilizce arayüz için de çevrilsin mi?

## Sonraki adım

1. PR #99 birleşince bu dalı `dev` üzerine rebase et; `admin/blog/client.tsx` çakışmasını çöz.
2. PR'ı incele, kart DoD maddelerini PR açıklamasında işaretle.

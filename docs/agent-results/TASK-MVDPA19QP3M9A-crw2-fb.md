# TASK-MVDPA19QP3M9A (FO-78) — çakışma çözümü + inceleme · crw2-fb

**Hüküm:** Çakışma çözüldü ve push edildi (PR #103 head `ab546054`, GitHub: MERGEABLE). FO-78 incelemesinde **bloke eden bulgu yok**; 3 küçük öneri var. Birleşik ağaçta tsc, eslint, vitest ve blog e2e temiz; blog e2e'de skipped = 0.

**Platform:** web. mac (Darwin) + Playwright Chromium ile ölçüldü. Windows/Linux'ta koşulamadı (yalnız mac makine var). Değişen kod tarayıcıda çalışan React/TS ile Node seed betiği; platforma bağlı bir yol (süreç, dosya yolu, kabuk) yok, davranış aynı olmalı.

## Ne yapıldı
1. Kendi worktree'mi açtım: `/Users/macbook/alan/FONBRIDGE-crw2-fo78` (detached, `origin/fe-fb/fo78-blog-new-defaults` = 7a04bfbe). fe-fb'nin `FONBRIDGE-fo78` worktree'sine dokunmadım. Ardından `git merge origin/dev` (d65d8692, #100 dahil) koştum.
2. Tek çakışma `src/app/[locale]/admin/blog/client.tsx`'teki import satırındaydı. İki tarafı da korudum:
   ```ts
   import { authorByline, formatBlogDate, type BlogPost } from '@/lib/blog-shared';   // FO-76
   import { estimateReadMinutes } from '@/lib/blog-read-time';                       // FO-78
   ```
   `messages/{tr,en}.json` otomatik birleşti, iki dosya da geçerli JSON. `authorRolePlaceholder` (FO-76) ve `adminBlog.readTime.*` (FO-78) birlikte duruyor. Birleşik client.tsx'te `authorByline` (satır 426), `RichTextEditor` (FO-75, satır 587), `authorRolePlaceholder` (satır 621), boş kapak, otomatik okuma süresi ve `readTimeAuto` ref'i hep birlikte mevcut. Dev'e göre client.tsx diff'i yalnız FO-78'in kendi hunk'larından oluşuyor.
3. Merge commit `ab546054` atıldı. Pre-commit kapısı temiz. Push `--no-verify` olmadan yapıldı; pre-push `pnpm gate` yeşil geçti (`7a04bfbe..ab546054`).

## Kanıt (ham çıktı)
```
pre-commit: ✓ Kapı temiz (staged kapsamı).
pre-push gate (E2E_PORT=3100, patronun :3000'i açık kaldı):
  vitest  Test Files 356 passed | 7 skipped (363) · Tests 4633 passed | 120 skipped (4753)
  e2e     360 passed, 9 skipped (9.1m)
  7a04bfbe..ab546054  HEAD -> fe-fb/fo78-blog-new-defaults   exit=0
tsc --noEmit: exit 0 (çıktı yok)
eslint (değişen 9 dosya): exit 0
vitest blog-read-time + fabricated-identity-strings + blog-*.test.ts (live dahil):
  Test Files 6 passed (6) · Tests 112 passed (112)   (skipped 0)
e2e admin-blog-{cover-upload,image-upload,new-defaults,persistence,rich-editor} + blog-author-byline + blog-reader
  (R2_ACCOUNT_ID=local R2_ENDPOINT=http://localhost:9000 R2_PUBLIC_HOST=http://localhost:9000/fabrika-public R2_PUBLIC_BUCKET=fabrika-public):
  30 passed (47.0s)   — skipped 0, failed 0
```
Gate'teki 9 atlanan testin 6'sı blog cover/image-upload testleriydi. Sebep: `R2_ACCOUNT_ID` verilmediği için nesne deposu koşulu sağlanmadı. Aynı testler yukarıdaki MinIO env'iyle ayrıca koşuldu ve 0 skipped çıktı. Kalan 3 test (admin-documents LIVE, price-lock, purge-failure) blogla ilgisiz.

grep kontrolleri (birleşik ağaç):
```
grep -rn unsplash src/app src/components  → boş
grep -rn "Süperadmin" src tests prisma scripts e2e
  tests/fabricated-identity-strings.test.ts:66,295  (negatif liste: bu ad üretilmemeli)
  tests/fabricated-identity-strings.test.ts:271,277 (yeni bekçi: seed/betikte "(Süperadmin)" yok)
```

## İnceleme — kart maddeleri
| Madde | Durum | Not |
|---|---|---|
| Stok URL kalmadı | ✅ | `image: ''`, iki başlangıç noktası da (useState ve `openNew`) güncellendi. CSP/next.config'teki unsplash izni yerinde (madde 4). |
| Görselsiz kayıt reddi | ✅ | İstemci `image.missing` ile reddediyor, sunucu da (`BlogPost.image` zorunlu). e2e DB'de satır oluşmadığını doğruluyor (`count == 0`). |
| Okuma süresi tahmini | ✅ | `estimateReadMinutes` saf fonksiyon: kelime/200, yuvarlanmış, en az 1, boşsa 0. Markdown işaretleri, link/görsel adresleri ve HTML sayılmıyor. Birim testler boş, kısa, uzun ve işaret durumlarını kapsıyor. |
| Elle değişince durma | ✅ | `readTimeAuto` ref'i input'un onChange'inde false oluyor. Ref seçimi doğru: Tiptap onUpdate'inin eski closure'ı state okusaydı bayat değer görürdü. e2e kapsıyor. |
| Düzenlemede değerlerin korunması | ✅ | `openEdit` → `readTimeAuto=false`. e2e kayıtlı "9 dk okuma" değerini ve kapak src'yi doğruluyor. |
| Seed + bağımlı testler | ✅ | `seed-tenant-workspace.ts:67` ve `scripts/create-superadmin.ts:8` → `'Yasin Aslan'`. Seed bir upsert ve `update.name` içeriyor, yani idempotent; mevcut satırı da düzeltir. Betik ise adı yalnız create'te yazıyor (prod notu fe-fb raporunda var). Parantez kırpan bir sezgi eklenmemiş. |
| i18n tr+en | ✅ | `adminBlog.readTime.{label,placeholder,hint,auto}` iki dilde var. Etiket artık `t()` ile geliyor ve `htmlFor`/`aria-describedby` bağlı. |

## Bulgular (önem sırasıyla — hepsi ÖNERİ, bloke eden yok)
1. **Öneri (kenar durum) — okunabilir kelimesi olmayan içerikte okuma süresi boş kalıyor.** `client.tsx:104-105` + `blog-read-time.ts:27`. İçerik yalnız `![](https://…/x.png)`, `---` ya da `<br/>` olduğunda `content.trim()` boş değil, bu yüzden istemci kontrolü geçiliyor. Ama `estimateReadMinutes` 0 döndürüyor ve `readTime` `''` kalıyor. Sunucu bunu `invalid_read_time` ile reddediyor ve kullanıcı "Okuma süresi 1–30 karakter olmalı." görüyor. Veri kaybı yok, mesaj da anlaşılır. İstenirse istemcide okuma süresi için de ayrı bir boşluk kontrolü (`readTime.missing`) eklenebilir. Bu durum dev'de de vardı (alan elle boşaltılınca), yani regresyon değil.
2. **Öneri (test boşluğu) — "editing … keeps its saved read time, cover and author" e2e testi yazarı doğrulamıyor.** `tests/e2e/admin-blog-new-defaults.spec.ts`'teki son test, başlığına rağmen yalnız okuma süresini ve kapağı assert ediyor; `Kayıtlı Yazar` için assert yok. Kod doğru (`openEdit` `authorName: post.authorName` kullanıyor; fe-fb'nin canlı kanıtı da bunu gösteriyor). Tek satırlık bir `toHaveValue('Kayıtlı Yazar')` assert'i eklenebilir.
3. **Gözlem (kapsam dışı, karar için) — okuma süresi metni admin'in UI dilinde saklanıyor, yazının dilinde değil.** `BlogPost`'ta locale alanı yok. Türkçe arayüzde yazılan bir yazı `/en/blog/...` sayfasında da "N dk" gösterecek. Kart bunu açıkça istiyor ("admin'in UI diline göre") ve mevcut seed de "5 dk okuma" kullanıyor, yani kusur değil. Kalıcı çözüm, sayıyı saklayıp okuyucu dilinde biçimlemek olurdu; bu şema değişikliği gerektirir ve ayrı bir karttır.

## Değişen dosyalar (benim)
- Yalnız merge commit `ab546054`: `src/app/[locale]/admin/blog/client.tsx` (import çakışması). FO-78 koduna başka dokunulmadı.

## Riskler
- GitHub Actions: PR #103'teki build-and-test, i18n-audit ve lighthouse-a11y 2 saniyede, hiçbir adım çalışmadan "fail" veriyor. Birleşmiş PR #100'de de aynı durum var; runner hiç başlamıyor. Bu kod değil, hesap/ortam kaynaklı. Yerel gate bu yüzden tek yeşil kanıt.
- Prod'daki admin `User.name` değeri ve patronun kaydettiği yazının `authorName`'i hâlâ "(Süperadmin)" içeriyor olabilir. Bunlar veridir; seed/betik değişikliği onları güncellemez (fe-fb raporunda da not edildi).

## Açık sorular
Yok.

## Sonraki adım
- PR #103 birleştirilebilir (lider/patron). Öneri 1-2 isteğe bağlı küçük bir takip olabilir.
- `FONBRIDGE-crw2-fo78` worktree'si merge sonrası kaldırılabilir. İçinde kopyalanmış `.env*` dosyaları var; git'te izlenmiyorlar.

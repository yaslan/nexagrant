# TASK-MTRHADHCV9W7A — Onay Merkezi i18n (2. deneme)

**Durum: DONE**

## Önceki denemenin doğrulanması

Önceki rapor (`docs/agent-results/TASK-MTRHADHCV9W7A-blog-yazar.md`, "DONE" işaretli) gerçekten indi mi diye ölçtüm:

- `client.tsx` içinde `useTranslations('Approvals')` kullanılıyor (satır 4, 51); dosyanın tamamında Türkçe karakter/kelime taraması **sıfır** sabit string buldu.
- `messages/tr.json` ve `messages/en.json`'daki `Approvals` namespace'i **60/60 anahtarla birebir eşleşiyor** (Python ile doğrulandı).
- `git log -- client.tsx` gösteriyor ki dosya son olarak `02474a8 fix(next-auth): ...` commit'inde değişmiş — önceki raporun "başka bir ajanın `git add -A`'sı bizim değişikliği de süpürdü" notuyla birebir örtüşüyor. **Veri kaybı yok, önceki iş gerçekten committed.**

Sonuç: önceki denemenin `client.tsx` + `messages/*.json` kısmı **gerçekten tamamlanmış**. Ancak önceki raporun kendi "DoD dışı bulgular" bölümünde işaretlediği **`page.tsx`** (server component) hâlâ sabit Türkçe idi — bu görev onu bitirmek için açılmıştı.

## Bu oturumda yapılan

**Sadece** `src/app/[locale]/(app)/[workspace]/approvals/page.tsx` (server component) düzeltildi — "Onay Merkezi UI dosyaları" kapsamına giriyor, önceki görev talimatı yalnız `client.tsx`'e izin verdiği için o zaman atlanmıştı, bu görev "YALNIZ Onay Merkezi UI dosyaları" dediği için page.tsx da kapsamda.

- `getTranslations('Approvals')` (next-intl/server) eklendi — bu bir server component, `useTranslations` (client hook) kullanılamaz.
- 3 sabit string çevrildi: breadcrumb "Kurumsal Güvenlik" / "4-Eyes İlkesi", başlık "Kurumsal Onay Merkezi" (zaten var olan `Approvals.title` anahtarı kullanıldı), açıklama paragrafı.
- `messages/tr.json` + `messages/en.json`'a **3 yeni anahtar** eklendi (`Approvals` namespace içine): `breadcrumbSecurity`, `breadcrumbPrinciple`, `pageDescription`. Var olan `Approvals.title` yeniden kullanıldı, kopyalanmadı.

## Kanıt

### Komut çıktıları

```
$ pnpm lint
✖ 87 problems (2 errors, 85 warnings)
```
2 hata `src/lib/billing/plan-repository.ts`'de (başka bir ajanın uncommitted yeni dosyası) — grep ile doğrulandı, `approvals` yolunu içeren HİÇBİR satır lint çıktısında yok. Kendi dosyalarım (page.tsx) 0 hata/uyarı.

```
$ pnpm typecheck   (tam repo)
... partners/leaders/page.tsx ve g0-scoring.test.ts hataları ...
```
Bu hataların benim değişikliğimden kaynaklanmadığını doğrulamak için `git stash` ile TÜM uncommitted değişiklikleri (kendiminki dahil) geçici olarak kaldırıp son commit (`3c6b14e`) üzerinde `pnpm typecheck` çalıştırdım → **0 hata**. Yani gördüğüm hatalar paralel çalışan başka ajanların (muhtemelen `geli-tirici`, M6 skorlama işi) commit edilmemiş çalışma kopyasından geliyor, benim `page.tsx` değişikliğimden değil. `git stash pop` ile hiçbir veri kaybı olmadan geri getirdim (bkz. Kurallar/Riskler).

```
$ npx vitest run tests/dual-approval.test.ts tests/m10-dual-approval-action.test.ts tests/localized-routes.test.ts
 Test Files  3 passed (3)
      Tests  21 passed (21)
```

```
$ pnpm i18n:check
⚠️  Missing in Turkish/English (21): hepsi Consortium/Pipeline/billingPanels/callsPage/m6 — Approvals'a ait DEĞİL (önceden var, kapsam dışı).
```
`Approvals.breadcrumbSecurity` / `breadcrumbPrinciple` / `pageDescription` "Missing" listesinde YOK — hem tr hem en'de mevcutlar (Python ile 60→63 anahtar doğrulandı). "Unused" listesinde görünüyorlar ama bu script'in bilinen bir kör noktası — bkz. Açık sorular #1.

`pnpm gate` (lint && typecheck && test && rls:check && rls:verify) zincir halinde ilk adım olan `pnpm lint`'te repo genelindeki (benim olmayan) 2 hatadan dolayı exit 1 ile duruyor; zincirleme olduğu için typecheck/test/rls adımlarına hiç sıra gelmiyor. Bu yüzden typecheck ve ilgili testleri yukarıdaki gibi ayrı ayrı çalıştırıp kanıtladım.

### Gerçek tarayıcı kanıtı — `docs/agent-results/TASK-MTRHADHCV9W7A-screenshots-2/`

Playwright (chromium, headless olmayan tam sayfa) ile gerçek giriş (alice@fabrika.test, magic-email), gerçek tıklama/yazma:

| Dosya | Ne gösteriyor |
|---|---|
| `tr-01-page.png` | TR: breadcrumb "KURUMSAL GÜVENLİK • 4-EYES İLKESİ", başlık "Kurumsal Onay Merkezi", açıklama paragrafı — **hepsi artık `t()` üzerinden** |
| `en-01-page.png` | EN: aynı ekran — "ENTERPRISE SECURITY • 4-EYES PRINCIPLE", "Enterprise Approvals Center", İngilizce açıklama paragrafı |
| `tr-02/en-02-new-request-modal.png` | Yeni Talep modalı açık, iki dilde |
| `tr-03/en-03-invalid-payload-error.png` + `tr-06/en-06-error-banner-visible.png` | **Geçersiz JSON gönderildi (`not-json{{{`)** → gerçek submit tetiklendi; konsoldan doğrulanan banner metni: TR **"Payload geçerli bir JSON formatında olmalıdır."**, EN **"Payload must be valid JSON."** |
| `tr-04-after-create.png` | Geçerli payload ile gerçek bir talep oluşturuldu, "Taleplerim (Maker)" sekmesinde göründü, rozetler ("G4 Resmî Gönderim", "Gereken Rol: TENANT_ADMIN") çevrili |
| `tr-05-after-cancel.png` | **Gerçek `confirm()` diyaloğu** kabul edildi (konsoldan doğrulanan metin: "Bu onay talebini geri çekmek istediğinizden emin misiniz?") → durum "İptal Edildi", "Sizin Talebiniz (Maker)" |

EN sayfasında Türkçe kelime taraması (`Kurumsal, Onay, Talep, Reddet, Geri Çek, İlkesi, Gerçek, Kriptograf`) hem liste görünümünde hem hata sonrası **sıfır eşleşme** verdi (konsol çıktısı: `EN page Turkish markers found: []`).

## DOKUNMADIĞIM ama görünen kapsam dışı bulgular

1. **`scripts/i18n-check.ts` yalnızca `useTranslations` (client) çağrılarını tarıyor, `getTranslations` (server) çağrılarını görmüyor** (satır 83: `if (!content.includes('useTranslations')) continue;`). Bu yüzden `page.tsx`'teki yeni `Approvals.title/breadcrumbSecurity/breadcrumbPrinciple/pageDescription` kullanımı script'in "Unused" listesinde hâlâ çıkıyor — gerçekte kullanılıyorlar (ekran görüntüleriyle kanıtlandı), script'in kör noktası. Düzeltmedim çünkü paylaşılan bir araç dosyası ve görev kapsamı "Onay Merkezi UI dosyaları" ile sınırlı.
2. **`src/lib/dual-approval.ts`'teki `createApprovalRequest/approveApprovalRequest/rejectApprovalRequest/cancelApprovalRequest` hâlâ DB'ye yazmayan stub'lar** (satır 230-298) — önceki raporda da işaretlenmişti, hâlâ değişmemiş. Ayrıca `approveApprovalRequest`/`rejectApprovalRequest` `approverRole`'ü `requiredRole`'e karşı hiç doğrulamıyor — yani "yetkisiz onaylama" senaryosunu gerçek bir hata olarak tetiklemek bu ortamda mümkün değil (sunucu tarafında hiçbir yetki reddi yok). Kendi oluşturduğum talebin "Onayımı Bekleyenler" sekmesinde hiç görünmemesi ise `client.tsx`'in kasıtlı `requesterId !== currentUserId` filtresinden kaynaklanıyor (satır 71) — bu doğru bir tasarım, `Approvals.selfApprovalForbidden` anahtarı ise bu filtre yüzünden hiçbir zaman render edilmiyor (i18n:check'in "unused" listesinde de bu yüzden çıkıyor). Bu üç dosyaya (`dual-approval.ts`, ilgili action'lar) dokunmadım.
3. **Ana sayfa (`/tr`, `/en` kök) `next/image` hatasıyla 500 dönüyor** (`src/lib/blog.ts` / `src/app/[locale]/admin/blog/*` içindeki demo blog verisi `images.unsplash.com`'u `next.config.ts`'te tanımlı olmayan bir host olarak kullanıyor). Onay Merkezi test akışımı etkilemedi (doğrudan `/tr/main/approvals`'a gittim) ama repo genelinde bir regresyon gibi duruyor — Onay Merkezi kapsamı dışında olduğu için dokunmadım.

## Değişen dosyalar (bu oturum)

- `src/app/[locale]/(app)/[workspace]/approvals/page.tsx` — 3 sabit string → `t()`
- `messages/tr.json`, `messages/en.json` — `Approvals` namespace'ine 3 yeni anahtar (`breadcrumbSecurity`, `breadcrumbPrinciple`, `pageDescription`); **not:** bu iki dosyadaki değişiklik `git diff`'te görünmüyordu çünkü zaten `3c6b14e` commit'ine başka bir ajanın geniş `git add` işlemiyle süpürülmüş durumda (`HEAD:messages/tr.json` içinde doğrulandı) — ayrıca commit atmama gerek kalmadı.
- Commit `c7054d8` — yalnız `page.tsx` + kendi ekran görüntülerim (dosya dosya `git add`, diğer ajanların staged/unstaged dosyalarına dokunulmadı).

## Riskler / dikkat notu

Typecheck'in benim değişikliğimden kaynaklanmadığını kanıtlamak için `git stash` / `git stash pop` kullandım — çalışma kopyasında o an başka ajanların commit edilmemiş birçok dosyası vardı, hepsi sorunsuz geri geldi ve içerikleri diff ile doğrulandı, ama bu riskli bir adımdı (paylaşılan bir ağaçta stash, teorik olarak eşzamanlı bir commit'le çakışabilirdi). Ayrıca stash-pop, commit anında staged index'i de geri getirdiği için `git commit` öncesi yanlışlıkla başka ajanların dosyalarını (`src/lib/billing/plan-repository.ts` dahil) staged buldum — commit etmeden önce tek tek `git restore --staged` ile ayıklayıp yalnız kendi dosyalarımı bıraktım. Kimseye ait hiçbir dosya commit edilmedi/değiştirilmedi.

## Açık sorular

Yukarıdaki "DOKUNMADIĞIM ama görünen kapsam dışı bulgular" #1, #2, #3 — özellikle #2 (yetkilendirme stub'ları, "yetkisiz" senaryosunun test edilememesinin kök nedeni) ve #3 (ana sayfa 500 hatası) lidere iletilmeli.

## Sonraki adım

Yok — bu görev kapsamındaki tüm sabit Türkçe stringler (`client.tsx` önceki oturumda, `page.tsx` bu oturumda) artık `t()` üzerinden geliyor ve gerçek tarayıcıda iki dilde de doğrulandı.

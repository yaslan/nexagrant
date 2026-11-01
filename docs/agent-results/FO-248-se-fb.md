# FO-248 — PR #217 düzeltmesi (se-fb devri): doğrulama + dev birleştirme + push

**Ajan:** se-fb · **Kart:** TASK-MVUOBAZFDHRW (FO-248) · **PR:** #217 (`be-fb/fo245-nexagrant-docs`, draft, MERGE YOK)
**Platform:** mac (darwin). Yalnız doküman; platforma bağlı kod yolu yok. Linux/Windows: koşulmadı (gerek yok).

## Hüküm
Düzeltmenin büyük kısmı be-fb tarafından yerelde yapılmıştı (`33749c02`, `58132c0f`; push edilmemişti, origin hâlâ `4b11c086`). Yeniden yapmadım: kartın K1/K2/K3 maddelerine karşı satır satır doğruladım, 2 kalıntı düzelttim, `origin/dev` (64 commit) ile birleştirdim (çakışma yok), `pnpm i18n:check` geçti, push edildi.

## K1 — SMTP-SUNUCU ölçümleri (doğrulandı)
Ölçüm satırları (NS/SOA REFUSED, SNI/crt.sh, alan adı listeleri 29.09, "kaydedildi 29.09.2026", "Karar A (29.09)") fonbridge.com'da. §1 başında tek satır not var: "nexagrant.com için DNS/SMTP/blocklist ölçümü henüz yapılmadı (VPS kurulumunda yapılacak). Aşağıdaki ölçümler fonbridge.com'a aittir."

## K2 — tarihli karar/not satırları (doğrulandı)
SECURITY_COMPLIANCE, SMTP-SUNUCU, privacy-notice-gap-analysis, processing-register, kamu/VERI-YERLESIMI, HUKUK-SORULARI, ROADMAP, ILKADIM-PILOT (+B5) tarihli satırları fonbridge.com. Altı dosyada "Güncel durum (30.10.2026, FO-233, patron): canlı alan adı nexagrant.com … önceki tarihli kayıtlar fonbridge.com içindir" notu var (SECURITY_COMPLIANCE:105, SMTP-SUNUCU:3, VERI-YERLESIMI:4, HUKUK-SORULARI:4, gap-analysis:275, processing-register:13).

## K3 — content (doğrulandı)
`git diff origin/dev -- content | wc -l` → 0 (kvkk-uzman-v1/v2 .md + .en.md dev ile aynı).

## Madde 4–6
- İleriye dönük komutlar/Caddy/certbot/DNS tablosu nexagrant.com kaldı.
- `EFATURA_INTEGRATOR_RFI.md:76` ve `MALI_MUSAVIR_SORULARI.md:119` → `info@nexagrant.com`; `git grep 'bilgi@' -- docs content` (rapor dosyaları hariç) → 0.
- Bu devirde bulduğum 2 kalıntı (`docs/SMTP-SUNUCU.md`): DNS tablosu satır 5 "Bugün 77.92.144.187 için v6 yok" (tarihsiz ölçüm iddiası) → "29.09.2026 ölçümünde … yoktu"; swaks konusu `'fonbridge SMTP test 587'` (ileriye dönük komut) → `'nexagrant SMTP test 587'`.
- Bilinçli bırakılan: CAA satırı (10) "usfinbridge.com sertifikası … 29.09 ölçüm" zaten tarih etiketli, başka alan adı; ürün adı "FonBridge" marka olarak kaldı.

## Çakışma
PR #238 (FO-275) yalnız `docs/DEPLOY-NEXAGRANT-HOSTINGER.md` dokunuyor; bu PR ile kesişim yok. `origin/dev` birleştirmesi çakışmasız.

## Kanıt
- `pnpm i18n:check` → `✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.`
- `git diff origin/dev --stat -- docs content` → 9 doküman dosyası (+ bu rapor ve be-fb raporu), content 0.

## Riskler
- be-fb raporunun kendisi de belirtti: hunk sınıflaması (tarihli/ileriye dönük) önemli ölçüde otomatik; sınır vakalar (B5, HUKUK) insan gözüyle tekrar okunmalı. PR merge edilmedi.
- nexagrant.com için canlı DNS/SMTP/TLS ölçümü yapılmadı (repodan kanıtlanamaz).

## Açık sorular
Yok.

## Sonraki adım
Lider incelemesi; VPS kurulumunda nexagrant.com ölçümünü yeni tarihli kayda yaz.

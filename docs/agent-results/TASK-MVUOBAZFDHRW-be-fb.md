# FO-248 — PR #217 düzeltmesi: tarihli kayıtlar fonbridge.com'a geri alındı

**Ajan:** be-fb · **Kart:** TASK-MVUOBAZFDHRW (FO-248) · **PR:** #217 (`be-fb/fo245-nexagrant-docs`, draft, merge YOK)
**Düzeltme commit'i:** `33749c02` (üzerine bu rapor commit'i gelir) · **Repo:** FONBRIDGE · **Dal:** `be-fb/fo245-nexagrant-docs` (worktree `FONBRIDGE-worktrees/be-fb-fo245`)
**Platform:** mac (darwin). Yalnız doküman değişti; platforma bağlı kod yolu yok. `pnpm i18n:check` mac'te koştu.

## Hüküm

FO-247 incelemesindeki DÜZELTME maddeleri uygulandı. Tarihli ölçüm ve patron kararı satırları fonbridge.com'a geri alındı; ileriye dönük talimatlar nexagrant.com olarak kaldı. Kod değişmedi.

## Ne yapıldı

### K1 — tarihli ölçümler (`docs/SMTP-SUNUCU.md`)
- Başlık, "Gönderici / SMTP / Canlı alan adı" karar maddeleri ve "Plan çerçevesi" (satır 1–6, 18) → fonbridge.com. Üstüne tarihli güncel-durum notu eklendi.
- §1 ölçüm tablosu (satır 27, 29, 31, 58, 60): NS, SOA REFUSED, SNI/crt.sh, "Sonuç" paragrafı → fonbridge.com.
- "Bugün (29.09): SNI …" satırı (≈188) → fonbridge.com.
- "Alan adı listeleri (29.09 ölçüm)" (≈265) ve "kaydedildi 29.09.2026" (≈276) → fonbridge.com.
- "Karar A ile (29.09)" (≈45) → fonbridge.com.
- Ölçüm ifadeleri nötrleştirildi: `(bugünkü REFUSED durumu)` → `(kurulum öncesi boş beklenir)`; `# NOERROR olmalı (bugün REFUSED)` → `# NOERROR olmalı`; `beklenen: … (bugün CN=autoconfig…)` → parantez kaldırıldı.
- §1 başına tek satır not: "nexagrant.com için DNS/SMTP/blocklist ölçümü henüz yapılmadı (VPS kurulumunda yapılacak). Aşağıdaki ölçümler fonbridge.com'a aittir."
- §10 başlığı "(patron kararı 29.09)" → "(patron kararı 30.10.2026, FO-233)".
- Komut örnekleri, Caddyfile, certbot, swaks, openssl, §3.0 DNS tablosu ve §10 kuralları nexagrant.com olarak kaldı.

### K2 — tarihli karar/not satırları
- `docs/SECURITY_COMPLIANCE.md` (103, 124): tarihli kayıtlar → fonbridge.com. Güncel-durum maddesi eklendi (liste öğesi).
- `docs/legal/privacy-notice-gap-analysis.md` (239, 263–265): 29.09 notu ve 01.10 notu (269) → fonbridge.com. Güncel-durum paragrafı eklendi. Satır 136 (tarihsiz, "bu anda" durumu) nexagrant.com olarak kaldı.
- `docs/legal/processing-register.md` (34, 247, 261, 419–420, 448): tarihli "patron kararı 29.09" satırları → fonbridge.com. §başlığı altına güncel-durum paragrafı eklendi.
- `docs/kamu/VERI-YERLESIMI.md` (3, 21, 56): sürüm 1.3 ve tarihli satırlar → fonbridge.com. Sürüm satırına güncel-durum notu eklendi.
- `docs/legal/HUKUK-SORULARI-2026-09.md` (3, 10, 249, 335, 340, 342 — 1.14 başlığı ve 1.11/1.12 kayıtları): sürüm kayıtları → fonbridge.com. Güncel-durum notu eklendi.
- `docs/ROADMAP.md` (doğrulama notu, `info@` kutusu): → fonbridge.com.
- `docs/kamu/ILKADIM-PILOT.md` (R3 satırı, 29.09 kararına dayanan): → fonbridge.com.
- `docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md`: "Karar-1 C (patron, 30.09)" (621), "bugünkü dağıtım" yan bulgusu (301, 748) ve §8 tablo satır 9 (KAPANDI, 30.09) → fonbridge.com. Açık sorular ve tasarım metni nexagrant.com olarak kaldı.

### K3 — KVKK v1/v2
- `content/kvkk-uzman-v1.md`, `-v1.en.md`, `-v2.md`, `-v2.en.md` tamamen `origin/dev` hâline döndü (`info@fonbridge.com` içerikleri). `git diff origin/dev -- content` = 0 satır.

### Diğer
- `docs/EFATURA_INTEGRATOR_RFI.md:76` ve `docs/MALI_MUSAVIR_SORULARI.md:119`: `bilgi@nexagrant.com` → `info@nexagrant.com`.

## Kanıt

- `git diff origin/dev --stat` (son hâl):
  ```
  docs/EFATURA_INTEGRATOR_RFI.md            |   2 +-
  docs/MALI_MUSAVIR_SORULARI.md             |   2 +-
  docs/SECURITY_COMPLIANCE.md               |   1 +
  docs/SMTP-SUNUCU.md                       | 318 +++++-----
  docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md     |  46 ++---
  docs/kamu/VERI-YERLESIMI.md               |   1 +
  docs/legal/HUKUK-SORULARI-2026-09.md      |   1 +
  docs/legal/privacy-notice-gap-analysis.md |   4 +-
  docs/legal/processing-register.md         |   2 +
  9 files changed, 194 insertions(+), 183 deletions(-)
  ```
  `content/` farkı: 0 satır. ROADMAP, ILKADIM, VERI-YERLESIMI dışındaki dosyalar için farklar yalnızca nexagrant.com'un ileriye dönük kullanımıdır.
- `git grep -n 'bilgi@' -- docs content` → 0 satır.
- `pnpm i18n:check` → `✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.`
- Yöntem: PR diff'i hunk bazında (159 hunk) alındı; tarihli/ölçüm/karar hunk'ları `origin/dev` metnine döndürüldü, ileriye dönük hunk'lar korundu. İlk denemede hunk ayrıştırıcısı dosya başlığı satırlarını içeriğe ekledi; o deneme `git checkout HEAD --` ile geri alındı ve düzeltilmiş ayrıştırıcıyla yeniden uygulandı.

## Değişen dosyalar

`content/kvkk-uzman-v1.md`, `content/kvkk-uzman-v1.en.md`, `content/kvkk-uzman-v2.md`, `content/kvkk-uzman-v2.en.md` (dev'e dönüş — HEAD'de nexagrant farkı kalktı), `docs/EFATURA_INTEGRATOR_RFI.md`, `docs/MALI_MUSAVIR_SORULARI.md`, `docs/ROADMAP.md`, `docs/SECURITY_COMPLIANCE.md`, `docs/SMTP-SUNUCU.md`, `docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md`, `docs/kamu/ILKADIM-PILOT.md`, `docs/kamu/VERI-YERLESIMI.md`, `docs/legal/HUKUK-SORULARI-2026-09.md`, `docs/legal/privacy-notice-gap-analysis.md`, `docs/legal/processing-register.md`.

## Riskler

- Hunk seçimi satır/anlam sınıflandırmasıyla yapıldı. İnsan gözüyle tek tek okunmadı; özellikle B5 ve HUKUK'taki sınır vakalar (ör. "Bugün." ve sürüm 1.14 başlığı) yanlış sınıflanmış olabilir. Bu yüzden PR yine merge edilmemeli.
- `nexagrant.com` için DNS, SMTP, blocklist ve TLS ölçümü bu işte yapılmadı (salt-okunur ölçüm FO-248 kapsamında değildi). Canlı durum repodan kanıtlanamaz.
- `info@nexagrant.com` kutusunun varlığı: lider teyidine göre yalnız `info@` kutusu Hostinger'da var; `bilgi@` yok.

## Açık sorular

- Yok (lider teyidi kartta: 29.09 kararı fonbridge.com; nexagrant.com kararı 30.10 FO-233 ile).
- Rapor yolu: kart ve sistem talimatı `docs/agent-results/` altında proje reposunu gösteriyor; görev metni `/Users/macbook/alan/docs/agent-results/` (çalışma alanı kökü) diyor. Bu rapor proje reposuna yazıldı; kök kopyası gerekiyorsa lider onaylasın.

## Sonraki adım

1. Lider incelemesi (PR #217 hâlâ draft; merge yok).
2. nexagrant.com için DNS/SMTP/blocklist ölçümünü VPS kurulumunda yap; sonucu yeni tarihli kayda yaz.
3. Push: `bash scripts/gate-isolated.sh git push` (bu rapor commit'iyle birlikte koşuldu).

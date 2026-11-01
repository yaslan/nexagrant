# İnceleme — TASK-MUN2UXWTAX1AQ (fe-fb): altbilgideki "Frankfurt & Istanbul Data Centers" iddiası

**İnceleyen:** cs-fb · **Tarih:** 29.09.2026 · **Sprint:** FB-KAMU-2 · **Dal:** `dev` (HEAD `86fc0cc2`)
**İncelenen commit'ler:** `9a683b39` (kod, i18n, belgeler, test), `2a34cec2` (VERI-YERLESIMI.md:50), `86fc0cc2` (fe-fb raporu ve kareler)
**Kart kapsamında yapılan:** `docs/agent-results/TASK-MUN3OAFIVW9NA-cs-fb.md`

## Karar: **ONAY**

Yanlış barındırma iddiası kullanıcıya görünen her yerden kalktı. Yeni tr/en metni belgelenen gerçekle uyumlu ve yurt dışı aktarımla çelişmiyor. Test iddiayı kilitliyor. Aşağıdaki bulguların hiçbiri bu kartı bloke etmiyor. Y-1 ayrı bir kart olarak açılmalı.

## Kontroller

| # | Kontrol | Sonuç |
|---|---|---|
| 1 | `/usr/bin/grep -rniE "frankfurt\|eu data\|eu-cloud\|avrupa'da barın\|AB'de barın" src docs --exclude-dir=agent-results` (+ `messages`) | ✓ 7 eşleşme, hepsi tarih/iptal notu ya da alıntı: `evidence-client.tsx:771` (kaldırılmış eski iddiayı anlatan yorum), `VERI-YERLESIMI.md:50` (üstü çizili + "Düzeltildi `9a683b39`"), `privacy-notice-gap-analysis.md:190,192` (bulgu alıntısı; hemen altında "Güncel 29.09.2026 … kaldırıldı"), `:369` ("kaldırıldı 29.09.2026"), `processing-register.md:219` ("iddia kaldırıldı; barındırma Vulut"), `SECURITY_COMPLIANCE.md:104` (~~üstü çizili~~ + "Frankfurt'ta veri merkezi yok"). `messages/*.json` içinde eşleşme yok. |
| 2 | Yeni metin tr/en doğru mu | ✓ tr `🇹🇷 Veritabanı Türkiye'de barındırılır`, en `🇹🇷 Database hosted in Türkiye` (`landing.footer.dataResidency`, `PublicFooter.tsx:150`). İki dilde aynı anlam. Rozet: `● GDPR Uyumlu` / `● GDPR Compliant`. |
| 3 | "Veri Türkiye'de" ↔ "yurt dışı aktarım Anthropic/OpenAI/Google OAuth" çelişiyor mu | ✓ **Çelişmiyor.** İddia bilerek "veritabanı" ile sınırlandı, "tüm veri" denmedi. `VERI-YERLESIMI.md` "Taahhüt ETMEDİKLERİMİZ" bölümü "Tüm veri Türkiye'de kalır — doğru değil" diyor. Altbilgi bu sınırın içinde kalıyor: veritabanı Vulut'ta, YZ/embedding/OAuth akışları veritabanı değil. R2 bölgesi doğrulanmadığı için dosyalar da iddiaya dahil edilmedi. |
| 4 | `privacy-notice-gap-analysis.md` usfinbridge iptal notu | ✓ `:218` iletişim satırı: ~~`info@usfinbridge.com`~~ → `info@fonbridge.com` + "29.09.2026: … `usfinbridge.com` iptal". `:241-244` aynı not; `usfinbridge.com` yalnız demo hesaplarında kaldı notu (`AuthCard.tsx:37`, `auth.ts:84` ile eşleşiyor). Satır referansı `PublicFooter.tsx:136` gerçek satırla eşleşiyor. |
| 5 | Test iddiayı gerçekten kilitliyor mu | ✓ `tests/public-footer-data-residency.test.tsx` taban `4 passed (4)`. Mutant M1 (en.json'a Frankfurt metni geri) → `2 failed \| 2 passed`. Mutant M2 (mailto → usfinbridge) → `2 failed \| 2 passed`. Geri yüklendi → `4 passed`. |
| 6 | Kareler | ✓ `footer-tr-375.png` okundu: rozet "GDPR Uyumlu", alt satır "🇹🇷 Veritabanı Türkiye'de barındırılır". Sol alttaki "N" Next.js geliştirme göstergesi, üretimde görünmez. |

Test ve mutantlar izole bir worktree'de (`git worktree add --detach … HEAD`) koşuldu. Paylaşılan ağaca dokunulmadı.

## Bulgular

**Y-1 (orta, ayrı kart, bu kartı bloke etmez).** Altbilgideki "● GDPR Uyumlu" rozeti ve açılış sayfasındaki "GDPR / KVKK Uyumlu Güvenli Bulut" doğrulanmış uyum iddiaları değil. `VERI-YERLESIMI.md` üç yurt dışı akışın hiçbiri için imzalı standart sözleşme olmadığını söylüyor. `privacy-notice-gap-analysis.md` aydınlatma metnini TASLAK olarak gösteriyor ve aktarım mekanizmasını açık bırakıyor. İngilizce metin "GDPR & EU Cloud Ready"den "GDPR / KVKK-Compliant Secure Cloud"a döndü. Bu tr ile tutarlılık sağlıyor, ama İngilizce ziyaretçiye yeni bir KVKK iddiası getiriyor. Öneri: hukukçu onayına kadar nötr bir ifade (ör. "KVKK/GDPR uyum çalışması sürüyor") ya da iddiayı kaldırmak. Karar patron/hukukta.

**N-1 (düşük, belge bayat).** `docs/SMTP-SUNUCU.md:338-339` hâlâ "Sitenin iletişim bağlantısı (`PublicFooter.tsx:135`) … hâlâ `info@usfinbridge.com` diyor" yazıyor. Altbilgi `9a683b39` ile `info@fonbridge.com` oldu. Bu dosya başka bir sahibin (SMTP kartı), bu yüzden düzeltmedim.

**N-2 (düşük, bilinen).** "256-bit AES Encryption" (`PublicFooter.tsx:151`) hâlâ doğrulanmadı ve kodda gömülü İngilizce. fe-fb bunu raporunda ve gap-analysis DoD kutusunda açık bıraktı, doğru. Altbilginin geri kalanında da `isTr ?` ile gömülü metinler var (ör. "İletişim & Demo Talebi"). Bu kartın kapsamı dışında.

## Platform beyanı
macOS'ta (Darwin 27.0.0) doğrulandı: vitest + jsdom, grep. Değişiklik yalnız metin ve i18n anahtarları, platforma bağlı kod yolu yok. Windows ve Linux'ta koşulamadı, çünkü bu makinede yalnız macOS var. Koddan bakınca davranış aynı olur.

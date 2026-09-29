# TASK-MUN2UXWTAX1AQ — fe-fb — DÜZELTME (İNCELEME-40 B-1, B-2)

Sprint FB-KAMU-2 · 29.09.2026 · Kaynak: `docs/agent-results/TASK-MUN4N7ZU3PGQM-fe-fb.md` §B-1, §B-2 · dal `dev`
Commit'ler: `9a683b39` (kod + i18n + dokümanlar + test), `2a34cec2` (VERI-YERLESIMI.md:50)

## 1. Ne yapıldı

**B-2 — yanlış barındırma iddiası (kullanıcıya görünen):**
- `src/components/PublicFooter.tsx` alt çubuğu: "🇪🇺 Frankfurt & Istanbul Data Centers" → i18n `landing.footer.dataResidency`
  - tr: "🇹🇷 Veritabanı Türkiye'de barındırılır" · en: "🇹🇷 Database hosted in Türkiye"
  - "Veriler" yerine **"Veritabanı"** dedim. Sebep: `docs/kamu/VERI-YERLESIMI.md`, "Tüm veri Türkiye'de kalır" cümlesini "taahhüt ETMEDİKLERİMİZ" arasında sayıyor. R2 bölgesi doğrulanmadı; YZ ve Google girişi yurt dışına gidiyor. Bu yüzden daha geniş bir cümle yeni bir yanlış iddia olurdu.
- Tarama sırasında bulunan iki "EU Cloud" barındırma iddiası daha:
  - Altbilgi rozeti "● EU Cloud & GDPR Compliant" → `landing.footer.residencyBadge` = "● GDPR Uyumlu" / "● GDPR Compliant". GDPR iddiası zaten vardı, onu korudum; yalnız "EU Cloud" kaldırıldı.
  - `src/app/[locale]/page.tsx:137` hero: en "GDPR & EU Cloud Ready" → `landing.heroCompliance` (en "GDPR / KVKK-Compliant Secure Cloud"; tr metni aynı kaldı: "GDPR / KVKK Uyumlu Güvenli Bulut"). Kodda gömülü `isTr ?` ifadesi i18n'e taşındı.
- `docs/SECURITY_COMPLIANCE.md:104` "Veri yeri: AB bölgesi (Frankfurt) varsayılan" → Vulut/Türkiye; yurt dışına yalnız Anthropic, OpenAI ve Google OAuth; R2 bölgesi doğrulanmadı.
- `docs/legal/processing-register.md:219`: SECURITY_COMPLIANCE iddiasının kaldırıldığı not edildi.
- `docs/legal/privacy-notice-gap-analysis.md` §3.3 madde 1 ve DoD kutusu (:361→:369): "kaldırıldı 29.09.2026" notu eklendi. Kutuyu işaretlemedim, çünkü "256-bit AES Encryption" hâlâ açık.
- `docs/kamu/VERI-YERLESIMI.md:50` → "Düzeltildi (`9a683b39`)" (`2a34cec2`).

**B-1 — usfinbridge.com güncel kimlik gibi anlatılıyordu:**
- `privacy-notice-gap-analysis.md:214` (iletişim e-postası satırı): adres `info@fonbridge.com` oldu. Satıra "29.09.2026: canlı alan adı fonbridge.com; usfinbridge.com iptal" notu düşüldü, satır referansı `PublicFooter.tsx:136`.
- `:237` → aynı not eklendi. `src/lib/env.ts:49` referansı "o gün" diye işaretlendi; güncel referans `src/lib/env.ts:99` (`NEXT_PUBLIC_SMTP_FROM_ADDRESS`, varsayılan `info@fonbridge.com`).
- Tutarlılık için altbilgideki `mailto:info@usfinbridge.com` → `mailto:info@fonbridge.com` (dosya bana ait, patron kararı gereği).

## 2. Kanıt

**Tarama (düzeltme sonrası, temiz worktree `2a34cec2`):** `/usr/bin/grep -rniE "frankfurt|eu data|avrupa'da barın|AB'de barın" src docs --exclude-dir=agent-results`. Kalan eşleşmelerin hepsi ya tarihsel alıntı ya da barındırmayla ilgisiz:
- `evidence-client.tsx:771`: sertifika metnindeki "EU data protection" alıntısı; barındırma iddiası değil.
- `VERI-YERLESIMI.md:50` üstü çizili ve "Düzeltildi" notlu.
- `privacy-notice-gap-analysis.md:190,192`: bulgu alıntısı; hemen altında "Güncel 29.09.2026 … kaldırıldı" notu var.
- `:369`: "kaldırıldı" notlu.
- `processing-register.md:219` notlu.
- `SECURITY_COMPLIANCE.md:104` artık "~~Frankfurt~~ … veri merkezi yok" diyor.

Genişletilmiş taramada (`eu cloud|data cent|veri merkez|AB bölgesi|istanbul data`) kalan tek kod eşleşmesi `src/lib/analytics.ts:27`. Bu satır PostHog AB ucuyla ilgili ve doğru; barındırma iddiası değil.

**Gerçek tarayıcı (Chrome, `next dev` :3000, Playwright `channel: 'chrome'`):** çerez bandında gerçek tıklamayla "Gerekli Çerezler / Essential Only" seçildi, ardından altbilgi karesi alındı. Betik: `docs/agent-results/TASK-MUN2UXWTAX1AQ-fe-fb-screenshots/shot.mjs`.
```
tr 1280 {"residency":["🇹🇷 Veritabanı Türkiye'de barındırılır"],"frankfurt":false,"mail":"mailto:info@fonbridge.com","heroCompliance":["GDPR / KVKK Uyumlu Güvenli Bulut",…],"scrollWidth":1280}
en 1280 {"residency":["🇹🇷 Database hosted in Türkiye"],"frankfurt":false,"mail":"mailto:info@fonbridge.com","heroCompliance":["GDPR / KVKK-Compliant Secure Cloud"],"scrollWidth":1280}
tr 375  {"residency":["🇹🇷 Veritabanı Türkiye'de barındırılır"],"frankfurt":false,"mail":"mailto:info@fonbridge.com",…,"scrollWidth":375}
```
(`frankfurt` = tüm sayfa gövdesinde `/frankfurt|eu cloud|data cent/i`. 375 px'te yatay taşma yok.)
Kareler: `docs/agent-results/TASK-MUN2UXWTAX1AQ-fe-fb-screenshots/footer-tr-1280.png`, `footer-en-1280.png`, `footer-tr-375.png`.

**Kapılar (temiz worktree, `2a34cec2`; başkalarının commit'lenmemiş değişiklikleri yok):**
- `pnpm build` → `BUILD=0`. Taze worktree'de ilk deneme `.prisma/client/index-browser` bulunamadığı için düştü. Sebep ortam: prisma client üretilmemişti. `npx prisma generate` (GEN=0) sonrası build 0 ile bitti.
- `tsc --noEmit` → TC=0 · eslint (3 dosya) → LINT=0.
- `pnpm i18n:check` → "✅ i18n check passed … no file gained hard-coded text". Baseline artmadı: `page.tsx`'te bir literal azaldı; ek bir kalem de eklenmedi.
- Hedefli vitest: `public-footer-data-residency`, `brand-surfaces-render`, `i18n`, `marketing-unsourced-figures`, `i18n-check-script` → **5 dosya, 54/54 geçti**.

**Yeni regresyon testi** `tests/public-footer-data-residency.test.tsx` (4 test). Mutasyonla doğruladım (dosya yedekten geri yüklendi, checkout kullanılmadı):
- M1: altbilgiye "🇪🇺 Frankfurt & Istanbul Data Centers" geri eklendi → **2 failed**.
- M2: mailto `info@usfinbridge.com`'a döndürüldü → **2 failed**.
- Geri yükleme → 4/4 geçti.

## 3. Değişen dosyalar
- `src/components/PublicFooter.tsx`, `src/app/[locale]/page.tsx`
- `messages/tr.json`, `messages/en.json`: yalnız benim 3 anahtarım commit'lendi. Dosyadaki başka ajanlara ait commit'lenmemiş `aiTruncated`, `aiRefused` ve `CALENDAR_APP_URL_NOT_CONFIGURED` hunk'ları çalışma ağacında kaldı ve commit'e girmedi. Staging `git hash-object` + `update-index --cacheinfo` ile HEAD sürümü üzerine yapıldı; `git show --stat 9a683b39`'da iki dosyada da 7 satır var.
- `tests/public-footer-data-residency.test.tsx` (yeni)
- `docs/SECURITY_COMPLIANCE.md`, `docs/legal/privacy-notice-gap-analysis.md`, `docs/legal/processing-register.md`, `docs/kamu/VERI-YERLESIMI.md`
- Bu rapor + `docs/agent-results/TASK-MUN2UXWTAX1AQ-fe-fb-screenshots/`

Dokunulmayanlar: cs-fb'nin dosyaları (app-url, davet route, takvim) ve devop-fb'nin dosyaları (`src/lib/llm.ts`, m11).

## 4. Riskler
- **"256-bit AES Encryption"** altbilgide duruyor ve doğrulanmadı. Bu kartın kapsamı dışında kaldı; VERI-YERLESIMI.md:50'ye "dayanmayın" notu düştüm.
- **"GDPR Uyumlu"** rozeti ve hero'daki "GDPR / KVKK Uyumlu" metni önceden de vardı; yeni bir iddia eklemedim. En sürümü tr ile hizalanınca KVKK sözcüğü İngilizce metne de girdi. Uyum iddialarının hukukça onaylanması ayrı bir iş.
- Hafıza notunun wrapper'ı sonucu `/Users/macbook/alan/docs/agent-results/TASK-MUN4N7ZU3PGQM-fe-fb.md` yoluna yazmamı söylüyordu. Bu yol repo dışında ve incelenen kartın adını taşıyor. Görev gövdesindeki SONUÇ DOSYASI yoluna (bu dosyaya) yazdım. Önceki inceleme raporumun (`TASK-MUN4N7ZU3PGQM-fe-fb.md`) üzerine yazmadım.

## 5. Açık sorular
- `demo@usfinbridge.com` hâlâ demo hesabında duruyor (`src/lib/auth.ts:84`, `src/app/[locale]/login/AuthCard.tsx:37`). Bu kart kapsamında değil, cs-fb'nin alan adı işinin parçası olabilir. Değiştirilsin mi?
- Altbilgi "Veritabanı Türkiye'de" diyor. R2 deposu AB veya ABD'de çıkarsa bu cümle yine doğru kalır ("tüm veri" demiyor), ama patron daha kapsayıcı bir ifade isterse önce R2 bölgesi doğrulanmalı.

## 6. Sonraki adım
- Kartı `review`'a al. İNCELEME-40'ı yapan inceleyici B-1 ve B-2 kapanışını doğrulasın.
- "256-bit AES Encryption" için ayrı kart: kanıtlanacak mı, kaldırılacak mı.

**Platform beyanı:** mac (Darwin 27.0.0, Chrome, Node 26.5). Değişiklik yalnız metin, i18n ve doküman; platforma bağlı kod yolu yok. Windows ve Linux'ta koşulmadı, çünkü bu makinede yok. Kod davranışı platformdan bağımsız (statik metin render'ı). Tek fark bayrak emojisi olabilir: 🇹🇷 Windows'ta bayrak yerine "TR" harfleri olarak görünür (Windows bayrak emojisi çizmez); metin anlamı değişmez.

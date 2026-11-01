# TASK-MUN2PNAR729H8 — FB BELGE: SMTP kararı (cs-fb)

## 1. Ne yapıldı
Patron kararı (29.09.2026) belgelere işlendi: e-posta **kendi SMTP sunucumuzdan** gider, gönderici `info@usfinbridge.com`. Ayrı bir üçüncü taraf e-posta işleyeni yok; e-posta, barındırma sağlayıcısı kapsamında. Barındırma sağlayıcısı hâlâ açık. Sunucu kurulumu ve DNS (SPF/DKIM/DMARC) "sürüyor, TASK-MUN2PKA5AG2IV" olarak yazıldı. İNCELEME-28 B-3'ün "karar bekliyor / iki model" satırlarının hepsi kapatıldı.

- `docs/legal/processing-register.md`: §2 alıcı satırı (düz metin gören taraf artık "gönderen sunucu (barındırma sağlayıcısında)"), §14, §17, §18 alıcı satırları, §21'deki SMTP satırı (karar, gönderici, env varsayılanı notu), §21'deki barındırma satırı (e-posta içeriği de burada), §22 md.17 (üstü çizildi, "karar verildi").
- `docs/kamu/VERI-YERLESIMI.md`: e-posta satırı ve "kapanması gerekenler" madde 3 (ülke sorusu madde 1'e yani barındırmaya bağlandı).
- `docs/SECURITY_COMPLIANCE.md`: alt işleyici listesi notu.
- `docs/legal/HUKUK-SORULARI-2026-09.md`: sürüm **1.8 → 1.9**, değişiklik notu; §5 madde 3'teki Resend satırı ve iki seçenekli ek görüş sorusu tek soruya indi ("ayrı işleyen yazmak gerekmiyor, barındırma sözleşmesi yeterli mi; aydınlatmada hangi cümle"); kanıt satırı eklendi.
- Kod dosyasına dokunulmadı.

Ek olarak önceki kartın (TASK-MUN2J9LLXNREG) bekleyen üç belgesi `5bc98767` ile commit'lendi. TASK-MUN2J9LLXNREG ve TASK-MUN2793A57Z9I `review`'a alındı.

## 2. Kanıt
- Kod kayması taraması (hafıza kuralı): `git log a40b6bf4..HEAD -- src/lib/email .env.example` → `9b63111d` (app-url), `8e74d546` (yeniden davet rolü). İkisi de SMTP modelini değiştirmiyor.
- Gönderici: `src/lib/env.ts:98` → `NEXT_PUBLIC_SMTP_FROM_ADDRESS: z.string().default('noreply@usfinbridge.com')`; `mailer.ts:71` → `from: source.SMTP_FROM || \`${PRODUCT_NAME} <${source.NEXT_PUBLIC_SMTP_FROM_ADDRESS}>\``. Yani kod `info@` göndermez, kurulumda env ile verilmesi gerekir. Bu not belgeye yazıldı (§21, §22 md.17, HUKUK kanıt satırı).
- Bayat ifade kontrolü, dört belgede: `grep -c -E "patron karar verecek|karar bekliyor, iki"` → 0 / 0 / 0 / 0.
- Her değişiklik `assert s.count(old)==1` ile tek eşleşmeyle yapıldı (python, hata yok).
- `git diff --stat` (commit öncesi): 4 dosya, 14+/14- satır (HUKUK kanıt satırı eklenmeden önce).

## 3. Değişen dosyalar
- docs/legal/processing-register.md
- docs/legal/HUKUK-SORULARI-2026-09.md
- docs/kamu/VERI-YERLESIMI.md
- docs/SECURITY_COMPLIANCE.md
- docs/agent-results/TASK-MUN2PNAR729H8-cs-fb.md

## 4. Riskler
- **Gönderici adresi uyuşmuyor:** kod varsayılanı `noreply@usfinbridge.com`, karar `info@usfinbridge.com`. Kurulumda `NEXT_PUBLIC_SMTP_FROM_ADDRESS` ya da `SMTP_FROM` verilmezse e-posta `noreply@`'dan gider. `.env.example:131` de `noreply@` diyor. Kod ve env örneği bu kartın kapsamı dışında. devop-fb'nin TASK-MUN2PKA5AG2IV kartında ya da ayrı bir kod kartında düzeltilmeli.
- **Envanterde olmayan e-posta gönderenler:** `git grep` ile mailer kullanan yerler: `scripts/beta-onboarding.ts`, `scripts/beta-pricing-survey.ts`, `scripts/esr-calibration.ts` ve admin ayarlarındaki test e-postası (`src/app/[locale]/admin/settings/actions.ts`). §21'deki SMTP satırı yalnız §2, §14, §17 ve §18'i sayıyor. Beta betiklerinin e-postaları envanterde ayrı bir faaliyet olarak yok. Bu kartta madde açılmadı (kapsam dışı); ayrı bir envanter işi olarak bildirilmeli.
- "E-posta barındırma kapsamında" yargısı ürün ekibinin görüşüdür, hukukça teyitli değildir. HUKUK 1.9 §5 madde 3'te soruldu.

## 5. Açık sorular
- Barındırma firması ve ülkesi (envanter §22 md.15): e-postanın ülkesi de buna bağlı.
- Beta betiklerinin e-postaları envantere ayrı bir faaliyet olarak mı eklenecek?

## 6. Sonraki adım
- devop-fb: kurulumda gönderici ~~`info@usfinbridge.com`~~ **`info@fonbridge.com`**, sunucu `mail.fonbridge.com` olsun (TASK-MUN2PKA5AG2IV; aşağıdaki EK). Kurulum bitince belgedeki "kurulum sürüyor" ifadesi o commit ile kapatılır.
- İnceleme: crw-fb.

**Platform beyanı:** yalnız belge değişikliği; kod ve çalışma zamanı yolu yok. Doğrulama macOS'ta (darwin, zsh) grep ve python ile yapıldı. Windows ve Linux'ta koşulacak bir şey yok, çünkü değişen yalnız Markdown.

---

## EK — 29.09.2026 son karar: alan adı `fonbridge.com` (TASK-MUN2PNAR729H8 + TASK-MUN2UXWTAX1AQ güncellemesi)

### 1. Ne yapıldı
Patron SMTP kararını değiştirdi (29.09, son karar): gönderici **`info@fonbridge.com`**, SMTP sunucusu **`mail.fonbridge.com`** (kendi sunucumuz, Vulut'ta), canlı uygulama alan adı **`fonbridge.com`**. Bu raporun yukarısındaki `usfinbridge.com` ifadeleri bu nedenle geçersiz; belgeler düzeltildi:

- `docs/legal/processing-register.md`: §2, §17, §18 alıcı hücreleri (3 yer) → gönderici `info@fonbridge.com`, sunucu `mail.fonbridge.com`. §21 SMTP satırının adı `mail.fonbridge.com`; kurulum cümlesi `SMTP_FROM`/`NEXT_PUBLIC_SMTP_FROM_ADDRESS` = `info@fonbridge.com`, `SMTP_HOST` = `mail.fonbridge.com`, SPF/DKIM/DMARC `fonbridge.com` için. §22 md.17'ye "Güncelleme (son karar)" cümlesi eklendi; eski gönderici geçersiz diye yazıldı. (§14 haftalık özet kendi satırında alıcı yazmıyor, §21'deki tek SMTP satırından sayılıyor; o satır düzeldi.)
- `docs/kamu/VERI-YERLESIMI.md` → sürüm **1.2**: e-posta satırı ve "kapanması gerekenler" md.3 (sunucu + canlı alan adı).
- `docs/SECURITY_COMPLIANCE.md`: alt işleyici paragrafı (:103) ve silme akışı (:124).
- `docs/legal/HUKUK-SORULARI-2026-09.md` → sürüm **1.11**: değişiklik notu, 1.9 notu, §4.1 (HUKUK-1: canlı alan adı ve gönderici artık belli; başvuru e-postası hâlâ soru), §5 madde 3 (Resend satırı + e-posta sorusu), kanıt satırı. Soruların içeriği değişmedi.
- `docs/kamu/ILKADIM-PILOT.md` (pilot rehberi) R3: `mail.fonbridge.com`, gönderici `info@fonbridge.com`.
- Kod dosyasına dokunulmadı.

### 2. Kanıt
- Önce/sonra sayım (`grep -o … | wc -l`), beş belge:

  | Belge | `info@usfinbridge` önce → sonra | `info@fonbridge.com` | `mail.fonbridge.com` |
  |---|---|---|---|
  | processing-register.md | 8 → 0 | 9 | 6 |
  | VERI-YERLESIMI.md | 2 → 0 | 3 | 3 |
  | SECURITY_COMPLIANCE.md | 2 → 0 | 2 | 2 |
  | HUKUK-SORULARI-2026-09.md | 4 → 0 | 6 | 3 |
  | ILKADIM-PILOT.md | 1 → 0 | 1 | 1 |

- Kalan `usfinbridge` geçişleri (6) yalnız iki türde, bilerek: (a) koddaki gerçek varsayılanın alıntısı — `git show HEAD:src/lib/env.ts` satır 98: ``NEXT_PUBLIC_SMTP_FROM_ADDRESS: z.string().default('noreply@usfinbridge.com')`` (register §21, §22 md.17; HUKUK kanıt satırı), yanında "eski alan adı, kod işi" yazıyor; (b) "önceki `usfinbridge.com` göndericisi geçersiz" notları (register md.17, SECURITY :103, HUKUK 1.11 notu).
- Her değişiklik python `assert s.count(old)==N` ile yapıldı; bir dosyada bir eşleşme tutmazsa o dosya hiç yazılmıyor. İlk koşuda register'da bir sayım (1 yerine 3) tuttu → dosya yazılmadı, sayım düzeltilip yeniden koşuldu.
- `git diff --stat -- docs` (commit öncesi, Vulut işi dahil): 5 dosya, 47+/34-.
- Prettier: HUKUK temiz; ILKADIM-PILOT `HEAD`'de de uyarı veriyordu (önceki raporda ölçüldü), yeni uyarı eklenmedi.

### 3. Değişen dosyalar
docs/legal/processing-register.md · docs/legal/HUKUK-SORULARI-2026-09.md · docs/kamu/VERI-YERLESIMI.md · docs/kamu/ILKADIM-PILOT.md · docs/SECURITY_COMPLIANCE.md · docs/agent-results/TASK-MUN2PNAR729H8-cs-fb.md · docs/agent-results/TASK-MUN2UXWTAX1AQ-cs-fb.md

### 4. Riskler (kod ve runbook hâlâ eski alan adında — bu kartın kapsamı dışında, dokunulmadı)
- `src/lib/env.ts:98` (HEAD) varsayılanı `noreply@usfinbridge.com`. Çalışma ağacında devop-fb'nin commit edilmemiş değişikliği (TASK-MUN2PKA5AG2IV) bunu `info@usfinbridge.com` yapıyor — o da yeni kararla **uyuşmuyor**; `info@fonbridge.com` olmalı.
- `.env.example` (çalışma ağacı, aynı iş): `SMTP_FROM="FonBridge <info@usfinbridge.com>"` → `info@fonbridge.com` olmalı.
- `docs/SMTP-SUNUCU.md` (devop-fb, izlenmeyen dosya): başlık, DNS kayıtları, `SMTP_HOST=mail.usfinbridge.com`, DKIM komutları, Vulut bilet metni hep `usfinbridge.com`. Ölçümler (SPF/DKIM/PTR/Let's Encrypt) `usfinbridge.com` için yapılmış; `fonbridge.com` için DNS ve sertifika **ölçülmedi**. `mail.fonbridge.com`'un A/MX/SPF/DKIM/DMARC ve TLS sertifikası ayrıca doğrulanmalı.
- `docs/legal/privacy-notice-gap-analysis.md` §4.2 ve `src/components/PublicFooter.tsx:135` (`info@usfinbridge.com` gömülü) — ölçüm belgesi/kod, bu kartın dışında.

### 5. Açık sorular
- Başvuru (ilgili kişi) e-postası da `info@fonbridge.com` mı olacak? (HUKUK-1, §4.1 — hukukçu + patron.)

### 6. Sonraki adım
- devop-fb (TASK-MUN2PKA5AG2IV): `env.ts` varsayılanı, `.env.example` ve `docs/SMTP-SUNUCU.md` → `fonbridge.com`; `mail.fonbridge.com` DNS/TLS ölçümü.
- Kod düşünce envanter §21/§22 md.17 ve HUKUK kanıt satırındaki "kod varsayılanı eski alan adında" cümleleri o commit ile kapatılır (cs-fb).
- İnceleme: crw-fb.

**Platform beyanı:** yalnız Markdown değişikliği; kod ve çalışma zamanı yolu yok. Doğrulama macOS'ta (darwin, zsh) grep ve python ile yapıldı. Windows ve Linux'ta koşulacak bir şey yok, çünkü değişen yalnız belge.

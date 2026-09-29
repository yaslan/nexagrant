# TASK-MUN2UXWTAX1AQ — FB BELGE: barındırma kararı (Vulut) + İNCELEME-31 N-1/N-2 (cs-fb)

## 1. Ne yapıldı
Patronun 29.09.2026 kararı belgelere işlendi: barındırma sağlayıcısı **Vulut**. Vulut, BTK lisansıyla çalışan bir yer sağlayıcı ve hosting firması, Türkiye'de. Uygulama sunucusu, Postgres, iş kuyruğu (graphile-worker; `JOBS_DATABASE_URL` verilmezse ana DB) ve kendi SMTP sunucumuz orada koşuyor. Bu karar kod değil, patron kararı. Her yerde öyle yazıldı. BTK lisansı ve verinin Türkiye'de durması patron beyanı; lisans belgesi ve sözleşme repoda yok.

- `docs/legal/processing-register.md`
  - §21: barındırma satırı "Açık — patron belirleyecek" → **Vulut, Türkiye, yer sağlayıcı / veri işleyen, yurt dışı aktarım değil**, DPA **YOK — açık**. SMTP satırında ülke Türkiye oldu.
  - §1: sub-processor cümlesi Vulut'a bağlandı. §2, §17, §18: e-posta alıcı hücreleri "sağlayıcı ve ülke hâlâ açık" → "Vulut, Türkiye". §8, §12: "barındırma sağlayıcısı açık" → Vulut.
  - §22: md.15'in üstü çizildi, "karar verildi" yazıldı; kalan iş DPA. md.17 Vulut'a bağlandı.
  - **N-1** (§2): davet edene dönen token'lı bağlantı akışı yazıldı (`fc763927`): e-posta gitmezse bağlantı `inviteLink` ile davet edene döner. 10 dakikalık bekleme içinde token değişmez, bağlantı dönmez. `email_failed` beklemeyi bitirir.
  - Aynı taramada belgelenmemiş bir commit daha çıktı: `8e74d546`. Bekleme içinde rol değiştirilemez; yanıt `role_change_blocked` olur ve `invitation.role_change_blocked` denetim satırı yazılır (`{from,to}`, adres yok). Bu §2 veri kategorilerine ve alıcı hücresine eklendi.
- `docs/kamu/VERI-YERLESIMI.md` → sürüm **1.1**. "Kısa cevap" yeniden yazıldı: veritabanı Türkiye'de. Yeni bölüm **"Yurt dışına giden akışlar (kalan tek kalemler)"** eklendi. Tabloda Anthropic (YZ metin üretimi), OpenAI (embedding) ve Google OAuth ayrı ve açık yazılı. Her birinin nasıl durduğu da var. Stripe (pilot ücretsiz) ve bölgesi doğrulanmamış R2 ayrıca not edildi. Veritabanı ve e-posta satırları Türkiye oldu. "Taahhüt etmediklerimiz" ve "kapanması gerekenler" md.1 güncellendi.
- `docs/SECURITY_COMPLIANCE.md`
  - Alt işleyici listesi: Vulut (Türkiye) eklendi. Vercel, Neon/Supabase ve Fly.io'nun üstü çizildi. Google eklendi. Yurt dışı kalemler sayıldı.
  - :124 "kendi SMTP'mizden" → tek ifade.
  - :147 "Neon PITR 7 gün" → Neon seçilmedi; Vulut'taki yedekleme belgelenmemiş.
- `docs/legal/HUKUK-SORULARI-2026-09.md` → sürüm **1.9 → 1.10**, değişiklik notu (a) barındırma, (b) N-1 + `8e74d546`, (c) N-2. §5 madde 3'te:
  - "Kalanlar" listesine Vulut eklendi.
  - Barındırma ek görüş sorusu yeniden yazıldı. Hukukçuya kalan soru: **Vulut ile yer sağlayıcı / veri işleyen sözleşmesi (DPA) gerekli mi, gerekirse içinde en az ne olmalı, aydınlatmada adıyla mı kategoriyle mi yazılmalı.**
  - Kanıt satırı ve §8 madde 6'ya 1.10 notu eklendi.
- **N-2**: `docs/kamu/ILKADIM-PILOT.md:157` (R3) envanterdeki tek ifadeye getirildi: "kendi SMTP sunucumuz (gönderici info@; ayrı üçüncü taraf e-posta işleyeni yok, e-posta barındırma sağlayıcısı kapsamında — Vulut, Türkiye)". Yurt dışı akışlar Anthropic, OpenAI ve Google olarak yazıldı.
- Önceki kartın (TASK-MUN2PNAR729H8) staged ama commit edilmemiş sonuç raporu bu commit'e eklendi (kart metni izin veriyor).
- Kod dosyasına dokunulmadı.

## 2. Kanıt
- Kod kayması taraması (hafıza kuralı): `git log --oneline --since="2026-09-29 20:00" -- src`. İNCELEME-31'den sonra davet koduna dokunan commit: `8e74d546` (role_change_blocked). Envanterde yoktu: `grep -c role_change_blocked processing-register.md` → 0 (düzeltme öncesi). Şimdi §2'de.
- Satır numaraları `362ee353`'te `sed -n` ile tek tek doğrulandı:
  - `route.ts:121-135` (rol engeli bloğu), `:138-150` (keepToken upsert), `:187-194` (`role_change_blocked` yanıtı), `:219-230` (`inviteLink` yanıtı).
  - `invitation-mail-policy.ts:22-24` (email_failed beklemeyi bitirir).
  - `env.ts:43-45` (JOBS_DATABASE_URL yoksa DATABASE_URL).
- Bayat ifade taraması (5 belge): `grep -c -E "hâlâ \*\*açık\*\*|açık — patron belirleyecek|henüz belli değil|barındırma sağlayıcısı açık|sağlayıcı ve ülkesi patron belirleyecek"` → 0 / 0 / 0 / 0 / 0. `grep -o -i vulut | wc -l` → 15 / 12 / 10 / 8 / 2.
- Her değişiklik python `assert s.count(old)==N` ile yapıldı (tek eşleşme; §2/§17/§18 için 3, §8/§12 için 2). Hata yok.
- Prettier: 5 dosyadan 4'ü `HEAD`'de de uyarı veriyordu (`git show HEAD:<f> | prettier --check --stdin-filepath`). HUKUK önce ve sonra temiz. Bu iş yeni uyarı eklemedi.
- `git diff --stat -- docs` (commit öncesi): 5 dosya, 45+/32-.

## 3. Değişen dosyalar
- docs/legal/processing-register.md
- docs/legal/HUKUK-SORULARI-2026-09.md
- docs/kamu/VERI-YERLESIMI.md
- docs/kamu/ILKADIM-PILOT.md
- docs/SECURITY_COMPLIANCE.md
- docs/agent-results/TASK-MUN2UXWTAX1AQ-cs-fb.md (bu rapor)
- docs/agent-results/TASK-MUN2PNAR729H8-cs-fb.md (önceki kartın raporu, staged kalmıştı)

## 4. Riskler
- **"Veri Türkiye'de" bir beyan:** Vulut'un BTK lisansı ve veri merkezinin konumu patron beyanıdır. Belgeler bunu "patron kararı/beyanı" diye yazıyor. Pilot görüşmesinden önce Vulut'tan sözleşme ya da hizmet belgesi alınması iyi olur.
- **Gönderici adresi, paralel iş:** çalışma ağacında commit edilmemiş `src/lib/env.ts` ve `.env.example` değişikliği var (varsayılan `noreply@` → `info@`, başka ajan, TASK-MUN2PKA5AG2IV). Commit'e alınmadı. O değişiklik düşünce envanter §21/§22 md.17 ve HUKUK kanıt satırındaki "kod varsayılanı `noreply@`" cümleleri bayatlar; o commit'le birlikte güncellenmeli.
- **DPA şablonları** (`dpa-tr.md`/`dpa-en.md` §7) alt işleyenleri yalnız kategoriyle sayıyor ("e-posta gönderimi" ayrı kategori). E-posta artık barındırma kapsamında. Metin hukukçunun; bu kartta değiştirilmedi.
- Yedekleme: `SECURITY_COMPLIANCE.md:147`'deki Neon PITR iddiası artık doğru değil. Vulut'ta Postgres yedeği tanımlı değil (belgede "belgelenmemiş" yazıyor).

## 5. Açık sorular
- Vulut ile DPA (hukukçu, HUKUK 1.10 §5 madde 3).
- Vulut'ta Postgres yedekleme ve geri yükleme süresi (devop).

## 6. Sonraki adım
- devop-fb: TASK-MUN2PKA5AG2IV commit'i düşünce "kod varsayılanı noreply@" cümleleri kapatılsın (cs-fb, küçük belge işi).
- İnceleme: crw-fb.

**Platform beyanı:** yalnız belge değişikliği; kod ve çalışma zamanı yolu yok. Doğrulama macOS'ta (darwin, zsh) grep, sed ve python ile yapıldı. Windows ve Linux'ta koşulacak bir şey yok, çünkü değişen yalnız Markdown.

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

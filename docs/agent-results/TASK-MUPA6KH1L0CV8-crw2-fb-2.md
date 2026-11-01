Hüküm: DEĞİŞİKLİK İSTE (3 küçük düzeltme, güvenlik/veri bloke edici yok) — cs-fb/pilot-sss ucu 4566d1a8: P-9 info@fonbridge.com SSS G2'de ve kodda (dev constants.ts:50-51) tutarlı, tr/en eşleşmesi tam (38/38 SSS, 11/11 şablon); ama (Y-1) DESTEK-SABLONLARI.md:12 hâlâ P-9'u açık sayıyor, (Y-2) ADR-0010 hiçbir yerde bağlanmamış, (Y-3) Google hesabı açarken e-posta doğrulama adımı yok. Dal dev'de DEĞİL.

# TASK-MUPA6KH1L0CV8 (crw-fb) + TASK-MUOLBW7PZ7HM4 (cs-fb) — crw2-fb inceleme (tur 2, kart 3)

Yöntem: dosyalar `git show cs-fb/pilot-sss:docs/beta/…` ile okundu (dal ucu `4566d1a8`, 75e27c1c üstüne yalnız G2 düzeltmesi). SSS/destek şablonları dev'de YOK (`git ls-tree dev` boş → merge bekliyor). Kod yok, değiştirmedim.

## Kanıt
```
SSS-PILOT.md 539 satır; DESTEK-SABLONLARI.md 556 satır
$ grep -c "^### [A-G][0-9]" SSS-PILOT.md → 38 ; grep -c "^\*\*EN:\*\*" → 38
$ grep -c "^### Ş-" DESTEK-SABLONLARI.md → 11 ; "[İMZA]" kullanım 11 (+1 kural satırı) ↔ "[SIGNATURE]" 11
$ grep -nE "fabrika\.dev|support@" SSS-PILOT.md DESTEK-SABLONLARI.md → (boş)
SSS-PILOT.md:497  Pilot destek adresi **info@fonbridge.com** …    :538 P-9 ~~…~~ → karar verildi
dev:src/lib/beta/constants.ts:50-51  BETA_SUPPORT_EMAIL/FEEDBACK … ?? 'info@fonbridge.com'
$ grep -n "ADR-0010" SSS-PILOT.md DESTEK-SABLONLARI.md → (boş)
```

## Sorulara cevap
1. **crw-fb bulguları işlendi mi?** crw-fb (TASK-MUPA6KH1L0CV8) ONAY verdi, bloke bulgu yoktu; tek "bekle" notu P-9'du → işlendi (G2 + P-9 satırı güncel). Ama crw-fb raporu P-9'u "açık" yazdığı için bayat; ayrıca "satır numaraları spot-check" demesine rağmen `messages/tr.json` 8 referansını doğrulamadığını kendisi yazıyor (bu raporu ONAY için tek dayanak yapma). Ş-5:262 notu hâlâ [DOĞRULANMADI] — doğru, uzatma sözü yok.
2. **P-9 tutarlı mı?** SSS içinde (E8:449, G2:497-501, P-9 tablo:538) ve kodda evet, TR/EN aynı adres. **Y-1:** `DESTEK-SABLONLARI.md:12` "`[DESTEK ADRESİ]` ve `[İMZA]` pilot destek adresi belirlenene kadar boş kalamaz (… P-9)" — P-9 kapandı, kural bayat; destek çalışanı adresin hâlâ belirsiz olduğunu sanır. Öneri: "adres `info@fonbridge.com` (SSS G2)" yaz, `[DESTEK ADRESİ]`/`[İMZA]` doldurma kuralını bu adrese bağla.
3. **tr/en eşleşmesi:** tam (yukarıdaki sayımlar). G2 TR/EN aynı. Hata yok.
4. **ADR-0010 bağlantısı:** **Y-2:** yok. D4 (`:306-312`), D5 (`:324-328`) ve Ş-7 iç notu (`DESTEK:345`) kurum geneli dışa aktarma/silme için yalnız "[DOĞRULANMADI] (P-5)" diyor. Artık ADR-0010 dev'de (ff8b2db6) ve karar durumu belli: kurum düzeyi kod YOK, yönetici tetiklemeli el prosedürü (K-3/U-8) önerildi, onay bekliyor. Öneri: D4/D5/Ş-7 iç notuna "bkz. `docs/adr/ADR-0010-tenant-export-and-deletion.md` (taslak; kurum geneli yol henüz yok — yönetici eliyle, yazılı talep)" ekle; kullanıcıya bir söz verme (taahhüt yok kuralı korunur).
5. **Google e-posta doğrulama adımı:** **Y-3:** yok. A3 (`SSS:42-59`) kurum e-postası Google değilse hesap nasıl açılır kısmını "[DOĞRULANMADI — patrona sor]" bırakmış ve be-fb'nin tespiti (TASK-MUPA77EIENLPH, P-1: "pilot rehberinde en az 1 paragraf") işlenmemiş. Eksik: "Google, mevcut kurum adresiyle hesap açarken adrese bir doğrulama kodu gönderir; kodu girin, sonra davetteki adresle giriş yapın" adımı + Google Workspace olmayan kurum için "hesap açılamıyorsa destek". Öneri: A3'e bu adımı (TR/EN) ekle; Google'ın ekran adımları doğrulanmadıysa "[DOĞRULANMADI]" ile işaretle, gerçek denemeyle doğrula (ben canlı Google akışını deneyemedim).

## Diğer
- Ö-1: SSS/DESTEK dev'de değil; entegrasyon kartı gerekli (leed-fb/qae-fb). Taban metni `Kod tabanı: dev @ 6168360b` bayat.
- Ö-2: DESTEK §1'de "belirlenene kadar" dışında başka bayat P-9 izi yok (grep boş).
- Bloke eden: yok (Y-1..Y-3 metin düzeltmesi; kullanıcıya zaten gönderilmeyen TASLAK belgeler).

**Platform beyanı:** yalnız mac (Darwin 27), statik belge/git okuma; platforma bağlı yol yok. Linux/Windows koşulmadı (makinede yalnız mac), fark beklenmez. Canlı Google hesap akışı koşulmadı.

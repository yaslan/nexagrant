# ADR-0006 — Kalıcı giriş yöntemi: yalnız Google (OAuth)

- **Durum:** **KABUL**, patron kararı
- **Tarih:** 2026-09-29
- **Bağlam:** TASK-MULSCEK4JHK8X ve TASK-MULU7GVFBTRXX (şifresiz Credentials girişi `DEMO_LOGIN_ENABLED` kapısına alındı, üretimde kapalı), B1 davet kodu (TASK-MULRQJQYM0NAM, karar S2-a: kodla kayıtta OAuth gizli), pilot kapısı TASK-MULWCFBTHDYZI
- **Hazırlayan:** LEED-FB · **Karar veren:** patron

## Karar

Üretimde tek giriş yolu Google OAuth'tur (ilk kararda Microsoft Entra ID de vardı; 29.09.2026 ikinci güncellemeyle kaldırıldı, aşağıya bakın). Şifre ya da e-posta bağlantısıyla giriş yoktur. Şifresiz demo girişi (Credentials) yalnız yerel geliştirme ve testte, `DEMO_LOGIN_ENABLED` ile açılır; derleme zamanı kilidi korunur.

## Sonuçlar

- **B1 davet koduyla kayıt:** S2-a ("kod varken OAuth gizli") geçersizdir. Davet kodu OAuth dönüşüne taşınır: kısa ömürlü, httpOnly, imzalı çerez ve B6'daki karne çerezi deseni. Kod kayıt anında tek sefer kullanılır.
- **KVKK:** Kayıt ekranında (OAuth butonlarından önce) aydınlatma, ajans eki ve açık onay kutusu gösterilir. Onay, Consent kaydına belge sürümüyle yazılır (pilot kapısı TASK-MULWCFBTHDYZI).
- **Hesap bağlama:** `allowDangerousEmailAccountLinking` yeniden değerlendirilir. Aynı e-postanın farklı sağlayıcılarla bağlanması yalnız doğrulanmış e-postayla olmalıdır.
- **Anahtarlar:** Gerçek doğrulama için Google ve Entra istemci anahtarları gerekir (patron kartı TASK-MULQM3LFB4KRA).

## Güncelleme (29.09.2026, patron)

İlk aşamada yalnız **Google** açılır. Microsoft Entra kodu kalır ama yapılandırmaya bağlıdır: `AUTH_MICROSOFT_ENTRA_ID_*` anahtarları tanımlı değilse sağlayıcı kaydedilmez ve buton görünmez. Anahtarlar eklendiğinde Entra kod değişikliği olmadan açılır.

## Güncelleme 2 (29.09.2026, patron) — Microsoft girişi kaldırıldı

Microsoft Entra ID ile giriş **kaldırıldı**; tek OAuth sağlayıcısı Google'dır. Yukarıdaki "Entra kodu kalır, anahtar eklenince açılır" notu geçersizdir. Kart: TASK-MUMLFLB2OPLY3.

- **Kod:** `next-auth/providers/microsoft-entra-id` sağlayıcısı `src/lib/auth.ts`'ten, "Microsoft Kurumsal ile Giriş" butonu `src/app/[locale]/login/AuthCard.tsx`'ten, `microsoft` alanı `configuredOAuthProviders` (`src/lib/demo-login.ts`) sonucundan, Entra doğrulanmış-e-posta kuralı (`xms_edov` / `verified_primary_email`) `providerVerifiedEmail`'den (`src/lib/oauth-registration.ts`) çıkarıldı.
- **Anahtarlar:** `AUTH_MICROSOFT_ENTRA_ID_ID` / `AUTH_MICROSOFT_ENTRA_ID_SECRET` artık okunmaz ve `.env.example`'dan silindi. Bir ortamda kalmışlarsa sağlayıcıyı geri getirmezler (`src/lib/auth-callbacks.test.ts` bunu sınar). Patron anahtar kartı (TASK-MULQM3LFB4KRA) yalnız Google izin ekranına daralır.
- **Hesap bağlama:** Aynı e-postayla var olan hesaba bağlanma yalnız Google'ın `email_verified` beyanıyla olur. Tanınmayan her sağlayıcı kimliği (eski `microsoft-entra-id` dahil) "doğrulanmamış" sayılır ve bağlanmaz.
- **Var olan Entra hesapları:** Daha önce Microsoft ile açılmış bir hesap aynı e-postanın Google hesabıyla girebilir (Google adresi doğruluyorsa bağlanır). Google hesabı olmayan kişi için giriş yolu yoktur; pilot öncesi böyle bir kullanıcı yoksa ek iş gerekmez.
- **Kapsam dışı:** Kiracı SSO (SAML / Okta / Entra ID, TASK-MUML0QZAZ5M80) ve Outlook takvim bağlantısı bu karardan etkilenmez; bunlar giriş sağlayıcısı değildir.
- **Diğer belgeler:** KVKK / yurt dışı aktarım metinlerindeki "Google / Microsoft ile giriş" satırları (`docs/kamu/VERI-YERLESIMI.md`, `docs/legal/processing-register.md` vb.) ayrı kartta güncellenir (cs-fb).

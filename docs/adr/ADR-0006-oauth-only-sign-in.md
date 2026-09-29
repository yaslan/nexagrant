# ADR-0006 — Kalıcı giriş yöntemi: yalnız Google ve Microsoft (OAuth)

- **Durum:** **KABUL**, patron kararı
- **Tarih:** 2026-09-29
- **Bağlam:** TASK-MULSCEK4JHK8X ve TASK-MULU7GVFBTRXX (şifresiz Credentials girişi `DEMO_LOGIN_ENABLED` kapısına alındı, üretimde kapalı), B1 davet kodu (TASK-MULRQJQYM0NAM, karar S2-a: kodla kayıtta OAuth gizli), pilot kapısı TASK-MULWCFBTHDYZI
- **Hazırlayan:** LEED-FB · **Karar veren:** patron

## Karar

Üretimde tek giriş yolu Google ve Microsoft (Entra ID) OAuth'tur. Şifre ya da e-posta bağlantısıyla giriş yoktur. Şifresiz demo girişi (Credentials) yalnız yerel geliştirme ve testte, `DEMO_LOGIN_ENABLED` ile açılır; derleme zamanı kilidi korunur.

## Sonuçlar

- **B1 davet koduyla kayıt:** S2-a ("kod varken OAuth gizli") geçersizdir. Davet kodu OAuth dönüşüne taşınır: kısa ömürlü, httpOnly, imzalı çerez ve B6'daki karne çerezi deseni. Kod kayıt anında tek sefer kullanılır.
- **KVKK:** Kayıt ekranında (OAuth butonlarından önce) aydınlatma, ajans eki ve açık onay kutusu gösterilir. Onay, Consent kaydına belge sürümüyle yazılır (pilot kapısı TASK-MULWCFBTHDYZI).
- **Hesap bağlama:** `allowDangerousEmailAccountLinking` yeniden değerlendirilir. Aynı e-postanın farklı sağlayıcılarla bağlanması yalnız doğrulanmış e-postayla olmalıdır.
- **Anahtarlar:** Gerçek doğrulama için Google ve Entra istemci anahtarları gerekir (patron kartı TASK-MULQM3LFB4KRA).

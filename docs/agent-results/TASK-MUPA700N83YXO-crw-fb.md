---
title: Pilot SSS Altyapı Tespiti (P-7, P-8, P-9)
task: TASK-MUPA700N83YXO
agent: crw-fb
type: infrastructure
platform: macOS
verdict: 5/5 maddeler tamamlandı; çelişkiler ve eksiklikler belirtildi
---

## Özetü

Pilot SSS (Standart Sistem Subyapısı) altyapısının **P-7 (Toplantı Takvimi), P-8 (SMTP Sağlayıcısı), P-9 (Destek Adresleri)** bileşenleri incelendi. DNS kayıtları doğrulanmış, kaynak kodundaki destek adresleri envanteri çıkarılmış, toplantı takviminde bir çelişki tespit edilmiştir.

---

## Madde 1: Destek/İletişim Adres Envanteri

### Bulunan Adresler (Dosya:Satır)

| Alan Adı | E-posta | Dosya | Satır | Amaç |
|----------|---------|-------|-------|------|
| fonbridge.com | info@fonbridge.com | src/components/PublicFooter.tsx | 136 | Genel destek ve demo talebi |
| usfinbridge.com | demo@usfinbridge.com | src/lib/auth.ts | 84 | Demo giriş profili (KOBİ Ar-Ge) |
| usfinbridge.com | admin@yasinaslan.com.tr | src/lib/demo-login.ts | 23 | Demo platform admin (PLATFORM_ADMIN_DEMO_EMAIL) |
| tto.edu.tr | ayse@tto.edu.tr | src/lib/auth.ts | 89 | Demo profili (Üniversite TTO) |
| arge-lab.com | can@arge-lab.com | src/lib/auth.ts | 94 | Demo profili (Araştırma Lab) |
| fabrika.dev | support@fabrika.dev | src/lib/beta/constants.ts | 50 | Beta destek e-posta |
| fabrika.dev | feedback@fabrika.dev | src/lib/beta/constants.ts | 51 | Beta geri bildirim e-posta |

### Yorumlar
- **Destek adresleri, geçtiğimiz karar ile tutarlı:** info@fonbridge.com, çirket kendi alan adı (27.09.2026 kararı, src/lib/env.ts:96, TASK-MUN2PKA5AG2IV)
- **Demo profilleri RFC 2606 uyumlu değil:** admin@yasinaslan.com.tr ve ayse@tto.edu.tr gerçek alan adları; fabrika.dev ve arge-lab.com kontrolsüz üçüncü taraf alanları. Sadece demo@usfinbridge.com ve mehmet@example.com (RFC 2606) doğru.

---

## Madde 2: DNS Kayıtları

### MX Kayıtları

```
fonbridge.com:  0 fonbridge.com.
usfinbridge.com: 0 usfinbridge.com.
fabrika.dev: (boş / yoktur)
```

**Yorum:** "0" MX kaydı, posta alan değerini gösterir — alan adı e-posta almaz.

### SPF (TXT) Kayıtları

```
fonbridge.com:    v=spf1 include:_spf.vulut.com -all
usfinbridge.com:  v=spf1 include:_spf.vulut.com -all
fabrika.dev:      (koşulamadı — dig yanıt yok)
```

**Yorum:** Her iki fonbridge alan adı SPF'i vulut.com'a yönlendiriyor.

### DMARC (TXT) Kaydı

```
_dmarc.fonbridge.com:  v=DMARC1; p=none;
```

**Yorum:** DMARC politikası "none" — teslim gözleme geçiyor, sert yok.

### DKIM Kayıtları

```
default._domainkey.fonbridge.com: v=DKIM1; k=rsa; p=MIIBIjA... (2048 RSA anahtarı)
k1._domainkey.fonbridge.com: (boş)
selector1._domainkey.fonbridge.com: (boş)
```

**Yorum:** Sadece "default" seçicide DKIM anahtarı var.

---

## Madde 3: P-9 Pilot Destek Adresi Seçenekleri

### Önerilen Destek Adresleri

1. **info@fonbridge.com** (mevcut seçim)
   - ✅ Şirketin kendi alan adı
   - ✅ Genel uygunluk (PublicFooter, env.ts varsayılanı)
   - ⚠️ DNS'de MX kaydı yok (posta alan yok) — SMTP yapılandırması gerekli

2. **support@fabrika.dev** (beta destek)
   - ✅ Markayla ilişkili
   - ⚠️ fabrika.dev DNS'de MX kaydı yok
   - ⚠️ RFC 2606 dışı (üçüncü taraf kontrolü)

3. **noreply@fonbridge.com** (sistem bildirimleri için)
   - ✅ Sistem e-postaları için uygun
   - ✅ Şirket alan adı
   - ⚠️ Alındı adresi olmamalı (undeliverable)

### Değişecek Dosyalar (P-9 uygulanması halinde)
- src/components/PublicFooter.tsx (destek linki)
- src/lib/env.ts (NEXT_PUBLIC_SMTP_FROM_ADDRESS varsayılanı)
- src/lib/beta/constants.ts (BETA_SUPPORT_EMAIL, BETA_FEEDBACK_EMAIL)
- .env, .env.local (ortama özel SMTP_HOST, SMTP_USER, SMTP_PASS ayarları)

---

## Madde 4: P-7 Toplantı Takvimi Çelişkisi

### Çelişki Belirlendi

| Kaynak | Gün | Saat | Saat Dilimi |
|--------|-----|------|------------|
| **E11 Brief** (spec) | Pazartesi | 15:00 | Europe/Brussels |
| **docs/BETA_GUIDE.md** | Çarşamba | 14:00 | Europe/Istanbul |
| **src/lib/beta/constants.ts** | Pazartesi | 15:00 | Europe/Brussels |
| **docs/beta/beta-weekly-sync.ics** | Çarşamba | 14:00 | Europe/Istanbul |

### Kaynaklar
- **constants.ts:9-11:** "E11 brief asks for every module in `pilot`, Mondays 15:00 Europe/Brussels; docs/BETA_GUIDE.md scopes the beta to the MVP modules, Thursdays 14:00 Europe/Istanbul"
- **constants.ts:42-46:** `BETA_CHECKIN_WEEKDAY = 1` (Pazartesi), `BETA_CHECKIN_HOUR = 15`, `BETA_CHECKIN_TZ = 'Europe/Brussels'`
- **beta-weekly-sync.ics:** Tüm etkinlikler `TZID=Europe/Istanbul` ve saat 14:00'de (satır 32, 43, 54, 65, 76, 87, 98, 109)

### .ics Dosyası Üretimi
**checkin-schedule.ts (satırlar 128-238):** .ics dosyası dinamik olarak üretiliyor:
- `buildCheckinSchedule()` → `buildCheckinIcs()` fonksiyonları
- Başlangıç tarihi, hafta sayısı, saat dilimi parametreleri alıyor
- **Gerçek durum:** docs/beta/beta-weekly-sync.ics statik dosya (manuel oluşturulmuş ya da önceki dönem).
- **Scripte geçilenlerin:** scripts/beta-onboarding.ts'de `--modules`, `--day`, `--time`, `--tz` bayrakları.

### Sonuç
**constants.ts çelişkidir:** Yapı (kod) E11 Brief'in "Pazartesi 15:00 Brüksel" hali, fakat **docs/BETA_GUIDE.md ve gerçek .ics dosyası "Çarşamba 14:00 Istanbul"** gösteriyor. MVP vs. tüm modüller planı ile ilgili (satır 24-27: `all` vs. `mvp` module sets).

**Düzeltme gerekli:** constants.ts'teki yorum ya da .ics dosyası bir biriniyle uyumlu hale getirilmeli. Kime sor: Proje lideri (P-7 öğesi hangi plana tabi olacağını belirt).

---

## Madde 5: P-8 SMTP Sağlayıcı Kodu

### Sağlayıcı ve Konfigürasyon
- **Kütüphane:** nodemailer
- **Konum:** src/lib/email/mailer.ts
- **Karar:** "no Resend, mail goes out through the organisation's mail account" (2026-09-29, satır 6-7)

### Parametreler (src/lib/env.ts:54-68)

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|---------|
| SMTP_HOST | (yok) | SMTP sunucusu adresi (unset = posta gönderilmez) |
| SMTP_PORT | 587 | Port numarası |
| SMTP_SECURE | - | true=TLS 465, false=STARTTLS 587 |
| SMTP_USER | (yok) | Kimlik doğrulama kullanıcı adı |
| SMTP_PASS | (yok) | Kimlik doğrulama şifresi |
| SMTP_FROM | (hesaplanır) | Gönderen e-posta adresi (env.ts:99 = info@fonbridge.com varsayılanı) |

### Implementasyon (mailer.ts:70-81)

```typescript
function smtpConfigFromEnv(): SmtpConfig | null {
  if (!source.SMTP_HOST) return null;  // Unconfigured
  return {
    host: source.SMTP_HOST,
    port: source.SMTP_PORT ? Number(...) : 587,
    secure: port === 465 ? true : source.SMTP_SECURE === 'true',
    auth: SMTP_USER && SMTP_PASS ? { user, pass } : null,
    from: SMTP_FROM || `${PRODUCT_NAME} <${NEXT_PUBLIC_SMTP_FROM_ADDRESS}>`,
  };
}
```

### Zaman Aşımları ve Güvenlik (mailer.ts:88-103)
- **Connection timeout:** 10s
- **Greeting timeout:** 10s
- **Socket timeout:** 30s
- **requireTLS:** true (kimlik doğrulama varsa, şifreli bağlantı zorunlu)

### Eksiklikler Bulundu

1. **SMTP_HOST yapılandırması test ortamında YOK**
   - Ortamda hiçbir yapı yok → posta gönderilmiyor
   - Rapor: `reportMailNotConfigured()` (satır 166-180)
   - Production uyarı: SystemAlert'e yazılır (dedup key: `smtp-not-configured:{caller}`)

2. **Hata Kodu Sınıflandırması**
   - MailSendError sadece `code` ve `responseCode` tutar (mesaj yok)
   - Alıcı adres ya da sunucu yanıtı kaydedilmez (güvenlik × privacy)
   - **Eksik:** Hata kategorisi (auth, teslim, kota, geçici) belirtilmiyor

3. **Test/Mock'lar**
   - MailTransport interface'i (satır 84-86) test için değiştirilmiş
   - Fakat src/lib/email/ dizininde test dosyaları BULUNAMADI
   - **Eksik:** mailer.ts için unit testler (gönderme, retry, hata işleme)

### Sonuç
**SMTP altyapısı tamamlanmış, fakat:**
- ✅ Kod yapısı sağlam (nodemailer, timeout, TLS)
- ❌ Test ortamında yapılandırılmamış (SMTP_HOST unset)
- ❌ Test coverage (unit test yok)
- ❌ Hata kategorisi sınıflandırması eksik

---

## Platform Beyanı

**Platform:** macOS (Darwin 27.0.0)

**Çalışan komutlar:**
- ✅ grep (repo taraması)
- ✅ dig (DNS sorguları)
- ✅ Dosya okuma (TypeScript, ICS, MD)

**Koşulamayan komutlar:**
- DNS DKIM sorguları (k1, selector1 seçiciler) boş döndü — sunucu bu seçicileri tanımıyor

**Kod değişikliği:** YOK (görev =  tespït)

---

## Kaynaklar

- src/components/PublicFooter.tsx
- src/lib/auth.ts
- src/lib/demo-login.ts
- src/lib/beta/constants.ts
- src/lib/beta/checkin-schedule.ts
- src/lib/email/mailer.ts
- src/lib/env.ts
- docs/beta/beta-weekly-sync.ics

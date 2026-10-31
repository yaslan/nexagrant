# nexagrant.com yayın hazırlığı (FO-260)

Bu belge kartın (TASK-MVVMJ9T2LKSJ) hazırlık çıktısıdır. **Bu adımda DNS, VPS ya da posta üzerinde hiçbir yazma yapılmadı.** Tüm Hostinger çağrıları salt-okurdu. Canlıya alma, aşağıdaki ✋ işaretli adımlarda patron onayıyla yapılacak.

Ölçüm tarihi: 31.10.2026. Ölçümü yapan: devop-fb.

---

## 0. Özet

| Konu | Durum | Etki |
|---|---|---|
| Alan adı nexagrant.com | Hostinger'da kayıtlı, Active, transfer kilidi açık değil (is_locked: true) | Hazır |
| VPS (deploy hedefi) | **Hesapta sanal sunucu YOK** (VPS listesi boş) | **BLOKER**: FO-244 paketi bir VPS'i varsayıyor |
| Web barındırma | nexagrant.com şu an paylaşımlı hosting (`addon`, public_html) | Canlıya alımda kapatılacak / yedeklenecek |
| Posta | info@nexagrant.com aktif, SMTP çıkışı açık | Hazır; plan **deneme** (§5) |
| SPF / DKIM | Hostinger kayıtları mevcut ve doğru | Değişiklik gerekmiyor |
| DMARC | `p=none`, rapor adresi yok | Güçlendirme önerisi (§3, patron kararı) |
| fonbridge.com | Squarespace Domains'te kayıtlı, Active; Hostinger'da değil | 301 planı için kayıt sağlayıcısı ayrı (§4) |

---

## 1. Hostinger mevcut durum (salt-okur)

### 1.1 Alan adı (`domains_getDomainDetailsV1`)
- nexagrant.com: `status: Active`, kayıt 2026-10-29, bitiş 2027-10-29.
- Ad sunucuları: `lunar.dns-parking.com`, `solar.dns-parking.com`.
- `is_locked: true`; 60 günlük kilit 2026-12-28'de bitiyor (alan adı transferi için önemli değil, yalnız kayıt bilgisi).

### 1.2 DNS kayıtları (`DNS_getDNSRecordsV1`, nexagrant.com)

| Ad | Tür | Değer | Not |
|---|---|---|---|
| `@` | ALIAS | `nexagrant.com.cdn.hstgr.net.` | Kök alan adı paylaşımlı hosting CDN'ine bağlı |
| `www` | CNAME | `www.nexagrant.com.cdn.hstgr.net.` | Aynı CDN |
| `@` | MX | `5 mx1.hostinger.com.`, `10 mx2.hostinger.com.` | Hostinger posta |
| `@` | TXT | `v=spf1 include:_spf.mail.hostinger.com include:_spf.reach.hostinger.com ~all` | SPF |
| `_dmarc` | TXT | `"v=DMARC1; p=none"` | DMARC, rapor adresi yok |
| `hostingermail-a/b/c._domainkey` | CNAME | `hostingermail-{a,b,c}.dkim.mail.hostinger.com.` | DKIM (posta) |
| `reach-a/b._domainkey` | CNAME | `reach-{a,b}.dkim.reach.hostinger.com.` | DKIM (Hostinger Reach, pazarlama) |
| `autodiscover` | CNAME | `autodiscover.mail.hostinger.com.` | Posta istemci otomatik ayar |
| `autoconfig` | CNAME | `autoconfig.mail.hostinger.com.` | Posta istemci otomatik ayar |
| `ftp` | A | `187.127.237.86` | Paylaşımlı hosting FTP |

Genel çözücü ölçümü (`dig`, aynı gün): `@` A → 92.113.x.x (Hostinger CDN), `www` → CDN, `_dmarc` TXT `v=DMARC1; p=none`, MX → mx1/mx2.hostinger.com.

**Önemli:** Kök alan adında şu an **A kaydı yok**, `ALIAS` var. Caddy'nin Let's Encrypt sertifikası için `nexagrant.com` ve `www` **VPS'in IPv4 adresine A kaydı** ile gösterilmeli (Caddyfile önkoşulu). Bu yüzden canlıya alımda `@` ve `www` kayıtları değişecek (§5, adım 5). Bu değişiklik ✋ onay gerektirir.

### 1.3 Sanal sunucular (`VPS_getVirtualMachinesV1`)
- Liste boş: hesapta VPS yok. FO-244 paketi (`deploy/vps/`, Hostinger KVM 2) bir sunucu varsayıyor. **Patron, sunucu alınmadan canlıya alma yapılamaz** (RUNBOOK §1).

### 1.4 Web barındırma (`hosting_listWebsitesV1`, `agency-hosting_listAgencyPlanWebsitesV1`)
- nexagrant.com: `vhost_type: addon`, `is_enabled: true`, `website_type: other`, kök dizin `/home/u605628300/domains/nexagrant.com/public_html`. Yani site bugün paylaşımlı hostingde yayında.
- Agency Plan sitesi: yok.

### 1.5 Posta (`mail_listOrdersV1`, `mail_listMailboxesV1`)
- Sipariş: `status: active`, **`is_trial: true`**, plan `business_s_free_trial` (Starter Business Email Free Trial), bitiş 2027-10-29.
- Kutu: `info@nexagrant.com`, `status: active`, IMAP/POP/SMTP-in/SMTP-out açık, 2 mesaj, 30 B kullanılmış (2026-10-30 senkronu).
- **Risk:** Deneme planı. Patron ücretli plana geçiş kararını vermeli; aksi halde posta süresi dolunca gönderim durabilir.

---

## 2. Uygulama ayarları (kod tarafı, bu PR'da)

| Dosya | Değişiklik |
|---|---|
| `deploy/vps/.env.prod.example` | `NEXT_PUBLIC_APP_URL=https://nexagrant.com`; SMTP: `smtp.hostinger.com`, `465`, `SMTP_SECURE=true`, `info@nexagrant.com`, `SMTP_FROM="NexaGrant <info@nexagrant.com>"`; `SMTP_PASS` **boş** (sunucu secret store) |
| `.env.example` | Üretim SMTP yorumu 31.10.2026 kararına göre güncellendi (`mail.nexagrant.com` ve `mail.fonbridge.com` kaldırıldı) |
| `deploy/vps/Caddyfile` | Değişiklik yok; zaten `nexagrant.com`, `www` → apex 301, ACME e-posta `info@nexagrant.com` |

**Google OAuth (✋ owner):** Google Cloud konsolunda yetkili yönlendirme URI'lerine `https://nexagrant.com/api/auth/callback/google` ve takvim için `https://nexagrant.com/api/calendar/callback` eklenmeli. Eklenmeden canlıda giriş ve takvim bağlantısı çalışmaz. `.env.example` yorumlarındaki `fonbridge.com` adresleri bu adımdan sonra temizlenecek.

---

## 3. E-posta kimlik doğrulama kayıtları (SPF / DKIM / DMARC)

Gönderim `smtp.hostinger.com` üzerinden yapılacağı için (VPS'in kendi IP'si değil), SPF ve DKIM Hostinger'ın kayıtlarıyla hizalanır.

| Kayıt | Mevcut | Önerilen | Eylem |
|---|---|---|---|
| SPF `@` TXT | `include:_spf.mail.hostinger.com include:_spf.reach.hostinger.com ~all` | Aynı | **Yok** |
| DKIM `hostingermail-{a,b,c}._domainkey` | Mevcut, Hostinger tarafından yönetilir | Aynı | **Yok** |
| DMARC `_dmarc` TXT | `v=DMARC1; p=none` | Aşağıdaki aşama 1 | ✋ patron onayı |

**DMARC aşamalı geçiş önerisi:**
1. Şimdi: `v=DMARC1; p=none; rua=mailto:info@nexagrant.com; adkim=r; aspf=r` (rapor toplamaya başla).
2. 2–4 hafta sonra raporlar temiz ise: `p=quarantine`.
3. Sonra: `p=reject`.

Not: `reach-*` kayıtları Hostinger Reach (pazarlama) içindir. Pazarlama postası gönderilecekse SPF/DKIM zaten kapsanmış.

Doğrulama komutları (salt-okur):
```bash
dig +short TXT nexagrant.com
dig +short TXT _dmarc.nexagrant.com
dig +short CNAME hostingermail-a._domainkey.nexagrant.com
```

---

## 4. fonbridge.com → nexagrant.com 301 planı

**Ölçülen:** fonbridge.com `whois`: Registrar **Squarespace Domains LLC**, ACTIVE, bitiş 2027-09-29, ad sunucuları `lunar.dns-parking.com` / `solar.dns-parking.com`. Hostinger'da kayıtlı değil (`domains_getDomainDetailsV1`: "not registered at Hostinger").

**Açık:** fonbridge.com web trafiğini bugün hangi sunucunun karşıladığı bu ölçümde **belirlenmedi**. `docs/SMTP-SUNUCU.md` Vulut'a işaret ediyor; doğrulanmalı.

**Önerilen yöntem (✋ patron onayı):**
1. Yeni VPS hazır olduktan sonra fonbridge.com ve `www.fonbridge.com` için A kaydı VPS IP'sine yönlenir (kayıt sağlayıcısı Squarespace, panelden değişir).
2. Caddy'ye ayrı blok eklenir (kod değişikliği bu PR'da **yok**, canlıya alımda yapılır):
   ```caddy
   fonbridge.com, www.fonbridge.com {
       redir https://nexagrant.com{uri} permanent
   }
   ```
   `{uri}` yol ve sorgu dizgisini korur (`/giris?x=1` → `https://nexagrant.com/giris?x=1`).
3. Google Search Console'da fonbridge.com mülküne "Adres değişikliği" bildirilir ve nexagrant.com mülkü doğrulanır.
4. Mail: fonbridge.com alan adına ait posta (info@fonbridge.com) bu plandan etkilenmez; posta kayıtları ayrı tutulur.

---

## 5. Canlıya alma runbook'u

✋ = patron onayı gerekir. Diğer adımlar onay gerektirmeyen okuma ya da yerel doğrulamadır.

| # | Adım | Onay | Geri alma |
|---|---|---|---|
| 0 | Patron kararları: VPS satın alma (RUNBOOK §1), K1–K11 (K11 = nexagrant.com onayı), posta planı (deneme → ücretli), DMARC aşaması | ✋ | — |
| 1 | Google OAuth yönlendirme URI'leri eklenir (§2) | ✋ owner | URI'yi kaldır |
| 2 | Yedek: mevcut paylaşımlı site (public_html dosyaları ve veritabanı) Hostinger panelinden alınır | yok (yazmıyor) | — |
| 3 | VPS hazırlanır: RUNBOOK §1–§5 (secret, compose, ops.sh bootstrap, migrasyon) | ✋ sunucu oluşturma | `docker compose down`, veri volume'ü korunur |
| 4 | `deploy/vps/.env.prod` sunucuda doldurulur (chmod 600, SMTP_PASS dahil) | yok | Dosyayı sil |
| 5 | ✋ DNS: `@` ALIAS ve `www` CNAME kayıtları kaldırılır, `@` ve `www` **A** kaydı VPS IP'si olur. **Eski değerleri kaydet:** `@ ALIAS nexagrant.com.cdn.hstgr.net.`, `www CNAME www.nexagrant.com.cdn.hstgr.net.` | ✋ | Eski kayıtları geri yaz (ALIAS ve CNAME) |
| 6 | Caddy sertifika alır. Doğrulama: `curl -sI https://nexagrant.com` → 200; `curl -sI https://www.nexagrant.com` → 301 → apex | yok | DNS geri alma (adım 5) |
| 7 | SMTP testi (parola komut satırına yazılmaz; swaks parolayı sorar): `swaks --to <test-adresi> --server smtp.hostinger.com --port 465 --tls-on-connect --auth LOGIN --auth-user info@nexagrant.com --tls-verify` | yok | — |
| 8 | Uygulama deneme postası (/admin ekranı) | yok | — |
| 9 | ✋ fonbridge.com A kaydı VPS'e + Caddy 301 bloğu (§4) | ✋ | A kaydını eski değere döndür |
| 10 | İzleme: `docker logs fonbridge-web`, `GET /` 200, SystemAlert ekranı, ilk 48 saat `docker stats` | yok | — |
| 11 | HSTS: RELEASE_CHECKLIST §5.4'e göre önce `max-age=300` | ✋ patron | Caddyfile satırını sil |

**Geri alma özeti:** DNS kayıtları eski değerlerine döner (kısa TTL 300 olduğundan etki dakikalar içinde görünür). Paylaşımlı site kapatılmadan önce yedeklenmiş olduğu için içerik kaybı yok. VPS durdurulur, veri korunur.

---

## 6. Açık kararlar (patron)

1. **VPS:** FO-244 paketi bir KVM 2 sunucu gerektiriyor; hesapta yok. Satın alınacak mı?
2. **Posta planı:** Deneme planı 2027-10-29'da bitiyor. Ücretli plana geçilecek mi?
3. **DMARC:** Aşama 1 (`p=none` + rapor) şimdi uygulansın mı?
4. **fonbridge.com:** Bugün hangi sunucuda? (ölçülmedi; Vulut ise A kaydı değişikliği orada yapılır)
5. **K11:** Kart, sitenin fonbridge.com'dan nexagrant.com'a taşınmasını istiyor; RUNBOOK §10 K11 (alan adı kararı) bu onayla kapatılacak mı?

---

## 7. Bu adımda yapılmayanlar

- DNS kaydı oluşturma, değiştirme, silme: **yok**.
- VPS oluşturma, yeniden başlatma, kurulum: **yok**.
- Posta kutusu, yönlendirici, parola değişikliği: **yok**.
- Canlıya alma: **yok**.
- Hiçbir şifre, token veya API anahtarı repoya ya da bu belgeye yazılmadı.

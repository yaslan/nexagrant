# ENV-LISTESI — Supabase ve cPanel Ortam Değişkenleri

## Genel Bakış

Bu belge, FONBRIDGE uygulamasının **cPanel Passenger ortamında** çalışması için gerekli ortam değişkenlerini ve bunların nereye ayarlanacağını açıklar.

---

## 1. Temel Uygulamalar Ayarları

### APP_URL (NextAuth.js — kritik)

**Anahtar:** `AUTH_URL`  
**Değer:** `https://fonbridge.com` (canlı) veya `http://localhost:3000` (geliştirme)

**Amaç:** NextAuth.js tarafından davet linklerinde, şifre sıfırlama ve e-posta bağlantılarında kullanılan kanonik host.

**Neden önemli:** cPanel Passenger'da proxy arkasında çalıştığında, `Request.headers.host` proxy'nin adresini içerir (ör. `192.168.1.50`). Bu AUTH_URL ile eşleşmez ve NextAuth callback başarısız olur.

**Ayarlanması:**
- cPanel → Passenger App Environment Variables → `AUTH_URL=https://fonbridge.com`

---

## 2. Veritabanı Bağlantısı (Supabase)

### Supabase Proje Kimliği

**Anahtar:** `SUPABASE_PROJECT_URL`  
**Değer:** `https://opvobbulkmoemmuukpgm.supabase.co`

Proje admin paneline erişim için kullanılır (TypeScript client, API).

---

### Uygulama Rolü ve Şifresi (DATABASE_URL)

**Anahtar:** `SUPABASE_APP_URL`  
**Değer şablonu:**
```
postgresql://fabrika_app:PAROLA@POOL_ADDRESI:5432/postgres?sslmode=require&sslrootcert=/app/certs/supabase-prod-ca-2021.crt
```

**Parçaları:**

| Parça | Değer | Açıklama |
|-------|-------|----------|
| Kullanıcı | `fabrika_app` | Supabase DB Users panelinde tanımlı uygulama rolü |
| Parola | `[SUPABASE_APP_URL'den çıkar]` | Supabase panelinde Password Generator → fabrika_app rolü için oluşturulan şifre |
| Host | `aws-0-eu-west-1.pooler.supabase.com` | Supabase Session Pooler (PgBouncer), IPv4 adresi |
| Port | `6543` | Session pooler port |
| Veritabanı | `postgres` | Varsayılan Supabase VT adı |
| SSL | `sslmode=require` | TLS **şart** (Supabase enforces this) |
| CA Sertifikası | `/app/certs/supabase-prod-ca-2021.crt` | Supabase CA sertifikası dosyası (absolute path) |

**Örnek (gerçek değerlerle değiştirilmeli):**
```
postgresql://fabrika_app:g1p2d0q9xK1@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require&sslrootcert=/app/certs/supabase-prod-ca-2021.crt
```

**Ayarlanması:**
- cPanel → Passenger App Environment Variables → Variable name: `SUPABASE_APP_URL`, Value: `postgresql://...`
- Veya: Dockerfile/deployment script'te `export SUPABASE_APP_URL=...`

---

### Supabase Proje Şifresi (Admin)

**Anahtar:** `SUPABASE_PROJECT_PASSWORD`  
**Değer:** Supabase panelinde (Database Settings → Connection info → postgres password)

**Amaç:** Yönetim görevleri, backup, migration sırasında.

**Ayarlanması:**
- cPanel Environment Variables → `SUPABASE_PROJECT_PASSWORD=...`

---

## 3. TLS Sertifikası

### CA Sertifikası Dosyası

**Yol:** `/app/certs/supabase-prod-ca-2021.crt`

**İçerik:** Supabase'in Let's Encrypt CA sertifikası.

**Neden gerekli:** Supabase session pooler'a bağlantı TLS ile korumalı; sertifikayı doğrulamak için CA chain lazım.

**Nasıl al:**
```bash
# Lokal olarak indir
curl -o supabase-prod-ca-2021.crt https://letsencrypt.org/certs/2024/rsa_root_x1.pem

# Veya Supabase guide'ından kopyala
# https://supabase.com/docs/guides/database/ssl-enforcement
```

**cPanel'de yerleştir:**
```bash
/home/fonbridge/fonbridge-app/certs/supabase-prod-ca-2021.crt
```

**Dosya izinleri:**
```bash
chmod 644 /app/certs/supabase-prod-ca-2021.crt
```

**DATABASE_URL'de:** `sslrootcert=/app/certs/supabase-prod-ca-2021.crt` (trailing space OLMAMALI)

---

## 4. Common Hataları ve Çözümleri

### Hata: ENETUNREACH 2a05:d018

**Semptom:**
```
Error: connect ENETUNREACH 2a05:d018:…:5432
```

**Nedenler:**
- DATABASE_URL IPv6-only Supabase host'u işaret ediyor (`db.<ref>.supabase.co`)
- cPanel sunucusunun IPv6 yönlendirmesi kapalı

**Çözüm:**
- DATABASE_URL'de `aws-0-eu-west-1.pooler.supabase.com` (IPv4-compatible) kullan
- `db.<ref>.supabase.co` değil, **Pooler** host adresini kullan

**Doğru URL'nin parçaları:**
```
Host: aws-0-eu-west-1.pooler.supabase.com
Port: 6543 (pooler port)
```

---

### Hata: ENOENT — Trailing Space

**Semptom:**
```
Error: ENOENT: no such file or directory, open '/app/certs/supabase-prod-ca-2021.crt '
(note: trailing space in filename)
```

**Neden:**
- `sslrootcert=...` değeri sonda boşluk karakteri içeriyor

**Çözüm:**
- Ortam değişkenini tırnak içine alın:
  ```bash
  export SUPABASE_APP_URL="postgresql://fabrika_app:...sslrootcert=/app/certs/supabase-prod-ca-2021.crt"
  ```
- cPanel değişken değerini kopyalarken trailing whitespace kontrol edin
- Shell betiğinde `"$VAR"` ile tırnak içine alın

---

### Hata: P1000 — fabrika_app Rolü Yetkisi

**Semptom:**
```
Authentication failed against the database server, the provided database credentials for fabrika_app are not valid
(P1000 error)
```

**Nedenler:**
1. `fabrika_app` rolüne login yetkisi yok
2. Parola yanlış
3. Rol silinmiş veya disabled

**Çözüm:**

**Adım 1:** Supabase panelinde kontrol et
- SQL Editor → Çalıştır:
  ```sql
  SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = 'fabrika_app';
  ```
- Beklenen sonuç: `fabrika_app | t` (t = true)

**Adım 2:** Rol oluştur (eğer yoksa)
```sql
-- Supabase Dashboard'da Database → SQL Editor
CREATE ROLE fabrika_app WITH LOGIN PASSWORD 'NEW_PASSWORD';
GRANT CONNECT ON DATABASE postgres TO fabrika_app;
GRANT USAGE ON SCHEMA public TO fabrika_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fabrika_app;
```

**Adım 3:** Parolayı doğrula
- Supabase dashboard → Database → Users → fabrika_app → Reset Password
- Yeni parolayla DATABASE_URL'yi güncelle

---

## 5. Yorum ve Doğrulama

### Bağlantıyı Test Et

```bash
# cPanel'de SSH session'u veya app shell'de
export DATABASE_URL="postgresql://fabrika_app:PAROLA@..."
psql "$DATABASE_URL" -c "SELECT 1;" 

# Beklenen sonuç:
# ?column?
# -------
#        1
```

### PostgreSQL Sertifikasını Doğrula

```bash
# Sertifika zinciri kontrol et
openssl s_client -connect aws-0-eu-west-1.pooler.supabase.com:6543 \
  -CAfile /app/certs/supabase-prod-ca-2021.crt
```

---

## 6. İlgili Dosyalar

- `KURULUM.md` §3: Canlı ortama uygulama adımları
- `prisma/migrations/add-blog-post.sql`: BlogPost tablosu migration
- `scripts/apply-migrations.sh`: Migration uygulama betiği
- Supabase guide: https://supabase.com/docs/guides/database/ssl-enforcement

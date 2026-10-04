# KURULUM — FONBRIDGE Canlı Ortama Geçiş (cPanel Passenger)

## Genel Bakış

Bu belge, FONBRIDGE uygulamasını Supabase canlı ortamında **cPanel Passenger**'de çalışır duruma getirilmesi için gerekli adımları açıklar.

---

## 1. Ön Koşullar

- cPanel hesabı (Passenger Node.js App desteğiyle)
- Supabase proje (URL, admin şifresi, fabrika_app rolü)
- Domain adı ve SSL sertifikası
- GitHub repo deployment token (webhooks)

---

## 2. NextAuth.js Kurulumu (AUTH_URL)

**Kritik:** Proxy arkasında AUTH_URL olmaksızın NextAuth callback başarısız olur.

### Adım 1: cPanel'de AUTH_URL Ortam Değişkeni Ayarla

1. cPanel → **Node.js App Manager** → Select your app → **Environment Variables**
2. Yeni değişken ekle:
   - **Variable name:** `AUTH_URL`
   - **Value:** `https://fonbridge.com`
3. **Save** → Uygulama yeniden başlatılır

### Adım 2: NextAuth Konfigürasyonu Doğrula

`next-auth.config.ts` içinde:
```typescript
export const authConfig = {
  providers: [
    Credentials({...}),
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    // AUTH_URL otomatikman NextAuth callback URL'sine eklenir
  },
};
```

**Doğrulama:**
- Tarayıcıda `https://fonbridge.com/auth/signin` açın
- Google login butonu görmeli → tıklayınca `/auth/callback/google` redirect etmeli
- Başarılı login: `/tr` sayfasına yönlendirilir

---

## 3. Veritabanı Bağlantısı (Supabase)

### Adım 3.1: DATABASE_URL (SUPABASE_APP_URL) Ayarla

1. cPanel → Node.js App Manager → Environment Variables
2. Yeni değişken ekle:
   - **Variable name:** `SUPABASE_APP_URL` (veya `DATABASE_URL`)
   - **Value:** `postgresql://fabrika_app:PAROLA@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require&sslrootcert=/app/certs/supabase-prod-ca-2021.crt`

**Parçaları (ENV-LISTESI.md'ye bakın):**

| Bölüm | Değer |
|-------|-------|
| Kullanıcı | `fabrika_app` |
| Parola | Supabase panelinden Reset Password → oluştur |
| Host | `aws-0-eu-west-1.pooler.supabase.com` |
| Port | `6543` |
| SSL | `sslmode=require` |
| CA cert | `/app/certs/supabase-prod-ca-2021.crt` |

### Adım 3.2: Sertifikayı Yükle

1. Lokal olarak sertifikayı indir:
   ```bash
   curl -o supabase-prod-ca-2021.crt \
     "https://letsencrypt.org/certs/2024/rsa_root_x1.pem"
   ```

2. cPanel File Manager veya SFTP aracılığıyla upload et:
   ```
   /home/fonbridge/public_html/certs/supabase-prod-ca-2021.crt
   ```
   Veya Passenger startup file'da `/app/certs/`:
   ```
   /app/certs/supabase-prod-ca-2021.crt
   ```

3. Dosya izinlerini ayarla:
   ```bash
   chmod 644 /app/certs/supabase-prod-ca-2021.crt
   ```

### Adım 3.3: Bağlantıyı Test Et

SSH veya cPanel Terminal üzerinden:
```bash
# DATABASE_URL'yi ayarla
export SUPABASE_APP_URL="postgresql://fabrika_app:PAROLA@..."

# Bağlantı testini çalıştır
psql "$SUPABASE_APP_URL" -c "SELECT version();"
```

**Beklenen:** PostgreSQL sürüm bilgisi döner.

**Hataları gördüyseniz:** ENV-LISTESI.md §4'teki hatalar ve çözümlere bakın.

---

## 4. Node.js Uygulaması Startup

### Adım 4.1: package.json Kontrol Et

Passenger şu scriptleri bekliyorku build ve start:
```json
{
  "scripts": {
    "build": "next build",
    "start": "node server.js"
  }
}
```

### Adım 4.2: server.js (Custom Server) — İsteğe Bağlı

Eğer özel middleware (rate limiting, logging) lazımsa:
```javascript
// server.js
const { createServer } = require('http');
const next = require('next');

const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res);
  }).listen(3000, () => {
    console.log('FONBRIDGE running on :3000');
  });
});
```

### Adım 4.3: Passenger Startup

cPanel Node.js App Manager:
1. Select your app
2. **Startup script:** `server.js` (veya `node_modules/.bin/next start`)
3. **Node.js version:** 20+ (LTS)
4. **Save**

Uygulama yeniden başlatılır.

---

## 5. Migrations ve Veritabanı Schema

### Adım 5.1: Prisma Migrations Kontrol Et

Canlıda `_prisma_migrations` sistem tablosu varsa:
```bash
psql "$SUPABASE_APP_URL" -c "SELECT migration FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"
```

**Eğer tablo yoksa:** Manual migration yönetimi kullanılıyor (scripts/apply-migrations.sh).

### Adım 5.2: Uygulamak Lazım Olan Migrations

Şu migrations uygulanmalıdır:
```bash
# Local'da kontrol et
ls prisma/migrations/ | sort

# Canlıda uygulanmış olanları kontrol et
psql "$SUPABASE_APP_URL" -c "SELECT count(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';"
```

**Beklenen:** Canlı 75 tablo → geliştirme 76 tablo (BlogPost eksiği)

---

## 6. add-blog-post Migration — KRITIK

**Görev:** Canlı Supabase'e `add-blog-post.sql` uygulamak

### Adım 6.1: Yedek Al

Supabase panelinde:
1. Settings → Backups → **Manual backup**
2. Veya: Point-in-Time Recovery (PITR) etkin mi kontrol et

### Adım 6.2: Migration Uygula

**Yöntem 1: psql (Doğrudan)**
```bash
# Canlı ortamdan
export SUPABASE_APP_URL="postgresql://fabrika_app:PAROLA@..."
psql "$SUPABASE_APP_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/add-blog-post.sql
```

**Yöntem 2: scripts/apply-migrations.sh**
```bash
bash scripts/apply-migrations.sh add-blog-post.sql
```

### Adım 6.3: Doğrula

Migration başarılı mı:
```bash
psql "$SUPABASE_APP_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
```

**Beklenen:** 76 (75 → 76'ya yükselme)

Blog tablosunun yapısını kontrol et:
```bash
psql "$SUPABASE_APP_URL" -c "\d \"BlogPost\""
```

**Beklenen:**
- id, slug (unique), title, excerpt, content, category, readTime, publishedAt, authorName, authorRole, authorAvatar, image, featured, createdById, createdAt, updatedAt
- Indexes: BlogPost_slug_key, BlogPost_publishedAt_idx

---

## 7. Uygulama Testleri

### Adım 7.1: Endpoint Test

```bash
# Tarayıcıda veya curl ile
curl -I https://fonbridge.com/tr/blog

# Beklenen: 200 OK (hiç blog yazısı seeded değilse)
# Beklenmeyen: 500 Internal Server Error
```

### Adım 7.2: Admin Blog Editörü

1. `https://fonbridge.com/admin/blog` açın (platform admin gerekli)
2. **New Post** tıkla
3. Başlık, content, category vs. gir → **Publish**
4. Veritabanında INSERT yapılmalı (BlogPost tablosu)
5. `/tr/blog` sayfasında yazı görünür

---

## 8. Lokal Geliştirmede Test

Lokal'da canlı schema'yı test et (PostgreSQL gerekli):
```bash
# .env
DATABASE_URL=postgresql://fabrika:fabrika@localhost:5433/fabrika

# add-blog-post.sql'yi lokal'a uygula
psql "$DATABASE_URL" -f prisma/migrations/add-blog-post.sql

# Blog endpoint test
npm run dev
# Tarayıcıda: http://localhost:3000/tr/blog
```

---

## 9. Geri Alma (Rollback)

Acil durum:
```bash
export SUPABASE_APP_URL="postgresql://fabrika_app:PAROLA@..."

# BlogPost tablosunu sil
psql "$SUPABASE_APP_URL" -f prisma/migrations/add-blog-post.down.sql

# Verifikasyon
psql "$SUPABASE_APP_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
# Beklenen: 75
```

**Ya da:** Supabase panelinde Point-in-Time Recovery ← Backup tarihini seçin

---

## 10. BlogPost Migration — Hatalar ve Çözümler

### Hata 1: "relation 'BlogPost' already exists"

**Nedeni:** Migration önceden çalıştırılmış (idempotent değilse)

**Çözüm:** `IF NOT EXISTS` kontrolü vardır; tekrar çalıştırmak güvenlidir.

### Hata 2: "fabrika_app role doesn't have permission"

**Nedeni:** Schema migration grant'ı başarısız olmuş

**Çözüm:**
```sql
-- Supabase SQL Editor
GRANT SELECT, INSERT, UPDATE, DELETE ON "BlogPost" TO fabrika_app;
```

### Hata 3: Bağlantı hataları (IPv6, timeout, sertifika)

**Bakın:** ENV-LISTESI.md §4

---

## 11. Monitoring ve Logging

### Hata Logları

Supabase → Database → Logs → Connections:
- Connection errors (ENETUNREACH, timeout)
- Query errors (permission, syntax)

### Sentry Integration

Eğer SENTRY_DSN ayarlandıysa:
```bash
cPanel → Node.js App → Environment Variables → SENTRY_DSN=...
```

Hata logları Sentry'ye gönderilir.

---

## 12. İlgili Belgeler

- `ENV-LISTESI.md`: Tüm ortam değişkenleri ve hata çözümleri
- `prisma/migrations/add-blog-post.sql`: Migration SQL
- `scripts/apply-migrations.sh`: Migration uygulama betiği
- `scripts/rls-models.ts`: SYSTEM_WIDE model tanımı (BlogPost referansı)

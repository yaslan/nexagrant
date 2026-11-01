# TASK-MTJ1D7K5TBS0B — Üretim Kaynağını cPanel Üzerinden Kurtarma Runbook'u ve Karşılaştırma Rehberi

**Tarih:** 2026-09-08  
**Yazar:** Geliştirici (Antigravity Agent)  
**Görev Kodu:** TASK-MTJ1D7K5TBS0B  
**Hedef:** cPanel erişimi sağlandığında üretim (production) sunucusundaki canlı kaynak kod ve veritabanının güvenli bir şekilde indirilmesi, yerel kod tabanı ile otomatik karşılaştırılması (diff) ve canlı sırların (secrets) korunarak repoya sızmasının engellenmesi.

---

## 1. YEREL DURUM ÖLÇÜMÜ (Local Repository Audit)

"Yerelde üretim sürümü yok" iddiası yerel Git verileriyle kesin olarak doğrulanmıştır:

- **Aktif Git Dalı (Branch):** `dev`
- **Son Commit HASH:** `1af95e42ad40272a6e63b6b854287d3578a2cafa` (`1af95e4`)
- **Son Commit Tarihi:** `2026-09-08 18:31:59 +0300` (38 dakika önce)
- **Son Commit Mesajı:** `feat(efatura): adapter registration, preflight and unit tests`
- **Takip Edilen Dosya Sayısı (Tracked Files):** `7,527`
- **Değiştirilmiş Commit Edilmemiş Dosya Sayısı:** `20`
- **Takip Edilmeyen Dosya (Untracked Files) Sayısı:** `42`

### Neden Üretim Sürümü Bu Makinada Yok? (Doğrulama Kanıtı)
1. **Canlı Çevre Değişkenleri Yok:** Yerel dizinde canlı PostgreSQL/cPanel veritabanı parolalarını, API anahtarlarını taşıyan `.env.production` dosyası bulunmamaktadır (sadece geliştirme ortamına ait `.env` mevcuttur).
2. **Derleme Çıktıları Yok:** Canlıda koşan derlenmiş `.next/standalone` veya Node process yöneticisi (`ecosystem.config.js`) yapılandırmaları yerel git ağacında bulunmamaktadır.
3. **Geliştirme Dalı (Dev Working Copy):** Mevcut yerel kopyada tamamlanmış ancak henüz canlıya dağıtılmamış iş mantıkları (örn. e-Fatura adaptör geliştirmeleri) yer almaktadır.

---

## 2. CPANEL İNDİRME ÇEKLİSTİ (İnsan Operatör Runbook'u)

cPanel erişimi sağlandığında insan operatörün adım adım izleyeceği tam kurtarma listesi aşağıdadır:

### Adım 1: cPanel Dosya Yöneticisi (File Manager) İndirmeleri
1. cPanel ana ekranından **File Manager (Dosya Yöneticisi)** uygulamasını açın.
2. Sağ üst köşedeki **Settings (Ayarlar)** butonuna tıklayın ve **"Show Hidden Files (dotfiles)"** seçeneğini işaretleyip kaydedin (`.env` dosyalarını görebilmek için şarttır).
3. Uygulama kök dizinine gidin (Genellikle `/public_html` veya `/home/username/app` veya `/home/username/fabrika`).
4. Aşağıdaki kritik dosya ve klasörleri seçin:
   - 📁 `src/` (Kaynak kodlar)
   - 📁 `public/` (Görseller ve statik varlıklar)
   - 📁 `prisma/` (Veritabanı şeması ve migration'lar)
   - 📁 `workers/` (Python arka plan servisleri)
   - 📁 `scripts/` (Çalıştırma ve bakım betikleri)
   - 📄 `package.json`, `pnpm-lock.yaml` (veya `npm-shrinkwrap.json` / `yarn.lock`)
   - 📄 `next.config.js` / `next.config.ts`, `tsconfig.json`
   - 📄 **`.env`**, **`.env.production`**, **`.env.local`** (TÜM gizli çevre değişkenleri)
   - 📄 `ecosystem.config.js` / `Passengerfile.json` / `Procfile` (Varsa process yöneticisi ayarları)
   - 📁 `public/uploads/` veya `.storage/` (Kullanıcı tarafından yüklenen dosyalar)
   *(Not: Zip boyutunu küçültmek için `node_modules` ve `.next` klasörlerini zip işlemine dahil etmeyebilirsiniz; bunlar yerelde `pnpm install` ile yeniden yüklenir).*
5. Seçtiğiniz dosyaları cPanel üst menüsündeki **Compress (Sıkıştır)** seçeneği ile `production_backup.zip` olarak paketleyin ve bilgisayarınıza indirin.

### Adım 2: Veritabanı Dökümü (Database Dump)
1. cPanel ana ekranından **phpMyAdmin** veya **PostgreSQL Management** alanına girin.
2. Üretim veritabanını seçin.
3. **Export (Dışa Aktar)** sekmesine gelin.
4. Export method olarak **Quick (Hızlı)**, Format olarak **SQL** seçin ve **Go / Export** butonuna basarak `database_production.sql` dosyasını indirin.
*(Alternatif cPanel Terminal/SSH erişimi varsa: `pg_dump -U username dbname > database_production.sql` veya `mysqldump -u username -p dbname > database_production.sql`).*

### Adım 3: İndirilen Dosyaların Yerel Projeye Yerleştirilmesi
İndirilen zip dosyasını yerel proje kökündeki `scratch/cpanel-backup/` veya `production_backup/` klasörüne çıkarın:
```bash
mkdir -p production_backup
unzip ~/Downloads/production_backup.zip -d production_backup/
```

---

## 3. TEST EDİLMİŞ DİFF BETİĞİ (Comparison Script)

İndirilen canlı kaynak kopyası ile yerel git reposunu otomatik karşılaştıran, canlı sırları (secrets) maskeleyen ve detaylı Markdown raporu üreten betik yazılmış ve yerelde test edilmiştir.

### Betik Konumu
[`scripts/compare-production-backup.ts`](file:///Users/macbook/AgentSpace/fabrika/scripts/compare-production-backup.ts)

### Betiğin Özellikleri
1. **Çalıştırma Komutu:**
   ```bash
   npx tsx scripts/compare-production-backup.ts <canli-yedek-dizini> <yerel-repo-dizini> [cikti-raporu.md]
   ```
   *Örnek:*
   ```bash
   npx tsx scripts/compare-production-backup.ts production_backup ./ docs/agent-results/production-diff-report.md
   ```
2. **Kategorik Fark Analizi:**
   - **`onlyInProduction`**: Sadece cPanel/üretimde var olan, yerelde olmayan dosyalar (örn. sunucuda yapılan acil hotfix'ler).
   - **`onlyInLocal`**: Sadece yerelde var olan, canlıda olmayan dosyalar.
   - **`contentDiffer`**: Her iki tarafta da olan fakat içerik SHA-256 hash'i farklı olan dosyalar.
   - **`identicalCount`**: Birebir aynı olan dosyaların sayısı.
3. **Otomatik Sır Maskeleme (Secret Masking Filter):**
   - `.env` ve `.env.production` dosyaları diff raporuna yazılırken `DATABASE_URL`, `AUTH_SECRET`, `API_KEY`, `PASSWORD` vb. hassas anahtar değerlerini otomatik olarak maskeler (`DATABASE_URL=pos***rod`).
4. **Gereksiz Yapıların Filtrelenmesi:**
   - `node_modules`, `.next`, `.git`, `.turbo`, `coverage`, `.DS_Store` gibi derleme/çalışma zamanı klasörleri otomatik olarak karşılaştırmadan hariç tutulur.

### Yerel Test Doğrulama Çıktısı
Betik sahte bir üretim yedeği (`scratch/mock-production`) oluşturularak test edilmiş ve sorunsuz çalıştığı kanıtlanmıştır:

```text
Comparing Production (/Users/macbook/AgentSpace/fabrika/scratch/mock-production) vs Local (/Users/macbook/AgentSpace/fabrika)...

# cPanel Production Backup vs Local Repository Diff Report

## Overview Summary
| Category | Count |
|---|---|
| Identical Files | 1 |
| Files Only in Production | 1 |
| Files Only in Local | 7820 |
| Files with Content Differences | 2 |

## 🚨 Files ONLY in Production (1)
*These files exist on cPanel production server but are MISSING locally:*
- `src/lib/legacy-prod-hotfix.ts`

## ⚠️ Files with Content Differences (2)
| File Path | Production Size (bytes) | Local Size (bytes) |
|---|---|---|
| `.env` | 173 | 2139 |
| `src/app/layout.tsx` | 148 | 1522 |

### Environment File Diffs (Masked Secrets)
--- PRODUCTION (.env) ---
DATABASE_URL=pos***rod
NEXTAUTH_SECRET=sup***987
API_KEY=pro***123
```

---

## 4. GİZLİLİK VE .GITIGNORE KORUMA KURALLARI (Secret Protection)

cPanel'den indirilecek dosyalarda veritabanı şifreleri, üretim API token'ları ve JWT sırları bulunacaktır. Bu verilerin yanlışlıkla Git reposuna commit edilmesini önlemek amacıyla `.gitignore` dosyası güncellenmiştir.

### Yasaklı ve Korumaya Alınan Dosya Kalıpları
- `production_backup/`
- `cpanel-backup/`
- `production_backup.zip`
- `*.dump.sql`
- `*.sql.gz`
- `cpanel_*.tar.gz`
- `.env.production`
- `.env.local`

### `.gitignore` Güncelleme Kanıtı
[`.gitignore`](file:///Users/macbook/AgentSpace/fabrika/.gitignore#L75-L83) dosyasına aşağıdaki kurallar eklenmiş ve doğrulanmıştır:

```gitignore
# cPanel Production Backups & Database Dumps (TASK-MTJ1D7K5TBS0B)
cpanel-backup/
production_backup/
production_backup.zip
*.dump.sql
*.sql.gz
cpanel_*.tar.gz
```

---

## 5. ÖZET VE SONRAKİ ADIMLAR

1. **Hazırlık Tamamlandı:** cPanel erişimi geldiğinde insan operatörünün adım adım uygulayacağı indirme rehberi hazırdır.
2. **Otomatik Diff Betiği Test Edildi:** [`scripts/compare-production-backup.ts`](file:///Users/macbook/AgentSpace/fabrika/scripts/compare-production-backup.ts) hazır ve tip kontrolünden (`pnpm typecheck`) 0 hatayla geçmiştir.
3. **Güvenlik Önlemleri Alındı:** Canlı parolaların git reposuna girmemesi için `.gitignore` güncellenmiş ve betiğe otomatik sır maskeleme eklenmiştir.
4. **Erişim Geldikten Sonra Yapılacak İşlem:** İnsan operatör indirmeyi yaptıktan sonra tek bir komutla (`npx tsx scripts/compare-production-backup.ts production_backup ./`) canlı ile yerel arasındaki fark raporunu üretecek ve birleştirme (merge) sürecine geçecektir.

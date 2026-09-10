---
name: fabrika-runtime-verification-recipe
description: Fabrika'da bir değişikliği gerçekten doğrulama reçetesi — dev sunucu tekliği, curl ile NextAuth oturumu, seed kullanıcıları, DB durumu kontrolü
metadata:
  type: reference
  updatedAt: 2026-09-06
---

Fabrika'da "çalışıyor" demeden önce izlenecek somut adımlar. `pnpm lint` + `pnpm typecheck` bu repoda **yetmiyor** — çalışma anında patlayan sınıf hatalar var (bkz. [[nextjs-use-server-and-env-gotchas]]).

## Dev sunucu

Next.js **aynı dizinde ikinci bir dev sunucuya izin vermiyor** (`PORT=3100 pnpm dev` bile reddedilir: "Another next dev server is already running"). Paralel ajan çalışıyorsa zaten ayakta olan 3000'i kullan; öldürme (başkasının işini bozarsın).

Sunucu logu **stdout'ta değil**: `.next/dev/logs/next-development.log` (JSON satırları). 500 aldığında hatanın gerçek sebebi burada:

```bash
tail -60 .next/dev/logs/next-development.log | grep -i error
```

## curl ile oturum açma (NextAuth v5)

Korumalı rotaları test etmenin yolu:

```bash
C=$(curl -s -c cookies.txt http://localhost:3000/api/auth/csrf \
    | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')
curl -s -o /dev/null -b cookies.txt -c cookies.txt \
  -X POST http://localhost:3000/api/auth/callback/credentials \
  -d "email=owner@demo.fabrika.test&password=demo1234&csrfToken=$C&redirect=false&callbackUrl=http://localhost:3000/tr"
curl -s -b cookies.txt http://localhost:3000/api/auth/session   # doğrula
```

Şifre serbest: credentials sağlayıcısı `password || 'demo1234'` ile geçiyor.

## Kullanıcılar

- **Seed kullanıcıları (DB'de gerçekten var):** `owner@demo.fabrika.test`, `manager@demo.fabrika.test`, `writer@demo.fabrika.test` → tenant `demo-tenant`, workspace slug **`main`**.
- **Demo profiller (auth.ts içinde):** `admin@yasinaslan.com.tr`, `mehmet@example.com`, `ayse@tto.edu.tr` — giriş sayfasındaki "⚡ Hızlı Demo Giriş Rolleri" tek-tık butonlarıyla açılır (bkz. `src/app/[locale]/login/AuthCard.tsx`, buton metni `handleDemoLogin(email)`). **Düzeltme (2026-09-07, TASK-MTQWBAJ2T5XSV):** bu satırın önceki hali "DB sorguları boş döner" diyordu — bu artık doğru değil / muhtemelen hiç doğru değildi: `admin@yasinaslan.com.tr` ile girişte gerçek bir kiracıya (workspace slug `default`) bağlanılıyor, Pipeline board'da gerçek DB'den G0-G4 fırsatları (`demo-opp-1` dahil, gerçek `Opportunity` satırı) görünüyor ve `ConsortiumSeat` gibi tenant-scoped tablolara gerçek yazma/silme yapılabiliyor (Playwright ile doğrulandı). Veri gerektiren testte önce bunu dene; boş dönerse ancak o zaman seed kullanıcısına geç. **Düzeltme (2026-09-10, TASK-MTV5ESBVAHUEV):** KOBİ demo adresi `mehmet@fonbridge.app` DEĞİL, artık `mehmet@example.com` (RFC 2606) — hem `auth.ts`'teki `DEMO_PROFILES` anahtarı hem giriş sayfasındaki görünür satır değişti; eski adresle giriş denemesi profili bulamaz.

Korumalı sayfa yolu: `/{locale}/{workspace}/...` → örn. `/tr/main/settings/privacy`.

## Veritabanı

`DATABASE_URL` yerel: `postgresql://localhost/fabrika`. Uygulama `src/lib/db.ts` üzerinden **`fabrika` kullanıcısıyla** bağlanıyor (fallback `postgresql://fabrika:fabrika@localhost:5432/fabrika`).

⚠️ Ham `pg` ile `postgresql://localhost/fabrika` diye bağlanırsan OS kullanıcısıyla **farklı bir oturum** açarsın ve "0 tablo" görürsün — uygulamanın gördüğü DB bu değildir. DB durumunu kontrol ederken uygulamanın kullandığı bağlantıyı taklit et:

```bash
node -e "
require('dotenv').config({quiet:true});
const {PrismaClient}=require('@prisma/client');
const {PrismaPg}=require('@prisma/adapter-pg');
const pg=require('pg');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL||'postgresql://fabrika:fabrika@localhost:5432/fabrika'});
const prisma=new PrismaClient({adapter:new PrismaPg(pool)});
(async()=>{ /* sorgun */ await prisma.\$disconnect(); await pool.end(); })();
"
```

Bu betiği **proje kökünden** çalıştır (`/tmp`'de `node_modules` çözülmez).

Şema/seed: `pnpm prisma db push` + `pnpm db:seed`. `prisma/migrations/` boş — bu repo migration geçmişi tutmuyor, `db push` kullanılıyor.

## Statik kontrollerin sınırı

`pnpm typecheck` **tüm repoyu** tarar. Paralel ajanların yarım dosyaları çıktıyı kirletir; kendi dosyalarını ayırt et, başkasınınkine dokunma (çakışma). Lint'i dosya/dizin vererek dar çalıştır:

```bash
pnpm lint src/actions 'src/app/[locale]/compliance'   # köşeli parantezli yolları tırnakla
```

---
name: fabrika-live-postgres-for-evidence
description: Canli Postgres kaniti icin docker postgres-vector kabini kullan — kabin ici POSTGRES_USER/PASSWORD .env'deki DATABASE_URL ile AYNI DEGIL; TCP baglantisi .env parolasini ister, docker exec psql soket-guveniyle gecer
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Depoda gerçek DB'ye karşı ölçüm yapman gerektiğinde (satır sayısı, şema doğrulama) hazır
kap zaten çalışıyor:

```bash
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'
# postgres-vector  pgvector/pgvector:pg16  0.0.0.0:5432->5432/tcp
```

**Tuzak:** kabın kendi ortam değişkenleri uygulamanın kullandığı kimlik bilgileri DEĞİL.

```
kap içi : POSTGRES_USER=fabrika  POSTGRES_PASSWORD=fabrika_pass  POSTGRES_DB=fabrika_db
.env    : DATABASE_URL=postgresql://fabrika:<baska-parola>@localhost:5432/fabrika
```

Yani gerçek şema `fabrika` veritabanındadır (71 tablo), `fabrika_db` **boştur** (0 tablo).
`docker exec ... psql -U fabrika` unix soketinden trust ile geçer ve parola sormaz; ama
TCP üzerinden bağlanan bir istemci (Python worker, Prisma) `.env`'deki parolayı ister.
Kabın `POSTGRES_PASSWORD` değerini TCP'de kullanmaya çalışmak
`password authentication failed` verir.

Doğru yol — URL'yi daima `.env`'den türet:

```bash
node -e "const u=new URL(require('fs').readFileSync('.env','utf8').match(/^DATABASE_URL=\"?([^\"\n]+)/m)[1].trim()); u.pathname='/baska_db'; console.log(u.toString())"
```

**İzole başarısızlık denemesi:** paylaşılan dev DB'sini bozmadan "boru hattı çöktüğünde ne
olur" ölçmek için geçici bir veritabanı yarat, yalnız ihtiyacın olan tabloyu kur, worker'ı
oraya yönlendir, sonra `DROP DATABASE`. Paylaşılan tablolara test satırı yazdıysan
sonunda temizle ve taban sayımına döndüğünü göster — başka ajanlar aynı DB'yi kullanıyor.

İlgili: [[fabrika-k2-worker-200-is-not-proof]] ·
[[fabrika-prisma-client-side-defaults-are-not-db-defaults]] ·
[[fabrika-agents-share-one-working-tree]]

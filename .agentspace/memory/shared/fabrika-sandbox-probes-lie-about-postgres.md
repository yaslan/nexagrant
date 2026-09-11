---
name: fabrika-sandbox-probes-lie-about-postgres
description: Ajan kabuğunda lsof/ps/docker ps/which psql "Postgres yok" der ama Postgres AYAKTADIR — tek güvenilir yoklama nc -z localhost 5432 (ya da doğrudan bir Prisma sorgusu); bu yüzden "DB yok" diye gerçek e2e'yi atlama
metadata:
  type: reference
  updatedAt: 2026-09-11
---

2026-09-11, TASK-MTVUQ775Y9YIL. Gerçek tarayıcı e2e'si koşturulacaktı; ortam yoklaması şunu dedi:

```
$ lsof -ti:5432            → (boş)            "no 5432"
$ ps aux | grep postgres    → (yalnız kendi grep'im)
$ which psql postgres pg_ctl → hiçbiri bulunamadı
$ brew services list        → yalnız mysql
$ docker ps                 → failed to connect to the docker API … daemon çalışmıyor
```

Beşi de yanlış. Aynı kabukta:

```
$ nc -z localhost 5432      → Connection to localhost port 5432 succeeded!
$ npx tsx -e "prisma.$queryRawUnsafe('select current_user, current_database()')"
  → [{"current_user":"fabrika","current_database":"fabrika"}]
```

Sebep: ajan kabuğu kum havuzunda koşuyor; başka kullanıcıya/kaba ait soketleri ve süreçleri
göremiyor, Docker soketine erişemiyor, PATH'te istemci ikilileri yok. Yani bu komutların
"yok" demesi **yokluk kanıtı değil**.

Sonuç — raporda "DB yok, e2e koşulamadı" yazmadan önce:
1. `nc -z localhost 5432` (Postgres için) — ya da doğrudan bir Prisma sorgusu koştur;
2. ilk Prisma çağrısı bazen boş/kırpık mesajla düşebiliyor (`Invalid prisma.$queryRawUnsafe()
   invocation` ve altında hiçbir şey) — bir kez daha dene, ikincisi bağlandı.

Ben bu yüzden önce "Postgres yok" diye rapor yazdım; hafızadaki
[[fabrika-dev-postgres-is-up]] notu uyarmasa gerçek e2e hiç koşmayacaktı. Kapsayıcı/parola
ayrıntıları: [[fabrika-live-postgres-for-evidence]].

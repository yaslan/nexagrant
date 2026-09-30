# TASK-MUO9IS43PM2KI — FB İNCELEME-95: M4 özet claim'i User satırında (TASK-MUNVW60JPR1I9) — se-fb

**Durum:** DEVAM EDİYOR

İncelenen: dev `f7a6dcf5` (merge be-fb/munvw6-m4-claim), dev ucu `2a3900b8`.
Ortam: ayrı worktree + izole pg16 + mailpit + gerçek graphile-worker; paylaşılan :5433'e yazılmaz. Kod değiştirilmez.

## Plan
1. Kod okuması (claim SQL, release, claimedToday, migration + down).
2. Eski şemadan (`3eb40805`) izole DB'de yükseltme; idempotentlik; FORCE RLS altında backfill.
3. Senaryolar: çok kiracılı kullanıcı, kiracı atlama nedenleri, üyelik silme, eşzamanlı iki worker, gece yarısı/TZ.
4. EXPLAIN (indeks kullanımı).
5. Kendi mutantlarım.
6. Tam vitest + tsc/lint/build.

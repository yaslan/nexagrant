---
name: fabrika-dev-postgres-is-up
description: Fabrika'da yerel Postgres AYAKTA (localhost:5432) — "DB yok" diye uçtan-uca doğrulamayı atlama, önce nc -z localhost 5432 ile bak
metadata:
  type: reference
  updatedAt: 2026-09-06
---

Bir önceki oturumun devir notu "Postgres yok → RLS/uçtan uca doğrulama bu makinede yapılamadı"
diyordu. **Yanlıştı.** 2026-09-06'da kontrol ettim:

```
$ nc -z -G 2 localhost 5432 && echo up
up
```

Gerçek DB sayesinde K1 işini üç kez koşup idempotency'yi kanıtlayabildim
(`Call` 26→430, `Topic` 35→1288, sonra `inserted:0 updated:1270` ve satır sayıları sabit).
Bu kanıt olmadan "additive + idempotent, iki kez koşuldu" DoD'u karşılanamazdı.

Kural: "DB yok" sonucuna varmadan ÖNCE `nc -z localhost 5432` çalıştır. `.env` içeriğini `grep`
ile okumak izin istemine takılıyor — porta bakmak yeterli.

Sayaç sorgusu için repo köküne geçici tsx script'i yaz (bkz.
[[fabrika-tsx-script-must-live-in-repo-root]]), `::int` cast'ini unutma.

İlgili: [[fabrika-k1-upstream-sources]]

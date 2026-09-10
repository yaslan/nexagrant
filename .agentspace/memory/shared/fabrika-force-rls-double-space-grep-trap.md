---
name: fabrika-force-rls-double-space-grep-trap
description: prisma/migrations'ta iki dosya FORCE  ROW LEVEL SECURITY'yi çift boşlukla yazıyor — tek-boşluk grep'i yanlış-negatif verir, RLS taramasını yanıltır
metadata:
  type: reference
  updatedAt: 2026-09-09
---

`prisma/migrations/add-feedback.sql:73` ve `prisma/migrations/add-lifetime-licence.sql:53`
`FORCE` ile `ROW` arasında **iki boşluk** kullanıyor:

```
ALTER TABLE "Feedback" FORCE  ROW LEVEL SECURITY;
```

`grep -n "FORCE ROW LEVEL SECURITY"` (tek boşluk) bu iki dosyada **eşleşmez** ve tarayıcıya
"FORCE eksik" dedirtir — yani var olan bir korumayı yok sanıp gereksiz bir "sapma" kaydı
açtırır. TASK-MTUGK2OUVAFDN taramasında tam olarak bu oldu, dosyaları elle okuyunca yakalandı.

Kural: RLS/DDL taramasında sabit boşluklu desen kullanma — `grep -nE "FORCE +ROW LEVEL SECURITY"`
ya da yalnız `grep -n FORCE` yazıp çıktıyı gözle doğrula. Aynı tuzak `AS  RESTRICTIVE`,
`WITH  CHECK` gibi her çok-kelimeli SQL anahtar dizisi için geçerli.

Bağlam: o tarama sonunda 7 migration dosyasında **gerçek sapma çıkmadı** — CalendarConnection
izole bir vakaydı ([[fabrika-calendarconnection-rls-fixed-others-unchecked]] artık kapandı).
İlgili: [[fabrika-rls-audit-check-four-things-not-one]]

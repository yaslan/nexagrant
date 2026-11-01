---
name: fabrika-review-pile-is-the-real-backlog
description: "`review`de bekleyen kart bitmiş iş değil — dağıtılacak iş arıyorsan gerçek kuyruk orada, backlog'da değil"
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

2026-09-08, "bekleyen görevleri dağıt" dendiğinde panoda 70 kart vardı. `backlog` + `todo`
sütunlarında **gerçek iş neredeyse yoktu**: bir mükerrer (TASK-MTRV586KA36DP, işi çoktan
yapılmıştı) ve iki takılı `in_progress` kart. Buna karşılık **20'den fazla kart `review`de**
oturuyordu — hiçbiri bağımsız doğrulanmamış.

`review` = "worker bitti dedi", `done` = "ölçtük, gerçekten bitti". Aradaki fark bu ofiste
küçük değil: bugün `review`deki üç kartın ölçümü, aynı kusur sınıfının BAŞKA dosyalarda
sürdüğünü gösterdi (uydurma kimlik dizeleri hem `m11/types.ts` hem `documents/export/route.ts`
içindeydi; kart yalnız birincisini kapsıyordu).

Kural: dağıtım yaparken önce `backlog`/`todo`ya bak, sonra MUTLAKA `review` yığınını tara.
Boş ajan varken `review` kartı doğrulatmak, yeni iş icat etmekten her zaman iyidir — kanıtsız
bir "bitti" üç hafta sonra bulunduğunda çok daha pahalıya patlar. Doğrulama görevini verirken
"iddiayı ONAYLAMAYA değil ÇÜRÜTMEYE çalış, kart yanlışsa yanlış demek geçerli sonuçtur" cümlesini
KOY — bkz. [[fabrika-verify-each-claim-not-the-headline]] ve
[[fabrika-partial-fix-check-all-surfaces-of-the-same-bug]].

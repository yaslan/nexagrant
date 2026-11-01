---
name: probes-on-a-shared-db-must-run-one-file-at-a-time
description: Aynı kiracı üzerinde çalışan ve kendi satırlarını temizleyen vitest sondalarını TEK ÇAĞRIDA birlikte koşma — dosya paralelliği altında birbirlerinin satırlarını siler ve anlamsız sayı üretirler
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Fabrika'da gerçek Postgres'e vuran üç QA sondası (`demo-tenant` üzerinde, her biri `afterAll`'da
kendi `AiUsageLog`/`CreditLedger` satırlarını siliyor) tek `npx vitest run a b c` çağrısıyla
koşuldu. Vitest dosyaları paralel çalıştırdığı için birinin `deleteMany`'si diğerinin ölçüm anına
denk geldi; çıktı `bakiye: −3`, `AiUsageLog: []`, `total debited: 1503` gibi imkânsız değerler
verdi. Ayrı ayrı koşulunca üçü de temiz ve tekrarlanabilir sonuç verdi.

**Why:** Bu tür bir çıktı bir ÜRÜN kusuru gibi okunur (negatif bakiye! kayıp kayıt!) ve raporlanırsa
QA'nın bütün raporunun güvenilirliğini götürür. Ölçüm hatasını ürün kusuru diye raporlamak,
gevşetilmiş bir testten daha pahalıdır.

**How to apply:**
- Paylaşılan bir DB'ye/kiracıya vuran sonda dosyalarını **her zaman ayrı `vitest run` çağrısıyla**
  koştur (döngü içinde tek tek). Alternatif: `--no-file-parallelism`, ya da her sondaya kendi
  kiracı id'sini ver.
- Bir sonda çıktısı fizik-dışı görünüyorsa (negatif bakiye, boş olmaması gereken tablo, uçuk
  toplam) ÖNCE kendi koşum düzenini şüphelen, sonra ürünü. Tek dosya olarak tekrar koş.
- Aynı depoda başka ajanlar aynı DB'yi kullanıyor olabilir; sonda koşmadan önce bunu hesaba kat
  ve sonda satırlarını mutlaka temizle, temizliği çıktıyla kanıtla.

İlgili: [[one-action-can-be-billed-twice-in-two-places]], [[fabrika-local-green-is-worthless-under-a-bypassrls-role]]

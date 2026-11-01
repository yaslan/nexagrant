---
name: fabrika-a-green-gate-may-predate-the-commit-it-closes
description: Kapatacağın kartın kapı koşusu, kartın kendi commit'inden ESKİ bir ağaçta alınmış olabilir — kapıyı yeşil görmek yetmez, hangi commit'te koştuğunu sor
metadata:
  type: feedback
updatedAt: 2026-09-09
---

TASK-MTT1WUUS7MN7R'yi (KDV birleştirmesi) kapatırken iki rapor da `pnpm gate` yeşil
gösteriyordu. Ama QA'nın kapı koşusu `d737759`'da alınmıştı; kartın kendi işi `1547db2`,
komşu kartın refaktörü `f5fd3c6` — **ikisi de o commit'ten sonra** inmişti. Yani hiçbir
tam kapı, iki değişikliğin bir arada olduğu ağacı hiç ölçmemişti. HEAD'de (`bd125f3`)
yeniden koşturdum: exit 0, 1547 test. Sonuç iyi çıktı, ama bu şans — kapının atfı
doğrulanmamıştı.

**Neden:** Paralel dalgalarda raporlar yazıldıkları anın ağacını ölçer; kartlar ise
sırayla kapanır. Aradaki her commit ölçülmemiş kalır ve "yeşil kapı" cümlesi bir
sonraki karta miras geçer.

**Nasıl uygularım:** Bir kartı `done` yapmadan önce raporun kapı çıktısındaki commit'i
(`git log --oneline`) kartın işinin indiği commit'le karşılaştır. Kapı işten ESKİYSE
kapıyı HEAD'de kendim koştururum ve raporuma "ölçülen ağaç: <sha>" satırını yazarım.
Bu, [[fabrika-verify-what-a-gate-measures]] (kapı NEYİ ölçüyor) ile
[[fabrika-check-artifact-timestamps-against-dispatch]] (kanıt NE ZAMAN üretildi)
arasındaki üçüncü soru: kapı HANGİ AĞACI ölçtü.

Yolun üstünde ayrıca [[fabrika-partial-fix-check-all-surfaces-of-the-same-bug]]'ın
kardeşi çıktı: birleştirilen kuralın YANINDAKİ kural (stopaj yuvarlaması) aynı iki
dosyada hâlâ iki kopyaydı. Düzeltmeyi okurken düzeltilen satıra değil, komşusuna bak.

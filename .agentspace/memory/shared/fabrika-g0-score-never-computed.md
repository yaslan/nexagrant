---
name: fabrika-g0-score-never-computed
description: Fabrika'da G0 kapı puanı hiç hesaplanmıyor — g0Score seed'den statik ya da Math.random() ile geliyor, kanonik scoreG0() üretimde hiç çağrılmıyor (ölçüldü 2026-09-07)
metadata:
  type: project
  updatedAt: 2026-09-07
---

2026-09-07'de ölçüldü (TASK-MTQ63RR8Z0G8E keşfi):
`src/lib/scoring/g0-canonical.ts` içindeki `scoreG0()` ve `decideG0()` fonksiyonlarının
ÜRETİM KODUNDA TEK ÇAĞRISI YOK. Yalnız `scripts/esr-calibration.ts` CLI'ı çağırıyor.

`opportunity.g0Score` alanı şu üç yoldan doluyor:
- `prisma/seed-opportunities.ts` — statik değerler (75, 82, 85, 88, 92)
- pipeline mock'u — `Math.random() * 15 + 80`
- hiç dolmuyor

`src/lib/gates/evaluate.ts` bu uydurma sayıyı okuyup kapı kararı veriyor. Yani kullanıcıya
gösterilen G0 puanı hiçbir Evidence kaydına dayanmıyor — CLAUDE.md kural 7 ihlali.

İKİNCİ ÖLÇÜM TUZAĞI: kart "G0 üç yerde farklı hesaplanıyor" diyordu; gerçek "hiç
hesaplanmıyor". Kart teşhisi ÇÜRÜDÜ. Bu yüzden koda karşı doğrulamadan iş dağıtma —
bkz. [[fabrika-board-cards-go-stale]].

Bağlı sonuç: E11.3 ESR kalibrasyonunun "%85 doğruluk" kriteri bu boşluğun üstünde duruyor;
fixture ölçümü %80 (A kuralı), ortak anket yanıtları 2026-09-20'ye kadar bekleniyor.

Eski `src/lib/scoring/g0.ts` (`calculateG0Score`, 4-faktör, 0-10 ölçek) referanssız ölü kod.

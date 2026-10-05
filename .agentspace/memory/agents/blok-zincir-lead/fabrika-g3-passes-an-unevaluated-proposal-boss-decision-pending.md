---
name: fabrika-g3-passes-an-unevaluated-proposal-boss-decision-pending
description: G3 kapısı hiç değerlendirilmemiş teklifte passed:true dönüyor ve bu genel API'ye sızıyor — denetim ölçtü (2026-09-10), patron kararı BEKLİYOR, öneri Seçenek 2
metadata:
  type: project
  updatedAt: 2026-09-10
---

## Ölçülen gerçek (TASK-MTVR9F6VLZ1WM, blok-zincir-denet-i, 2026-09-10)
`src/lib/gates/evaluate.ts` — bir fırsatın hiç `Evaluation` satırı yokken G3 kapısı
`{"passed":true,"reasons":[]}` dönüyor (`inputs.mockEvaluation = true` dalı). Bu teorik
değil, iki gerçek yolla oluşuyor: pipeline "yeni fırsat" formundaki **Başlangıç Kapısı**
seçicisi doğrudan `G3` seçilmesine izin veriyor, ve G3'te duran bir fırsatta
"G3 kapısını değerlendir" düğmesi yeşil dönüyor.

Patlama yarıçapı: ekranda `role="alert"` yeşil kutu ("G3 kapısı geçildi.", gerekçe listesi
boş) · `GateDecision{gate:G3, passed:true, evaluationsCount:0}` **kalıcı denetim kaydı**
yazılıyor · `/api/v1/opportunities` son 3 `GateDecision` satırını olduğu gibi dışarı verdiği
için `passed:true` **entegratöre gidiyor**. Aşama ilerlemiyor, G4 etkilenmiyor.

## Karar bekleyen soru
Seçenek 1 — davranışı koru (hiçbir şey değişmez, sessiz yanlış denetim izi genel API'ye
sızmaya devam eder). Seçenek 2 — boş listede G3 kırmızı (`passed=false` +
`reasons.push('No evaluation on file')`); `tests/gates.test.ts:343` güncellenir, M6'yı hiç
kullanmayan kiracı G3'ü elle geçemez hale gelir.

**Denetçinin önerisi: Seçenek 2, ama `DEFAULT_GATE_RULES.G3`'e AÇIK bir bayrakla, sessizce
değil.** Gerekçesi güçlü: aynı üründe iki farklı yokluk politikası var — başka kapılar
yoklukta "geçemedi" derken G3 "geçti" diyor; ve yanlış "geçti" sessizdir, yanlış "geçemedi"
kullanıcının hemen fark edip düzelttiği bir durumdur.

`evaluate.ts` bu turda KASITLI olarak değiştirilmedi (kanıt: kartın DoD'u ve `git diff`).
Dikkat: `tests/gates.test.ts:343` bu davranışı ŞU AN pinliyor — testin asıl koruduğu şey
doğru (boş listeyi NaN'a sokmamak), `passed:true` ise o testin hedefi değil, yan ürünü.

Patron karar verene kadar: bu kartı yeniden açma, ama kapanmış sayma — karar sorusu bende.
İlgili: [[fabrika-a-passing-test-can-be-satisfied-by-a-second-mechanism]]

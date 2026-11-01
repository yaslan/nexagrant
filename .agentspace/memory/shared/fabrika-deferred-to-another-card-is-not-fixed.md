---
name: fabrika-deferred-to-another-card-is-not-fixed
description: Bir raporda "bu başka kartın kapsamı, dokunmadım" satırı o kusurun düzeldiğinin kanıtı DEĞİL — Fabrika'da devredilen bulgular kimsenin üstüne alınmadan aylarca ağaçta kalabiliyor; devretmeden önce ve devralırken grep'le
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Fabrika'da doğru ve iyi niyetli bir davranışın — "bu bulgu benim kartımda değil, ilgisiz
kusuru düzeltmiyorum, adıyla bildiriyorum" — sessiz bir yan etkisi var: **devredilen bulgu
kimsenin listesine geçmiyor.** Rapor yazan haklıdır, ama "başka kartın" cümlesi kimse
o kartı koşturmadıysa hiçbir şeyi düzeltmez.

Ölçülmüş örnek (TASK-MTQYXISOPUJ53, 2026-09-08): `pipeline/[id]/consortium/page.tsx`
`DEMO_OPPORTUNITIES` sabiti üç ayrı raporda "TASK-MTQW5BVFW6CMT'nin işi" diye devredilmişti.
O kart kapandı; sabit **ağaçta kaldı**. 2026-09-08'de kaydı olmayan bir kiracı konsorsiyum
sayfasında hâlâ "FLEX-GRID … — Stage G0" görüyordu — yani devir, düzeltme sanılıyordu.

**Why:** Devir bir *niyet* kaydıdır, bir *durum* kaydı değil. Kart kapandığında raporundaki
"kapsam dışı" satırları kimse yeniden okumuyor; bir sonraki ajan da önceki raporu okuyup
"o zaten devredilmiş" diye üstünü çiziyor. İki taraf da doğru davranıp kusur hayatta kalıyor.

**How to apply:**
- **Devrederken:** bulguyu yalnız raporun "Açık sorular" bölümüne yazma — `create_task` ile
  kart aç (ya da ilgili kartın açıklamasına dosya:satır ekle). Rapor satırı kart yerine geçmez.
- **Devralırken / doğrularken:** başka bir raporun "şu kart bunu kapatacak" cümlesini kanıt
  sayma. **Önce grep at.** `grep -rn "DEMO_\|MOCK_\|FALLBACK_" src --include='*.ts*'`
  otuz saniye sürer ve iddiayı ya doğrular ya çürütür.
- Bir kart `review`de duruyorsa, "gövdesinde sayılan N nokta"nın N'i de ayrı ayrı ölçülmeden
  `done`a alınmasın; sayım eksik olabilir (o kartta 5 deniyordu, altıncı nokta açıktı).

İlgili: [[fabrika-done-reports-can-be-wrong]] · [[fabrika-board-cards-go-stale]] ·
[[fabrika-fabricated-fallback-antipattern]]

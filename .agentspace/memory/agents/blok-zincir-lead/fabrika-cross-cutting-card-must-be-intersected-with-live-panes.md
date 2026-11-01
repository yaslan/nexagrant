---
name: fabrika-cross-cutting-card-must-be-intersected-with-live-panes
description: Çağrı yeri tabanlı (cross-cutting) bir kartı dağıtmadan önce dosya listesini CANLI pane'lerin tuttuklarıyla kesiştir — çakışan dosyalar "ölç ama DÖNÜŞTÜRME" olarak karta girer
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Sorun
Dizin sınırına göre bölünebilen kartlar kolaydır ([[fabrika-file-ownership-delegation-works]]).
Ama bazı kartlar **çağrı yeri** tabanlıdır: "`recordAlert` çağıranlarını dönüştür" dediğinde
kapsam 17 dosyaya / 39 çağrıya yayılır ve hiçbir dizin sınırına oturmaz. Böyle bir kartı
"tüm çağıranlar" diye dağıtırsan, o an koşan pane'lerin tuttuğu dosyalara da girer.

## Reçete (2026-09-10, TASK-MTVRBLKRUUEUM dağıtımında uygulandı)
Dağıtmadan ÖNCE:
1. `grep -rln "<çağrı>(" src scripts` ile gerçek dosya listesini çıkar (kart metnindeki
   tahmini değil — 39 çağrının nerede olduğunu ölçtüm, kart "K1/K2 çekicileri" diyordu ama
   liste 17 dosyaydı).
2. `agentspace_pane action=list` + `git status --porcelain` ile o an CANLI pane'lerin hangi
   dosyaları tuttuğunu çıkar.
3. Kesişimi kartın İÇİNE yaz: çakışan dosyalar **"tabloya dahil et, ne yapılması gerektiğini
   yaz, ama DÖNÜŞTÜRME ve dokunma"** olur; worker onları raporun "Sonraki adım"ında ayrı kart
   olarak önerir.

Bu turda kesişim iki dosyaydı (`inngest/jobs/alerts-daily.ts` blok-zincir-dev'de,
`lib/feedback/submit.ts` blockzincir-pm'de) ve ikisi de ölçüme dahil, dönüşüme hariç verildi.

Kazanç: kart tam kapsamıyla dağıtılır (kapsamı korkuyla daraltmak da bir hatadır —
[[fabrika-conflict-avoidance-must-not-shrink-a-directive]]), ama yarış çıkmaz; eksik kalan
parça kaybolmaz, adıyla bir sonraki karta devredilir.

---
name: fabrika-a-fix-to-zero-can-erase-its-own-gate-note
description: Bir kapının "bu tablo/desen neden muaf" notu çağrı sayacına bağlıysa, düzeltme sayacı sıfıra indirince NOT DA raporlardan kaybolur — muafiyet gerekçelerini eşleşmeden değil, gerekçe listesinden tohumla
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

`scripts/tenant-bypass-scan.ts` her muaf tablo için yazılı bir gerekçe taşıyordu ve bu gerekçeyi
yalnız **o tablonun çağrı yeri görüldüğünde** rapora basıyordu (`Map` sadece eşleşmede büyüyordu).
TASK-MTVTU103F11XJ `ConceptTemplate`'i 5 çıplak çağrı yerinden 0'a indirdi — ve tablo, yeni yazılmış
gerekçesiyle birlikte **rapordan tamamen kayboldu**. Düzeltme, kendi belgesini sildi.

**Neden önemli:** o not bir yokluğu belgelemek için vardı (§5.3 bunu adıyla istemişti). Sonraki
okuyan "bu tablo bu kapının kapsamında mı?" sorusunun cevabını hiçbir yerde bulamaz ve kuralı
yeniden keşfetmek zorunda kalır — ya da kapsamda sanır.

**Düzeltme (uygulandı):** sayaç, gerekçesi YAZILI her model için sıfırdan tohumlanıyor:
`new Map(Object.keys(CATALOGUE_REASONS).map((m) => [m, 0]))`. `Document` ve `Chunk` de bu yüzden ilk
kez göründü — ikisi de zaten 0'daydı ve hiç basılmıyordu.

**Genel kural:** bir kapının çıktısında "X neden muaf" cümlesi varsa, o cümlenin basılması X'in
İHLAL SAYISINA bağlı olmamalı. Muafiyet beyanı, ihlalden bağımsız yaşar. Bu,
[[a-conformance-check-cannot-see-absence]]'in ikizi: orada denetçi bir API'nin yokluğunu göremiyordu,
burada kapı kendi muafiyet notunun yokluğunu göremiyor. Bir kartı kapatırken kapının çıktısını
düzeltmeden ÖNCE ve SONRA karşılaştır — satır KAYBOLDUYSA bu da bir regresyondur.

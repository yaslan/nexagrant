---
name: fabrika-my-own-bucket-claim-was-wrong-per-line
description: Envanterimde "bu kovadaki her satırda tenantId zaten where'de" dediğim toplu iddia bir satırda YANLIŞTI — kovaya alırken satır satır doğrula, dilimi uygulayan ajan (ben bile olsam) premise'i tekrar ölçmeli
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

TASK-MTSZ0AL4QP2CT envanterinde Kova H'yi şöyle tanımlamıştım: *"hepsinde `tenantId`/`userId`
zaten `where`/`data`'da, eksik olan yalnız sarmalayıcı"* ve altına *"Tümü elle doğrulandı"*
yazmıştım. Dilim 2'yi uygularken (TASK-MTVR9T834EPUC) bir satırda yanlış çıktı:

```ts
// src/lib/feedback/submit.ts:190
await prisma.feedback.update({ where: { id: created.id }, ... })   // tenantId YOK
```

Kovanın 18 satırından 17'si iddiaya uyuyordu; biri uymuyordu ve "tümü elle doğrulandı" cümlesi
onu görünmez kılmıştı. Zararı sınırlıydı (`created.id` o fonksiyonun az önce o kiracı için
ürettiği id, çağıranın verdiği bir değer değil) ama iddia yine de yanlıştı.

**Why:** Kova, satırları *aynı işlemle* halledilebilsin diye kuruluyor; o yüzden kovanın gerekçesi
tek cümleye indirgeniyor ve tek cümle satır bazındaki istisnayı yutuyor. Bir sonraki okuyucu — ki
bu sefer bendim — o cümleye dayanıp "mekanik taşıma" diye geçiyor. Denetim raporunun kendisi
[[fabrika-board-cards-go-stale]] ile aynı sınıfa giriyor: benim yazdığım olması onu doğrulanmış
yapmıyor.

**How to apply:** (1) Envanter yazarken kova gerekçesini satır tablosunun yanına **satır başına
tek kelimeyle** doğrula (`where:{id,tenantId}` / `where:{id}` gibi), toplu "hepsi doğrulandı"
cümlesi yazma. (2) Dilimi uygularken, kartın verdiği kova tanımını her satırda **premise olarak
tekrar ölç** — kaynağı ben olsam bile. (3) Uymayan satırı sessizce düzeltme: kartın kapsamı
"mekanik taşıma, yetki değişikliği değil" ise davranışı değiştirme, sarmalayıcıya al ve
**raporun Riskler bölümünde adıyla** bildir + gerekiyorsa ayrı kart öner. Bkz.
[[fabrika-verify-the-card-recheck-not-just-the-old-report]].

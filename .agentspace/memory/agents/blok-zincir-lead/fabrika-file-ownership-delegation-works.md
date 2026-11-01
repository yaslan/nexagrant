---
name: fabrika-file-ownership-delegation-works
description: Paralel dalgada her worker'a TEK dosya sahipliği + "şuna DOKUNMA" listesi vermek çakışmayı bitirdi — 6/6 iş kanıtla geçti
metadata:
  type: feedback
updatedAt: 2026-09-07
---

2026-09-07, S10 dogfood dalgası: 6 worker aynı çalışma ağacında paralel koştu ve
**hiçbiri diğerinin işini ezmedi** — önceki dalgalarda bu düzenli olarak oluyordu.

Fark eden şey, alt-görev metninde her worker'a şunu vermekti:
- **sahiplendiği tam dosya yolları** ("`briefs/client.tsx`"),
- **açık yasak listesi** ("`briefs/page.tsx` customer-support'a ait, DOKUNMA"),
- ve komşusunun adı (kimin neyi tuttuğunu bilsin diye).

Aynı klasörde iki worker çalıştı (`briefs/page.tsx` ↔ `briefs/client.tsx`) ve sorun çıkmadı;
demek ki ayrım DOSYA düzeyinde net olduğu sürece klasör paylaşımı sorun değil.

İkinci işe yarayan şey: kartın kapsamını DARALTIP söylemek. blog-yazar'a "rozet etiketi
SENİN DEĞİL, yalnız i18n" dendi; o dosyalarda geli-tirici çalışıyordu, çakışma olmadı.

**Nasıl uygula:** dalga kurarken önce dosya haritası çıkar, sonra görevleri o haritaya göre
böl — kart sınırlarına göre değil. İki kart aynı dosyaya düşüyorsa ikisini TEK worker'a ver
(bu turda pipeline'ın iki kartı geli-tirici'de birleştirildi) ya da sıraya sok.

Bkz. [[fabrika-agents-share-one-working-tree]] · [[fabrika-parallel-agent-file-race]]

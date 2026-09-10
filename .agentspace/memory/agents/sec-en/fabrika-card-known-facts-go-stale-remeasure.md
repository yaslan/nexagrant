---
name: fabrika-card-known-facts-go-stale-remeasure
description: Fabrika kartlarındaki "ÖLÇÜM ZATEN YAPILDI, TEKRARLAMA" satırı bir kanıt değil bir fotoğraftır — canlı sayaç ölçen kartlarda ölçümü HER ZAMAN yeniden koş
metadata:
  type: feedback
updatedAt: 2026-09-10
---

TASK-MTTUUGKNDGBXK kartı "bilinen gerçek: SystemAlert 106 satır" deyip "ÖLÇÜM ZATEN YAPILDI,
TEKRARLAMA" dedi. Yeniden ölçtüm: **263 satır** — kart 2,5 kat bayattı, ve kartın verdiği kaynak
dağılımında bugün en yoğun iki kaynak (`cordis-sync`, `cordis-delta`) **hiç yoktu**. Talimata
uysaydım rapor daha yazılırken yanlış olacaktı.

Neden bayatlıyor: paylaşımlı dev ağacında kardeş ajanların `pnpm test` koşuları tabloyu
**saatte ~18 satır** büyütüyordu. Yığın ben ölçerken bile 260→261→262→263 gitti.

**Nasıl uygularım:** kart bir SAYI veriyorsa ve o sayı canlı bir kaynaktan (DB satırı, kuyruk
boyu, dosya sayısı, disk) geliyorsa, "tekrarlama" dese bile **önce yeniden ölç** — maliyeti bir
salt-okunur sonda, bedeli yanlış rapor. Kartın sayısı sabit bir olgudan (dosya:satır referansı,
şema alanı, commit sha) geliyorsa tekrar ölçmeye gerek yok. Ayrıca: raporda mutlak sayıyı
ölçüm damgasıyla ver, ama analizi **oranlar ve kova yapısı** üzerine kur — onlar bayatlamıyor.

Kardeş kayıt: [[fabrika-board-cards-go-stale]] (kartın STATÜSÜ bayatlar) — bu kayıt kartın
İÇİNDEKİ VERİNİN bayatlamasıyla ilgili, ayrı bir tuzak.
Ayrıca bkz. [[fabrika-a-failed-card-may-already-have-its-report]].

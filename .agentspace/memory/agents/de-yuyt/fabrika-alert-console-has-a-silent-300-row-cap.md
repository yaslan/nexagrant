---
name: fabrika-alert-console-has-a-silent-300-row-cap
description: admin/alerts MAX_ROWS=300 ile kesiyor, sayfalama yok ve "Toplam uyarı" kutusu DB sayısını değil yüklenen diziyi gösteriyor — kapak aşılınca sessizce yalan söyler
metadata:
  type: project
  updatedAt: 2026-09-10
---

`src/app/[locale]/admin/alerts/page.tsx:13` `MAX_ROWS = 300`, sorgu `take: 300` + `orderBy createdAt desc`.
`client.tsx:158` "Toplam uyarı" kutusuna **`rows.length`** yazıyor — yani DB sayısını değil, yüklenen diziyi.
`client.tsx`'te `slice`/pagination **yok** (arama sıfır eşleşme).

**Sonuç:** tablo 300'ü geçtiği an kutu sonsuza dek "300" der, eski alarmlar hiçbir uyarı vermeden düşer ve
ekranda kapağa dair tek ipucu yoktur (tarayıcı sondası: `strings hinting at a cap/pagination: []`).

2026-09-10 ölçümü: 262 satır, son 24 saatte 186 yeni → kapağa ~5,5 saat. Yani bu ekran teorik değil,
fiilen yalan söylemek üzereydi.

**Ters yönde bir düzeltme de var:** yeni alarm `createdAt desc` sayesinde 1. satırda görünür — "yeni alarm
yığında kaybolur" korkusu YANLIŞ. Gizlenen şey yeni değil **eski ve azınlıktaki** alarm: sayfa 31,8 ekran,
tek `m10` alarmı y=21109px'de. Ve tek triyaj kontrolü "Yalnız çözülmemişler" 0 satır filtreliyor, çünkü
`resolvedAt` hiç yazılmıyor (262/262 açık) — kimse kapatmadığı için filtre ölü.

**Nasıl uygulanır:** Fabrika'da "liste ekranı boğulmuş" kartlarında önce `take:`/`MAX_ROWS` sabitini ve
sayaç kutusunun neyi saydığını oku. Sayaç `rows.length` ise kapak aşıldığında ekran sessizce yalan söyler —
bu, gürültünün kendisinden daha ciddi bir bulgudur.

İlgili: [[fabrika-systemalert-is-outside-tenant-cleanup]]

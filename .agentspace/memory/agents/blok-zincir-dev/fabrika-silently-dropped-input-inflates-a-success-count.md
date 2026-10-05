---
name: fabrika-silently-dropped-input-inflates-a-success-count
description: `.find` ile eşleştirilen girdi satırı eşleşmezse sessizce düşer ama sayaçta kalır — anlaşılmayan girdi ya reddedilmeli ya raporlanmalı, asla atlanmamalı
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Fabrika ESR ingest'i (`scripts/esr-calibration.ts` → `applyResponses`) her partner oyunu örnek
setinde `rollups.find(...)` ile arıyordu. Eşleşmeyen satır — deşifre hatası (`S1` ↔ `S01`),
roster'da olmayan bir gönderen — hiçbir etiketi değiştirmiyor, hiçbir uyarı üretmiyor, ama
"N verdict ingested" sayısına dahil oluyordu. Ölçtüm: **5 çöp satır E11.3 bloke sayısını 4'ten
3'e düşürdü** (`pnpm beta:esr-preflight`). Aynı sınıfta: aynı (ortak, örnek) çifti iki farklı
cevapla iki kez oy veriyordu (çoğunluğu kaydırır), aynı cevapla iki kez oy veriyordu (ağırlığı
ikiye katlar).

**Why:** `.find`/`map`+lookup deseninde "eşleşmedi" ile "eşleşti ama etkisiz" aynı sessiz yola
çıkar. Sayaç ham satırdan, etki eşleşmeden geliyorsa ikisi sessizce ayrışır ve sayaç şişer.

**How to apply:** Dış kaynaklı satır kabul eden her ingest'te önce saf bir **mutabakat** adımı
koy (girdi ↔ bilinen id/kimlik kümesi): anlaşılmayan satır dosyanın TAMAMINI reddetsin ve her
sebep adıyla yazılsın; birebir aynı tekrar satırı tek kayda indirgensin (idempotans); çelişen
tekrar **tahmin edilmesin** ("son satır kazanır" bir yazı tura), operatöre sorulsun. Salt-okunur
bir kapı bu reddi çökme değil **bloke** olarak raporlamalı. İlgili: [[fabrika-a-count-is-not-coverage]]

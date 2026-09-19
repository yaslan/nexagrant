---
name: fabrika-tenant-bypass-audit-baseline-drifts
description: withTenant sarmalayıcısız prisma.* çağrılarının sayısı (98/101) sabit bir baseline değil — prisma/rls.sql'deki tenant-model kümesi büyüyor (43→48), yeniden ölçüm yapmadan eski raporun sayısını kullanma
metadata:
  type: project
  updatedAt: 2026-09-10
---

`docs/agent-results/TASK-MTU6I3V2R30M8-blok-zincir-denet-i.md` 43 tenant-scoped
model üstünden 98 gerçek (101 ham) sarmalayıcısız `prisma.*` çağrısı bulmuştu.
TASK-MTSZ0AL4QP2CT'de aynı yöntemle (rls.sql'i python'la yeniden parse edip
grep) yeniden ölçtüğümde: **48 model** (3 yeni: `ClaimEvidenceLink`,
`EvidenceReminder`, `Consent` — ilk ikisi kodda hiç kullanılmıyor), **79 gerçek
çağrı**. Düşüşün nedeni model sayısının artması değil — TASK-MTUGJTD5HZDW0
denetimin işaretlediği 3 kritik kiracı-sızıntısı satırını (evidence,
concept-notes liste+detay, hepsi `session?.tenantId ? {...} : {}` ternary
deseni) gerçekten düzeltmiş: mantık `data.ts`'e taşınmış, `withTenantOn` içine
alınmış, ve TASK numarası referanslı bir docstring eski hatayı örnekliyor.

**Ders:** Bu tarz "X sarmalayıcısız çağrı var" raporları zamanla hem büyür
(yeni model eklenince) hem küçülür (biri düzeltince) — [[fabrika-board-cards-go-stale]]'in
bu spesifik türü. Bir sonraki tur bu raporun 79 sayısını da körü körüne
kullanmamalı, `prisma/rls.sql`'i yeniden parse edip grep'i yeniden koşmalı.

Metodolojik not: cron job'ları (Kova D) tek bir "sub-query'ler zaten
kapsanmış" kovası saymak yanlış — dosyayı satır satır okuyunca ikiye
bölünüyor: (a) fan-out sorgusu (`savedSearch.findMany`, `relationship.findMany`,
`feedback.findMany` — tenant filtresiz, KASITLI, tenant henüz bilinmiyor) vs
(b) döngü-içi alt-işlem (`tenantId` zaten elde, mekanik sarılabilir). Önceki
denetim bu ikisini ayırmamıştı; `m4-weekly-summary.ts:62`'yi yanlışlıkla
"sarılabilir" gibi göstermişti — kodu okuyunca tam tersi, o da fan-out.

Ayrıntılı kova tablosu ve 5 dilimlik plan: `docs/agent-results/TASK-MTSZ0AL4QP2CT-blockzincir-pm.md`.

[[fabrika-rls-gates-dont-scan-app-code]] · [[fabrika-board-cards-go-stale]]

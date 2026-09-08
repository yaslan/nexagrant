---
name: fabrika-erasure-decision-split-the-two-not-null-columns
description: Patron kararı (A4/Seçenek C) — DualApprovalStep saklanır ve adıyla beyan edilir, Relationship.ownerUserId nullable yapılıp imhada koparılır
metadata:
  type: project
  updatedAt: 2026-09-08
---

**Karar (patron, 2026-09-08): Seçenek C.** İmhadan sağ çıkan iki `NOT NULL` kolon
farklı vakadır, tek kural uygulanmaz:

- **`DualApprovalStep` → SAKLANIR**, ama `actorUserId` **ve** `actorName` **birlikte**,
  saklama kaydında ve aydınlatma metninde **adıyla beyan edilerek**. Gerekçe: niyet
  şemada yazılı ve bir bütünlük kuralı o id'ye bağlı. Beyan A1 hukuk girdisini
  BEKLEMİYOR (patron: "şimdi"). Kart: TASK-MTT1VEUF8Z9SH.
- **`Relationship.ownerUserId` → nullable + imhada koparılır.** Gerekçe: yalnız bir iş
  ataması; dış taraf zaten `counterpartName`/`counterpartEmail`'de; hiçbir kural bu
  id'ye dayanmıyor. Kart: TASK-MTT1XL9NP2QYU (migration kilidi açılınca).

**Neden "ikisini de nullable yap" (A) reddedildi — bu asıl ders:** `DualApprovalStep`'te
`actorName` aynı satırda kalıp ekranda görünmeye devam ederdi; yalnız id'yi koparmak
**uyum görüntüsü üretip gerçek koruma sağlamayan** en kötü sonuçtur. Ayrıca Postgres'te
NULL'lar unique index'te birbirinden ayrı sayıldığı için dört-göz kuralı o satırlarda
**sessizce devre dışı** kalırdı.

**Kalıcı kural:** yarım imha yasak — purge sonrası özneye ait **AD** hiçbir kolonda
kalmamalı; id'nin gitmiş olması kanıt DEĞİL.
Bkz. [[fabrika-erasure-must-scan-names-not-just-ids]]

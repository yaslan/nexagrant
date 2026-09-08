---
name: fabrika-opportunity-delete-has-two-fkless-children
description: Fabrika'da bir Opportunity silmek ConceptNote ve ProposalUsage'ta SESSİZCE yetim satır bırakır — bu iki tablo opportunityId taşır ama FK'si yok; cascade'e güvenmeden önce information_schema'dan delete_rule'u ÖLÇ
metadata:
  type: project
  updatedAt: 2026-09-08
---

`Opportunity` silmeden önce "Prisma cascade halleder" diye düşünme. **İki tablo
`opportunityId` taşır ama yabancı anahtarı YOKTUR**, dolayısıyla veritabanı onları
temizlemez ve engellemez de — sessizce yetim kalırlar:

```
  ApplicationPart   FK delete rule: CASCADE      ConceptNote     NO FK — would orphan
  ConsortiumSeat    FK delete rule: CASCADE      ProposalUsage   NO FK — would orphan
  Effort/Evaluation/FollowupDoc/GateDecision/Proposal          CASCADE
```

(`prisma/schema.prisma`, `model ConceptNote` ve `model ProposalUsage` — ikisi de
`opportunityId String` + `@@index`, ilişki satırı yok. `ProposalUsage`'ın FK'si
`evidenceId`'ye, fırsata değil.)

**Ölçüm reçetesi — varsayma, sor.** Şemayı okumak yerine veritabanına sordur;
kolon adı `opportunityId` olan her tabloyu ve gerçek `delete_rule`'unu döker:

```sql
SELECT table_name FROM information_schema.columns
WHERE table_schema='public' AND column_name='opportunityId';

SELECT tc.table_name, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc USING (constraint_name)
JOIN information_schema.key_column_usage kcu USING (constraint_name)
WHERE tc.constraint_type='FOREIGN KEY' AND kcu.column_name='opportunityId';
```

Referansın kolon adından anlaşılmadığı durumlar için tüm şemayı süpür (2026-09-08'de
459 kolon, ~10 sn): `information_schema.columns`'tan `text/varchar` kolonları çekip her
birine `WHERE "<col>" = ANY($1::text[])`, `json/jsonb` için `::text LIKE '%<id>%'`.

**Yıkıcı işlem şablonu (TASK-MTS9CEDCWKQQK'de uygulandı, `scripts/task-mts9cedcwkqqk-*.ts`):**
(1) yedeği `docs/agent-results/<TASK>-backup.json`'a yaz — satır + bağlı satırlar + FK
kuralları; (2) kimliği **iki** kez doğrula: önce okuma-yalnız betikle, sonra bir kez daha
**silme transaction'ının İÇİNDE**; (3) `deleteMany({ where: { id: { in: [...] } } })` —
`title LIKE` / `tenantId =` gibi toplu yüklem ASLA; (4) transaction içinde iki koruma:
silinen satır sayısı beklenen sayıya eşit **ve** kiracı sayımı tam o kadar azalmış olmalı,
değilse geri sar; (5) `--confirm` bayrağı olmadan kuru koşu.

İlgili: [[fabrika-board-cards-are-not-db-rows]] ·
[[fabrika-schema-contract-guard-misses-relation-names]] ·
[[fabrika-idempotency-which-tables-must-stay-flat]]

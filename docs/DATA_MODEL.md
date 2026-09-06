# DATA_MODEL.md — Veri modeli

Kaynak: `prisma/schema.prisma` (bağlayıcı). Bu dosya niyeti ve ilişkileri açıklar.

## 1. Kiracılık

- `Tenant` (şirket/kurum) → `Workspace` (danışmanlıklar için müşteri başına; KOBİ'de tek) → iş kayıtları.
- `Membership(tenant, user, role, workspaceIds[])`; boş `workspaceIds` = tüm çalışma alanları.
- **Paylaşımlı (tenant-agnostik) tablolar:** `Programme, Call, Topic, TopicStat, Organization, Project, Participation, OrgTopicStat, Collab, ModuleCatalog, Plan, AddOnCatalog, Document(tenantId=null), RawFetch, SystemAlert`. RLS: herkese okuma, yalnızca sistem yazma.
- **Kiracıya özel:** geri kalan tümü; `tenantId` zorunlu, RLS `tenant_id = current_setting('app.tenant_id')`.

## 2. Ana akış (K5)

```
Topic ──(TopicMatch: fitScore, g0Score)──▶ Opportunity(stage G0..G4, intendedRole)
   Opportunity ──▶ GateDecision[] (her kapı; inputs JSON; ruleVersion)
   Opportunity ──▶ ConsortiumSeat[] (roleKey; organizationId | partnerOrgId; status)
                       └─▶ SeatCandidate[] (M8 puanları)
   Opportunity ──▶ ConceptNote[] (M2) ──▶ Proposal (1:1; esrScores; outcome)
   Opportunity ──▶ Effort[] (kişi-saat)
```

Durumlar: `Opportunity.stage` yalnızca `GateDecision(passed=true)` ile ilerler; geri alma yönetici yetkisiyle ve olay kaydıyla.

## 3. Ortak istihbaratı (K2/M1/M4)

- `Organization` (PIC) paylaşımlı; `OrgTopicStat(organizationId, topicPrefix)` konu öneki bazlı liderlik; `Collab(orgA, orgB)` iş birliği grafı (orgA < orgB normalize).
- Kiracıya özel katman: `Relationship` (odak kişi, sıcaklık, sonraki adım) + `Interaction` + `PartnerOrg` (CORDIS'te olmayanlar).
- "Ortak kartı" görünümü = `Organization ⨝ OrgTopicStat ⨝ Relationship(tenant)`.

## 4. Kanıt (M3) ve YZ (K6)

- `Evidence` kiracıya özel; `sourceUrl` zorunlu (kind=stat için). `validUntil` geçince UI uyarısı.
- `Document/Chunk` RAG deposu; kamusal belgeler paylaşımlı, yüklemeler kiracıya özel. `Chunk.embedding` pgvector(1536).
- `AiUsageLog` her çağrı; `CreditLedger` bakiye = SUM(delta). Kredi düşümü ve log aynı transaction'da.

## 5. Modül ve yetkilendirme

- `ModuleCatalog` manifestlerden seed; `ModuleState(tenant, module) ∈ {OFF, DEV, PILOT, ON}`.
- `Plan` → varsayılan `modules[]`, koltuk, çalışma alanı, kredi; `AddOn(sku)` → `AddOnCatalog.grantsModule|grantsSeats|grantsCredits|grantsWorkspaces`.
- Etkin kapsam (`entitlements(tenant)`) = plan + aktif eklentiler; `canEnable` bunu ve bağımlılıkları kontrol eder.

## 6. İndeks ve performans notları

- `Topic(nextDeadlineAt)`, `TopicMatch(tenantId, g0Score)`, `OrgTopicStat(topicPrefix, coordinatorCount)`, `Relationship(tenantId, lastContactAt)`.
- Embedding sorguları için `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)` (migration'da ham SQL).
- CORDIS yükleme: worker Parquet → `COPY` ile geçici tabloya → upsert; ORM ile satır satır değil.

## 7. Silme ve saklama

- Kiracı silme: `Tenant` cascade; paylaşımlı veriye dokunmaz; `AuditEvent` 12 ay anonimleştirilmiş saklanır (KVKK/GDPR).
- `RawFetch` 90 gün; `AiUsageLog` 24 ay (şeffaflık beyanı için).

## 8. v1.1+ tablolar (şemada yorum olarak)

`MockEvaluation` (M6), `MeetingBrief` (M9), `FollowupDoc` (M10), `ApplicationPart` (M11), `TtoPortfolioItem` (M7), `MarketplaceListing/Engagement/Commission`, `ApiKey`.

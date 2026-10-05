---
name: fabrika-purge-detach-vs-retain-per-column
description: Fabrika imha kuralı — FK'siz her User.id sütunu kendi gerekçesine göre karara bağlanır (özne verisi sil / kiracı kaydı NULL'la / imza sakla), toplu tek kural uygulanmaz
metadata:
  type: project
  updatedAt: 2026-09-08
---

`purgeDueUsers()` (`src/lib/inngest/jobs/users-scheduled-deletion.ts`) yabancı
anahtarı olmayan `User.id` sütunlarını **elle** adlandırmak zorunda —
`DELETE FROM "User"` onlara ulaşamaz. Buradaki kalıcı ders, hangi sütunun
listede olduğu değil (o kodda yazılı); **sütun başına karar verilmesi**:

- **özneye ait satır** → silinir (`CalendarConnection`, `SavedSearch`, `Effort`)
- **kiracıya ait kayıt** → satır kalır, yalnız kişiye giden bağ `NULL`'lanır
  (`AiUsageLog`, `AuditEvent.actorId`, `Opportunity.ownerId`, `Feedback`,
  `ProposalUsage`, ve 2026-09-08'den beri `Relationship.ownerUserId`)
- **imza/kayıt niteliği taşıyan** → **saklanır**, ama saklama kaydında
  **adıyla** beyan edilir (`DualApprovalStep.actorUserId` + `actorName`)

**Neden önemli:** "hepsini nullable yap, hepsini kopar" tek kuralı cazip ve
YANLIŞ. `DualApprovalStep`'te uygulansaydı id kopardı ama `actorName` ekranda
kalırdı (`documents/client.tsx:427`) — uyum GÖRÜNTÜSÜ, gerçek koruma yok.
Tersi de yanlış: bir **iş atamasını** ("internal focal point") imzaymış gibi
saklamanın hukuki dayanağı yok. Ayırt edici soru **"bu id'ye bir bütünlük
kuralı dayanıyor mu ve niyet şemada yazılı mı?"** — `DualApprovalStep`'te evet
(`@@unique([followupDocId, actorUserId])` + şema yorumu), `Relationship`'te
hayır (yalnız bir `@@index`).

**Nasıl uygulanır:**
- Yeni bir FK'siz `User.id` sütunu eklendiğinde bu üç kovadan birine yerleştir
  ve `docs/DATA_MODEL.md` §7.1.1 tablosuna yaz; kovasız bırakma.
- Testi **canlı DB'ye** yazdır (`tests/gdpr-data-subject.live.test.ts`):
  mock, sütunun gerçekten `NULL` kabul ettiğini kanıtlayamaz. Ayrıca hep bir
  **komşu satır** tohumla — kapsamsız bir `updateMany` tüm kiracıyı sahipsiz
  bırakır ve bunu yalnız komşu iddiası yakalar.
- Yalnız id'yi değil **adı** da ölç: id `NULL` olsa da yan sütunda ad kalabilir.

`Relationship.ownerUserId` nullable olunca `m4WeeklySummary` sessizce bozuluyordu:
gruplama anahtarı `${tenantId}:${ownerUserId}` sahipsiz satırları tek bir
`tenant:null` "odak kişi"sinde topluyordu. **Bir sütunu nullable yapmak, onu
okuyan her toplayıcıyı gözden geçirmeyi gerektirir** — tip hatası vermeyen
(şablon dizesi `null`'ı sessizce yutar) türden bir kırılma.

[[fabrika-erasure-decision-split-the-two-not-null-columns]] kararın kendisi;
bu dosya karardan çıkan kalıcı mühendislik kuralı.
[[fabrika-erasure-must-scan-names-not-just-ids]] ile aynı aile.

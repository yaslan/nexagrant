---
name: fabrika-erasure-must-scan-names-not-just-ids
description: Fabrika'da imha denetimi userId kolonlarını taramakla bitmez — aynı satırdaki ad kolonu ekranda kalır ve id'yi koparmak sahte uyum üretir
metadata:
  type: project
updatedAt: 2026-09-08
---

Bir GDPR/KVKK imha işini denetlerken FK'sız `userId` kolonlarını bulmak **yetmez**.
Aynı satırda **denormalize edilmiş bir ad kolonu** olabilir ve o, id koparıldıktan
sonra da kişiyi teşhis eder.

Ölçülmüş vaka (TASK-MTPZF8X1W8WCU, 2026-09-08): `DualApprovalStep` hem `actorUserId`
hem `actorName` taşıyor ve `actorName` denetim izinde kullanıcıya **gösteriliyor**
(`src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/client.tsx:427`).
Yalnız `actorUserId`'yi NULL'lamak imhayı görüntüde tamamlar, adı ekranda bırakır —
ve testler id'ye baktığı için **kimse fark etmez**. Ayrıca Postgres'te NULL'lar unique
index'te ayrı sayıldığından `@@unique([followupDocId, actorUserId])` dört-göz kuralı
o satırlar için sessizce devre dışı kalır.

Aynı denetimde ikinci ders: benzer görünen iki kolon **aynı vaka olmayabilir**.
`DualApprovalStep.actorUserId` bir imza (şema yorumu niyeti yazıyor,
`prisma/schema.prisma:1207`), `Relationship.ownerUserId` ise bir iş ataması — birine
uygun karar diğerine yanlış. Tek kural dayatmak, ikisinden birinde hatalı olur.

**Why:** İmha kartlarında "tüm userId kolonları kapatıldı" ifadesi bitmiş iş sanılıyor;
oysa ad kolonu taranmadıysa iş yarım ve yanlış tarafta güven üretiyor.

**How to apply:** İmha denetiminde (1) FK'sız id kolonlarını çıkar, (2) **aynı tablolarda
ad/e-posta/telefon gibi denormalize kimlik kolonlarını da ara**, (3) her birinin
kullanıcıya gösterilip gösterilmediğini yüzeyden doğrula, (4) purge sonrası "öznenin ADI
hiçbir tabloda kalmadı" testini id testinden AYRI yaz, bilinçli istisnaları yalnız-küçülen
bir ledger'da listele. İlgili: [[erasure-gap-lives-in-columns-without-a-foreign-key]],
[[type-gate-proof-needs-a-rejection-not-zero-errors]]

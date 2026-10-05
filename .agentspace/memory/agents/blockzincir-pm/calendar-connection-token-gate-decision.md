---
name: calendar-connection-token-gate-decision
description: CalendarConnection token şifreleme kararı KAPANDI — B (ertele+kilitle), makine gate'i src/lib/db.ts'te canlı; M9 OAuth PR'ı bunu bilmeden ilerlemesin
metadata:
  type: project
  updatedAt: 2026-09-08
---

TASK-MTSHP3BMTAD3Y (ölçüm) → TASK-MTSJIXP9V3JD7 (uygulama, lider onayı B) ile
`CalendarConnection.accessToken`/`refreshToken` düz-metin riski **kapandı** — ama
"şifreleme yazıldı" anlamında değil, "düz metin yazılamaz hale getirildi" anlamında.

**Durum (2026-09-08):**
- Şifreleme fonksiyonu (AES-GCM vb.) HÂLÂ YAZILMADI — kasıtlı, OAuth exchange
  tasarımına ertelendi (client id/secret, `/api/calendar/callback`, `src/core/events`
  hâlâ yok — bkz. ROADMAP açık karar #12).
- Bunun yerine `src/lib/db.ts`'te bir Prisma `$extends` sorgu uzantısı var:
  `calendarConnection.create/update/updateMany/upsert` çağrılarında bu iki sütuna
  yazılan her non-null değer `fkenc1:` önekini taşımıyorsa reddediliyor
  (`src/lib/calendar/token-envelope.ts` → `PlaintextCalendarTokenError`).
- **Sonuç: Google/Outlook OAuth callback'ini yazacak geliştirici, encrypt adımını
  atlarsa (ya da unutursa) PR'ının kendi ilk yazma denemesi bu gate tarafından
  reddedilir.** Bu bilinçli — "unutma" koruması, dokümantasyon değil.

**How to apply:** M9 takvim OAuth kartı açıldığında bu dosyayı ve
`docs/agent-results/TASK-MTSJIXP9V3JD7-blockzincir-pm.md`'yi oku — encrypt fonksiyonu
`ENVELOPE_PREFIX + <ciphertext>` üretmek ZORUNDA, aksi halde gate reddeder (bu bir hata
değil, beklenen davranış). Gerçek şifreleme şemasını (anahtar yönetimi: env mi, KMS mi)
bu kart seçmeli — henüz karar yok.

**Kapsam dışı bırakılan, açık kalan risk (daha acil):** Aynı taramada
`Account.access_token`/`refresh_token`/`id_token` (NextAuth, Google+Microsoft Entra ID
login — **aktif olarak yazılıyor**, `CalendarConnection`'ın aksine 0 satır değil) ve
`ApplicationPart.magicToken` (`ApiKey.keyHash`'in aksine hash'lenmeden düz metin bearer
token) aynı sınıftan ama daha acil bulundu, düzeltilmedi. Ayrı kart adayı.

İlgili: [[fabrika-prisma-migrations-are-hand-applied]]

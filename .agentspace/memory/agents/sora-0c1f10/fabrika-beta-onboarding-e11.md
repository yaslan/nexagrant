---
name: fabrika-beta-onboarding-e11
description: E11 beta programının sabitlenen tasarımı (8 hafta, 10 slot, Perşembe sync) ve dokümanların nerede olduğu; takvim entegrasyonu katalogda yok, ICS statik üretildi.
metadata:
  type: project
updatedAt: 2026-09-06
---

E11.1 (TASK-MTPZEESJPKGCY) ile sabitlenen beta programı tasarımı:

- Süre **2026-09-07 → 2026-11-01** (8 hafta); sync **Perşembe 14:00–14:45 Europe/Istanbul**;
  Hafta 7 = fiyat doğrulama (E11.4), Hafta 8 = G0 kalibrasyonu (E11.3) + kapanış.
- 10 slot: KOBİ / üniversite TTO / danışmanlık / araştırma merkezi profillerinden 2'şer + 2 yedek.
  Gerekçe: bir geri bildirimin "tek kişinin tercihi mi, profilin ihtiyacı mı" olduğunu ayırmak.
- Beta kapsamı MVP modülleri: M1, M2, M3, M4, M5, M8 + yönetici konsolu. M6/M7/M9/M10/M11 kapsam dışı.
- Dokümanlar: `docs/BETA_GUIDE.md` (TR) + `docs/BETA_GUIDE.en.md`, `docs/beta/beta-weekly-sync.ics`,
  `docs/beta/partner-tracker.md`, `docs/beta/weekly-sync-template.md`.
- **Google Calendar entegrasyonu AgentSpace katalogunda YOK** (katalog: coolify, elevenlabs, github,
  hostinger, posthog, sentry, stripe, supabase, vercel) → takvim statik ICS olarak üretildi.
  Otomatik takvim sync'i v1.1 backlog'unda (TASK-MTPZLC9PI5VEH).
- Ortak kimlik bilgileri (ad/e-posta) repoya YAZILMAZ; takipte yalnız slot kodu (BP-01…BP-10) + profil.

İlgili: [[fabrika-local-dev-gotchas]]

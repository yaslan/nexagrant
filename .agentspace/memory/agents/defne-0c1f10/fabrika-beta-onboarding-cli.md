---
name: fabrika-beta-onboarding-cli
description: scripts/beta-onboarding.ts — Fabrika beta ortak onboarding CLI'ının sözleşmesi, güvenlik kapıları ve geri alma yolu
metadata:
  type: project
  updatedAt: 2026-09-06
---

`scripts/beta-onboarding.ts` (E11.1) beta tasarım ortaklarını uçtan uca kurar:
tenant + owner user + membership + workspace + enterprise abonelik + davet + tüm
ModuleState'leri PILOT. `pnpm beta:onboard` / `pnpm beta:rollback`.

**Sözleşme (unutulmaması gerekenler):**
- **Dry-run varsayılan.** DB yazımı `--apply`, e-posta `--send` ister — ayrı bayraklar.
- `--send`, roster'da tek bir `.invalid` / `.test` / `example.com` adresi varken
  **reddediyor**. Yer tutucuya kazara gönderim mümkün değil.
- **Davet token'ı korunuyor** (varsa yeniden üretilmiyor) — aksi halde ikinci koşum
  gönderilmiş bağlantıyı geçersiz kılardı. Idempotency'nin can alıcı noktası.
- `AuditEvent` bilinçli olarak her koşumda birikir; upsert edilmez (denetim kaydı append-only).
- Geri alma: `pnpm beta:rollback --apply` → roster'daki tenant'ları cascade siler, sonra
  başka tenant'a üye olmayan kullanıcıları siler. Gerçek koşumla doğrulandı.
- Program tasarımı bayrağa bağlı: `--modules=all|mvp --day=<1-7> --time=HH:MM --tz=<IANA>`.

**Sır/PII kuralı:** Üretilen `docs/BETA_DATA/generated/` dizini davet HTML/TXT'lerinde
**canlı invitation token** taşır (TENANT_OWNER erişimi verir) → `.gitignore`'da. Gerçek
ortak listesi de PII; repoya konmaz, `--roster=<repo-dışı-yol>` ile verilir.

**Zaman dilimi dersi (genel geçer):** "Pazartesi 15:00 CET" gibi bir slot, 8 haftaya
yayılınca DST sınırını geçer (2026-10-25). Offset'i sabit yazmak son toplantıyı bir saat
kaydırır. Doğru yöntem: her tekrar kendi UTC anını `Intl.DateTimeFormat` + zone ile
çözsün ve ICS'e **RRULE yerine tekrar başına bir VEVENT** yazılsın — istemciler
recurrence'ı DST üzerinden farklı genişletebiliyor. `src/lib/beta/checkin-schedule.ts`
içindeki `zonedTimeToUtc` bunu kütüphanesiz yapıyor; testi DST kayması üzerine kurulu.

İlgili: [[fabrika-parallel-agent-collisions]], [[fabrika-rls-bypass-role]], [[fabrika-workspace]]

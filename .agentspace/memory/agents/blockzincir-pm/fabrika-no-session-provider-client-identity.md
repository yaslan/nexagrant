---
name: fabrika-no-session-provider-client-identity
description: Fabrika'da hiçbir yerde <SessionProvider> yok — bir client component'te kullanıcı kimliği lazımsa useOptionalSession() tek başına hep null döner; /api/auth/session'ı fetch et
metadata:
  type: project
  updatedAt: 2026-09-07
---

`grep -rn "SessionProvider" src/app` → **0 sonuç**. `src/lib/hooks/use-optional-session.ts`
bilerek "provider yoksa null" döner, yani provider'sız bir ağaçta çağıran her client
component kimliği ASLA öğrenemez; `displayUserName()` ile birleşince ekranda herkes
"İsimsiz kullanıcı" olur (TASK-MTRHZIWHU2SKA'da Part B editöründe tam olarak bu oldu —
sabit "Dr. Mehmet Yılmaz"ı oturuma bağladım, ekran "İsimsiz kullanıcı" gösterdi).

`src/components/UserMenu.tsx` bu yüzden kimliği **prop olarak** sunucudan alır; hook orada
yalnızca yedek.

## Ne yapmalı
- Ebeveyn sayfa/kabuk SENİN dosyanda ise: kimliği sunucudan prop geçir (tercih edilen).
- Ebeveyn başka bir kartın dosyasıysa: NextAuth'un kendi `GET /api/auth/session` rotasını
  fetch et — provider'ın context'e koyacağı kaydın aynısını döner:
  `{"user":{"name":"Alice","email":"…","id":"demo-user-alice"},"tenantId":…,"role":…}`.
  Context'i önce dene, boşsa fetch et; kimlik gelene kadar heartbeat/kilit çağrısı YAPMA
  (boş userId ile presence yazarsan her part'a anonim satır düşer).

İlgili: [[fabrika-m11-partb-local-verification-recipe]]

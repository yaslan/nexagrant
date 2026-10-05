---
name: fabrika-use-server-exports-must-be-async
description: Fabrika'da 'use server' modülünün HER export'u async fonksiyon olmalı — hata sınıfı/tip/sabit oraya konulamaz, ayrı bir lib dosyasına al
metadata:
  type: reference
  updatedAt: 2026-09-07
---

`src/modules/*/server/*-actions.ts` dosyaları `'use server'` taşıyor. Next.js bu modüllerin
**her export'unun async fonksiyon olmasını** şart koşar. `export class CalendarActionError`,
`export type CalendarActionCode` ya da `export const SELF_SERVE_PROVIDERS` koyarsan build kırılır
(`tsc` bunu yakalamaz — tip düzeyinde geçerli görünür).

**How to apply:** Server Action'ın fırlattığı hataların kod birliğini, tiplerini ve sabitlerini
ayrı bir düz modüle koy (örn. `src/lib/calendar/errors.ts`), action dosyası oradan import etsin;
istemci de aynı yerden import eder.

**İkinci yarısı — hata mesajı sınırdan geçmez:** Next.js throw'u serialize eder, sınıf
kaybolur, istemciye yalnız `Error.message` ulaşır. Bu yüzden mesaj **makine-okur kod** olmalı
(`CALENDAR_OAUTH_NOT_CONFIGURED`) ve istemci koda göre `t()` çağırmalı — düz İngilizce metni
kullanıcıya gösterme (CLAUDE.md kural 8). Kodu geri okuyan yardımcı da aynı lib dosyasında
dursun ve **tanımadığı hatayı tanımadı bıraksın**; makul görünen bir mesaja eşlemek uydurmadır.

---
name: fabrika-sentry-envelope-without-sdk
description: Fabrika'da Sentry'ye SDK'sız gönderim — envelope HTTP sözleşmesi, DSN yokken no-op deseni ve fetch BodyInit tuzağı
metadata:
  type: reference
  updatedAt: 2026-09-06
---

Sentry'ye olay göndermek için `@sentry/nextjs` **şart değil**. SDK derleme eklentisi, source-map
yüklemesi ve global hata yakalayıcı getiriyor; tek ihtiyaç "yapılandırılmış bir olay gönder" ise
envelope ucu dokümante bir HTTP sözleşmesi ve ~150 satır `fetch` yetiyor
(`src/lib/observability/sentry.ts`).

**DSN ayrıştırma:** `https://<publicKey>@<host>/<path><projectId>` → gönderim ucu
`<proto>://<host><path>/api/<projectId>/envelope/`. Başlık:
`X-Sentry-Auth: Sentry sentry_version=7, sentry_client=<ad>/<sürüm>, sentry_key=<publicKey>`,
`Content-Type: application/x-sentry-envelope`.

**Gövde** satır-ayrımlı: `{envelope header}\n{item header}\n{payload}\n`. Binary ek (ekran
görüntüsü) ikinci item olarak eklenir ve item header'ında **`length` ZORUNLUDUR** — parser
rastgele baytların içinde newline arayamaz. Uzunluk yanlışsa Sentry **tüm zarfı** reddeder,
olay da gitmez.

**İki tuzak:**

1. `fetch(..., { body })` — `Buffer` `BodyInit`'e uymuyor. TS `Buffer<ArrayBufferLike>` diyor,
   `BufferSource` ise `ArrayBuffer` tabanlı view istiyor; `new Uint8Array(buf.buffer, ...)` de
   yetmez. Çözüm: `const b = new Uint8Array(buf.byteLength); b.set(buf);` (birkaç KB için kopya
   bedava).
2. Hata gövdesini **çağırana verme**. Sentry 403'ü `{"detail":"invalid key: <DSN key>"}` döner —
   yalnız `sentry_http_<status>` dön, gövdeyi asla.

**Desen — "yükseltici, doğruluk kaynağı değil":** DSN boşsa `{status:'skipped'}` dön, asla atma.
Çağıran önce DB satırını yazsın, sonra göndersin ve sonucu (`sent|skipped|failed`) satıra
damgalasın. Böylece Sentry bağlı olmadan da sistem tam çalışır — Fabrika'da bugünkü durum bu.

Test etmek için soket açmaya gerek yok: `buildEnvelope()`'u ayrı export et, biçimi doğrula;
taşımayı da yerel bir `http.createServer` yakalama sunucusuna gerçek POST atarak sına
(`tests/feedback-sentry.test.ts`).

İlgili: [[fabrika-runtime-verification-recipe]]

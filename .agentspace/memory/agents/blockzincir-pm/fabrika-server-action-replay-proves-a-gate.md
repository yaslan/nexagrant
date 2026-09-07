---
name: fabrika-server-action-replay-proves-a-gate
description: Bir yetki kapısının UI'da değil gerçekten sunucuda durduğunu kanıtlama yöntemi — Playwright ile next-action POST'unu yakala, kapıyı kapat, aynı POST'u replay et
metadata:
  type: reference
updatedAt: 2026-09-07
---

"Düğmeyi gizledik" bir kapı kanıtı DEĞİLDİR. Next.js server action'ı herkese açık bir POST uç
noktası; kanıt için onu doğrudan çağırmak gerekir. 2026-09-07'de (TASK-MTQW8188AWOAT) işe yarayan
yöntem:

1. Kapıyı **AÇIK** bırak, gerçek tarayıcıda gerçek düğmeye bas. `page.on('request')` ile
   `r.method()==='POST' && headers['next-action']` olan isteği yakala: `{url, headers, body}`.
2. DB'de yan etkiyi ölç (`CreditLedger` satır sayısı + `sum(delta)`, `AiUsageLog`, iş tablosu).
   Bu "açık kol"; gerçekten harcandığını görmek şart, yoksa "harcanmadı" iddiası boş.
3. Kapıyı **KAPAT** (`ModuleState` satırını UPDATE et).
4. Aynı POST'u birebir replay et: `ctx.request.post(url, { headers, data: body })` — `ctx` aynı
   tarayıcı context'i olduğu için oturum çerezi taşınır. `content-length` başlığını SİL, yoksa
   uyuşmazlık verir.
5. Yanıtı ve yan etki sayaçlarını tekrar ölç. Beklenen: `500` + `ModuleAccessError`, sayaçlar
   DEĞİŞMEMİŞ.

Bu, tek bir çalıştırmada hem "açıkken çalışıyor" hem "kapalıyken hiçbir şey yazmıyor" kanıtı verir.

**Ortam tuzağı:** `ANTHROPIC_API_KEY` yoksa YZ yolları harcamayı göstermeyebilir. `generateText`
başarılı API çağrısından SONRA düşer, yani anahtarsız ortamda M6 hiç kredi harcamaz — "harcanmadı"
kanıtı anlamsızlaşır. M9'un `generateMeetingBrief`'i ise LLM hatasını yutup `CreditLedger -1`
yazar; anahtarsız ortamda gerçek harcama gösterebilen kol odur. Kanıt kolunu buna göre seç.

İlgili: [[fabrika-module-gate-is-opt-in]]

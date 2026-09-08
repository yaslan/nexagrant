---
name: fabrika-pinned-next-action-id-is-vacuous
description: Bir e2e testinde SABİT yazılmış `Next-Action` id'si her build'de ölür ve rota 404 döner — "status >= 400" iddiası korumayı DEĞİL yokluğu ölçer; canlı id'yi gerçek tıklamadan hasat et ve pozitif kontrol koy
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Next her build'de her server action'a **yeni** bir id üretiyor. Bir spec o id'yi kaynağa
sabitlerse, bir sonraki build'den itibaren ölçtüğü tek şey "böyle bir action yok".
TASK-MTS9C907G4YNW'de ölçüldü (Next 16.3.4, dev, HEAD `bcf09fb`):

```
anonim   + spec'in sabitlediği id : 404 "Server action not found."
anonim   + tamamen uydurma id     : 404 "Server action not found."
OTURUMLU + spec'in sabitlediği id : 404 "Server action not found."
OTURUMLU + uydurma id             : 404 "Server action not found."
```

Dört hücre aynı → `expect(status).toBeGreaterThanOrEqual(400)` bir REDDİ bir YOK-ROTADAN
ayıramaz. Kanıtı: `signDocument`'tan `requireTenantAction()` guard'ını kasten sildim,
anonim çağrı gerçekten başkasının dokümanını imzaladı — **eski iddia yine yeşil kaldı (404)**.

## Doğrusu

1. **Canlı id'yi çalışma anında hasat et** — gerçek tıklamanın gönderdiği POST'tan:
   ```ts
   page.on('request', (req) => {
     const id = req.headers()['next-action'];
     if (req.method() === 'POST' && id) posts.push({ id, body: req.postData() });
   });
   // tıkla, sonra: gövdesi docId'yi taşıyan POST'u seç
   ```
   Tıklamayı ancak **DB'de gerçekten yazdıysa** id kaynağı say (`expect.poll(() => row.signedAt)`).
2. **Hükmü DB satırından oku**, status'tan değil. Anonim replay sonrası `signedAt` hâlâ `null`.
   Anonim çağrı dev'de 500 döndü ama sayıyı sabitleme (prod build'de değişebilir); sabitlenecek
   olan `not.toBe(404)` + DB gerçeği.
3. **POZİTİF KONTROL şart:** aynı id oturumlu çağrıldığında 200 dönmeli ve satır İMZALANMALI.
   Yoksa "yazılmadı" ifadesi "istek action'a hiç ulaşmadı" ile aynı şeye benzer.
4. **Tuzak:** replay'i `page.request` ile atma — o, tarayıcı context'inin çerez kavanozunu
   paylaşır, "anonim" çağrın az önce kurduğun oturum çerezini taşır ve testin tam tersini
   kanıtlar. Playwright'ın izole `request` fixture'ını kullan, kimliği `Cookie` başlığıyla ver.

Aynı kural genel: **404 asla koruma kanıtı değildir.** Bir reddi ölçüyorsan, yolun canlı
olduğunu ayrıca göster.

İlgili: [[fabrika-run-unique-session-name-proves-actor]] · [[fabrika-force-server-action-failure-in-browser]] ·
[[fabrika-dual-approval-fully-in-memory]]

---
name: fabrika-blocked-card-premise-may-hide-the-real-blocker
description: "Dış girdi bekliyor" kartının "kod tarafı hazır" premisini ölç — e-Fatura'da hazır olmayan şey adaptör değil, Invoice yazma yoluydu
metadata:
  type: project
  updatedAt: 2026-09-08
---

2026-09-08'de patron TASK-MTRJSOWFH6B45'i (e-Fatura go-live, "DIŞ GİRDİ BEKLİYOR —
kod tarafı hazır") "şimdi yap" diye gönderdi. Kart doğru şekilde bloke görünüyordu:
entegratör adaptörü satıcının API'si bilinmeden yazılamaz. Ama premisin ikinci yarısını
ölçünce çıkan şey şuydu:

```
grep -rniE "invoice\.(create|upsert)" src scripts prisma tests workers
→ yalnız iki e2e testi. Üretim kodunda SIFIR.
```

Ödeme yolları (Stripe `subscription-sync.ts`, iyzico `iyzico.ts:705-725`) yalnız
`AuditEvent` yazıyordu; `iyzico.ts:713`'te "There is no Invoice table" diyen BAYAT bir
yorum duruyordu (tablo aylar önce eklenmişti). Yani kimlik bilgileri gelse bile GİB'e
gönderilecek tek bir belge olmayacaktı.

**Nasıl uygula:** "dış girdi bekliyor" etiketli bir kart geldiğinde bloke olan kısmı değil,
**hazır olduğu iddia edilen** kısmı ölç. Zincirin sonundan başa doğru yürü: gönderilecek şey
üretiliyor mu? Üretilecek şeyin girdisi yazılıyor mu? Bu depoda kanıt aramanın en hızlı yolu
ilgili tabloya YAZAN kodu aramaktı (okuyan değil). İlgili:
[[fabrika-verify-each-claim-not-the-headline]], [[fabrika-green-gate-does-not-prove-a-clean-clone]]

**İkinci kez doğrulandı (2026-09-08, aynı gün, aynı kart).** Invoice yazma yolu kapandıktan
sonra kart yine "kod tarafı hazır" diyordu; ölçünce `ADAPTERS`
(`src/lib/efatura-integrator.ts`) yalnız `sandbox` içeriyordu — yani 13 env değişkeni
eksiksiz girilse bile sonuç `provider_unsupported`. Aynı kart, aynı premis, farklı boşluk.
**Kural:** bu premis her yeniden gönderilişinde YENİDEN ölçülür; bir kez doğrulanmış olması
bir sonraki turda geçerli değildir — arada kapanan her kusur, zincirde bir SONRAKİ eksiği
görünür kılar. Ayrıca: bloke kartın dokümanı bayatlar (bu turda `docs/EFATURA_SETUP.md`
çoktan karara bağlanmış ADR-0002'yi hâlâ "karar bekliyor" diye anlatıyordu) — kartı
ertelerken dokümanını da tazele. Bkz. [[stale-audit-report-reframes-before-it-is-reused]]

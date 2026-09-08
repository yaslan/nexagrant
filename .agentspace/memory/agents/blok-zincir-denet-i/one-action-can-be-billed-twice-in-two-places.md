---
name: one-action-can-be-billed-twice-in-two-places
description: Bir "tek giriş noktası" birleştirmesini doğrularken adaptörün düşüşünü değil, TEK EYLEMİN defterde kaç satır bıraktığını say — ikinci tahakkuk çağıran modülde durabilir
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Fabrika'da TASK-MTSXGXBCJ007W ("iki LLM adaptörü aynı çağrıyı 7 kat farklı fiyatlıyor")
doğrulanırken: adaptör birleştirmesi gerçekten tamdı — tek dosya, tek formül, tek hash,
`AiUsageLog`'a yazan tek yer. Kartın iddiası kapanmıştı. **Ama tek bir M6 değerlendirmesi
`CreditLedger`'a iki düşüş satırı yazıyordu:** adaptörün token tahakkuku (`usage:M6`, −1) ve
`m6/server/actions.ts` içindeki sabit tahakkuk (−3). Denetim kaydı "1 kredi" diyor, kiracıdan 4
alınıyordu. Aynısı M9 ve M10'da (2×), M2/M7'de yok.

**Why:** "tek giriş noktası" doğrulaması adaptöre bakmakla biter sanılıyor. Para adaptörden
çıkmıyor — DEFTERDEN çıkıyor, ve deftere yazan ikinci el çağıran modülün kendisi olabilir. Üstelik
1424 birim testin hepsi yeşildi: `tests/modules/m6.test.ts` adaptörü `vi.mock`'luyor, dolayısıyla
adaptörün düşüşü testin görüş alanında değil; test sonra modülün sabit düşüşünü doğrulayıp "doğru"
diyor. Mock'lanan taraf, çift-sayımın görülemeyen yarısıdır.

**How to apply:**
1. Fatura/kredi iddiası doğrularken sorulacak soru "adaptör doğru mu fiyatlıyor" değil,
   **"tek eylem defterde kaç satır bıraktı ve toplam, kayıt satırındaki rakama eşit mi"**.
   Ölçüm: gerçek sunucu eylemini çağır, `CreditLedger` satırlarını ve `AiUsageLog.credits`'i
   yan yana oku. `grep` yetmez — iki yazma iki ayrı dosyada duruyordu.
2. `grep -rn "creditLedger.create" src/` çalıştır ve çıkanları ikiye ayır: hibe/satın alma
   (iyzico, monthly-grant, subscription-sync — meşru) ve **YZ çağıran modüllerin kendi düşüşleri**
   (şüpheli). İkincisi adaptörünkiyle çakışıyor mu, koştur bak.
3. Bir raporun "doküman şunu satıyor ama hiçbir kod uygulamıyor" cümlesini ASLA devralma —
   doğrula. Burada `docs/BILLING.md` satır 53'teki M6=3/M9=1/M10=1 rakamları modül kodundaki
   `delta` değerleriyle birebir aynıydı; sabit model uygulanıyordu, sadece adaptörün üstüne
   biniyordu. Geliştirici raporu ve `src/lib/llm.ts` yorumu ikisi de yanlış diyordu.

İlgili: [[a-missing-field-card-hides-a-wrong-value-bug]] (kartın söylediği kusur kapanmışken
yanında daha ağır bir kusur duruyor — aynı desen), [[probes-on-a-shared-db-must-run-one-file-at-a-time]]

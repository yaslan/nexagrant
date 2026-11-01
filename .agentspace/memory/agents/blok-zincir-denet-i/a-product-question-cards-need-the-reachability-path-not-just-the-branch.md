---
name: a-product-question-cards-need-the-reachability-path-not-just-the-branch
description: "Bu dal yanlış davranıyor" tipi ürün-sorusu kartında asıl iş dalı göstermek değil, kullanıcının o dala GERÇEKTEN nasıl vardığını bulmaktır — Fabrika'da cevap kapıların kendisinde değil, aşamayı kapı koşmadan yazan iki UI yolundaydı
metadata:
  type: feedback
updatedAt: 2026-09-10
---

Fabrika TASK-MTVR9F6VLZ1WM/B: `gates/evaluate.ts` G3, boş `evaluations`
listesinde `passed: true` dönüyor. Dalı göstermek 30 saniye; kartın istediği
"üretimde mi yalnız seed/demo'da mı" sorusu asıl iş.

İlk analizim YANLIŞTI: "buton mevcut aşamayı koşuyor, G3'ü koşmak için fırsatın
zaten G3'te olması lazım, G3'e varmak için G3'ün geçmesi lazım → ulaşılamaz."
Tavuk-yumurta kapalı görünüyordu. **Aşamayı kapıdan bağımsız yazan yolları
aramayı unutmuştum.** `grep -rn "stage:"` iki tane buldu:
- `pipeline/board.tsx` yeni-fırsat formunda **"Başlangıç Kapısı"** `<select>`'i,
  G3 dahil tüm kapıları sunuyor (`actions.ts` `stage: stage || 'G0'` ile yazıyor);
- `moveOpportunityStage` sürükle-bırakta `data: { stage: newStage }` yazıyor.

**Genel kural:** bir durum makinesinde "X durumuna ancak Y geçerse varılır"
akıl yürütmesi, o durumu YAN KAPIDAN yazan kod olmadığını doğrulamadan
geçersizdir. Her zaman alanın tüm yazıcılarını grep'le.

Patlama yarıçapını da dalın kendisinden değil kaydın nereye AKTIĞINDAN çıkar:
burada `GateDecision{passed:true}` `/api/v1/opportunities`'ten dışarı gidiyordu;
buna karşılık aşama ilerlemiyordu ve M5 KPI'ı yalnız G0/G2 okuduğu için
etkilenmiyordu. Bu ayrımı yapmadan "ciddi" ya da "önemsiz" demek tahmindir.

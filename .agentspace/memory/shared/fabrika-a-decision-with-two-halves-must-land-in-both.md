---
name: fabrika-a-decision-with-two-halves-must-land-in-both
description: "Fiyat KDV hariç" gibi bir karar hem EKRANI hem TAHSİLATI değiştirir — yalnız birini uygulamak sistemi yalancı yapar; kart yalnız birini sayıyorsa ötekini de yap ve raporda açıkça beyan et
metadata:
  type: feedback
updatedAt: 2026-09-08
---

TASK-MTT1WUUS7MN7R kartı (a)–(g) maddelerinde **faturayı ve fiyat ekranını**
tarif ediyordu, tahsilatı değil. Ama patron kararı ("fiyatlara KDV hariç,
ülkelerin oranlarına göre **ekle**") iki yeri birden değiştiriyordu.

**Why:** Yalnız ekranı değiştirseydim fiyat sayfası "KDV hariç" derken checkout
liste fiyatını çekmeye devam edecekti — **etiket yalan** olurdu. Yalnız faturayı
değiştirseydim fatura, tahsil edilmemiş bir tutarı belgeleyecekti — **fatura ≠
makbuz**. İkisi de sessiz ve ancak muhasebede fark edilen hatalar.

**How to apply:**
- Bir karar okuduğunda "bu cümle kaç yüzeyi değiştiriyor?" diye say; kartın
  madde listesi bunun tamamı olmayabilir (kart karardan önce yazılmış olabilir).
- Eksik yarımı yap, ama **raporun en başında** ayrı bir başlıkla beyan et ve
  geri alma yolunu tek cümleyle yaz ("tek dosya: `checkout-tax.ts` çağrısını
  kaldır").
- Mutabakatı ölçüyle kanıtla: `net + KDV = tahsil edilen` eşitliğini sonda
  çıktısına bastır; tutmuyorsa yarımlardan biri eksiktir.
- Kart yazıldıktan sonra kapsamı genişleten patron kararları `shared/` hafızada
  olabilir — başlamadan önce oraya bak. Bkz.
  [[fabrika-prices-are-vat-exclusive-per-country]]

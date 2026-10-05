---
name: fabrika-a-count-is-not-coverage
description: Bir kapı "N kayıt işlendi" sayısına bakıyorsa hâlâ kör — sayı KAPSAM değildir; teyit edilen birim / toplam birim ölç
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

E11.3 kapısında (TASK-MTQ2KL3JO4MK2, 5. geçiş) `responses` kontrolü `responseCount >= 1` ile
yeşile dönüyordu. 20 örneklik sette 3 örneği kapsayan 6 satır "✅ Partner verdicts ingested"
diyordu; hemen altındaki accuracy satırı ise hâlâ 17 **geçici** etikete karşı ölçülüyordu.
Kriter, hak etmediği bir veriyle kapanabilir durumdaydı.

**Why:** "işlendi" bir SÜREÇ ifadesidir, "yeterli veri var" bir KAPSAM ifadesidir. Bir kabul
kriterini kapatan kapı ikincisini ölçmek zorundadır; ilki her zaman daha kolay yazılır ve
sessizce yanlış cevap verir.

**How to apply:** Bir readiness/preflight kontrolü yazarken payı DEĞİL oranı ölç:
`teyit edilmiş birim / beklenen birim` (burada: çoğunluk taşıyan örnek / 20). Berabere kalan,
eşleşmeyen, reddedilen birimler **teyit sayılmaz**. Kontrol metni oranı yazsın ("3/20 samples
carry a confirmed majority — 17 label(s) are still provisional") ki okuyan kişi eksiği görsün.
İlgili: [[fabrika-silently-dropped-input-inflates-a-success-count]]

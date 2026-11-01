---
name: fabrika-default-0-columns-hide-absence
description: Fabrika'da `Float @default(0)` sütunlar yokluğu ölçülmüş sıfır gibi gösteriyor — ayrımı okuma katmanında `MetricValue`/`null` ile taşı, UI'da değil
metadata:
  type: project
updatedAt: 2026-09-07
---

`Evaluation.excellence/impact/implementation` (ve benzeri sayısal KPI girdileri) Prisma'da
`Float @default(0)` — yani **doldurulmamış satır ile gerçekten 0 puan alan satır aynı
görünüyor**. Bu, hesap zincirinin sonundaki `?? 0` ile birleşince ürünü yalan söyletiyordu:
hiç fırsatı olmayan kiracıya "İsabet Oranı 0,0 %", hiç açılmamış değerlendirmeye
"Toplam: 0.0 / 15.0 (Eşik Altı)".

**Ayrımı nereden çıkarırsın (şema değiştirmeden):** puanları yazan fonksiyonlar
(`generateAiEvaluation`, `saveHumanEvaluation`) puanla **aynı ifadede**
`status: 'completed'` yazıyor. Yani sütunlar yalnız `status === 'completed'` **ve**
`readerType !== 'PANEL'` iken anlamlı — PANEL satırının puanları `Reviewer`/`Score`
içinde ağırlıklı 1–5 ölçekte durur, bu üç sütun ömür boyu 0 kalır
(`prisma/seed-m6-evaluations.ts` tam olarak böyle 10 satır üretiyor).

**Kalıcı kural:**
1. Ayrımı **okuma katmanında** bir tipe koy (`MetricValue = {measured:true,value} | {measured:false}`,
   ya da `LensMarks | null`) — UI'a `0` gönderirsen orada geri kazanılamaz.
2. Türetimi **saf fonksiyona** çıkar (`src/modules/m5/server/metrics.ts`,
   `src/modules/m6/lens-scores.ts`) ki DB'siz test edilebilsin.
3. Her metrik için **İKİ** test yaz: yokluk → ölçülmemiş, VE gerçek sıfır → ölçülmüş 0.
   Tek tarafı sabitlersen "sıfırları gizle" diye düzeltilir ve gerçek sonuç kaybolur.
4. Boş durumda kartı **hiç basma**; ölçülmemiş tek kart ise birimi (`%`, `gün`) düşür,
   `success` yeşilini bırak (eksik bir oran yeşil çerçevede "iyi sonuç" gibi okunur) ve
   değeri gövde puntosunda göster — eksik sayı gerçek sayıdan yüksek sesle konuşmasın.
5. "Yeni çalışma alanı" ile "bu tarih aralığı boş" **farklı cümleler**: aralıktan bağımsız
   bir sayım (`hasAnyOpportunity`) olmadan ayırt edilemez.

Aynı tarama yapılmamış yüzeyler: `dashboard/client.tsx` (`personDaysPerOpp === '0' ? '14.2'`
gibi bir yedek var), `evaluations/panel/**`, K5 pipeline kartları.

İlgili: [[fabrika-g0-evidence-placeholder-laundering]] — aynı hastalığın yazma tarafı.

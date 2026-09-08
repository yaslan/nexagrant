---
name: fabrika-verification-cards-orphan-when-target-closes
description: Hedef kartı done yaparken eşleşen DOĞRULAMA kartı todo'da öksüz kalıyor — ikisini birlikte kapat
metadata:
  type: project
updatedAt: 2026-09-08
---

Board'da her doğrulama turu için hedef kartın YANINDA ayrı bir `DOĞRULAMA · <ajan> → <hedef>`
kartı açılıyor. Hedef kart `done` olunca doğrulama kartı KENDİLİĞİNDEN kapanmıyor; `todo`
sütununda öksüz kalıyor ve sonraki turda "yapılacak yeni iş" gibi görünüyor.

2026-09-08: 13 kartı `done` yaptım; sonraki `todo` listesinde 7 adet MTSK* kodlu DOĞRULAMA
kartı duruyordu — hepsinin çıktısı `docs/agent-results/` altında ZATEN vardı ve hepsi GEÇTİ
hükmü taşıyordu.

Kural: kapatma turunda `list_tasks status=todo` da çalıştır ve her doğrulama kartı için
hedefin rapor dosyası var mı diye bak. Varsa doğrulama kartını da kapat — yoksa ekip aynı
doğrulamayı ikinci kez koşar.

Ayırt etme ipucu: doğrulama raporu `TASK-<HEDEF>-<ajan>.md` adıyla yazılıyor, doğrulama
kartının KENDİ kodu (MTSK*) dosya adında GEÇMİYOR — bu yüzden kod araması boş döner,
hedef kodla ara.

İlgili: [[fabrika-cross-verification-needs-a-falsifying-probe]] ·
[[fabrika-data-loading-verification-breaks-empty-table-specs]]

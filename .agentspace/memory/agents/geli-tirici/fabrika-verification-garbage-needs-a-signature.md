---
name: fabrika-verification-garbage-needs-a-signature
description: Bir UI düzeltmesini elle (checked-in test dışı) doğrulamak için DB'ye satır yazıyorsan, o satırları greplenebilir bir imzayla etiketle ve aynı oturumda temizle — yoksa gerçek veriden ayrılamaz hale gelir
metadata:
  type: feedback
---

**Kural:** [[fabrika-alert-console-row-limit]] gibi bir "300 satırı aşınca kesme" düzeltmesini
elle doğrulamak için DB'ye 286+ satır yazan bir ad-hoc script/oturum, o satırları
`source: 'test-module' | 'test-worker' | 'test-api'` gibi bir imzayla veya mesajında
sabit bir dizgeyle (`'truncation testing'`) etiketlemeli VE aynı oturumda silmeli.

**Neden:** TASK-MTVN8M702FU5A'da tam bunun tersi oldu — bir önceki doğrulama 286 satırı
yerel Postgres'te (`SystemAlert`) bıraktı, hiçbir checked-in test bunu yakalamıyordu.
`SystemAlert`'ın `tenantId` kolonu yok (bkz. `scripts/check-orphan-alerts.ts` docstring'i),
yani tenant-silme sweep'i de bu satırlara dokunamıyor — kalıcı çöp. Satırların hepsi AYNI
`createdAt` damgasını taşıyordu (tek seferlik toplu insert imzası), ve şans eseri hâlâ
tanınabilir bir `source` deseni kullanmıştı; o desen olmasaydı 286 satırı gerçek
alarmlardan ayırmanın YOLU YOKTU.

**How to apply:**
- Bir UI davranışını (kesme, sayaç, filtre) elle DB'ye satır yazarak doğrularken, satırlara
  o oturuma özel, benzersiz bir alan koy (`source: `probe-${Date.now().toString(36)}``
  gibi) — sabit bir string DEĞİL, çünkü sabit string iki eşzamanlı doğrulamada çarpışır.
- Silme her zaman o benzersiz alana dar kapsamlı `deleteMany` ile olsun; "hepsini temizle"
  ya da geniş bir `contains` sorgusu YAZMA.
- Ölçülecek eşik bir sabitse (`MAX_ROWS = 300` gibi), taban sayıyı bilmene gerek yok —
  eşiği kesinlikle aşacak kadar satır ekle (`MAX_ROWS + 1`), taban her ne olursa olsun
  toplam eşiği geçer.
- Kalıcı kapsama en iyi çözüm: bu doğrulamayı bir kerelik script yerine kendi
  `afterAll`'ında temizleyen bir e2e/vitest testine dönüştür — bkz.
  `tests/e2e/alert-console-truncation.spec.ts` (TASK-MTVN8M702FU5A'da eklendi:
  301 satırlık pile + admin konsolunda gerçek `count()` ve kesme notu doğrulaması +
  `afterAll`'da `source`'a dar kapsamlı silme, `removed.count` ile doğrulanıyor).

**Related:** [[fabrika-alert-console-row-limit]] · [[fabrika-db-backed-change-needs-a-db-baseline-too]]

---
name: an-alert-body-that-changes-every-run-defeats-its-own-dedupe
description: Yeni bir SystemAlert çağıranı yazarken meta'yı SABİT tut ve dizileri SIRALA — zaman damgası/hata metni koyan çağıran TASK-MTS80DUAF39Z8'in tekrar korumasını sessizce kapatır; ayrıca satırın ekrana ulaştığını tıklayarak kanıtla
metadata:
  type: project
  updatedAt: 2026-09-09
---

`recordAlert()` bir uyarıyı `(level, source, message, çağıranın meta'sı)` ile tanır ve
**çözülmemiş** özdeş satıra katlar. Yani **kimliğin bir parçası meta'dır**.

Yeni bir çağıran yazarken (TASK-MTTOUDNQ97X83, imha işi) uygulanan kurallar:

1. `source` ve `message` **sabit** — koşuya göre değişen hiçbir şey içermez.
2. meta yalnız **olguyu** taşır: `failedCount`, `failedUserIds`, `failureKinds`.
   Zaman damgası, deneme sayısı, rastgele id, **ham hata metni** YOK — biri girerse her gece
   yeni satır açılır ve düzeltilmiş sonsuz-büyüme davranışına geri dönülür.
3. Diziler **sıralanır**: `stableStringify` dizi sırasını anlamlı sayar, yani aynı iki hesabın
   ters sırada gelmesi farklı bir uyarı olurdu.
4. Hata **kodu** (`errorCode(error)` → `P2011`) taşınır, hata **metni** taşınmaz:
   `SystemAlert`'in `tenantId`'si ve RLS politikası yoktur; metin kiracı değeri sızdırabilir.

Ölçüm: iki gece üst üste aynı hata → tek satır, `alertRepeatCount: 2`. Farklı hesap → yeni satır.

**Ve satır ekrana ulaşmalı.** `/[locale]/admin/alerts` meta'yı yalnız satıra **tıklayınca**
açar; "satır yazıldı" testi bunu kanıtlamaz. Gerçek tarayıcıda platform admin ile açıp satıra
tıklayan bir spec yazıldı — [[a-record-is-not-a-document]] burada da geçerli.

Yazma yolunu ayrıca **üretim rolüyle** ölç: `SystemAlert`'te RLS yok ve `fabrika_app`'in
INSERT yetkisi var (ölçüldü). `AiUsageLog` aynı görünüp RLS'e takılmıştı (TASK-MTSYH8LDGV5YU).

İlgili: [[fabrika-idempotency-which-tables-must-stay-flat]] · [[a-fix-can-turn-a-silent-bug-into-an-outage]]

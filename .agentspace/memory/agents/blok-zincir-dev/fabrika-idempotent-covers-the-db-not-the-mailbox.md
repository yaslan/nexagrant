---
name: fabrika-idempotent-covers-the-db-not-the-mailbox
description: Bir betik "running twice is safe" diyorsa bu genelde yalnız DB upsert'leri içindir — mail/ödeme/webhook gibi dış yan etkiler ayrıca korunmalı; Fabrika'da esr-calibration --send tam olarak böyleydi
metadata:
  type: project
  updatedAt: 2026-09-08
---

`scripts/esr-calibration.ts` başlığı şunu vaat ediyordu: *"Every database write is an upsert on a
deterministic id … Running twice is safe and is part of the definition of done."* Vaat **doğruydu ama
eksikti**: yalnız DB yazmalarını kapsıyordu. Aynı betiğin `--send` adımı — tek geri alınamaz adım —
hiçbir koruma taşımıyordu ve ikinci koşuda 10 ortağın hepsine anketi tekrar yolluyordu.

**Genel ders:** bir betikte idempotency iddiası gördüğünde *hangi yan etki için* doğru olduğunu sor.
DB upsert'i idempotent yapmak kolay olduğu için genelde tek yapılan odur; asıl geri alınamaz olan
(mail, ödeme, dış API, dosya silme) korumasız kalır. **Sıralaman ters olmalı: en az geri alınabilir
adım en çok korunan adım olsun.**

Fabrika'daki düzeltme (commit `fb337a3`, TASK-MTQ2KL3JO4MK2):
- makbuzda kayıtlı ortaklar atlanır → yarıda kesilen koşu **devam eder**, tekrarlamaz
- teslim edilecek kimse kalmadıysa koşu reddeder; `--resend` bilinçli ve loglu override
- makbuz birleştirilir (`mergeRecipients`), üzerine yazılmaz — yoksa devam eden koşu öncekilerin
  kanıtını siler

**Açık kalan:** makbuz `docs/BETA_DATA/generated/` altında ve gitignore'lu, yani **makineye özel**.
İki farklı makineden gönderim yapılırsa birbirlerini görmezler. Kapı ve `--send` artık bunu söylüyor
ama teknik olarak çözmüyor; gerçek çözüm makbuzu DB'ye/R2'ye taşımak ve bu PII kararı gerektiriyor.

Doğrulama yöntemi: [[fabrika-test-a-destructive-path-by-removing-its-credential]].

---
name: my-probe-residue-can-block-a-not-valid-constraint
description: Bir CHECK kısıtı NOT VALID kaldıysa suçlu çoğu zaman kendi sondamın bıraktığı satırlardır — satırlara BAK, kalıntıysa sil ve VALIDATE koş; bu bir yayın adımını kapatır
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

## Ne oldu
TASK-MTSWLWDONWA3W'de şema `Invoice_fx_required_for_foreign_currency` kısıtını
`NOT VALID` olarak eklemişti ve 3. tur raporum bunu "prod'a geçmeden
`VALIDATE CONSTRAINT` koşulmalı" diye **riske** yazıp bırakmıştı. 4. turda satırlara
baktım: kısıtın doğrulanmasını engelleyen iki satır **benim 2. turumun sonda
kalıntısıydı** (`qa-fx-…` fixture kiracısı, biri kursuz USD). Başka hiçbir kiracıda
fatura yoktu. Sildim, `ALTER TABLE … VALIDATE CONSTRAINT` koştu → `convalidated: true`.

**Why:** `NOT VALID` "kısıt zayıf" demek değil — yeni her yazma zaten denetlenir; yalnız
*mevcut* satırlar doğrulanmamış kalır. Yani bu bayrak neredeyse her zaman **veriyle**
ilgilidir, kodla değil. Kalıntı bırakan bir QA turu, kendi bıraktığı satırla bir sonraki
turun yayın adımını kilitler ve bunu "risk" diye rapora yazıp gerçek bir işi açık gösterir.

## How to apply
1. `convalidated=false` gördüğünde önce **satırları oku** — sayıyı değil, satırın kendisini
   (numarası, kiracısı, `createdAt`'i). Fixture deseni (`qa-…`, sonda zaman damgası) taşıyorsa
   kalıntıdır.
2. "Başka kiracıda var mı" sorusunu AYRICA sor (`count({ where: { tenantId: { not: fixture } } })`)
   — silmeden önce gerçek veriye dokunmadığını kanıtla, çıktıyı rapora koy.
3. Sil → `VALIDATE CONSTRAINT` → aynı yolu bir kez daha koş (kısıt doğrulandıktan sonra
   davranış değişmemeli) → kalıntı sayısını 0 olarak raporla.
4. Prod için ayrı satır yaz: dev'de doğrulanmış olması prod'u doğrulamaz.

İlgili: [[probes-on-a-shared-db-must-run-one-file-at-a-time]] ·
[[fabrika-schema-done-means-information-schema]]

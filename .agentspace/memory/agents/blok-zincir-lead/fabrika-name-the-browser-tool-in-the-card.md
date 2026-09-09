---
name: fabrika-name-the-browser-tool-in-the-card
description: Worker "CLI'da tarayicim yok" diyip gercek tarayici DoD'unu insana devrediyor — karta Playwright'i ADIYLA ve recete olarak yazmak bu mazereti kaldiriyor
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

TASK-MTTXQKBWYSS4K'de karta "gercek tarayicida konsol hatasi olmayacak" yazdim; worker kodu duzeltti,
lint/typecheck/test kosdu, ama tarayici maddesini **"benim tarayici erisimim yok, manuel dogrulama
insan tarafindan yapilacak"** diye devretti ve raporu yine de "bitti/PR ready" diye kapatti.
Rapor durusttu, DoD ise karsilanmamisti — ve altindaki regresyon (bkz. [[fabrika-beforeinteractive-not-parse-time]])
tam da o atlanan maddeyle yakalanacakti.

DERS: "gercek tarayici" demek yetmiyor; karta ARACI ADIYLA ve KOSULABILIR RECETE olarak yaz.
Bu depoda Playwright kurulu (`playwright.config.ts`, `pnpm test:e2e`), yani mazere yer yok:
"gecici bir spec yaz, `page.on('console')` ile mesajlari topla, su assertion'i kur, ciktiyi rapora kopyala".
Dahasi DoD'u iki-tarafli olcume bagla ("duzeltme ONCESI false, SONRASI true") — tek tarafli olcum
worker'in zaten inandigi seyi tekrar etmesine izin veriyor.

Ayrica: raporda dogrulamayi REDDEDEN cumleyi ara (bkz. [[fabrika-check-artifact-timestamps-against-dispatch]]);
"bitti" ozeti ile govdedeki "yapilamadi" cumlesi ayni raporda yan yana durabiliyor.

---
name: my-own-verification-report-goes-stale
description: Bir kart "QA doğruladı" notuyla geri geldiyse önce doğruladığın commit ile HEAD arasına bak — arada tam o kartın işi inmiş olabilir
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Kendi yazdığın doğrulama raporu da bayatlar. TASK-MTSWLWDONWA3W kartı
"düzeltmeler ayakta, ADR kararı bekleniyor" notuyla geri geldi; oysa doğruladığım
`311c902` ile HEAD arasında 38 commit vardı ve içlerinde kararın kendisi
(ADR-0002 option b kabul) ile Faz 2 uygulaması duruyordu. Raporu tekrar
özetlemek, bitmiş işi "bekliyor" diye raporlamak olurdu.

**Nasıl uygulanır:** Her yeniden-doğrulama turunun İLK komutu:
`git merge-base --is-ancestor <doğrulanan> HEAD; git log --oneline <doğrulanan>..HEAD`.
Boş değilse rapor bayattır — kartı sıfırdan, HEAD'de ölç. Kart metnindeki
"bekliyor/bloke" ifadesi de o commit'lerle çürütülmüş olabilir; kart metnine
değil ağaca inan. [[stale-audit-report-reframes-before-it-is-reused]]

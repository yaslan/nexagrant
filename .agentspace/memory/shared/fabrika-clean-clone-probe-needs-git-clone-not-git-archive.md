---
name: fabrika-clean-clone-probe-needs-git-clone-not-git-archive
description: Temiz-klon probunu `git archive` ile yapma — `.git` üretmediği için git index'i okuyan testler sahte kırmızı verir; `git clone --no-hardlinks` kullan
metadata:
  type: project
  updatedAt: 2026-09-08
---

`git archive HEAD | tar -x -C <tmp>` temiz-klon probu için **eksik** bir araç: yalnız
dosyaları çıkarır, `.git` dizini üretmez. Fabrika'da git'i sorgulayan testler var —
`src/modules/m8/server/schema-contract.test.ts` kapsamını `git ls-files` ile belirliyor
ve kendi boşluk-korumasını taşıyor:

    AssertionError: git ls-files answered nothing — the scope check is vacuous

Bu **sahte kırmızıdır** — HEAD'in kusuru değil, probun kusuru. TASK-MTSVTD6Q7A6'da tam
süiti `git archive` kopyasında koşunca 1 test böyle patladı; gerçek klonda 0 başarısızlık.

**Nasıl uygula:** tek bir dosyanın import'unu doğrulamak için `git archive` yeterli
(ucuz, hızlı). TAM süiti temiz durumda koşacaksan gerçek klon kullan:

    git clone --no-hardlinks <repo> <tmp>/realclone
    cd <tmp>/realclone && git checkout dev
    ln -sfn <repo>/node_modules node_modules   # node_modules zaten git'te değil
    npx vitest run --passWithNoTests           # ~6 sn

Klon yalnız commit'li durumu getirir, untracked dosyalar gelmez — aranan tam da bu.
`git status --porcelain` klonda boş çıkmalı.

[[fabrika-green-gate-does-not-prove-a-clean-clone]] bu probu `git archive` olarak tarif
ediyor; tam süit için o tarif yetersiz. İlgili: [[fabrika-clean-clone-silently-skips-rls-tests]]

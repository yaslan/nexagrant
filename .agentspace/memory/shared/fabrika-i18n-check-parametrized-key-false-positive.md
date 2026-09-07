---
name: fabrika-i18n-check-parametrized-key-false-positive
description: pnpm i18n:check parametreli t('key', {…}) çağrılarını göremez ve anahtarı "unused" sayar — bu bir hata değil; ayrıca komut bu depoda zaten exit 1 dönüyor ve pnpm gate'in parçası değil
metadata:
  type: project
  updatedAt: 2026-09-07
---

`scripts/i18n-check.ts` çağrı yerlerini `t('...')` biçiminde tarar. `t('key', { count: 3 })`
gibi **parametreli** çağrıları tanımaz, dolayısıyla anahtarı `unusedInTurkish` /
`unusedInEnglish` kovasına koyar. Bu bir eksik anahtar değildir — anahtar iki katalogda da
vardır ve UI'da render edilir.

Doğrulama yolu: raporun `missingInTurkish` / `missingInEnglish` / `missingInBoth`
kovalarına bak; anahtarın orada **olmaması** yeterlidir (`tests/i18n.test.ts` de yalnız
tr/en simetrisini zorlar ve `pnpm test` içinde koşar). "unused" listesini kanıt sayma;
gerçek kanıt sayfanın ekran görüntüsüdür.

Ayrıca: `pnpm i18n:check` bu depoda **zaten exit 1** dönüyor (şablon değişkenli anahtarlar
`${...}` yüzünden, ör. `Pipeline.detail.tab.${tab}`) ve `pnpm gate`'in parçası **değil** —
kırmızı çıktısını kendi değişikliğine yorma, kendi anahtarlarını `missing*` kovalarında ara.
İlgili kural: `t()` anahtarı her zaman düz literal olmalı ([[fabrika-i18n-dead-catalog-trap]]).

**İkinci ve daha büyük kör nokta (2026-09-07):** çıkarıcı yalnızca
`content.includes('useTranslations')` olan dosyaları tarıyor (`scripts/i18n-check.ts:83`). Yani
`getTranslations(...)` kullanan **tüm sunucu bileşenleri** görünmez — anahtarları hep "unused"
kovasında çıkar ve o dosyalardaki gerçek bir eksik çeviri hiç yakalanmaz. Bugünkü 510 "unused"
anahtarın büyük kısmı budur. Kanıt yolu değişmiyor: `missingInTurkish`/`missingInEnglish`
listelerine bak + ekran görüntüsü al.


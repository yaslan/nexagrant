---
name: fabrika-i18n-check-skips-files-with-no-t-call
description: i18n:check yeşil olsa da hiç t() içermeyen dosyayı hiç taramıyor — 50 dosyada 480 sabit metin, 10 rota /en altında tamamen Türkçe; kapı pariteyi ölçüyor, kapsamı değil
metadata:
  type: project
  updatedAt: 2026-09-09
---

`scripts/i18n-check.ts` bugün üç şeyi gerçekten blokluyor — katalog paritesi, kullanılan
statik anahtarın çözülmesi, dinamik anahtar şeklinin karşılığı olması — ve `pnpm gate`'in
parçası. (Eski "kapı fiilen kapalı" notu [[fabrika-i18n-gate-is-effectively-off]] ve
[[fabrika-i18n-check-parametrized-key-false-positive]] bu noktada ESKİMİŞTİR: komut artık
exit 0 dönüyor ve şablon değişkenli çağrılar için hayalet eksik üretmiyor.)
Ölçmediği şey **kapsam**. Dosya döngüsünün ilk satırı:

```ts
if (!raw.includes('useTranslations') && !raw.includes('getTranslations')) continue;
```

Yani **çeviriye hiç bağlanmamış bir sayfa denetimden tamamen muaf.** Bir metni `t()`'ye
bağlarsan denetlenirsin, sabit yazarsan görünmez olursun — kapı yanlış yönde teşvik veriyor.

2026-09-09 ölçümü (TASK-MTU64MMEQC0WV, tarayıcı:
`docs/agent-results/TASK-MTU64MMEQC0WV-evidence/scan-hardcoded.mjs`, tam liste aynı klasörde):
katalog paritesi KUSURSUZ (tr/en 1363-1363, sıfır eksik/fazla), buna karşılık `src/**/*.tsx`
içinde **480 sabit kullanıcı metni / 50 dosya**. Rota klasöründe hiç `t()` olmayanlar —
yani `/en` altında da kelimesi kelimesine Türkçe çıkanlar:

    marketplace · tto · opportunities/[id]/application · settings/modules · settings/api-keys
    admin/cordis · admin/settings · admin/tenants · admin/audit · admin/modules
    (pipeline ve evidence kısmi: 7 dosyanın 3'ü, 4 dosyanın 1'i)

Sonuçlar:
- "`pnpm i18n:check` yeşil" i18n'in bittiğinin KANITI DEĞİL. Bir rotanın çevrildiğini
  iddia etmeden önce o klasörde `grep -rl "useTranslations\|getTranslations"` koş.
- Kapıyı sabit metne karşı sıkılaştırmak bugün anında kırmızı verir (480 mevcut ihlal).
  Sıkılaştırma yapılacaksa **baseline'lı** olmalı: liste büyürse kırmızı, küçülürse baseline
  güncellenir — yoksa ekip kapıyı gevşetmeye zorlanır.
- `aria-label` gibi görünmeyen metinler de sabit (MobileAppHeader, MobileAdminHeader,
  ThemeToggle): gözle bakan QA bunu kaçırır, taramayla yakalanır.

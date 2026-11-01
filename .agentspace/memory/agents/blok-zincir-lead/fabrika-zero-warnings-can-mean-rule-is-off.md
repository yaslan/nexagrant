---
name: fabrika-zero-warnings-can-mean-rule-is-off
description: Bir lint kuralı için 0 uyarı görmek kodun temiz olduğu anlamına GELMEZ — Fabrika'da react-hooks/set-state-in-effect hiç yapılandırılmamıştı; kartı dağıtmadan önce eslint.config.mjs'te kuralın AÇIK olduğunu doğrula
metadata:
  type: feedback
updatedAt: 2026-09-07
---

İki kart (TASK-MTREW28BU7STD, TASK-MTQVFP0LV3YV7) `react-hooks/set-state-in-effect`
borcunu temizlemeyi istiyordu. `pnpm lint | grep -c set-state-in-effect` → **0**.
"Bitmiş" diye kapatmaya çok yakındım.

`eslint.config.mjs`'i açınca sebep göründü: dosyada yalnız `@typescript-eslint/no-unused-vars`
override'ı var; o kural **hiç yapılandırılmamış**. Yani 0, "ihlal yok" değil, **ölçüm yok**
demekti. Doğru iş sırası: kuralı aç → ölç → refactor et → kural açık kalsın.

Aynı tuzağın genel biçimi: bir sayıyı "temiz" diye okumadan önce onu ÜRETEN şeyin
gerçekten baktığını doğrula. Kapı için karşılığı [[fabrika-verify-what-a-gate-measures]];
lint için karşılığı bu.

Yanında çıkan ikinci bayatlık: aynı lint kartı "107 uyarı, next/image taşıması hiç inmedi"
diyordu. Ölçtüm: 82 uyarı, 81'i `no-unused-vars`, `no-img-element` **0** — next/image işi
inmişti, kart metni aylarca yanlış kaldı. Kart metni bir iddiadır; dağıtmadan önce ölç.

İlgili: [[fabrika-verify-backlog-before-assigning-finds-worse]] · [[fabrika-widen-a-narrow-gate-to-size-and-find]]

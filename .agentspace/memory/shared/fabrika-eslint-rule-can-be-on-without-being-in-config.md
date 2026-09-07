---
name: fabrika-eslint-rule-can-be-on-without-being-in-config
description: DÜZELTME — bir kural eslint.config.mjs'te görünmüyor diye kapalı DEĞİLDİR; Fabrika'da react-hooks/set-state-in-effect ilk günden beri error, "0 uyarı" ise susturulmuş ihlal demekti — kuralın durumunu `eslint --print-config` ile oku
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

TASK-MTQVFP0LV3YV7 kartı "`react-hooks/set-state-in-effect` kuralı `eslint.config.mjs`'te HİÇ
açık değil → 0 uyarı ölçümsüzlük" diyordu. **İkisi de yanlıştı.** Ölçüm (2026-09-08):

```
$ grep -n "react-hooks" eslint.config.mjs          → eşleşme yok      (kartın dayanağı, doğru)
$ npx eslint --print-config <dosya> | jq '.rules["react-hooks/set-state-in-effect"]'
[2]                                                 (= error, ve 16 react-hooks kuralı açık)
$ git log -S"eslint-plugin-react-hooks@7" --oneline -- pnpm-lock.yaml
0858e2d Initial commit                              (ilk günden beri açık)
```

Kural dosyada değil çünkü `eslint-config-next/core-web-vitals` →
`eslint-plugin-react-hooks@7.1.1`'in `recommended` setinden geliyor. **Paylaşılan config'i
`...spread` eden her kurulumda config dosyası kuralların TAMAMINI göstermez.**

## İki ayrı tuzak, ikisi de "0" üretir

1. **Kural kapalı** → 0, çünkü kimse bakmıyor.
2. **Kural açık, ihlaller susturulmuş** → 0, çünkü satır-içi `eslint-disable-next-line` var.

Fabrika'daki durum **2**'ydi: `notifications/client.tsx:60` ve `UserMenu.tsx:194`. Bunu
`eslint.config.mjs`'e bakarak ayırt edemezsin.

## Doğru sıra (grep'i tekrarlama)

```
eslint --print-config <gerçek bir dosya>          # kural açık mı, hangi seviyede
grep -rn "eslint-disable.*<kural>" src/           # susturulmuş ihlal var mı
# aleti sına: bilerek ihlal eden geçici bir dosya yaz, ateşliyor mu bak, sil
```

Üçüncü adım ucuz ve "0"ı kesin yorumlatır: sonda dosyası hata verdiyse alet çalışıyor demektir.

## Bu neden bir DÜZELTME kaydı

`agents/blok-zincir-lead/fabrika-zero-warnings-can-mean-rule-is-off.md` bu olaydan
"kural hiç yapılandırılmamıştı" sonucunu çıkarıp genel kural haline getirdi. Sezgisi
(*"bir sayıyı temiz diye okumadan önce onu ÜRETEN şeyin baktığını doğrula"*) doğru; ama o
doğrulamanın kendisi yine grep'le yapılmış ve yanlış teşhis vermiş. Doğrulama **çözümlenmiş
yapılandırmadan** yapılır, config dosyasından değil.

Aynı ailenin başka bir örneği: [[fabrika-hardcoded-copy-defeats-grep-audit]] — orada da grep'in
"bulamadım"ı "yok" diye okunmuştu. Kapı tarafındaki karşılığı:
[[fabrika-verify-what-a-gate-measures]].

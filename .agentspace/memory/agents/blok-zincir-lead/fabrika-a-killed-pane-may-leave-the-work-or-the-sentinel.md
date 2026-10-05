---
name: fabrika-a-killed-pane-may-leave-the-work-or-the-sentinel
description: "failed" bir pane işin yapılmadığı anlamına gelmez — kartı yeniden vermeden ÖNCE çalışma ağacına bak; hele kart geçici bir nöbetçi (ZZTEST gibi) söylüyorsa nöbetçi ağaçta kalmış olabilir
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Ne oldu
Patronun P1 marka direktifini blok-zincir-dev'e verdim; pane **exit 143** (SIGTERM) ile öldü,
rapor yazılamadı, supervisor "failed · beklenen çıktı yok" dedi. Kartı yeniden vermeye
hazırlanırken önce ağaca baktım:

```
src/lib/brand.ts:18   export const PRODUCT_NAME = 'FonBridge';   ✅ yapılmış
smtp-form.tsx :11 :14 :127 :168 → noreply@usfinbridge.com        ✅ yapılmış
git status → ikisi de COMMIT EDİLMEMİŞ · rapor dosyası YOK
```

Yani kod tamdı; eksik olan **doğrulama + commit + rapor**. Kartı "tekrar yap" diye verseydim
ajan aynı işi ikinci kez yapacaktı.

## Asıl tehlike — nöbetçi ağaçta kalabilir
Bu kart, adın gerçekten tek kaynaktan geldiğini kanıtlamak için geçici bir nöbetçi
söylüyordu ([[fabrika-prove-a-single-source-constant-with-a-sentinel]]):
`PRODUCT_NAME`'i `'ZZTEST'` yap, ölç, geri al. Pane sondanın **ortasında** öldürülseydi ürün adı
çalışma ağacında `ZZTEST` olarak kalırdı — ve bunu kimse fark etmeden bir sonraki commit'e
girebilirdi. Bu turda kalmamıştı, ama olabilirdi.

## Kural
Bir pane `failed` olduğunda, kartı yeniden vermeden önce SIRAYLA:
1. `git status --short` + kartın dokunacağı dosyalarda hedef değeri `grep`le — iş yapılmış olabilir.
2. Kart geçici bir nöbetçi/sonda içeriyorsa **nöbetçinin ağaçta kalıp kalmadığını ÖNCE ara**
   (`grep -rn "ZZTEST"` gibi). Bu, kayıp iş aramaktan daha acildir.
3. Sonuç raporu var mı, commit inmiş mi — ayrı ayrı bak; üçü (kod / commit / rapor) birbirinden
   bağımsız düşebilir.
4. Yeni kartı bulguna göre yaz: "tekrarlama, TAMAMLA" ve ne bulduğunu ajana SAYIYLA söyle ki
   kendi doğrulamasını yapsın (başkası geri almış olabilir).

İlgili: [[fabrika-idle-pane-failure-means-nothing-ran]] (ters durum: pane boşta öldü, HİÇ iş yok) ·
[[fabrika-recard-verify-then-file-the-followups]] · [[fabrika-verify-the-tree-not-just-the-report]]

## Ölçülen olay 2 (2026-09-10) — ağacı GÖRMEK yetmez, KAPIYA sokmak gerekir

İki kart (TASK-MTVFL8IJALB2H dedup anahtarı + TASK-MTVFJTNW6OW11 resolvedAt süpürücüsü) aynı
blok-zincir-dev pane'ine verilmişti; pane **exit 129** (geçici API hatası) ile öldü, iki rapor
da yazılmadı. Ağaçta 9 değişmiş + 3 untracked dosya duruyordu. Bu kez sadece `git status`'a
bakmakla yetinmedim, işi kapıya soktum:

```
pnpm typecheck                                  → exit 0 (temiz)
pnpm vitest run <4 ilgili dosya>                → 4 dosya / 72 test yeşil
```

Yani kod yalnız "var" değil, **çalışır** durumdaydı. Kartları "yeniden yap" diye vermek bu
işi çöpe atardı; "DEVRAL ve BİTİR" diye verdim ve ölçtüğüm sayıları (exit 0, 72 test)
delegasyon metnine yazdım ki ajan kendi doğrulamasını benimkiyle karşılaştırsın.

**Yeni kural — iç içe geçmiş yetim WIP tek pane'e gider:** iki kartın commit'siz işi AYNI
dosyaya (`src/lib/observability/system-alert.ts`) dokunuyorsa, iki kartı iki ayrı pane'e
vermek dosya yarışı üretir. İkisini TEK worker'a, tek alt-görev maddesi olarak ver ve iki
ayrı rapor dosyası iste. (`agentspace_delegate` maddeyi böldüğü için de tek madde şart —
bkz. [[agentspace-delegate-splits-numbered-lists]].)

İlgili: [[fabrika-paused-is-not-dead-check-before-adopting-wip]] (önce pane CANLI mı diye bak:
bu turda `agentspace_pane action=list` yalnız kendi pane'imi gösterdi, yani WIP gerçekten yetimdi)

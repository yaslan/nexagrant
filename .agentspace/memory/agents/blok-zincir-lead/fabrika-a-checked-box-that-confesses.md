---
name: fabrika-a-checked-box-that-confesses
description: Isaretli bir DoD kutusunun ICINDE "ama sorun var" cumlesi varsa kart kapanmaz — raporu okurken once kutularin ICINE bak
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

TASK-MTU26XBVZ6H1O 1. turunda worker kendi DoD'unda şunu **işaretli** teslim etti:

> `- [x] Env'lerle test yeşil, env'leri kaldırınca hata (ama lazy import sorun), reuseExistingServer sorun var`

Kutu yeşildi, içeriği iki açık sorun itiraf ediyordu. Raporun geri kalanı da yalnız **yeşil**
koşuyu gösteriyordu — bir kapının kapı olduğu ise GEÇTİĞİ değil KALDIĞI gösterilerek kanıtlanır.

Lider refleksi: bir sonuç raporunu okurken önce DoD listesine git ve **işaretli kutuların
metnini** oku, sayısını değil. "ama", "sorun var", "kısmen", "şimdilik" geçen işaretli bir
kutu = kapatılmayacak kart. Aynı raporda kırmızı kanıt yoksa zaten kapatma.

İkinci sinyal: kart başlığı "yarısı" / "bir kısmı" diyorsa, düzeltilen dosyaları SAY. Bu turda
üç spec'ten ikisi düzeltilmişti, üçüncüsü (`tests/e2e/invoice-write-path.spec.ts:171`) hâlâ
503'ü pass sayıyordu — rapor o dosyayı hiç anmıyordu. Raporun ANMADIĞI dosya, işin yapılmadığı
yerdir.

İlgili: [[fabrika-a-passing-test-can-be-satisfied-by-a-second-mechanism]] ·
[[fabrika-partial-fix-check-all-surfaces-of-the-same-bug]] ·
[[fabrika-playwright-reuses-a-stale-dev-server]]

**Üçüncü biçim — parantez, iddiayı süslemez, KAPSAMINI daraltır (TASK-MTVFKK8UZS5BF, 2026-09-10).**
Rapor şöyle diyordu:

> Test alerts were then removed *(seed-test-alerts.ts deleted, seed.ts reverted)*

Cümle "test alarmları kaldırıldı" diyor; parantez ise **gerçekte ne kaldırıldığını** sayıyor —
script ve seed dosyası, yani ARAÇ. Satırların kendisi hiç anılmıyor. Burada itiraf bir "ama"
değil, bir **envanter**: parantezde sayılanlar iddiadan azsa, iddia o kadardır.

Lider refleksi: bir raporda "temizledim / kaldırdım / geri aldım" cümlesi gördüğünde parantezi
ve yan cümleyi cümlenin AÇIKLAMASI değil KAPSAMI olarak oku. Sonra sayıyla doğrula.

**Ve bu sınıfın en ucuz doğrulaması aritmetiktir.** Depoda zaten bir sayıcı varsa bir koşuda biter:
```
önce (kart başlamadan)   : 31 tenant'sız satır
worker'ın eklediği       : 286   (raporun kendi çıktısı)
şimdi (pnpm alerts:check): 317   → 31 + 286 = 317, satırlar DURUYOR
```
"N şeyi temizledim" diyen her iddia, deponun kendi kapı/sayım komutuyla (burada `pnpm alerts:check`,
`TASK-MTVFWYKIZXRB1` ile yeni gelmişti) tek komutta çürütülebilir ya da doğrulanabilir. Raporun
düzyazısına değil sayıcıya sor. Bkz. [[fabrika-one-read-of-a-live-tree-is-a-frame-not-a-fact]] —
orada tek okuma yetmiyordu; burada tek okuma YETİYOR, çünkü ölçen şey rapor değil kapının kendisi.

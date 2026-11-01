---
name: fabrika-agents-share-one-working-tree
description: Fabrika'da paralel ajanlar TEK çalışma ağacını paylaşır — commit ederken yalnız kendi yollarını ver, `git commit -a`/çıplak `git add .` başkasının yarım işini yutar
metadata:
  type: project
updatedAt: 2026-09-07
---

Bu depoda paralel ajanlar ayrı worktree'de değil, **aynı dizinde** çalışır. Sonuçları:

1. **İndeks paylaşımlıdır.** 2026-09-07: kendi 3 dosyamı `git add` edip commit edecekken
   `git diff --cached` başka bir ajanın (blockzincir-pm) 28 dosyalık yarım işini gösterdi —
   o ajan `git add` etmiş, henüz commit etmemişti. `git commit` deseydim onun işini kendi
   mesajımla yutacaktım.
   **Çözüm:** `git commit <yol> <yol> -F -` — pathspec'li commit yalnız verilen yolları
   alır, indekstekinin geri kalanına dokunmaz. Commit'ten SONRA `git show --stat` ile ne
   commit'lediğini doğrula.
2. **Typecheck ağaç genelinde kırmızı olabilir** ve suç sende olmayabilir. `githooks/pre-commit`
   tam da bu yüzden yalnız STAGED dosyalardaki tsc hatalarında bloke eder, başkasınınkini
   uyarı olarak yazar.
3. **`git add <kendi yollarım>` + çıplak `git commit` YETMEZ — yarıştır.** 2026-09-07,
   TASK-MTQW76AKXW8OP: yalnız kendi 2 hafıza dosyamı `git add` ettim, ama indekste zaten
   başka bir ajanın (blok-zincir-dse) staged 17 dosyası duruyordu; çıplak `git commit`
   hepsini benim mesajımla aldı (19 dosya, 1445 satır). Hiçbir şey KAYBOLMADI ve kapı
   temiz geçti — ama iş yanlış commit mesajına yazıldı ve paylaşılan bir branch'te
   `--amend` ile düzeltmeye kalkmak (araya başka ajanın commit'i girebilir) daha kötüdür.
   `git diff --cached --stat` ile önden bakmak da tam koruma değil: senin bakışınla
   commit'in arasındaki saniyelerde başkası `git add` edebilir.
   **Tek yarış-güvenli yol:** `git commit <yol> <yol> -F -` — pathspec'li commit indeksin
   geri kalanını görmezden gelir. Her zaman bu formu kullan.
4. `git commit -a`, `git add .`, `git add -A` bu depoda TEHLİKELİDİR.

Bkz. [[fabrika-parallel-agent-file-race]] · [[fabrika-ci-has-no-remote]]

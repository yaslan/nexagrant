---
name: fabrika-mutation-red-may-fire-on-another-assertion
description: Mutasyon kontrolünde "kırmızı oldu" yetmez — HANGİ iddianın ateşlendiğini oku; ürünün katmanlı savunması varsa beklediğin negatif iddia ölü olabilir
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Bir e2e spec'ini mutasyonla doğrularken (ürünü kasten boz → spec kırmızı olmalı,
[[fabrika-prove-the-fix-against-the-real-database]]) sonucu "kırmızı/yeşil" diye
okumak yarım ölçümdür. **Hangi satırın düştüğünü** oku: spec'in gerçekte hangi
katmanı çivilediğini ancak o söyler.

Somut örnek (TASK-MTS6MFER9LQZR, `f10-absence-not-zero`): spec iki şey iddia ediyor —
boş çalışma alanı açıklama göstermeli (olumlu) **ve** hiçbir yerde `0,0` yazmamalı
(olumsuz). `src/modules/m5/ui/Dashboard.tsx`'te iki yokluk dalını da `false && …` ile
kapatıp F10 hatasını geri getirdim. Spec kırmızı oldu — ama **olumlu** iddiadan:

```
Expected substring: "Bu çalışma alanında henüz fırsat yok"
Received string:    "Toplam Teklif0projeİsabet OranıHenüz veri yok…"
```

Yani kartlar `0,0` basmadı, kart başına `Henüz veri yok` bastı: F10 savunması **iki
katmanlı** (dış boş-durum dalı + `metricCard`'ın `emptyDescription`'ı). Spec dış katmanı
koruyor; `not.toContainText('0,0')` satırının kırmızı verdiği bir senaryo bilinmiyor —
"koruduğunu sandığımız" ölü bir iddia olabilir.

Kural: mutasyon çıktısında ateşlenen iddiayı rapora **adıyla** yaz. Ateşlenmeyen
negatif iddialar için "bu mutasyonda ölçülmedi" de; sessizce "spec ölçüyor" deme.
İkinci bir katman bulduysan bu bir kusur değil iyi haberdir, ama spec'in kapsamını
daralttığı için bildirilmeli.

Yan not: bu depoda ağaç ve dev sunucusu paylaşımlı
([[fabrika-agents-share-one-working-tree]]). Mutasyon `src/` altında yaşadığı sürece
o pencerede e2e koşan başka ajan **sahte kırmızı** görür. Pencereyi saniyelerle sınırla,
hemen geri al, `git status --porcelain -- src/` ile geri aldığını kanıtla ve mutasyon
pencerelerini rapora yaz. Spec dosyasına asla dokunma — orada başka bir ajan olabilir.

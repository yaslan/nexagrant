---
name: fabrika-idle-pane-failure-means-nothing-ran
description: "`tespit=idle` (\"boş prompt'ta bekliyor\") ölü pane'den FARKLIDIR — iş hiç başlamamıştır, ağaçta arayacak yarım kod yoktur"
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

2026-09-08, S12 Dalga 7. Yedi pane açıldı, yedisi de `failed · tespit=idle · worker 16
dakikadır sessiz ve boş prompt'ta bekliyor — alt-görev KOŞMUYOR` ile düştü. Sebep: model
limiti doluydu; pane doğdu ama prompt hiç çalışmadı.

Ölçüm bunu birebir doğruladı: beklenen **yedi rapordan sıfırı** vardı ve dalgadan sonra
tek bir commit yoktu (yalnız kendi hafıza commit'im). Yani **kayıp yok, iş de yok** —
dalga aynen yeniden gönderilebilir.

Bu, [[fabrika-dead-pane-work-measure-before-discarding]]'deki durumdan FARKLI, karıştırma:

| Tespit | Anlamı | Ne yapmalı |
|---|---|---|
| `tespit=repair` / kod 129 | Pane öldü, iş KISMEN yapılmış olabilir | `git diff` + `typecheck` + `test` ile ÖLÇ, üstüne devam ettir |
| `tespit=idle` | Prompt hiç başlamadı, ağaçta hiçbir şey yok | Ölçüp doğrula, sonra dalgayı AYNEN yeniden gönder |

İki ek kural:
1. **Dalga koşmadıysa panoyu geri al.** Dağıtırken kartları `in_progress`'e taşımıştım;
   hiç iş olmayınca pano yalan söylüyordu. `review`e geri çektim. Pano gerçeği yansıtmalı,
   niyeti değil.
2. **`delegation failed (504): no app window`** = AgentSpace ofis penceresi kapalı, pane
   açılamaz. Bu bir kod/izin sorunu DEĞİL; tekrar tekrar denemenin faydası yok — patrona
   pencereyi açmasını söyle ve dalgayı hazır tut.

**2026-09-08 ek — "dalga koşmadı" cümlesini görev metnine koyarken DİKKAT.** Yeniden gönderirken
her alt-göreve "önceki denemede prompt hiç başlamadı, ağaçta yarım kod YOK, sıfırdan başla"
yazdım. Bu dalga için doğruydu ama blog-yazar bunu haklı olarak düzeltti: onun KARTININ
geçmişinde iş vardı (`219ddca`, `bb78d65` — bir gün önce, aynı kimlikle). İki şey ayrı:

- **dalga** koşmadı → o KOŞUDAN kod yok
- **kart** ise günler önce başka bir koşuda çözülmüş olabilir

Doğru cümle: "bu KOŞUDAN ağaçta kod yok; ama kartın kendi geçmişini `git log -- <dosya>` ile
ÖLÇ ve varsa üstüne çık." Aksi halde worker sıfırdan yazmaya kalkar ve biten işi tekrar eder.

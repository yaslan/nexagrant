---
name: fabrika-workers-cannot-read-card-bodies
description: Worker panodan kartın GÖVDESİNİ okuyamıyor — list_tasks yalnız başlık döndürüyor, bu yüzden bütün detay dağıtım metnine yazılmalı
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

2026-09-08, S12 Dalga 7. Görev metinlerine alışkanlıkla "kartın tam metnini panodan OKU"
yazıyordum. customer-support bunun **mümkün olmadığını** ölçtü ve dürüstçe raporladı:

> "Board aracı (`list_tasks`) yalnız başlık döndürüyor, kartın gövdesini döndürmüyor; kart
> metnini disk üzerinde de bulamadım (`office-state.json` içinde yok)."

Worker "beş nokta"nın listesini kartın BAŞLIĞINDAN ve gövdenin daha önce kopyalandığı iki
kalıcı kayıttan (eski sonuç raporu + shared hafıza dosyası) çıkarmak zorunda kaldı.

**Sonuç: `create_task` açıklamasına yazdığım zengin başlıklı format worker'a ULAŞMIYOR.** O
format panoda insanın (patronun) okuması için değerli, ama worker'ın tek gördüğü şey
`agentspace_delegate` objective'ine yazdığım metin.

Kural: her alt-görev metni **kendi kendine yeterli** olmalı — dosya yolları, fonksiyon
imzaları, tam id'ler, ölçüm komutları, DoD. "Kartta yazıyor" diye kısa geçme. Kartın
gövdesini yine zengin yaz (patron onu okuyor, ve bir sonraki dalga onu kaynak alıyor), ama
worker'a giden metne **detayı tekrar kopyala**. Bu tekrar israf değil, tek iletim kanalı.

İkinci sonuç: bir kartın gövdesi kalıcı olarak yalnız iki yerde yaşıyor — sonuç raporları ve
hafıza dosyaları. Bu yüzden [[fabrika-ask-workers-to-report-not-fix-adjacent-lies]]'deki
"düzeltmedim, bildiriyorum" bölümü sadece backlog kaynağı değil, aynı zamanda kartın
**arşivi**.

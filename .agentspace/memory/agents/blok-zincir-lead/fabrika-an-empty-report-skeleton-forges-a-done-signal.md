---
name: fabrika-an-empty-report-skeleton-forges-a-done-signal
description: Denetim defteri "BİTTİ"yi YARIM yazılmış bir rapor dosyasına da basabiliyor — ince rapor tek başına terk edilmişlik kanıtı DEĞİL, pane ölü mü diye bak
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

`TASK-MTTUUGKNDGBXK` dördüncü dağıtımında denetim defteri "BİTTİ · kanıt:
…-customer-support.md" dedi. Dosyayı açtım: **22 satır, altı başlık, hepsi
`_(doldurulacak)_`**. "Worker iskeleti yazıp öldü, sahte tamamlanma" diye hüküm verdim,
kartı `todo`'ya çektim ve yeniden dağıttım.

**Hüküm YANLIŞTI.** Dosyayı worker YAZARKEN yakalamışım. Aynı dosya bir saat sonra
**339 satır, 0 yer tutucu**, `47e764b` ile commit'li: on bölüm, gerçek tarayıcı ölçümü,
kareler, kapı çıktısı. Yeniden dağıttığım iş zaten koşuyordu; iki worker aynı kartı
paralel bitirdi (iki rapor: `-customer-support.md` 339 satır ve `-blockzincir-pm.md` 226).
İkinci worker bunu bana yüzüme söyledi ve haklıydı.

**Doğru olan yarısı:** denetim defteri tamamlanmayı dosyanın VARLIĞINDAN okuyor, içeriğinden
değil. Yarım yazılmış bir sonuç `.md`'si gerçekten erken "BİTTİ" bastırıyor. Bu kısım gerçek.

**Yanlış olan yarısı — ve asıl ders:** ince rapor, işin BİTTİĞİNİN olduğu kadar
İŞİN SÜRDÜĞÜNÜN de işareti olabilir. Dosya bir durum değil, bir AKIŞ; tek karesine bakıp
"terk edilmiş" denmez.

**Nasıl uygulanır — iki koşul, ikisi birden aranır:**
1. Rapor ince ya da yer tutuculu (`wc -l`, `grep -c 'doldurulacak\|IN PROGRESS'`), **VE**
2. Pane ÖLÜ (`agentspace_delegation_status` → `pane AYAKTA` YOKSA).

İkisi birden yoksa kart `todo`'ya ÇEKİLMEZ, yeniden DAĞITILMAZ — bir Monitor vuruşu
beklenir ([[fabrika-paused-is-not-dead-check-before-adopting-wip]]). Karta hâlâ
"önce boş iskelet yazma, sonuç `.md`'sini ancak kanıt varken oluştur; ara notlar
`-evidence/` altına `.txt`" yazmak doğrudur — erken bayrak dikmek yine de gürültü üretir.

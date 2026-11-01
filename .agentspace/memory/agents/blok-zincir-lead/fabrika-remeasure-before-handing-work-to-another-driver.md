---
name: fabrika-remeasure-before-handing-work-to-another-driver
description: Devir paketini yazmadan HEMEN ÖNCE ağacı yeniden ölç — pane'i kapattığım worker kapanmadan önce işi bitirip commit'lemişti, paket bir saat içinde bayatladı
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

2026-09-08. Patron "işi Antigravity'de sürdüreceğim" dedi; ben devir paketini yazdım, ekip
pane'lerini kapattım. Paketi yayımladıktan SONRA `git log`'a baktım ve altı commit gördüm:
adaptör birleşmesi, **Seçenek C'nin tamamı**, F-1 RLS düzeltmesi, çift-düşüş düzeltmesi,
üstüne bir QA turu. Yani paketin 6 prompt'undan 3'ü, yayımlandığı anda **bitmiş işi tekrar
yaptıracak** durumdaydı.

İki ayrı hata vardı, ikisi de aynı kökten:

1. **Pane kapatmak işin durduğu anlamına gelmiyor.** Kapattığım worker, kapanmadan önce
   raporunu yazmış ve commit'lemişti. "in-flight 8dk" gördüğüm iş aslında bitmek üzereydi.
2. **Ölçümüm ile teslimatım arasında zaman geçti.** Ağacı 20:35'te ölçtüm, paketi 21:10'da
   yayımladım; arada 6 commit indi. Devir paketi bir FOTOĞRAFtır ve fotoğrafın tarihi vardır.

Kural: bir başkasına (insan, başka bir IDE, başka bir ekip) devredilecek her paketin
**yayımlanmasından hemen önce** `git log --oneline -10` + `git status --short` + kapı
(typecheck/test) yeniden koşulur, ve paketin üstüne **ölçüm saati** yazılır. Bitmiş işi
"yap" diye devretmek, eksik işi devretmekten daha pahalıdır — karşı taraf çalışmayı
tekrar eder ve commit'lenmiş doğru çözümü ezebilir.

Ayrıca: worker'a haksızlık ettiğim yer — "onaysız iş yaptı, rapor da yazmadı" dedim; sonra
raporunu buldum (`-2.md`), B'yi neden seçtiğini gerekçelendirmişti ve C'yi seçememesinin
sebebi BENİM koyduğum "billing dosyalarına dokunma" kısıtıydı. Ağaçta beklenmedik bir iş
bulunca önce raporunu ara, sonra hüküm ver.

Bkz. [[fabrika-verify-the-tree-not-just-the-report]] · [[fabrika-check-artifact-timestamps-against-dispatch]]

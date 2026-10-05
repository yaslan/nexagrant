---
name: fabrika-verify-the-card-recheck-not-just-the-old-report
description: Bir kart "önceki rapor X dedi ama bugünkü grep temiz buldu" diyorsa, ŞÜPHELİ olan eski rapor değil kartın kendi yeniden-ölçümü olabilir — ikisini de kendin koştur
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

TASK-MTRNQHC3IV2BE kartı şöyle diyordu: "TASK-MTRHZIWHU2SKA raporu `src/modules/m11/types.ts`'te
`leadAuthor`/`lastModifiedBy` sabitleri olduğunu söylüyordu ama **bugünkü grep orada HİÇBİR
eşleşme bulmadı** — önce doğrula, zaten temizse raporda bunu açıkça yaz."

Kartın çerçevelemesi beni "eski rapor eskimiş, muhtemelen temizlenmiş" beklentisine sokuyordu.
İlk komutumda ikisini birden koşturdum ve **27 eşleşme** çıktı: eski rapor haklıydı, kartın
yeniden-ölçümü yanlıştı (muhtemelen dosya yolu ya da kaçış karakteri hatası).

**Neden önemli:** bir kart "iddia ŞU, doğrula" derken iki iddia taşır — orijinal bulgu ve
kartın kendi yeniden-ölçümü. İkincisi de bir iddiadır, kanıt değil. "Zaten temizse yaz"
talimatını "temiz olduğunu varsay" diye okursan, gerçekten ekranda görünen bir uydurmayı
(burada `PartBCollaborativeEditor.tsx:517,583,649,696` render ediyor) temiz ilan edersin.

**Nasıl uygulanır:** doğrulama görevinde ilk tool çağrısında HER İKİ ölçümü de kendi elinle
koştur ve çıktıyı rapora **yapıştır**. Sonuç hangi yöne çıkarsa çıksın — "iddia doğru" ya da
"iddia yanlış, ölçüm şu" — kanıtla yaz. Kapsam dışıysa düzeltme, `dosya:satır` ile bildir ve
yeni kart öner. Bkz. [[fabrika-stale-board-status-check-git-first]], [[fabrika-board-cards-go-stale]].

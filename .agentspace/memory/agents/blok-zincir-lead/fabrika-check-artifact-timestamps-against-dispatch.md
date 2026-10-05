---
name: fabrika-check-artifact-timestamps-against-dispatch
description: Worker "kanıt var" derken eski dosyayı gösteriyor olabilir — kare/çıktı dosyalarının mtime'ını görevin başlama saatiyle karşılaştır, ve raporda doğrulamayı REDDEDEN cümleyi ara
metadata:
  type: feedback
updatedAt: 2026-09-07
---

Bir kartı kapatırken kanıt dosyasının VAR olması yetmez; o kanıtın BU denemede üretildiğini
ölç. İki ucuz kontrol:

1. `ls -la <screenshots dizini>` → dosya damgaları görevin dağıtım saatinden ÖNCEyse kanıt
   yeniden üretilmemiştir. 2026-09-07'de TASK-MTR882HVZ8BG7'de tam bu oldu: sprint 19:23'te
   başladı, karelerin hepsi 18:21/18:50 damgalıydı, yani önceki (çökmüş) denemeden kalmaydı.
2. Raporda doğrulamayı REDDEDEN cümleyi ara. Aynı raporun kendi ifadesi:
   *"Var olan kareleri kanıt olarak kullandım (yeniden tıklama gerekli değil; testler +
   kareleri kapsadığı için)"* — worker DoD'u atladığını dürüstçe yazmıştı; okumayan lider
   kartı kapatacaktı. `git log --oneline -- <kapsam dizini>` de kartın hiç kod commit'i
   üretmediğini gösterdi.

**Why:** "done" bildirimi kanıt DOSYASININ varlığına bakar. Bir worker iyi niyetle
"zaten kanıt var, tekrar tıklamaya gerek yok" diyebilir — bu makul görünür ama kartın
sorusu tam olarak "BUGÜNKÜ kodda hâlâ doğru mu"dur; eski kare o soruyu yanıtlamaz.

**How to apply:** Gerçek-tıklama DoD'lu her kartta kapatmadan önce (a) kare mtime'ı >
dağıtım saati, (b) raporda "yeniden üretildi" ifadesi, (c) kapsam dizininde kod commit'i —
üçünden en az birini ölç. Yoksa kartı DAR bir kapsamla ("yalnız kanıtı yeniden üret")
geri aç; baştan yazdırma. İlgili: [[fabrika-evidence-file-may-answer-a-different-task]] ·
[[fabrika-concurrent-agents-and-git-reset-hard]]

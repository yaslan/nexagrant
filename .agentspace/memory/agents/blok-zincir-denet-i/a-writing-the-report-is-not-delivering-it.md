---
name: a-writing-the-report-is-not-delivering-it
description: Paylaşılan ağaçta rapor dosyasını yazmak teslim etmek değildir — commit'le ve git ls-tree ile ağaçta olduğunu doğrula
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Kural

Sonuç raporunu diske yazdıktan sonra **commit et ve `git ls-tree -r HEAD --name-only | grep <dosya>`
ile ağaçta olduğunu DOĞRULA.** `ls` ile "yazdım" demek yetmez.

## Why

2026-09-10, TASK-MTTUUGKNDGBXK: raporu 14:13'te yazdım. 14:19'da diskte **yoktu**.
Eşzamanlı koşan başka bir pane aynı kartı aynı kanıt dizininde işliyordu ve dosya kayboldu.
Commit (`2131930`) 12 kanıt dosyasıyla sorunsuz geçti — ama rapor `.md`'si tree'ye
girmedi, çünkü commit anında dosya artık yoktu. `git commit` bunu **hata olarak
bildirmedi**: staged bir dosya commit anında yoksa sessizce düşer.

O kartın notu şuydu: *"bu kart iki kez denendi ve iki kez rapor üretmeden düştü."*
Mekanizma büyük ihtimalle tam olarak bu — ajan raporu yazdı, iş bitti sandı, dosya
paylaşılan ağaçta kayboldu.

## How to apply

- Rapor yazıldıktan sonra **hemen, tek başına** commit et (12 dosyalık bir commit'in
  içine gömme — orada kaybolduğu fark edilmez).
- `git show --name-only HEAD` çıktısında raporun adını **gözünle ara**. Yoksa yeniden yaz.
- İçeriği de doğrula, yalnız yolu değil: `git show HEAD:<yol> | grep "^## "`.
- Uzun raporu önce scratchpad'e yaz, oradan kopyala — kaybolursa yeniden üretmek bedava.
- Kanıt dizininde bana ait olmayan dosyalar belirdiyse **eşzamanlı bir pane var** demektir:
  kendi dosyalarımı çakışmayan bir önekle adlandır, onlarınkine dokunma, ve durumu rapora yaz.

## Related

[[a-record-is-not-a-document]] — aynı ailenin öbür yarısı: makine formatına yazmak, insanın
eline geçmesi demek değil

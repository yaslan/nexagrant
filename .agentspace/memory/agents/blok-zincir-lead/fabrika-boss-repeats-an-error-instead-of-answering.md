---
name: fabrika-boss-repeats-an-error-instead-of-answering
description: Patron acik soruya cevap vermek yerine ayni hata metnini tekrar yapistiriyor — bu "kabul edelim" onerisinin REDDIDIR, soruyu tekrarlama, kalici cozume gec
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

2026-09-09'da React'in `Encountered a script tag` dev uyarisini uc turda cozemeyince "uretimde yok,
islevsel etkisi yok, kabul edip kapatalim mi?" diye sordum. Patron cevap YAZMADI — ayni konsol hatasini
DORDUNCU kez yapistirdi.

OKUMA: patron bu ofiste bir kartin kapanmasini reddederken tartismiyor, semptomu tekrar gonderiyor.
Ayni hata metninin tekrari = "hayir, kalsin degil, GITSIN". Soruyu yeniden sormak ya da ayni gerekcelerle
kabul onerisini tekrarlamak tur harciyor. Dogru refleks: tekrari karar say, en kalici cozume gec ve
bedelini OLC (burada: temayi cerezle sunucuda render etmek, script'i tamamen silmek; bedeli kok layout'un
`cookies()` yuzunden dinamik render'a dusmesi — build rota tablosu ONCE/SONRA olculerek raporlanacak).

Ikinci not: "dev-only, uretimde yok" argumani bu patronda kapatma gerekcesi olarak YETMIYOR — konsolda
gordugu seyin gitmesini istiyor. Bunu bir daha kapanis gerekcesi olarak sunma.

Ilgili: [[fabrika-react-script-warning-is-a-hydration-miss]], [[fabrika-boss-prefers-clean-chain-over-busy-team]]

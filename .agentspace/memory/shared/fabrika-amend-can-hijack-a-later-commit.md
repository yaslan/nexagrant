---
name: fabrika-amend-can-hijack-a-later-commit
description: Paylaşılan dev dalında git commit --amend ÇALIŞTIRMA — HEAD senin commit'inden ilerlemiş olabilir, amend sessizce BAŞKA bir ajanın commit'ini ele geçirir ve onun kodunun ihtiyaç duyduğu içeriği siler
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

`git commit --amend` her zaman **o anki HEAD**'i değiştirir — "benim önceki commit'im" değil.
Paylaşılan `dev` dalında commit'ler saniyeler içinde art arda geliyor; senin commit'inden sonra
başka ajanların 1-2 commit'i daha binmiş olabilir. `--amend` çağırdığında HEAD artık SENİN
commit'in değil, o başka ajanın commit'idir — ve sen onu, senin staged içeriğinle birleştirip
yeniden yazarsın. Mesaj `--no-edit` ile korunduğu için sonuç "onların mesajı + senin içeriğin"
gibi görünür, fark etmesi zor.

**Somut olay (TASK-MTS80LZI1GRWT, 2026-09-08):** `messages/tr.json`/`en.json`'daki bir
i18n anahtarını (`ultra.f3`) düzeltip `git apply --cached` ile temiz bir hunk stage'ledim,
`git diff --cached` ile doğruladım (temizdi), `git commit -- messages/tr.json messages/en.json ...`
ile commit attım. Sorun oradan değil, SONRA çıktı: aynı dosyalarda kalan bir "kirlenme" (başka
ajanın `m10` çeviri anahtarları + `repeatLabel` alan uyarı anahtarları — bunlar gerçekti, ilgili
ajanın kendi işiydi) olduğunu görünce "düzelteyim" diye `git add messages/*.json && git commit
--amend --no-edit` çalıştırdım. Aradan geçen sürede İKİ yeni commit gelmişti (bir test commit'i,
bir de tam da o `m10` çevirilerini kullanan `fix(m10)` commit'i). Amend, HEAD'deki (`fix(m10)`)
commit'i benim index'imle (yalnız 2 dosya, m10/repeatLabel anahtarları SİLİNMİŞ hâliyle)
birleştirdi → sonuç: `fix(m10)`'un kodu hâlâ `t('m10.…')` çağırıyor ama artık o anahtarlar
mesaj dosyasında YOK. Fark edilmese production'a böyle giderdi.

**Kurtarma:** `git reset --hard` ile geçmişi geri sarmadım (paylaşılan ağaçta başkalarının
commit edilmemiş işini de siler, bkz [[fabrika-concurrent-agents-and-git-reset-hard]]).
Bunun yerine: bozulan commit ile bir önceki iyi commit'i `git diff <iyi> <bozuk> --stat` ile
karşılaştırıp SADECE fark eden 2 dosyayı (`messages/tr.json`, `en.json`) o iyi commit'ten
(`git show <iyi-sha>:<dosya> > <dosya>`) geri yazdım ve düzeltici, tarih-yeniden-yazmayan
YENİ bir commit attım. Tarihi bozmadan onarım = güvenli; `--amend`/`reset --hard` = tehlikeli.

**Kural:** Bu repoda `--amend` hiç kullanma. "Az önceki commit'imi düzelteceğim" dürtüsü
geldiğinde önce `git log --oneline -3` ile HEAD'in gerçekten senin commit'in olup olmadığını
doğrula — çoğunlukla değildir. Düzeltme her zaman YENİ bir commit olsun.

İlgili: [[fabrika-agents-share-one-working-tree]] · [[fabrika-concurrent-commit-steals-your-stage]] ·
[[fabrika-commit-with-a-throwaway-index]] · [[git-add-verify-before-commit]]

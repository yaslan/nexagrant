---
name: fabrika-concurrent-commit-steals-your-stage
description: Fabrika'da index paylaşıldığı için başka bir ajanın commit'i senin stage'lediğin dosyaları kendi commit'ine alabilir — commit çağrın "no changes added" derse işin kaybolmadı, HEAD'e bak
metadata:
  type: project
updatedAt: 2026-09-07
---

Paralel ajanlar tek çalışma ağacını **ve tek git index'ini** paylaşıyor. `git add <yollarım>`
ile `git commit <yollarım>` arasındaki saniyelerde başka bir ajan commit alırsa, senin
stage'lediğin dosyalar **onun commit'ine** dahil olur ve senin çağrın
`no changes added to commit` ile döner.

Bu bir hata değil, bir yarış. Yapılacaklar:
1. Panik yapma, `git stash`/`git reset` ile "kurtarmaya" kalkma — iş kaybolmadı.
2. `git log --oneline -3` + `git cat-file -e <sha>:<yol>` ile her dosyanın hangi commit'e
   girdiğini **doğrula**.
3. Paylaşılan `dev` branch'inde geçmişi yeniden yazma (`--amend`, rebase). Bunun yerine
   sonuç raporuna "kodum şu sha'da, mesaj bana ait değil" satırını yaz ki sonra kimse
   kayıp commit aramasın.
4. Aynı şey `messages/tr.json`/`en.json` için de olur: senin anahtarların başkasının
   commit'iyle gidebilir. Commit sonrası `git show HEAD:messages/tr.json` ile kendi
   anahtarlarının durduğunu **doğrula** (görev kuralı zaten bunu istiyor).

Ters yön de olur: **stage'lediğin dosya BAŞKASININ commit edilmemiş işini de taşıyor olabilir.**
`git diff --cached <dosya>` beklediğinden çok satır gösteriyorsa o dosyayı olduğu gibi commit
etme — `git restore --staged <dosya>` ile çıkar, sonra yalnız kendi hunk'ını indekse uygula:

```
git restore --staged <dosya>
git apply --cached /tmp/benim-hunk.patch   # yalnız senin satırların
```

Patch uymazsa (`patch does not apply`) sebebi genelde HEAD'in bu arada kaymış olmasıdır:
`git diff HEAD <dosya>` tekrar bak — çoğu zaman senin satırın zaten karşı tarafın commit'ine
girmiştir ve yapacak bir şey kalmamıştır. "diff yok" = kayboldu DEĞİL;
`git show HEAD:<dosya> | grep '<senin satırın>'` ayırt eder.

Pencereyi daralt: yazdıktan hemen sonra stage'le, doğrulamayı stage'ten sonra yap,
`git add` ile `git commit` arasına uzun komut koyma.

İlgili: [[fabrika-agents-share-one-working-tree]] · [[fabrika-parallel-agent-file-race]]

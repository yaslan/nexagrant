---
name: fabrika-prove-a-dirty-worktree-is-redundant-before-removing
description: Commit'siz iş taşıyan bir worktree'yi --force'suz kaldırmanın tarifi — `git -C <wt> diff <dal> -- <dosya>` boşsa çalışma kopyası dalla birebirdir; her hunk'ı `git log -S` ile dalda ara, sonra checkout -- ile temizleyip normal remove
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

"Bu worktree'de commit'siz iş var, silemem" **çoğu zaman yanlış bir varsayımdır**: iş çoktan
dala girmiş, worktree bunun eski bir kopyasını taşıyor olabilir. Bunu tahmin etmek yerine üç
adımda kanıtla — ve kanıtladıysan `--force`'a hiç gerek kalmaz.

## 1. En güçlü tek komut: çalışma kopyasını dalla karşılaştır
```bash
git -C <worktree> diff <dal> -- <değişmiş dosya>     # çıktı BOŞ ⇒ içerik dalda birebir var
```
`git status` "M" der (çünkü worktree'nin KENDİ HEAD'ine göre değişmiş), ama dal ilerlemişse o
"değişiklik" dalın bugünkü içeriğinin ta kendisi olabilir. Karşılaştırmayı worktree'nin HEAD'ine
değil **hedef dala** yap. Untracked dosya için aynı şeyin karşılığı:
```bash
diff <(git show <dal>:<yol>) <worktree>/<yol>
```

## 2. Hunk hunk "bu dalda var mı" — dosya adı değil, benzersiz DİZE ile
```bash
git log -S'<hunk'tan benzersiz bir dize>' <dal> --oneline    # hangi commit'le girmiş
```
Dosya adıyla arama yanıltır (dosya dalda olabilir ama senin hunk'ın olmadan). Dizeyi seçerken
**dar** seç: `git log -S'ZZTEST' dev` dört commit döndürdü ama dördü de rapor düzyazısıydı;
`git log -S"PRODUCT_NAME = 'ZZTEST'" dev` boş döndü — asıl cevap buydu. Geniş arama "var" der,
dar arama "gerçekten kod olarak var mı" der.

## 3. Temizle, sonra normal `remove`
```bash
git -C <wt> diff > $SCRATCH/<wt>.patch   # önce yedek al, kaldırma geri alınabilir kalsın
cp <wt>/<untracked dosya> $SCRATCH/
git -C <wt> checkout -- <dosya>          # içeriği dalda kanıtlanmış olanı geri al
rm <wt>/<untracked dosya>
git -C <wt> status --porcelain           # BOŞ olmalı
git worktree remove <wt> && git worktree prune
```
Worktree temizse `remove` zorlamasız çalışır. **Kanıtsız `--force` = kanıtsız veri kaybı**;
kanıt topladıysan zaten `--force`'a ihtiyacın kalmaz — bu yüzden `--force`a uzanma isteği,
kanıtı atladığının işaretidir.

## Kaldırmadan önce iki şeyi ayır
- **Dal ≠ çalışma kopyası.** `git worktree remove` dalı silmez. `worktree-*` dalları kalsın
  isteniyorsa hiçbir şey yapmana gerek yok; `git branch --list 'worktree-*'` ile kaldırma
  sonrası kanıtla.
- **Depo dışındaki worktree'ler senin kapsamın değil.** `git worktree list` scratchpad'deki ve
  kardeş dizinlerdeki kopyaları da gösterir; başka bir oturuma ait olabilir, dokunma, rapora
  "kapsam dışı" diye yaz.

## "Değersiz" derken gerekçeyi yaz
`PRODUCT_NAME = 'ZZTEST'` gibi bir hunk'ı atarken "junk" demek yetmez; **neden** atıldığını
kaydet: bu, ex-en'in marka **ikame probunun** kalıntısıydı (ölçüm için yapılmış, atılmak üzere)
ve tabanı iki kuşak eskiydi — geri uygulansa markayı kırardı. Gerekçe yazılmazsa bir sonraki
denetim aynı soruyu sıfırdan sorar.

İlgili: [[fabrika-nested-worktrees-make-the-suite-run-n-times]] ·
[[fabrika-attribute-lint-typecheck-noise-with-git-show-head]] · [[fabrika-dead-pane-work-measure-before-discarding]]

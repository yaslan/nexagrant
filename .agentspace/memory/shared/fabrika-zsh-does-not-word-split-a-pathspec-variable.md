---
name: fabrika-zsh-does-not-word-split-a-pathspec-variable
description: Bu ofisin kabuğu zsh — `git add -- $MY` ile dosya listesi vermek SESSİZCE tek pathspec'e dönüşür ve commit boş çıkar; throwaway-index tarifinde yolları tek tek yaz
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

zsh, tırnaksız değişkenleri **kelimelere bölmez** (bash bölerdi). Yani:

```bash
MY="a.ts b.ts c.md"
git add -- $MY          # ← TEK pathspec: "a.ts b.ts c.md"
```

Çıktı bir hata gibi görünmüyor, bir **no-op** gibi görünüyor:

```
warning: could not open directory 'a.ts b.ts c.md': No such file or directory
fatal: pathspec 'a.ts b.ts c.md' did not match any files
...
no changes added to commit
```

`git commit` de "no changes added to commit" der ve **commit alınmaz**. [[fabrika-commit-with-a-throwaway-index]]
tarifiyle birleşince tehlikeli: throwaway index'te hiçbir şey stage'lenmediği için `git commit`
sessizce başarısız olur, `git log` bir sonraki ajanın commit'ini gösterir ve iş commit'lendi
sanılabilir. 2026-09-08 / TASK-MTQ2KL3JO4MK2'de tam olarak bu oldu; ikinci deneme düzeltti.

**Yol:** pathspec'leri her zaman tek tek yaz (satır sonu `\` ile), ya da zsh dizisi kullan
(`MY=(a.ts b.ts); git add -- $MY`). **Ve commit'ten sonra `git log --oneline -1` ile kendi commit
mesajını gör** — [[fabrika-parallel-agent-file-race]] zaten `git diff --cached` doğrulamasını
söylüyor; bu onun kardeşi: staged kapsam boşsa commit hiç olmaz.

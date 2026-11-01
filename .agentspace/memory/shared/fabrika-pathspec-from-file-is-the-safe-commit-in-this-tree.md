---
name: fabrika-pathspec-from-file-is-the-safe-commit-in-this-tree
description: Paylaşılan ağaçta yalnız kendi dosyalarını commit'lemenin en az tuzaklı yolu — GIT_LITERAL_PATHSPECS=1 + git commit --pathspec-from-file; köşeli parantez globunu ve zsh word-splitting'i tek hamlede çözer
metadata:
  type: reference
  updatedAt: 2026-09-09
---

Bu depoda commit kapsamını daraltmanın iki bilinen tuzağı var: Next.js yolları
(`src/app/[locale]/(app)/...`) git pathspec'inde **glob** sayılır (`[locale]` =
karakter sınıfı), ve zsh `git add -- $MY` ile verilen listeyi tek pathspec'e
çevirir. İkisini birden çözen kalıp:

```sh
cat > /tmp/mypaths.txt <<'EOF'
src/app/[locale]/(app)/[workspace]/dashboard/loading.tsx
src/app/[locale]/(app)/layout.tsx
tests/app-shell-no-loading-boundary.test.ts
EOF
export GIT_LITERAL_PATHSPECS=1
git add -- <worktree'de VAR OLAN dosyalar>          # silinenleri buraya yazma
git commit -F - --pathspec-from-file=/tmp/mypaths.txt <<'MSG'
...
MSG
git show --name-only --oneline HEAD                 # doğrula
```

Ölçülmüş ayrıntılar (2026-09-09, TASK-MTU4AYW5R9DGL, 24 dosya):

- `GIT_LITERAL_PATHSPECS=1` her yolu düz metin yapar; satır satır `:(literal)`
  yazmaya gerek kalmaz ve dosyadan okunduğu için zsh word-splitting devreye girmez.
- **`git add`, worktree'de olmayan (silinmiş) bir yol için `fatal: pathspec ...
  did not match any files` verir.** Sorun değil: silme zaten index'te `D` olarak
  duruyorsa `git add`'e gerek yok — `git commit --pathspec-from-file` o yolları
  worktree durumundan (yok → silme) commit'ler. `git add`'i yalnız var olan
  dosyalara ver.
- Pathspec'li commit, index'te duran **başkasının** sahnelenmiş değişikliğini
  (ör. bir komşunun `D src/lib/ai/rag.ts`'si) commit'e ALMAZ ve index'te
  bırakır — commit sonrası `git status --short -- <onların yolları>` ile doğrula.
- `githooks/pre-commit` pathspec'li commit'te geçici index'i görür, yani lint/tsc
  yalnız senin dosyalarına bakar; komşunun yarım işi seni bloke etmez.

[[fabrika-parallel-agent-file-race]] · [[fabrika-zsh-does-not-word-split-a-pathspec-variable]] ·
[[fabrika-staged-work-gets-swallowed]] · [[fabrika-commit-with-a-throwaway-index]] ·
[[fabrika-gate-scope-follows-the-git-index]]

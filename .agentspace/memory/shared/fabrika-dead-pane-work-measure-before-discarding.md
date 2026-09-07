---
name: fabrika-dead-pane-work-measure-before-discarding
description: Pane ölünce ağaçta kalan yarım işi atma — önce typecheck+test ile ölç, çoğu kez derleniyor ve testleri geçiyor
metadata:
  type: project
  updatedAt: 2026-09-07
---

AgentSpace yeniden başlayınca pane'ler ölüyor ve delegasyon "BAŞARISIZ · kanıt yok" olarak
raporlanıyor. Bu, **işin çöp olduğu anlamına gelmiyor**: 2026-09-07'de 5 pane öldüğünde çalışma
ağacında kalan kod `pnpm typecheck` temiz geçti ve `pnpm test` 765/773 verdi (ölümden önceki taban
725'ti — yani ölü ajanların yazdığı yeni testler de yeşildi).

Kural: "kanıt yok" raporunu gördüğünde `git diff --stat` + `pnpm typecheck` + `pnpm test` KOŞ.
Eksik olan genelde kod değil; eksik olan **doğrulama, migration'ın uygulanması, tarayıcı kanıtı ve
commit**. Ajanı "baştan yap" diye değil, "bitir ve indir" diye geri gönder.

`git reset --hard` / `git checkout .` bu durumda saatlerce işi siler — ajanlara açıkça yasakla ve
`git add -A` yerine dosya dosya `git add <yol>` iste (ağaçta başka ajanların işi de duruyor).

İlgili: [[fabrika-parallel-agent-file-race]]

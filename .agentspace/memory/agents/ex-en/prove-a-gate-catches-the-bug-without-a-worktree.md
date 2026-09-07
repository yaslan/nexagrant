---
name: prove-a-gate-catches-the-bug-without-a-worktree
description: Bir kapının gerçekten yakaladığını kanıtlamak için hatayı geri koy-koş-geri al'ı TEK bash komutunda yap; git worktree izni reddedilirse tercih edilen yol budur
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

Yeni/genişletilmiş bir kapı için "yeşil geçti" KANIT DEĞİL — kapı hiçbir şey taramıyor
olabilir. Kanıt: hatayı geri koy → KIRMIZI göster → geri al → YEŞİL göster.

Tercih edilen izolasyon `git worktree add --detach <scratch> HEAD` idi ama
2026-09-07'de bu ortamda **Bash izni reddedildi** (`git worktree add` prompt'a takıldı).
Paylaşılan çalışma ağacında çalışırken işe yarayan yol:

```bash
set -e
python3 - <<'PY'   # hatayı geri koy (assert ile anchor'ı doğrula)
...
PY
npx vitest run <test> 2>&1 | grep -E "FAIL|Tests  "        # RED
git checkout -- <o tek dosya>                               # geri al
git status --porcelain <o dosya> | wc -l                    # 0 = temiz, kanıta yaz
npx vitest run <test> 2>&1 | grep -E "Tests  "              # GREEN
```

Kritik detaylar:
- **Hepsi TEK komut** — başka bir ajanın araya girip bozuk hali commit'lemesi için
  pencere ~1 saniye ([[fabrika-agents-share-one-working-tree]]).
- `git checkout -- <tek yol>`, asla `git checkout .`.
- Geri alma kanıtını rapora YAZ (`git status --porcelain` boş çıktısı) — yoksa okuyan
  "başka kartın dosyasını değiştirmiş" diye okur.
- Yamayı `sed` yerine `python3` + `assert old in s` ile yap: anchor kaymışsa sessizce
  yanlış yere yazmak yerine patlar.

Ayrıca: kapıya eklediğin YENİ mantığı (ör. bir sabite taşınmış sorguyu çözme) fikstür
string'iyle DOĞRUDAN test et — `scanSource(source, ...)` gibi saf bir fonksiyon ayrıştır.
Yoksa yeni yol repoda hiç tetiklenmediği için test edilmemiş kod olarak iner.

İlgili: [[fabrika-untracked-scratch-scripts-break-gates]] · [[fabrika-agents-share-one-working-tree]]

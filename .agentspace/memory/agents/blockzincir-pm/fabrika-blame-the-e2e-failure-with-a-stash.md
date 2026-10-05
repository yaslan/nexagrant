---
name: fabrika-blame-the-e2e-failure-with-a-stash
description: Paralel ajan dalgasında bir e2e hatasının senin değişikliğinden mi geldiğini 40 saniyede kanıtlama — yalnız KENDİ dosyalarını git stash edip testi tekrar koş
metadata:
  type: feedback
updatedAt: 2026-09-07
---

Fabrika'da 6 ajan aynı anda `dev` üzerinde çalışırken bir e2e testi düştüğünde "benden değil"
demek yetmez — ÖLÇ. 2026-09-07'de işe yarayan:

```bash
git stash push -q -m "baseline" -- <yalnız KENDİ dokunduğun dosyalar>
pnpm exec playwright test <spec> -g "<tek test>"
git stash pop
```

Aynı şekilde düşerse hata önceden var demektir ve raporda bunu **kanıtla** yazabilirsin.

Kurallar:
- Stash'e **yalnız kendi dosyalarını** ver. Çıplak `git stash` başka ajanların çalışmasını da alır
  ve pop sırasında çakışma riski doğar.
- Fixture'ı etkileyen dosyaları (seed script'i, kapı satırları) da stash'e KAT — yoksa "baseline"
  gerçek baseline olmaz.
- Aralık kısa tutulmalı; ne kadar uzun sürerse başka bir ajanın aynı dosyaya yazma ihtimali o kadar
  artar.

Ayrıca gözlendi: başka bir ajan geniş `git add` ile **benim düzenlediğim dosyayı kendi commit'ine
aldı** (`briefs/page.tsx`, gate satırlarım dahil). Kayıp yok ama commit'ten önce `git log`/
`git show HEAD:<yol>` ile kontrol et — "dosyam staged listesinde yok" paniği genelde budur.
İlgili: [[fabrika-parallel-agent-file-race]]

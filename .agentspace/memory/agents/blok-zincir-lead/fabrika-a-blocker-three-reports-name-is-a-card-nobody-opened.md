---
name: fabrika-a-blocker-three-reports-name-is-a-card-nobody-opened
description: Üç ayrı rapor aynı çevresel engeli bağımsız bildirdi ama hiçbiri kart açmadı — herkesin "başkasının sorunu" dediği engel lidere düşer
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

S12'de üç kart (`TASK-MTV8WPLBFQNAO`, `TASK-MTV69TO4K8NVZ`, `TASK-MTV5ESBVAHUEV`) birbirinden
bağımsız olarak "kapı benim yüzümden kırmızı değil, yeşile de dönemez" yazdı. Üçü de dürüsttü,
üçü de kök nedeni doğru gösterdi, ve **üçü de kart açmadı** — her biri bunu kendi kapsamı
dışında saydı. Engel sprint boyunca yaşadı ve her kartın kapı iddiasını okunamaz hale getirdi.

Ölçüm (HEAD `a6278bc`): `pnpm typecheck` EXIT 0 temiz, `pnpm lint` 1960 error. Hataların
kaynağını dizin bazında saymak tek satırda bitirdi:

```
pnpm lint 2>&1 | grep '^/Users' | awk -F/ '{print $1"/"$2}' | sort | uniq -c
    465 .claude/worktrees
      2 docs/agent-results
```

`src/` kaynaklı **tek bir bulgu yok**. Kök neden: `vitest.config.ts` `.claude/worktrees/**`
ve `docs/**` yollarını zaten dışlıyordu, `eslint.config.mjs` dışlamıyordu — iki aracın
dışlama listesi birbirinden sapmıştı ve depo içinde açılmış git worktree'leri lint'e ana
ağacın parçası gibi göründü.

**Neden önemli:** Bir worker'ın kapsam disiplini (kartına sadık kal) doğru davranıştır, ama
yan ürünü şudur: kimsenin sahiplenmediği engel kendini kart olarak açamaz. Bu, kodda TODO
bırakmanın kart ölçeğindeki hali — bkz. [[fabrika-a-todo-in-code-is-a-card-that-never-got-opened]].
Ayrıca [[fabrika-a-green-gate-may-predate-the-commit-it-closes]] ile birlikte okunmalı:
orada kapının NE ZAMAN koştuğu, burada NEYİ taradığı yalan söylüyor.

**Nasıl uygulanır:** Rapor turlarını okurken "bu benim kartımı bloke etmiyor / başka kartın
işi" cümlesini bir sinyal olarak avla — aynı cümle iki farklı raporda görünüyorsa o engel
artık bir karttır ve açmak lidere düşer, worker'a değil. Kapı kırmızı geldiğinde ilk soru
"kaç hata" değil, **"hataların kaçı `src/` içinden"** olsun; yukarıdaki `awk -F/` sayımı
bunu bir komutta verir. İki ölçüm aracının (eslint/vitest/tsc) dışlama listeleri birbirinden
sapabilir — biri bir yolu dışlıyorsa diğerinin de dışlayıp dışlamadığını kontrol et.

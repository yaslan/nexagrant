---
name: fabrika-noUncheckedIndexedAccess-false-positive-pattern
description: Fabrika'da noUncheckedIndexedAccess açılınca çıkan 171 hatanın ezici çoğunluğu tek bir false-positive desenden geliyor — length-check sonrası index erişimi
metadata:
  type: project
  updatedAt: 2026-09-10
---

Fabrika'da `tsconfig.json`'a `noUncheckedIndexedAccess: true` eklenince (TASK-MTSWAKD31LS49 ölçümü, 2026-09-10) 171 hata / 33 dosya çıktı. Hataların ezici çoğunluğu **tek bir tekrarlayan yanlış-pozitif desen**den geliyor: kod zaten birkaç satır üstte `if (arr.length > 0)`, `if (arr.length >= N)`, `if (index !== -1)` gibi bir guard içeriyor, ama TypeScript'in control-flow analizi bu `.length`/`-1` kontrolünü aynı dizinin index erişimiyle ilişkilendirip daraltamıyor — bu TS'in bilinen bir sınırlaması, Fabrika'ya özgü bir bug değil.

Bu desenin somut örnekleri: `src/lib/auth.ts:379` (`dbUser.memberships[0]`, üstte `.length > 0`), `src/lib/gates/evaluate.ts:160` (`opp.evaluations[length-1]`, üstte `.length > 0` — G0-G4 kapı mantığının kalbi), `src/lib/blog.ts:187` (`BLOG_POSTS[index]`, üstte `index === -1` check), `src/components/UserMenu.tsx`/`SidebarNav.tsx` (`segments[1]`, üstte `.length > 1`).

İkinci büyük grup (105/171 = %61) test dosyalarındaki mock/fixture erişimi (`vitest-mock-extended` ile üretilen Prisma mock'unun index signature'ı) — gerçek runtime riski sıfır, gürültü.

**Why:** Bu ayrım olmadan "171 hata" rakamı yanıltıcı görünür ve bayrağı açmak korkutucu gelir; oysa gerçek dikkat gerektiren yer sadece 2 dosya (`EvidenceForm.tsx` boş FileList, `board.tsx` state tip uyuşmazlığı).

**How to apply:** Bu flag'i açma işine kim girerse girsin, önce `docs/agent-results/TASK-MTSWAKD31LS49-blok-zincir-dse.md`'deki 4 dilim planını ve kova ayrımını oku — sıfırdan saymaya gerek yok. Flag **tek global tsconfig bayrağı** (bu depoda proje referansı/alt-tsconfig yok) — dizin bazlı kısmi açılamaz; kalıcı açılış ancak TÜM dilimler bitince, tek commit'te olmalı, aksi halde eşzamanlı çalışan diğer ajanların `pnpm typecheck`'i kırılır. [[fabrika-concurrent-commit-steals-your-stage]]

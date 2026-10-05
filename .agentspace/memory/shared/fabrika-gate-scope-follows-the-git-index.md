---
name: fabrika-gate-scope-follows-the-git-index
description: Fabrika'da depo-geneli bir kapının kapsamını genişletirken çalışma ağacını değil git İNDEKSİNİ tara — paylaşılan worktree'de altı ajanın takipsiz sonda betiği kapıyı burada kırmızı, CI'da yeşil yapar; ve statik kapıyı genişletmek işi KOŞTURMANIN yerine geçmez
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Fabrika tek bir paylaşılan worktree'de çalışıyor ve her ajan `scripts/` altına `_<ajan>-probe.ts`
tarzı takipsiz sonda betikleri bırakıyor. Depo-geneli bir kapının (schema-contract, lint sweep,
i18n taraması…) kapsamını genişletirken bu kritik:

**Kapı deponun İÇERİĞİNİ okumalı, çalışma ağacında ne varsa onu değil.**

2026-09-08, TASK-MTSJK8VVG9MKM: `src/modules/m8/server/schema-contract.test.ts` kapsamı
`src/` → `src/ + prisma/ + scripts/` genişletildi. İlk koşuda kapı, o an başka bir ajanın açık
olan takipsiz hata ayıklama sondasında (`scripts/_cs-st6-probe3.ts`) gerçek bir kusur buldu ve
kırmızıya döndü. Kusur gerçekti, ama düzeltmesi benim değildi — ve rengi bir ajanın yerel çöpüne
bağlı bir kapı burada kırmızı, CI'da yeşil olur; yani hiçbir yerde güvenilmez.

Çözüm `git ls-files -c` (İNDEKS, commit değil):

```ts
const git = spawnSync('git', ['ls-files', '-c', '-z', '--', ...SCANNED], { cwd: REPO, encoding: 'utf8' });
const TRACKED = git.status === 0 && paths.length > 0 ? new Set(paths) : null;  // null → tüm ağaca geri düş
```

Neden indeks, neden commit değil: `git add`'lenmiş yeni dosya indekstedir, ve pre-commit hook
kapıyı tam o anda koşturur — yani yeni kod ilk commit'inde yakalanır. Takipsiz çöp hiç taranmaz,
zaten sevk de edilmez. Git yoksa (tarball) tüm ağaca geri düş: **fazla taramak güvenli yön, hiç
taramamak vakum.** İki yönü de mutasyonla kanıtla (aynı dosya takipsizken yeşil, `git add`
sonrası kırmızı) — yoksa "kapsamı genişlettim" iddian ölçülmemiş kalır.

## Ve statik kapı, işi KOŞTURMANIN yerine geçmez

Aynı kartta genişletilmiş tarayıcı `prisma/seed-m6-evaluations.ts`'te 3 hayalet sütun buldu.
Seed'i **gerçekten koşturmak** aynı sınıftan 2 kusur daha ortaya çıkardı, hiçbiri statik olarak
görünmüyordu:
1. `new PrismaClient()` Prisma 7'de kurulumda patlıyor ([[fabrika-prisma7-driver-adapter]]) —
   dosya sütunlara varamadan ölüyordu;
2. `Proposal.opportunityId` **`@unique`**; seed 2 teklifi tek fırsata bağlıyordu → P2002.
   Bir sütun-adı tarayıcısı ilişki KARDİNALİTESİNİ göremez.

Yani: kapıyı genişlet, sonra yine de koştur. Kapı "hangi ad var" sorusunu yanıtlar; "bu gerçekten
çalışır mı" sorusunu yalnız koşturmak yanıtlar.

İlgili: [[fabrika-typecheck-is-blind-to-db-calls]] · [[fabrika-prisma7-driver-adapter]] ·
[[fabrika-verification-recipe-mutation-and-counterfactual]] · [[fabrika-parallel-agent-file-race]]

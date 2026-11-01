---
name: fabrika-prove-a-red-gate-is-not-yours-by-counterfactual
description: Paylaşılan ağaçta kapı kırmızıysa "benim değil" DEME, ÖLÇ — aynı spec'i değişikliğin geri alınmış ve geri konmuş haliyle koş; ayrıca depo İÇİNDEKİ yabancı worktree'ler pnpm test/lint sayılarını üçe katlar
metadata:
  type: project
  updatedAt: 2026-09-10
---

Altı ajanın tek çalışma ağacını paylaştığı bu depoda `pnpm gate` çoğu zaman kırmızı ve
bunun **senin değişikliğin yüzünden olmadığını iddia etmek yetmez, ölçmek gerekir.**

İşe yarayan iki adım:

1. **Karşı-olgusal koşu.** Aynı spec'i iki kez koş: kendi dosyalarını `git checkout --`
   ile geri alıp bir kez, geri koyup bir kez. Aynı sonuç → değişken sen değilsin.
   (Yeni/untracked test dosyanı da geçici olarak dizinden çıkarmayı unutma.)
2. **Erişilebilirlik taraması.** Değiştirdiğin modülü uygulama kodundan kimse import
   etmiyorsa hiçbir e2e onu çalıştıramaz; `grep` çıktısı tek başına güçlü kanıttır.

**Ayrı bir tuzak — depo İÇİNE açılan worktree'ler.** Ajanlar `.claude/worktrees/<ad>/`
altında worktree açtığında vitest ve eslint depoyu **iki-üç kez** geziyor:

```
pnpm test → 435 dosya / 287 hata   (gerçek: 145 dosya)
pnpm lint → 17079 problem, 1456 error
```

Gerçek sinyali görmek için:
`npx vitest run --exclude '**/node_modules/**' --exclude '**/.claude/worktrees/**'`,
ve lint'i tam olarak dokunduğun dosya listesiyle `npx eslint <dosyalar>` diye koş.
Kendi worktree'ni **depo dışına** (`$SCRATCH`) aç — tarifin orayı işaret etmesinin sebebi
budur: [[fabrika-parallel-dev-server-needs-a-worktree]].

İlgili: [[fabrika-gate-scope-follows-the-git-index]],
[[fabrika-gate-definition-drifts-mid-sprint-check-evidence-era]]

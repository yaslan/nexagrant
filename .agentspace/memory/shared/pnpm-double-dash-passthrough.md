---
name: pnpm-double-dash-passthrough
description: pnpm run'da "-- --flag" yazma — pnpm ayıracı script'e aynen geçirir ve CLI "Unknown flag --" der; doğrusu pnpm tsx scripts/x.ts --flag
metadata:
  type: reference
  updatedAt: 2026-09-06
---

Bu depodaki `package.json` script'lerine bayrak geçirirken **`--` ayıracını kullanma**.
pnpm (npm'in aksine) `--`'yi yutmuyor, script'in `process.argv`'sine aynen ekliyor:

```bash
$ pnpm beta:onboard -- --apply
$ tsx scripts/beta-onboarding.ts -- --apply
[beta-onboarding] FAILED: Unknown flag "--". Run with no flags for a dry run.
```

Doğrusu, ya doğrudan bayrak:

```bash
pnpm beta:onboard --apply
```

ya da (script argümanlarını pnpm'in kendi bayraklarıyla karıştırma riski varsa) tam yol:

```bash
pnpm tsx scripts/beta-onboarding.ts --apply
pnpm tsx scripts/beta-onboarding.ts --rollback --apply
```

`docs/` içindeki bazı komut örnekleri hâlâ `--` ile yazılmış (ör. `pnpm jobs:k2 -- --month …`);
kopyalayıp yapıştırmadan önce bu tuzağı hatırla. Argümanı katı doğrulayan her CLI
(`beta-onboarding.ts` gibi "unknown flag → hata" davrananlar) bu yüzden patlar.

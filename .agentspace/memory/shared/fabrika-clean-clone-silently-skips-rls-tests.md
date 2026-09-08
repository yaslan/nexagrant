---
name: fabrika-clean-clone-silently-skips-rls-tests
description: Temiz klonda 21 RLS/kiracı-izolasyonu testi sessizce SKIP oluyor (.env gitignore'da) — DB'siz bir CI en güvenlik-kritik testleri hiç koşmadan exit 0 verir
metadata:
  type: project
  updatedAt: 2026-09-08
---

TASK-MTSVTD6Q7A6'da ölçüldü (dev @ dcd308a): aynı süit, iki ortam, aynı toplam 1309 test —

| ortam | PASS | SKIP |
|---|---|---|
| çalışma ağacı (`.env` var) | 1301 | 8 |
| gerçek temiz klon (`.env` yok) | 1280 | **29** |

Fark **tam olarak 21 test** ve hepsi RLS: `tests/rls.spec.ts` (6), `tests/plan-visibility-rls.spec.ts`
(5), `tests/plan-storefront.spec.ts` (10). Kök neden: `.env` `.gitignore:34` (`.env*`) ile —
doğru şekilde — commit'lenmiyor, klonda `DATABASE_URL` yok, testler kendini atlıyor.

**Neden önemli:** iki koşu da `exit 0` verir. Yani DB'si olmayan bir CI, deponun en
güvenlik-kritik testlerini (kiracı izolasyonu, özel plan görünürlüğü, vitrin fiyatlaması)
**hiç koşmadan yeşil raporlar**. "Temiz klonda yeşil" tek başına kiracı izolasyonunun
sınandığı anlamına GELMEZ.

**Nasıl uygula:** bir kapı/CI koşusunu kanıt sayarken PASS sayısına değil **SKIP sayısına**
da bak; 8'in üstündeki her skip DB'nin yokluğunu gösterir. Kiracı izolasyonu iddiası
gerektiğinde Postgres'i ayağa kaldırıp `pnpm rls:verify` koş (bkz. [[fabrika-dev-postgres-is-up]]).
Süit skip'i sessizdir — atlanan testi "geçti" sanma.

İlgili: [[fabrika-green-gate-does-not-prove-a-clean-clone]],
[[fabrika-clean-clone-probe-needs-git-clone-not-git-archive]]

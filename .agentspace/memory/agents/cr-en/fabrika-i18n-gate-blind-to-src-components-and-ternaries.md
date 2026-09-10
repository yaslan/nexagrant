---
name: fabrika-i18n-gate-blind-to-src-components-and-ternaries
description: pnpm i18n:check yeşilken de gömülü metin olabilir — check 4 yalnız src/app + src/modules tarar ve yalnız jsx-text + 4 attribute sayar, const x = isTr ? 'a' : 'b' görünmez
metadata:
  type: project
  updatedAt: 2026-09-10
---

`pnpm i18n:check` yeşil olması kural 8'in tutulduğu anlamına **gelmiyor**. Gömülü-metin
denetiminin (check 4) iki kör noktası var, ikisi de `scripts/i18n-hardcoded.ts`'te ölçüldü:

1. **Kapsam:** satır 41 → `export const SCAN_ROOTS = ['src/app', 'src/modules'];`
   `src/components/**` **hiç taranmıyor**. `CookieConsent.tsx`'in 7 gömülü metni bu yüzden
   baseline'da hiç görünmedi (TASK-MTVDRK4TABJ0U).
2. **Tür:** satır 36 → sayılan türler yalnız `jsx-text` ve `attr:title|label|placeholder|aria-label`.
   `const title = isTr ? 'Çerez Tercihleri' : 'Cookie Preferences'` bunların hiçbiri → görünmez.
   Kanıt: `src/app/[locale]/page.tsx` **68** `isTr` kullanıyor, baseline'da **4** literal kayıtlı.

**Sonuç — bir kart "baseline küçülecek" diyorsa ÖNCE dosyanın baseline'da olup olmadığına bak:**
```bash
python3 -c "import json;b=json.load(open('i18n-baseline.json'));print([k for k in b if 'X' in k])"
```
Dosya listede yoksa borç ödemek sayacı **oynatmaz**; baseline'ı büyüterek "geçmek" yerine
değişmediğini ölçüp gerekçesini yaz. `isTr ? … : …` deseni 29 dosyada yaşıyor ve kapı yeşil.

Bkz. [[fabrika-deferred-to-another-card-is-not-fixed]]

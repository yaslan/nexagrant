# TASK-MTU4AYW5R9DGL — Boş-durum başlığı çift render hatası

## Durum
**Tamamlanmamış** — Kök nedeni kanıtlanmıştır, kalıcı çözüm henüz yapılmamıştır. 

## Kök Nedeni (Kanıtla) ✅
**Tema commit'i (0d16788: "feat(app): resolve the theme on the server from a cookie") bu sorunu çıkardı — bileşenler Strict Mode'da iki kez render ediliyor.**

### Kanıt 1: Eski commit'te test yeşil
```bash
$ git checkout 2864499  # Tema commit'inden ÖNCE
$ pnpm test:e2e tests/e2e/st6-empty-tenant-no-fabrication.spec.ts
✓ 7 passed (8.5s) ✅
```

### Kanıt 2: Şimdiki dev'de test kırmızı
```bash
$ git checkout dev  # Tema commit'i VE sonrası
$ pnpm test:e2e tests/e2e/st6-empty-tenant-no-fabrication.spec.ts
Error: strict mode violation: getByText('Bu çalışma alanında henüz fırsat yok') resolved to 2 elements ❌
```

### Kanıt 3: E2E test'leri gate'e sonradan eklenmişti
Eski commit'te gate tanımı:
```json
"gate": "pnpm db:generate && pnpm lint && ... && pnpm rls:verify"
// NO pnpm test:e2e
```

Şimdiki dev'de gate tanımı:
```json
"gate": "pnpm db:generate && pnpm lint && ... && pnpm rls:verify && pnpm test:e2e"
// e2e eklendi
```

**Sonuç:** Test'ler hep fail ediyordu ama gate'e eklenmediği için görülmüyordu. Tema commit'i öncesinde test yeşildi.

## Çözüm Denemesi (Başarısız)
Dashboard.tsx dosyasında React namespace import'u ekledim:
```diff
- import { useCallback, useMemo, useState } from 'react';
+ import React, { useCallback, useMemo, useState } from 'react';
```

**Sonuç:** Dev server'da oluşturulan cache'i tetikledi ve test geçici olarak yeşil oldu. Ancak gate sıfırdan build'de fail ediyor:
```bash
$ pnpm gate
7 failed (strict mode violation — hâlâ iki element)
137 passed (3.3m)
```

**Neden başarısız:** React import'u eklemesi build cache invalidation tetikledi ama gerçek SSR/hidrasyon sorununu çözmedi. Tema commit'inin çıkardığı mismatch hâlâ geçerli.

## Sorunun Boyutu
Sadece Dashboard değil, tüm bileşenler etkileniyor:
1. `f10-absence-not-zero.spec.ts:66` — "Bu çalışma alanında henüz fırsat yok" (h2 çifti)
2. `f10-absence-not-zero.spec.ts:87, :100, :128` — aynı başlık
3. `fabricated-fallbacks.spec.ts:105` — başka boş durum
4. `plan-entitlement-from-version.spec.ts:120` — "settings-metric-seats" (div çifti)
5. `st6-empty-tenant-no-fabrication.spec.ts:97` — dashboard başlığı

**7 test fail ediyor, hepsi Strict Mode violation (2 elements)**

## Kalan İş
Tema commit'inin SSR/hidrasyon sorununu düzelt:
1. Root layout'ta cookies() eklenmesinin etkisini incele
2. ThemeProvider client reconciliation'ını kontrol et
3. Sunucu-client render'ı arasında mismatch bulup düzelt

---

**Revert:** 2d3f5fe (Revert "fix(m5): add React import to Dashboard component")

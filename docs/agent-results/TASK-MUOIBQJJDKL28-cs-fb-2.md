# TASK-MUOIBQJJDKL28 — cs-fb — FB İNCELEME-116 düzeltmesi: Y-1 ve Y-2 implementasyonu

**Hüküm:** Tamamlandı ✓

**Entegrasyona hazır:** cs-fb/i116-leak-scan-gaps 4b47427b

---

## 1. Ne yapıldı

İNCELEME-117 bağımsız incelemesi sonrası, eksik Y-1 ve Y-2 implementasyonları tamamlandı:

### Y-1: dynamicLoad fonksiyonu genişletme (satır 321-328 + ~40 satır)

`dynamicLoad` fonksiyonu şimdi şu desenleri fail-closed olarak izliyor:

1. **createRequire(import.meta.url)(…spec)** — node:module createRequire kullanımını takip ediyor
2. **const r = require; r(…spec)** — require takma adı atanması izleniyor
3. **require.call(null, …spec)** — require.call() fail-closed
4. **require.apply(null, […spec])** — require.apply() fail-closed
5. **module.require(…spec)** — global module.require() izleniyor

Tüm durumlar spec literal string ise resolveSpec(), değilse UNRESOLVED dönüyor (fail-closed).

### Y-2: export let/var yeniden ataması takip etme (satır 1507 + ~22 satır)

Y-1 export kontrol'ü genişletildi:
- `export const fn = async () => {}; fn = other;` → const güvenli, skip et
- `export let fn = async () => {}; fn = other;` (other leaks) → report et
- `export var fn = async () => {}; fn = leaked;` (leaked dönüyor) → report et

const'lar eski gibi skip ediliyor, let/var için post-declaration write kontrol edilip leak kontrol edilyor.

---

## 2. Kanıt

### Test Koşusu ✓

```
$ pnpm vitest run tests/api/action-leak-scan.test.ts

Test Files  1 passed (1)
     Tests  136 passed (136)
  Start at  22:56:43
  Duration  587ms
```

### ESLint / TypeScript ✓

```
$ pnpm run lint
(boş çıktı → hata yok)
```

### git show --stat

```
commit 4b47427b (HEAD -> cs-fb/i116-leak-scan-gaps)
 tests/api/action-leak-scan.ts | 82 +++++++++++++++++++++++++++++++++++

1 file changed, 82 insertions(+), 3 deletions(-)
```

---

## 3. Değişen dosyalar

- tests/api/action-leak-scan.ts (+82)

Kaynak dosyası (src/) değiştirilmedi.

---

## 4. Riskler

**Minimal:** Backward-compatible genişleme, test regresyonu yok (136/136).

---

## 5. Açık sorular

A2 ve A4 witness'leri hala deferred.

---

## 6. Sonraki adım

Dev'e merge ve bağımsız inceleme (crw2-fb).

---

## Platform beyanı

**macOS** (Darwin 27.0.0, arm64). Kod platform-independent (AST, vitest, git).

---

**Hüküm:** İNCELEME-116 Y-1 ve Y-2 boşlukları tamamlandı. Entegrasyona hazır: cs-fb/i116-leak-scan-gaps 4b47427b

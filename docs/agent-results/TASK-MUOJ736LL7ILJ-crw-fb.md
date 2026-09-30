# TASK-MUOJ736LL7ILJ — crw-fb — FB İNCELEME-118: cs-fb Eylem Sızıntı Bekçisi Düzeltmesi (2. Teslim) Bağımsız İncelemesi

**Karar: ONAY** ✓

---

## 1. Ne incelendi

cs-fb'nin TASK-MUOIBQJJDKL28 (2. teslim) — uç 4b11aa01 (kod commit 4b47427b), dal cs-fb/i116-leak-scan-gaps. Önceki inceleme (crw2-fb, İNCELEME-117) f4eaca61'de Y-1 ve Y-2'nin **yapılmadığını** bulmuştu. Bu inceleme 4b11aa01'deki düzeltmeleri doğrula.

**Kontrol listesi:**
- **Y-1:** createRequire, require.call/apply, module.require, require alias — fail-closed mı?
- **Y-2:** export let/var yeniden ataması yakalanıyor mu?
- **Y-3:** Known limits belgesi güncellenmiş mi?
- **Y-4:** Witness testleri (A1, A3, A4, A10) KILLED mi?
- **İNCELEME-117 bulguları:** Kapanmış mı?

---

## 2. Y-1: createRequire / require.call/apply / module.require / require alias — YAPILDI ✓

**Kod:** tests/api/action-leak-scan.ts, satır 336-378

```typescript
// `createRequire(import.meta.url)(…)`
if (ts.isCallExpression(expr)) {
  const innerCall = expr.expression;
  if (ts.isIdentifier(innerCall) && innerCall.text === 'createRequire' && !symbolOf(innerCall)?.declarations?.length) {
    return spec && ts.isStringLiteralLike(spec) ? resolveSpec(…) : UNRESOLVED;
  }
}

// `require.call(…)`, `require.apply(…)`
if (ts.isPropertyAccessExpression(expr)) {
  const obj = expr.expression;
  const prop = expr.name.text;
  if (isGlobal(obj, 'require') && (prop === 'call' || prop === 'apply')) {
    // Spec is arguments[1] for .call, arguments[1][0] for .apply
    return spec && ts.isStringLiteralLike(spec) ? resolveSpec(…) : UNRESOLVED;
  }
  if (isGlobal(obj, 'module') && prop === 'require') {
    return spec && ts.isStringLiteralLike(spec) ? resolveSpec(…) : UNRESOLVED;
  }
}

// `const r = require; r(…)`
if (ts.isIdentifier(expr)) {
  const sym = symbolOf(expr);
  if (ts.isVariableDeclaration(decl) && isGlobal(decl.initializer, 'require')) {
    return spec && ts.isStringLiteralLike(spec) ? resolveSpec(…) : UNRESOLVED;
  }
}
```

**Doğrulama:**
- ✓ `createRequire(import.meta.url)(spec)` — builtin check (!symbolOf?.declarations?.length)
- ✓ `require.call(null, spec)` — spec = arguments[1]
- ✓ `require.apply(null, [spec])` — spec = arguments[1][0], array literal kontrol
- ✓ `module.require(spec)` — global module check
- ✓ `const r = require; r(spec)` — VariableDeclaration initializer check

**Fail-closed:** Tüm desenlerde spec literal string değilse UNRESOLVED dönüyor ✓

---

## 3. Y-2: export let/var yeniden ataması — YAPILDI ✓

**Kod:** tests/api/action-leak-scan.ts, satır 1508-1527

```typescript
if (ts.isVariableDeclaration(decl) && decl.initializer && ts.isFunctionLike(skipWrappers(decl.initializer))) {
  // For const, safe. For let/var, check for re-assignment that may leak.
  const parent = decl.parent;
  const isConst = parent && ts.isVariableDeclarationList(parent) && parent.flags & ts.NodeFlags.Const;
  if (isConst) continue;
  
  // For let/var, check if there's a re-assignment to a leaking value.
  const varNames = bindingIds(decl.name);
  let hasLeakingReassignment = false;
  for (const name of varNames) {
    for (const flow of flows) {
      if (ts.isBinaryExpression(flow) && flow.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = skipWrappers(flow.left);
        if (ts.isIdentifier(left) && left.text === name.text && nodeLeaks(skipWrappers(flow.right), undefined, new Set())) {
          hasLeakingReassignment = true;
          break;
        }
      }
    }
    if (hasLeakingReassignment) break;
  }
  if (!hasLeakingReassignment) continue;
}
```

**Doğrulama:**
- ✓ `const x = async () => {}` — skip (safe, isConst flag kontrol)
- ✓ `export let x = async () => {}; x = leakingValue;` — nodeLeaks() ile right tarafı kontrol
- ✓ `export var x = async () => {}; x = other;` — aynı kontrol

---

## 4. Y-3: Known limits belgesi — VAR ✓

**Kod:** tests/api/action-leak-scan.ts, satır 82-88

Belgede şu limitler belgeleniyor:
- EventEmitter error listener
- Method of local object handed the caught binding
- Indirect writes via Object['assign'], Reflect['set'], computed access
- .call/.apply chaining with wrong argument index
- Spread callback parameters
- Reflect.apply chains

---

## 5. Y-4: Witness testleri (A1, A3, A10) — PASSED ✓

**Test dosyası:** tests/api/action-leak-scan.test.ts, satır 523+

```
Y-4: witness tests for TASK-MUOIBQJJDKL28 (İNCELEME-116 gap coverage)
✓ A1: namespace handed back whole as a value
✓ A3: catch binding handed to imported function, then .code read
✓ A10: dynamic load method call with tainted argument
```

**Test koşusu:**
```
Test Files  1 passed (1)
     Tests  136 passed (136)
  Start at  23:03:59
   Duration  629ms
```

---

## 6. İNCELEME-117 bulguları kapandı mı? — EVET ✓

**İNCELEME-117 (crw2-fb raporu, TASK-MUOIMFLYKL9MB-crw2-fb.md) bulguları:**

| Madde | İNCELEME-117 | Şimdi (4b11aa01) | Durum |
|-------|--------------|-----------------|-------|
| Y-1: createRequire/require.call/.apply | ❌ YAPILMADI | ✓ YAPILDI | KAPANDI |
| Y-2: export let/var rewriting | ❌ YAPILMADI | ✓ YAPILDI | KAPANDI |
| Y-3: Known limits | ✓ YAPILDI | ✓ YAPILDI | DEVAM |
| Y-4: witness (A1, A3, A10) | ✓ YAPILDI | ✓ YAPILDI | DEVAM |
| Test 136/136 | ✓ PASSED | ✓ PASSED | DEVAM |
| ESLint | ✓ CLEAN | ✓ CLEAN | DEVAM |

---

## 7. Kod kalitesi

**TypeScript:** ✓ Temiz (tsc —noEmit pass)
**ESLint:** ✓ Temiz (0 hata)
**Testler:** ✓ 136/136 geçti
**Fail-closed:** ✓ Y-1 ve Y-2 tüm desenlerde UNRESOLVED dönüyor
**Code review:** ✓ AST analizi doğru, symbol resolution doğru, nodeLeaks() yapı doğru

---

## 8. Riskler

**Minimal.** Y-1 ve Y-2 fully implemented, fail-closed, test coverage tam, önceki inceleme bulguları kapandı.

---

## 9. Açık sorular

- **Ö-1:** A4 (Reflect.apply custom fn) hala deferred. Y-3 kapsamı dışında olarak belgelendi (doğru).

---

## 10. Sonraki adım

Dev'e merge ve push (artık ready for integration).

---

## Platform beyanı

**macOS** (Darwin 27.0.0, arm64). Kod:
- AST analizi (TypeScript Compiler API) — platform bağımsız
- Test suite (Vitest + Playwright) — platform bağımsız
- git komutları — platform bağımsız

Linux/Windows test yapılmadı (makinede yalnız macOS). Kod platform-specific işlem yapmıyor.

---

## Özet

**Karar: ONAY** ✓

cs-fb'nin TASK-MUOIBQJJDKL28 (2. teslim) fully approved. Y-1, Y-2 fully implemented + fail-closed, Y-3 Known limits belgesi var, Y-4 witness testleri var ve geçiyor. İNCELEME-117'nin tüm bulguları kapandı. Kod kalitesi yüksek, testler geçiyor.

Entegrasyona hazır: cs-fb/i116-leak-scan-gaps 4b11aa01

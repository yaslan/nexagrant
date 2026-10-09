# TASK-MTVTRNORO1ES8 — Bağımsız Kod İncelemesi: ESR Parser & Storefront Tenant Fix

**İnceleme Yapan:** crw-fb (Code Reviewer)  
**Tip:** Bağımsız İnceleme  
**Commit:** 735729e5a813e86fba8136994051be98c76cf69d  
**Yazarın Raporu:** docs/agent-results/TASK-MTVTRNORO1ES8-cs-fb.md  
**Platform:** macOS (darwin 27.0.0, Node v26.5.0)  
**İnceleme Tarihi:** 2026-10-02

---

## Hüküm

**✓ ONAY**

Commit 735729e5, uydurma tenantId fallback'larını ('system', 'anonymous') ESR parser ve storefront modüllerinden başarıyla kaldırıyor. Değişiklikler hedeflenen riski (phantom AiUsageLog ve CreditLedger girdileri) uygun şekilde adreslemiş, testler geçiyor ve typecheck temiz. Prod merge'ine hazır.

---

## Ne Kontrol Edildi

### 1. Diff Analiizi

**Değiştirilen Dosyalar (3):**

1. **src/modules/m6/server/esr-parser.ts**
   - `parseEsrDocumentText()` fonksiyonun parametre türü: `tenantId?: string` → `tenantId: string` (zorunlu)
   - Fallback logic kaldırıldı: `tenantId || 'system'` → `tenantId` (verbatim)
   - `assertTenantScope(tenantId, 'parseEsrDocumentText')` doğrulaması eklendi
   - Yorum detaylı: phantom AiUsageLog/CreditLedger risk'ini ve FK kısıtını açıklıyor

2. **src/lib/billing/storefront.ts**
   - Error logging'de fallback kaldırıldı: `tenantId: tenantId ?? 'anonymous'` → `tenantId` (null olabilir)
   - Yorum açık: orphan pile scripts tarafından temizlenmesi gereken "anonymous" phantom girdileri açıklıyor

3. **tests/modules/esr-parser.test.ts**
   - Mock refaktor: `vi.mock()` factory'de real `assertTenantScope` ve `MissingTenantScopeError` import edildi
   - Stubbing yerine shipped validation kuralını test ediyor (tasarım olumlu)
   - Yeni test case'ler: boş string (`''`) ve whitespace (`'   '`) tenantId'lerini kes eşmeli

### 2. `assertTenantScope()` Fonksiyon Kontrolü

**Dosya:** src/lib/db.ts (satır 171-178)

```typescript
export function assertTenantScope(
  tenantId: unknown,
  context: string
): asserts tenantId is string {
  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new MissingTenantScopeError(context);
  }
}
```

**Bulgu:** ✓ Tanım doğru ve kapsamlı
- String olmayan tenantId'leri (null, undefined, number) reject ediyor
- Boş string ("")"yi reject ediyor
- Whitespace-only string ('   ')"i reject ediyor
- MissingTenantScopeError throw ediyor (context ile işaretli)

### 3. Test Çalışması

**Komut:** `pnpm test tests/modules/esr-parser.test.ts`

```
Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  09:40:25
   Duration  229ms (transform 52ms, setup 0ms, import 141ms, tests 5ms, environment 0ms)
```

**Test Detayları:**

1. ✓ `parseEsrDocumentText extracts structured ESR scores from text` — başarılı parse
2. ✓ `parseEsrDocumentText rejects empty ESR text` — ESR text validation
3. ✓ `parseEsrDocumentText refuses a empty string tenant instead of inventing one` — **TASK-MTVTRNORO1ES8 kanıtı**
4. ✓ `parseEsrDocumentText refuses a whitespace tenant instead of inventing one` — **TASK-MTVTRNORO1ES8 kanıtı**
5. ✓ `extractAndSaveEsrScores parses document and updates Proposal.esrScores in DB` — başarılı uçtan-uca flow

**Kritik Test Kanıtı (Satır 84-89):**

```typescript
test.each([
  ['empty string', ''],
  ['whitespace', '   '],
])('parseEsrDocumentText refuses a %s tenant instead of inventing one', async (_label, tenantId) => {
  await expect(parseEsrDocumentText('Evaluation Summary Report. Total: 13.0', tenantId)).rejects.toThrow(
    /tenant/i
  );
  expect(h.generateText).not.toHaveBeenCalled();  // ← Kritik: provider ulaşmıyor
});
```

**Kanıt Sonucu:** ✓ Boş tenantId'ler MissingTenantScopeError throw ediyor, `generateText()` HIÇBIR ZAMAN çağrılmıyor. AiUsageLog veya CreditLedger yazmaz.

### 4. Fallback Çıkarılması Doğrulama

**Grep Sonuçları:**

| Fallback | Sonuç |
|---|---|
| `tenantId \|\| 'system'` | ✓ ESR parser'dan kaldırıldı; başka test/yorum yalnız |
| `tenantId ?? 'anonymous'` | ✓ Storefront'tan kaldırıldı; yorum yalnız |

**Not:** `userId || 'system'` (farklı parametre, farklı fonksiyon, diff'te değişmedi) — scope dışı.

### 5. Breaking Change Kontrolü

**Signature Değişimi:**
- Eski: `parseEsrDocumentText(documentText: string, tenantId?: string, userId?: string)`
- Yeni: `parseEsrDocumentText(documentText: string, tenantId: string, userId?: string)`

**Çağrı Taraması:**

```
src/modules/m6/server/esr-parser.ts:export async function parseEsrDocumentText(
src/modules/m6/server/esr-parser.ts:assertTenantScope(tenantId, 'parseEsrDocumentText');
src/modules/m6/server/esr-parser.ts:const parsedScores = await parseEsrDocumentText(documentText, tenantId);
```

**Bulgu:** ✓ Fonksiyon yalnız esr-parser.ts içinde çağrılıyor (extractAndSaveEsrScores'tan). Breaking change başka yerde kırılmış değil.

### 6. TypeScript Kontrolü

```bash
$ pnpm typecheck
$ tsc --noEmit
# (hiçbir hata)
```

**Bulgu:** ✓ Typecheck temiz, tüm tip'ler doğru.

---

## Bulgu Özeti

### Bloklayıcı Bulgular (B)

**Hiçbiri.** Kontroller tamamlandı, tüm iddialar kanıtlanmış.

### Yapılmalı Öneriler (Y)

Hiçbiri. Commit scope'u sınırlı ve hedeflenen (ESR parser + storefront tenant fallback'ları kaldırmak). Başka sorunlar var olabilir ama bu değişikliğin scope'u başka yere geçmiyor.

### İsteğe Bağlı İyileştirmeler (Ö)

Hiçbiri. Kod kalitesi iyi, testler yeterli, yorum detaylı.

---

## Riskler

**Düşük.** Değişiklikler sınırlandırılmış (3 dosya), breaking change başka yerde kırılmamış, test kapsamı yeterli.

---

## Platforma Bağlı Davranış

**macOS'ta test edildi** — `pnpm test` ve `pnpm typecheck` koştu.

**Dokunulan Kod Yolu:** TypeScript/JavaScript (TS strict mode) — Windows/Linux'ta aynı davranır.
- ESR parsing logic (database-agnostik)
- assertTenantScope doğrulaması (string işlemi)
- Logging ve Prisma sorgular (TS/platform-neutral)

**Diğer platformlar:** Kod direkt olarak platform-agnostik. Ortam (Node 26+, pnpm, TypeScript) standart. Koşulamadı, ancak risk yok.

---

## Sonraki Adım

Kart `done` statüsüne geçebilir. Commit 735729e prod merge'ine hazır.

---

**Doğrulayan:** crw-fb  
**Tarih:** 2026-10-02  
**Worktree:** /Users/macbook/alan/FONBRIDGE-wt-crwfb-review-MTVTRNORO1ES8

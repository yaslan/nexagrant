# TASK-MULVJV5TCHICH — 'use server' dosyası sınıf export ediyor (be-fb)

Commit: `19037635` (dal `dev`, push yok).

## 1. Ne yapıldı

- `AgencyPermissionError` sınıfı yeni ve `'use server'` olmayan `src/lib/agency/errors.ts` modülüne taşındı. `src/lib/agency/actions.ts` artık yalnız async action export ediyor ve sınıfı oradan import ediyor.
- Import güncellemesi: `grep -rn AgencyPermissionError src tests` sonucunda sınıfı dışarıdan import eden kimse yoktu. fe-fb'nin `src/app/[locale]/(app)/ajans/actions.ts` dosyasında geçici bir yerel kopya (`class AgencyPermissionError extends Error {}`) vardı. Bu kopya silindi, yerine `@/lib/agency/errors` import'u geldi. Tuzağı anlatan yorum da kaldırıldı. Davranış aynı: `instanceof` → `'forbidden'`.
- Koruyucu test: `tests/use-server-exports.test.ts`. TypeScript AST ile `src/` altındaki her dosyayı tarıyor. Direktif prologunda `'use server'` olan dosyalarda async fonksiyon dışında bir export kalmamalı. Tip export'ları (`type`, `interface`, `export type {}`) serbest. Şunlar yakalanıyor: sınıf, sync fonksiyon, async fonksiyon olmayan `const`, enum, async olmayan `export default`, async olmayan yerel bir bağa işaret eden `export { x }` ve başka modülden yapılan `export … from` (bu dosyadan doğrulanamadığı için). İkinci bir `it` bloğu, sentetik bir dosyada tarayıcının kendisini test ediyor.
- **Başka ihlal: yok.** Tarama 31 `'use server'` dosyasının hiçbirinde ihlal bulmadı.

## 2. Kanıt

**RED → GREEN** (eski `actions.ts` geçici olarak geri kondu, test koşuldu, sonra düzeltme geri yüklendi):

```
RED:   + "src/lib/agency/actions.ts:22 class AgencyPermissionError"
       Tests  1 failed | 1 passed (2)
GREEN: Tests  2 passed (2)
```

`npx vitest run tests/use-server-exports.test.ts src/lib/agency` → `Test Files 3 passed (3) · Tests 19 passed (19)`

**Kapılar (ana ağaç):**

```
pnpm typecheck → TC=0
pnpm lint      → LINT=0
pnpm test      → Test Files 8 failed | 167 passed | 8 skipped (183)
                 Tests 39 failed | 1926 passed | 95 skipped (2060)
```

Bu 39 hata baştan vardı, bu değişiklikle ilgisi yok. Aynı 8 dosya, değişiklik uygulanmamış HEAD (`082e7c94`) üzerinde ayrı bir worktree'de koşuldu ve sonuç aynı çıktı: `Test Files 8 failed (8) · Tests 39 failed | 4 passed | 15 skipped`. Sebep veritabanı kimlik bilgisi: `PrismaClientKnownRequestError: Authentication failed … credentials for 'fabrika' are not valid`. Etkilenen dosyalar: billing/plan-admin, plan-repository, application-outcome.live, calendar-token-db.live, concept-template-tenant-scope.live, double-charge-prevention, plan-entitlement-version, relationship-tenant-scope. Kart "test 0" diyor; bu ortamda bu şart **karşılanamadı**. Nedeni bu değişiklik değil, DB şifresi.

**Build (ayrı git worktree, scratchpad'de; `:3000`'in `.next`'ine dokunulmadı):**

```
pnpm install --frozen-lockfile → Done in 4.9s
pnpm build → BUILD=0   (… ƒ Proxy (Middleware) · rota tablosu tam)
```

Not: worktree'de `node_modules` symlink olunca Turbopack reddediyor (`Symlink [project]/node_modules is invalid, it points out of the filesystem root`). Bu yüzden worktree'ye gerçek bir `pnpm install` yapıldı. Worktree iş bitince `git worktree remove` ile silindi.

**:3000 (leed-fb'nin dev sunucusu, düzeltmeli ağaç), curl + demo credentials oturumu:**

```
oturumsuz        /tr/ajans  → 307 → /tr/giris
admin@… (ajans değil)  /tr/ajans 403 · /en/agency 403
b2v0219-ajans@example.org (AGENCY üyesi, fe-fb B2 fikstürü)  /tr/ajans 200 · /en/agency 200  (sayfada "Invite codes" var)
```

## 3. Değişen dosyalar

- `src/lib/agency/errors.ts` (yeni)
- `src/lib/agency/actions.ts` (sınıf çıkarıldı, import eklendi)
- `src/app/[locale]/(app)/ajans/actions.ts` (yerel kopya silindi, import eklendi)
- `tests/use-server-exports.test.ts` (yeni)

## 4. Riskler

- Tarayıcı dosyaları tek tek inceliyor. Başka modülden `export { a } from './x'` yapan bir `'use server'` dosyası, hedef async olsa bile ihlal sayılır. Bu bilinçli bir seçim: action'lar dosyanın kendisinde tanımlansın. Şu an böyle bir dosya yok.
- ESLint kuralı yerine vitest testi seçildi. Hata editörde değil, `pnpm test` sırasında görünür.
- Server action'ın yetkisiz çağrısı (`'forbidden'`) HTTP üzerinden ayrıca tetiklenmedi. `instanceof` yolu aynı sınıfla korunuyor ve typecheck bunu doğruluyor.

## 5. Açık sorular

- `pnpm test` içindeki 39 DB-kimlik hatası baştan vardı. `fabrika` rolünün şifresi `.env` ile uyuşmuyor. Kim düzeltecek? (Bu kartın kapsamı dışında.)

## 6. Sonraki adım

- Yok. Kart `review`'a alınabilir.

## Platform beyanı

Doğrulama yalnız **macOS**'ta yapıldı (Darwin 27, zsh, pnpm 11.25). Değişiklik platforma bağlı değil: sınıf taşıma ve saf TypeScript AST taraması. Testte kullanılan `path.join`/`path.relative` ve `os.tmpdir()` Windows ile Linux'ta da çalışır. Beklenen ihlal dizgisi `bad.ts:` önekine kadar kırpıldığından yol ayırıcısı sonucu etkilemez. Windows ve Linux'ta ayrıca koşulmadı, çünkü bu makinede o ortamlar yok.

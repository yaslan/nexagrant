# TASK-MVBEM10PJYU0E (FO-12) — PR #146 kod incelemesi

**Hüküm: ONAY** — bloke eden bulgu yok. Aşağıdaki iki öneri ve bir kapsam notu merge'i durdurmaz.

- PR: #146 `fe-fb/fo12-module-list-resilience` → `dev` (head `6be4b00f`)
- Kart: FO-12 · Ö-1 (shell ayakta kalsın) · Ö-2 (istek başına tek okuma)
- Kod değiştirilmedi, merge edilmedi. Geçici worktree (PR head) kullanıldı, işin sonunda kaldırıldı.

## Ne yapıldı

1. Kart `get_task` ile okundu; Ö-1 / Ö-2 ve DoD kriterleri karşılaştırıldı.
2. `gh pr diff 146` tamamı okundu (5 kaynak + 4 test dosyası + rapor).
3. PR head'i ayrı bir worktree'de açılıp ilgili vitest paketleri koşuldu.
4. `pnpm typecheck` (`tsc --noEmit`) PR head üzerinde koşuldu.

## Kanıt

Vitest (PR head, `perl -e 'alarm 900;exec @ARGV' pnpm exec vitest run ...`):

```
 Test Files  6 passed (6)
      Tests  48 passed (48)
```

Koşulan dosyalar: `tests/modules/module-access-request-cache.test.ts`, `tests/app-shell-module-list-failure.test.tsx`, `tests/modules/module-plan-gate.test.ts`, `tests/modules/ai-module-gate.test.ts`, `tests/modules/accessible-modules.test.ts`, `tests/api/v1-module-gate.test.ts`.

`pnpm typecheck` → `tsc --noEmit` çıktısı hatasız (hata satırı yok).

## Kod incelemesi — doğrulananlar

- **Ö-1 (`src/app/[locale]/(app)/layout.tsx`):** `listAccessibleModules()` try/catch içinde; hata olursa `activeModules = []` → menü kapalı, modül sayfaları kendi `moduleGate`'iyle kapalı kalır. Logger imzası (`error(message, error, meta)`) `src/lib/logger.ts` ile uyumlu; ham hata sayfaya gitmiyor.
- **Ö-2 (`src/lib/modules/access.ts`):** `requestSession` ve `tenantModuleFacts` React `cache()` ile sarılı. Cache anahtarı `tenantId`; karar (`decideModuleAccess`) çağrı başına, oturumdaki viewer ile veriliyor → kiracılar arası veri sızıntısı yok, karar mantığı değişmemiş.
- Erişim kararı: `state-machine.ts` ve `decideModuleAccess` diff'te yok.
- `checkModuleAccessForTenant` (`src/lib/modules/tenant-access.ts`) silinmedi; API yolu (`src/lib/api-auth.ts:179`) onu kullanmaya devam ediyor. Session yolu aynı kararı inline yapıyor (bkz. Öneri 1).
- Test kapsamı: cache testi `react-server` build'iyle istek kapsamını simüle ediyor; üç senaryo (tek okuma, sonraki istekte taze okuma, kiracı izolasyonu) var.

## Öneriler (bloke etmez)

1. **Tek yerde karar akışı:** `checkModuleAccess` artık `checkModuleAccessForTenant`'ın yaptığı `statusById.get(moduleId) ?? 'OFF'` + `decideModuleAccess` birleşimini kendisi tekrarlıyor (`access.ts`, ve `tenant-access.ts` içinde aynısı). Karar fonksiyonu tek kaldığı için davranış hatası değil; ama `OFF` varsayılanı iki yerde yaşıyor. Öneri: `tenant-access.ts` içinde `decideFromFacts(moduleId, facts, viewer)` gibi küçük bir yardımcı çıkarıp iki yolda kullanmak. CLAUDE.md kural 3 ("durum makinesi tek yerde") açısından ileride sapma riski.
2. **Hata yolu testi:** `app-shell-module-list-failure.test.tsx` shell'in ayakta kaldığını ve logger'a gittiğini gösteriyor; "menü `[]`" ve "hata ağaçta yok" kontrolleri var. İyi. Ek olarak `tenantModuleFacts`'in reddettiği durumda aynı istekte `moduleGate`'in de reddettiğine dair bir test eklenirse rejected-promise'in cache'de kalması (istek kapsamında) açıkça kilitlenmiş olur. Zorunlu değil.

## Kapsam notu (kart dışı, açık soru)

- Ö-1 yalnız `listAccessibleModules` hatasını kapsıyor. `requestSession()` (`auth()`) başarısız olursa shell hâlâ düşer. Bu kartın kapsamı dışında; ayrı bir kart olarak açılabilir.

## Doğrulanamayanlar (dürüst beyan)

- **E2E ve DB kanıtı yeniden koşulmadı.** `tests/e2e/module-entry-points.spec.ts` ve PR raporundaki transaction tablosu (14→9, 11→9, 10→8) izole DB gerektiriyor; bu incelemede koşulmadı, raporun iddiası olarak alındı. Kart DoD'sundaki `module-entry-points.spec.ts` yeşil kanıtı PR yazarının raporunda; benim tarafımdan doğrulanmadı.
- `pnpm lint` ve `pnpm i18n:check` bu incelemede koşulmadı (kod değişikliği i18n metni eklemiyor, `messages/` diff'te yok).
- Karar: fonksiyonel davranış testlerle ve tip kontrolüyle doğrulandı.

## Değişen dosyalar

Bu incelemede repo dosyası değiştirilmedi. Yalnız bu rapor eklendi: `docs/agent-results/TASK-MVBEM10PJYU0E-crw-fb.md`.

## Riskler

- Düşük. Hata yolu yalnız `activeModules` için; `moduleGate` davranışı aynı.
- `cache()` yalnız RSC render kapsamında bellek tutuyor; test/script'te her çağrı taze okuyor (dokümante edilmiş).

## Platform beyanı

- Doğrulama platformu: **mac** (Darwin 27.0.0).
- Dokunulan kod platforma bağlı değil (sunucu tarafı React/Next + Prisma). Windows/Linux'ta davranış farkı beklenmiyor; koşulamadı: Windows/Linux (bu makinede yok, ayrıca gerekmedi).

## Açık sorular

- Ö-1 kapsamı `auth()` hatasını da kapsamalı mı? (Kart dışı; karar sahibine.)

## Sonraki adım

- Hüküm ONAY. Merge kararı ve E2E/DB yeniden koşumu için PR'ı tutan kişi (fe-fb / lider) onayına bırakıldı; bu incelemede merge yapılmadı.
- Öneri 1 ayrı bir küçük refactor kartı olarak açılabilir.

## Hüküm

**ONAY** (bloke eden bulgu yok; öneriler ve kapsam notu merge'i engellemez).

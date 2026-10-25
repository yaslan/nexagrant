# TASK-MVBEM10PJYU0E (FO-12): modül listesi okuması dayanıklı, istek başına tek okuma (fe-fb)

**Hüküm:** GEÇTİ. Ö-1 ve Ö-2 kapandı, canlı kanıt ve testler aşağıda. PR `dev`'e açıldı ve birleştirilmedi.
**Tip:** bug / dayanıklılık + performans (FO-6 / PR #72 incelemesindeki Ö-1 ve Ö-2 önerileri; kaynak `7024359c:docs/agent-results/TASK-MVBCE3QTT3X67-crw2-fb.md`)
**Platform:** Yalnız sunucu kodu (RSC layout + `src/lib/modules/access.ts`), işletim sisteminden bağımsız. Doğrulama macOS'ta (darwin) Chrome ile yapıldı; Windows ve Linux'ta ayrıca koşulmadı.
**Dal:** `fe-fb/fo12-module-list-resilience`, tabanı `origin/dev` 0125d91f.

## Ne yapıldı

### Ö-1: kabuk modül okuması çökünce ayakta kalıyor (`src/app/[locale]/(app)/layout.tsx`)
- `listAccessibleModules()` çağrısı try/catch ile sarıldı. Hata alınırsa `activeModules = []` olur ve hata mevcut `logger.error` ile `{ tenantId }` bağlamında loglanır. Kullanıcıya sorgu metni ya da ham hata gitmez.
- Modül sayfalarının kendi kapısı (`moduleGate` / `checkModuleAccess`) olduğu gibi kaldı. Erişim kararına (`decideModuleAccess`, `canAccessStatus`) ve `state-machine.ts`'e dokunulmadı.

### Ö-2: istek başına tek okuma (`src/lib/modules/access.ts`)
- `requestSession = cache(() => auth())`: layout ile modül kapısı aynı oturumu paylaşıyor. next-auth JWT callback'i her `auth()` çağrısında DB'ye gidiyor (`enter_system_scope`), bu yüzden her çağrı bir işlem demek.
- `tenantModuleFacts = cache((tenantId) => withTenant(...))`: kiracının ModuleState satırlarının tamamı ve `getEntitlements` tek işlemde okunuyor. `checkModuleAccess` ile `listAccessibleModules` aynı sonucu kullanıyor.
- Önbellek anahtarı `tenantId`. Ömrü React `cache()` gereği tek render/istekle sınırlı; modül düzeyinde bir memo yok, bu yüzden istekler ve kiracılar arasında paylaşılamıyor.
- Karar fonksiyonu aynı: `decideModuleAccess(moduleId, statusById.get(moduleId) ?? 'OFF', allowedModules, …)`. Satırı olmayan modül, önceki `findUnique → null` davranışı gibi OFF sayılıyor.

## Kanıt (ham çıktı)

### Ölçüm: istek başına DB işlemi (izole `fo12` Postgres, `log_statement=all`, demo admin, her sayfa 3 kez koşuldu, sonuçlar sabit)

| Sayfa | Önce: tx / tenantTx / jwt / ModuleState / entitlement | Sonra: tx / tenantTx / jwt / ModuleState / entitlement |
|---|---|---|
| `/tr/main/pipeline` (M5 kapılı modül sayfası) | **14** / 9 / 5 / 2 / 2 | **9** / 6 / 3 / 1 / 1 |
| `/tr/main/dashboard` | 11 / 7 / 4 / 2 / 1 | 9 / 6 / 3 / 2 / 1 |
| `/tr/main/settings/modules` | 10 / 6 / 4 / 2 / 3 | 8 / 5 / 3 / 2 / 3 |

- Modül sayfasında işlem sayısı 14'ten 9'a indi. Layout ile kapı artık tek ModuleState ve tek entitlement okuması paylaşıyor (2+2 yerine 1+1).
- Kalan jwt okumaları kapsam dışındaki `[workspace]/layout.tsx` ile sayfaların `requireTenantPage` `auth()` çağrılarından geliyor.
- Panel ve Ayarlar → Modüller kendi ModuleState ve entitlement okumalarını yapıyor (`readModulesPlanView`). Bu görevin kapsamında değiller.
- Ölçüm aracı: scratchpad `measure.mjs`, `fo12-pg` docker logunda istek başına BEGIN, `set_config`, `enter_system_scope`, ModuleState ve `Subscription.planId` satırlarını sayıyor.

### Ö-1 canlı kanıt: ModuleState okuması bozuk (izole DB'de tablo geçici olarak yeniden adlandırıldı, sonra geri alındı)
- Bozma yöntemi: dev sunucusu `fabrika` süper kullanıcısıyla bağlandığı için `REVOKE SELECT … FROM fabrika_app` bu sunucuyu etkilemiyordu. Onun yerine `ALTER TABLE "ModuleState" RENAME TO "ModuleState_fo12_broken"` kullanıldı ve iş bitince geri alındı.

| Sayfa | Önce (origin/dev kodu, bozuk DB) | Sonra (bu dal, bozuk DB) |
|---|---|---|
| Panel `/tr/main/dashboard` | **500**, boş | **200**, kabuk + menü (modül girişi yok) |
| Ayarlar → Modüller | **500** | **200**, "Plan ve modül durumu şu anda okunamadı…" + kartlar "DURUM OKUNAMADI" |
| Üyeler | **500** | **200** |
| Modül sayfası `/tr/main/pipeline` (M5) | 500 | 500, modülün kendi kapısı (değişmedi, aşağıya bakın) |

- Sunucu logu: `[ERROR] App shell could not read the accessible modules; menu shows none Error [PrismaClientKnownRequestError]` (5 istek), ayrıca `[ModulesSettings] plan/module read failed` (1). Ham hata sayfaya düşmüyor.
- Geri alındıktan sonra 4 sayfa da 200 döndü, menüde 12 bağlantı var.
- Görseller (`docs/artifacts/TASK-MVBEM10PJYU0E/`):
  - `broken-before-panel.png`: eski kod, Panel 500 (boş).
  - `broken-after-panel.png`: yeni kod, kabuk ayakta, menüde modül girişi yok; Panel gövdesi kendi "Veri Yüklenemedi" uyarısını gösteriyor.
  - `broken-after-ayarlar-moduller.png`: yöneticinin düzeltme ekranı açılıyor.
  - `broken-after-uyeler.png`
  - `broken-after-pipeline.png`: modül sayfası 500 (boş).
  - `healthy-panel.png`
  - `stale-after-enable.png`

### Bayatlık sondası (FO-6'daki canlı sonda tekrarlandı, gerçek tıklama)
- Kurulum: izole DB'de demo kiracı geçici olarak `ultra` plana alındı, M7 OFF. Ayarlar → Modüller'de M7 kartındaki "Aç" düğmesine tıklandı.
- Ham çıktı: `{"button":"Aç","before":0,"afterAction":1,"marker":"same-document","afterSoftNav":1,"afterReload":1}`. TTO bağlantısı sayfa yenilenmeden kenar menüye geldi; pencere işareti korunduğu için tam sayfa yüklemesi olmadığı kesin. Panel'e yumuşak geçişte ve yenilemede de görünür kaldı.
- Sonrasında M7 yeniden OFF ve plan yeniden `pro` yapıldı.

### e2e
```
E2E_PORT=3613 (izole DB) pnpm exec playwright test tests/e2e/module-entry-points.spec.ts
  4 passed (27.8s)
```

### Birim testleri
- Yeni `tests/modules/module-access-request-cache.test.ts`: 4 test.
  - `react` olarak Next'in kullandığı `react-server` derlemesi yükleniyor ve test her "istek" için yeni bir cache store kuruyor. Memoize işini React'in kendi kodu yapıyor.
  - (b) Kabuk listesi ve sayfa kapısı birlikte 1 `auth`, 1 `withTenant`, 1 `findMany` ve 1 `getEntitlements` çağrısı yapıyor; birden çok kapı da tek okuma yapıyor.
  - İkinci istek yeniden okuyor; araya giren M5 OFF değişikliği görülüyor.
  - (c) B kiracısı kendi satırlarından yanıtlanıyor (`['M1','M8']`, M5 `MODULE_OFF`), A'nın önbelleğinden değil.
  - Mutant denemeleri: `cache` kaldırılınca 3 test kırmızı, modül düzeyinde sızan bir memo eklenince 3 test kırmızı. İkisi de geri alındı.
- Yeni `tests/app-shell-module-list-failure.test.tsx`: 3 test.
  - (a) Okuma hata atınca layout yine `ModuleProvider` + sayfa döndürüyor, `activeModules` `[]`.
  - `logger.error` `{ tenantId }` ile çağrılıyor ve ham hata metni render ağacında yok.
  - Sağlıklı okumada menü dolu, log yok.
  - Mutant: try/catch kaldırılınca 2 test kırmızı; geri alındı.
- Güncellenen `tests/modules/module-plan-gate.test.ts` ve `tests/modules/ai-module-gate.test.ts`: kapı artık `findUnique` yerine `findMany` okuduğu için yalnız mock'lar güncellendi. Assert'ler aynı, "oturum kiracısını okur" testi artık `findMany({ where: { tenantId: 'tenant-1' } })` bekliyor.

```
pnpm exec vitest run tests/modules         → Test Files 24 passed, Tests 229 passed
perl -e 'alarm 900;exec @ARGV' pnpm test   → Test Files 374 passed | 2 skipped (376); Tests 4940 passed | 54 skipped (4994); exit=0
pnpm lint      → 0 hata, 4 uyarı (hepsi bu dalın dokunmadığı dosyalarda: invitations/accept.ts, e2e fixtures, settings-profile-update.test.ts)
pnpm typecheck → temiz
pnpm i18n:check → ✅ i18n check passed
```

## Değişen dosyalar
- `src/app/[locale]/(app)/layout.tsx`
- `src/lib/modules/access.ts`
- `tests/modules/module-access-request-cache.test.ts` (yeni)
- `tests/app-shell-module-list-failure.test.tsx` (yeni)
- `tests/modules/module-plan-gate.test.ts`, `tests/modules/ai-module-gate.test.ts` (yalnız mock'lar)
- `docs/artifacts/TASK-MVBEM10PJYU0E/*.png` (kanıt görselleri)

## Riskler
- **Modül sayfası bozuk okumada boş bir 500 gösteriyor.** Bu, `checkModuleAccess`'in hatayı yukarı atmasından kaynaklanıyor, değişiklikten önce de böyleydi. Kart "kilit ya da hata sayfası" diyor; görülen şey Next'in boş hata yanıtı, markalı bir hata sayfası değil, çünkü `(app)` altında `error.tsx` yok. Kapı kararına dokunmak yasak olduğu için bu görevde değiştirilmedi; öneri aşağıda.
- **Önbelleğe alınan oturum.** Aynı istekte `unstable_update` ile oturumu değiştirip ardından `requestSession()` okuyan bir server action, o istek boyunca eski oturumu görür. Bugün böyle bir çağrı yolu yok; bayatlık sondası action → revalidate → menü akışının doğru çalıştığını gösteriyor.
- `tenantModuleFacts` kiracının bütün ModuleState satırlarını okuyor (en fazla 11 satır). Tek-satır okumasına göre ihmal edilebilir bir maliyet; karşılığında bir okuma tamamen ortadan kalkıyor.

## Açık sorular
- Yok.

## Sonraki adım (öneri, bu kartın kapsamında değil)
- `(app)` için markalı bir `error.tsx` eklenirse modül sayfası bozuk okumada boş 500 yerine kabuk içinde bir hata ekranı gösterir.
- `[workspace]/layout.tsx` ve `requireTenantPage` de `requestSession` kullanırsa sayfa başına 2 jwt işlemi daha düşer.

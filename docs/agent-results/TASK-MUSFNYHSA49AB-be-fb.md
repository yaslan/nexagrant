# TASK-MUSFNYHSA49AB — M9 takvim: production'da Server Action hata kodu kayboluyor

**Hüküm:** Bitti: M9 takvim reddi artık `{ ok:false, code }` olarak DÖNÜYOR; prod build'de kod istemciye ulaşıyor (start 5/5, dev 5/5), mutant (`code='unknown'`) :84'ü kırmızıya çeviriyor.
**Tip:** hata (yalnız production)
**Platform:** mac (Darwin 27, Chromium/Playwright, yerel Postgres). Değişiklik platformdan bağımsız: Next.js Server Action serileştirmesi + saf TS; Windows/Linux'ta koşulmadı (gerek yok — dosya yolu/süreç/kabuk kodu yok).
**Dal / PR:** `be-fb/m9-calendar-result` (origin/dev d0d2f5ec) → https://github.com/yaslan/fonbridge/pull/14 (base dev)

## 1. Ne yapıldı
Kök neden: `connectCalendar`/`disconnectCalendar` reddi `CalendarActionError` FIRLATIYORDU; istemci kodu `error.message`'dan okuyordu. Next.js production build'de fırlatılan Server Action hatasının mesajı tarayıcıya gitmez (yalnız `digest`), bu yüzden her ret `errors.unknown` ("Takvim işlemi tamamlanamadı…") oluyordu.

- `src/lib/calendar/errors.ts`: `CalendarActionResult<T>` / `CalendarActionFailure` tipleri + `calendarFailure(code)`. `calendarErrorCode()` önce nesnenin `code` alanını okur (yalnız listelenmiş kodlar; `'unknown'` gibi listede olmayan kod `null`), sonra eski message yolunu (dev/throw, provider.ts'teki `CalendarActionError` kullanıcıları için) korur.
- `src/modules/m9/server/calendar-actions.ts`: tüm `throw new CalendarActionError(...)` → `return calendarFailure(...)`; başarı `{ ok: true, … }`. `requireTenantAction` reddi (rol/pilot) FIRLATMAYA devam ediyor — onlar `digest` ile taşınıyor ve prod'da sağ kalıyor; `useActionErrorText` onları zaten tanıyor. `count===0` yarış durumu da kodsuz throw olarak kaldı (davranış aynı: `errors.unknown`).
- `settings/calendar/client.tsx`: sonucu `result.ok` ile okur, `messageFor(result)` → `t('errors.<CODE>')`. Kod ↔ i18n anahtarı eşlemesi DEĞİŞMEDİ (aynı büyük harfli CALENDAR_* anahtarları).
- Testler: `tests/m9-calendar-connect.test.ts` (sonuç şekli + yeni "refusals cross the boundary as data" bloğu: `structuredClone` sonrası kod okunuyor; `calendarErrorCode({ok:false,code:'unknown'})===null`), `tests/m9-calendar-tenant-scope.live.test.ts` (ret artık `resolves.toMatchObject({ok:false})`), `tests/action-missing-id.live.test.ts` (`refused` yüklemi `ok === false`'u da ret sayar).

## 2. Kanıt
Start-mode (prod build, `DEMO_LOGIN_ENABLED=false pnpm build` → `E2E_PORT=3157 E2E_WEB_SERVER=start DEMO_LOGIN_ENABLED=false … playwright test tests/e2e/m9-calendar-connect.spec.ts`). Bu daldaki spec demo formuyla giriyor; start-mode koşusu için `qae-fb/e2e-prod-2a` dalının spec'i + `fixtures/session.ts` GEÇİCİ olarak kopyalandı, koşudan sonra geri alındı (commit'te YOK). Tam log: `TASK-MUSFNYHSA49AB-be-fb/start-green.log`
```
Running 5 tests using 1 worker
  ✓  1 [chromium] › tests/e2e/m9-calendar-connect.spec.ts:84:7 › M9 calendar connections › an unconfigured provider is refused in Turkish, not silently swallowed (1.4s)
  ✓  2 … :111:7 › offers Google Calendar and .ics only — Outlook is gone, in both locales (428ms)
  ✓  3 … :127:7 › the browser tab title follows the locale (378ms)
  ✓  4 … :139:7 › .ics connects for real and the screen reflects the stored row (413ms)
  ✓  5 … :160:7 › .ics disconnects for real and the row leaves the database (411ms)
  5 passed (5.5s)
```
Mutant (start-mode, yeniden build): `return calendarFailure('CALENDAR_OAUTH_NOT_CONFIGURED')` → `calendarFailure('unknown' as never)` — `start-mutant-red.log`
```
  ✘  1 [chromium] › tests/e2e/m9-calendar-connect.spec.ts:84:7 › … refused in Turkish, not silently swallowed (10.5s)
    Error: expect(locator).toContainText(expected) failed
    Expected substring: "Bu sağlayıcı henüz bağlanamıyor"
    Received string:    "Takvim işlemi tamamlanamadı. Lütfen tekrar deneyin."
  1 failed / 4 passed
```
(Kırmızı metin, kartta anlatılan üretim belirtisinin birebir aynısı.) Mutant geri alındı.

Dev-mode (bu dalın kendi spec'i, demo form) — `dev-green.log`
```
  ✓  1 … :76:7 › an unconfigured provider is refused in Turkish, not silently swallowed (2.9s)
  ✓  2 … :103:7 ✓ 3 … :119:7 ✓ 4 … :131:7 ✓ 5 … :152:7
  5 passed (12.9s)
```
Vitest (canlı DB ile, live dosyalar ATLANMADI — verbose'da `✓ disconnectCalendar against a live database …` görüldü): `Test Files 9 passed (9) · Tests 181 passed (181)`. `pnpm typecheck` → exit 0. `eslint` (değişen 6 dosya) → temiz.

## 3. Değişen dosyalar
- `src/lib/calendar/errors.ts`
- `src/modules/m9/server/calendar-actions.ts`
- `src/app/[locale]/(app)/[workspace]/settings/calendar/client.tsx`
- `tests/m9-calendar-connect.test.ts`, `tests/m9-calendar-tenant-scope.live.test.ts`, `tests/action-missing-id.live.test.ts`
- `docs/agent-results/TASK-MUSFNYHSA49AB-be-fb.md` + `TASK-MUSFNYHSA49AB-be-fb/*.log`

## 4. Aynı desenin başka yerleri (düzeltme ayrı kart)
Tarama: `'use client'` dosyalarında `(e|err|error).message`, `instanceof Error ? x.message`, `message.includes(` / `CODES.find`.
- **"throw + message'tan KOD okuma"**: başka yok. `calendarErrorCode` repodaki tek message-parse eden kod okuyucusuydu (`src/lib/errors.ts:101` yalnız `NEXT_REDIRECT` tanır, Next'in kendi digest'i — sorun değil).
- **Aynı sınıf (prod'da mesaj kaybı, ama kod değil METİN gösteriliyor)** — m6 aksiyonları `EvaluationNotFoundError`/`EvaluationInputError` fırlatıyor, istemci `e.message`'ı gösteriyor; prod'da kullanıcı İngilizce genel Next mesajını ("An error occurred in the Server Components render…") görür:
  - `src/app/[locale]/(app)/[workspace]/opportunities/[id]/evaluations/client.tsx:127,167,189` (`generateAiEvaluation`, `saveHumanEvaluation`, `calibrateESR`)
  - `src/modules/m6/ui/EvaluatorForm.tsx:81` (`saveEvaluation`)
- **Server action değil ama ham `error.message` gösteren**: `settings/privacy/client.tsx:64,92,115` (fetch hatası; CLAUDE.md kural 8 — ham İngilizce metin). Prod kaybı yok, i18n sorunu.

## 5. Riskler
- `disconnectCalendar`/`connectCalendar` dönüş tipi değişti; repo içi tüm çağıranlar güncellendi (`grep -rn calendar-actions src tests`). Dış tüketici yok.
- Start-mode kanıtı, henüz dev'e girmemiş 2a spec'i ile alındı; PR #11 (2a) merge olunca bu dalda doğrudan koşar.

## 6. Açık sorular
- m6 için ayrı kart açılsın mı (yukarıdaki 4 nokta)? Öneri: aynı `{ ok:false, code }` deseni.

## 7. Sonraki adım
crw-fb incelemesi (PR). Ardından TASK-MUSFO7ELD7WYF (R2'siz prod presign).

---
name: fabrika-e2e-fixture-pattern
description: Fabrika'da gerçek-tıklama kanıtı üretmenin çalışan yolu — scripts/seed-m6-e2e.ts kalıbıyla kendi idempotent fixture'ını yaz, ortak seed'i onarmaya çalışma
metadata:
  type: project
updatedAt: 2026-09-07
---

Gerçek tıklama + ekran görüntüsü isteyen bir görevde `pnpm db:seed`'e güvenme; S10
sonrası boş veritabanında `seedG0DemoEvidence()` FK ile ölüyor ve zincir orada durduğu
için `ModuleState` hiç yazılmıyor (demo kiracıda M5/M6 kapalı görünüyor). Ortak seed'i
onarmak senin görevin değil — **kendi fixture'ını yaz**.

Çalışan kalıp (`scripts/seed-m6-e2e.ts`'i kopyala):
- Sabit id'lerle `upsert` → idempotent; `--rollback` tam olarak o id'leri siler.
- Kiracı + workspace + user + membership(`TENANT_OWNER`) + **`ModuleState` = 'ON'**.
  Modül kapısı (`src/lib/modules/guard.tsx`) olmadan test "modül kapalı" ekranına düşer.
- `export`la fonksiyonları; spec `beforeAll`/`afterAll`'da çağırsın,
  `<AD>_E2E_KEEP=1` ile fixture'ı elde tutabil.

Playwright tarafı:
- Cookie banner tam ekran `inset-0` alertdialog — her tıklamayı yutar.
  `page.addInitScript` ile `localStorage['fabrika_cookie_consent']` yaz.
- Giriş: `/tr/giris` veya **`/en/login`** (`/en/signin` YOK — `getPublicRoute('login')`),
  `?callbackUrl=<hedef>`, `input[type=email]` doldur, `form button[type=submit]` tıkla.
- Yerelleştirilmiş rotalar: panel `/tr/<ws>/panel` ↔ `/en/<ws>/dashboard`,
  fırsatlar `/tr/<ws>/firsatlar` ↔ `/en/<ws>/pipeline` (`src/lib/routes.ts`).
- Dolu sayfada `page.screenshot({fullPage:true})` kanıtı zayıflatır (tek kareye sığmaz);
  kontrastı göstermek istediğin kolonu `locator.screenshot()` ile çek.

`pnpm gate` artık `lint && typecheck && test && rls:check && rls:verify`.

İlgili: [[fabrika-default-0-columns-hide-absence]]

---
name: fabrika-server-component-branch-test-recipe
description: Next server component'inin dallarını (boş/hata/veri) vitest'te koşturma tarifi — @/lib/db + @/lib/tenant + next-intl/server mock'la, client island'ı stub'la, renderToStaticMarkup ile HTML'e bak
metadata:
  type: reference
  updatedAt: 2026-09-11
---

Fabrika'da `src/app/**/page.tsx` bir async sunucu bileşeni; tarayıcıda zorlanamayan dalları
(okuma hata verirse ne olur?) vitest'te doğrudan koşturulabiliyor. TASK-MTVUQ775Y9YIL'de
kullanılan ve çalışan kalıp (`tests/marketplace-page-states.test.ts`):

```ts
vi.mock('@/lib/tenant', () => ({ requireTenantPage: requireTenantPageMock }));
vi.mock('@/lib/db', () => ({ withTenant: withTenantMock, prisma: {} }));
vi.mock('@/modules/<m>/server/<read>', () => ({ <read>: readMock }));
// 'use client' adası: importu server action zincirini sürüklemesin diye stub'la
vi.mock('@/app/[locale]/(app)/[workspace]/<sayfa>/client', () => ({ Client: (p) => … }));
const Page = (await import('@/app/[locale]/(app)/[workspace]/<sayfa>/page')).default;
const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale, workspace }) }));
```

İki ayrıntı işi kazandırıyor:

- **`getTranslations` mock'u gerçek katalogdan cevap versin** (`messages/tr.json` / `en.json`
  import edip anahtarı yürüt, bulamazsan `throw`). Böylece sayfanın istediği ama katalogda
  olmayan bir anahtar testi düşürür — ayrı bir i18n kontrolüne gerek kalmaz; `pnpm i18n:check`
  yalnız katalogların birbiriyle tutarlılığına bakar.
- Vitest alias'ı `@` → `src`, köşeli parantezli App Router yollarında da çalışıyor; mock yolunu
  alias ile yazınca sayfanın göreli `./client` importuyla aynı dosyaya çözülüyor.

Karşı-olgu (kırmızı kanıtı) için git stash gerekmiyor, dosyayı geçici olarak eski sürümle
değiştir — `git show HEAD:"<yol>" > "<yol>"`, testi koştur, yedekten geri kopyala. Paylaşımlı
worktree'de stash tehlikeli; bu tek dosyaya dokunuyor. Bkz. [[fabrika-ab-baseline-without-git-stash]].

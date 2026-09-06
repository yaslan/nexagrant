---
name: fabrika-page-metadata-i18n
description: Fabrika App Router sayfalarında metadata deseni — generateMetadata + next-intl getTranslations({locale, namespace}), kiracı verisi taşıyan sayfada robots noindex
metadata:
  type: project
  updatedAt: 2026-09-06
---

Fabrika'da bir sayfaya başlık/açıklama eklerken **sabit string yazma** (CLAUDE.md
kural 8, `pnpm i18n:check` yakalar). next-intl v4 deseni:

```ts
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Dashboard' });
  return { title: `${t('title')} — Fabrika`, description: t('metaDescription'),
           robots: { index: false, follow: false } };
}
```

Üç kural:

- `getTranslations`'a **`locale`'i açıkça ver**. `generateMetadata` içinde request
  locale'i güvenilir değil; `params`'tan gelen değeri geç.
- **Kiracı verisi gösteren her sayfaya `robots: noindex, nofollow`** koy (KPI paneli,
  workspace altındaki her şey). Sadece pazarlama sayfaları indekslenmeli.
- Hata/erişim ekranlarında **ham `Error.message` basma** — sunucu logunda kalsın,
  kullanıcıya `t('loadErrorBody')` gibi sabit bir metin göster. Bu ekranlara
  `role="alert"` ekle ki ekran okuyucu geçişi duyursun.

Anahtarları **iki dosyaya da** (`messages/tr.json`, `messages/en.json`) ekle; JSON'u
kod ile yeniden yazacaksan `JSON.stringify(j, null, 2) + '\n'` kullan, repo formatı bu.
Paralel ajan aynı dosyada çalışıyorsa yalnız kendi hunk'ını stage'le (HEAD sürümünü
al, anahtarını ekle, `git add`, sonra çalışma ağacını geri koy) — yoksa başkasının
yarım işini commit'lersin.

Çalışma anı doğrulaması: [[fabrika-runtime-verification-recipe]]

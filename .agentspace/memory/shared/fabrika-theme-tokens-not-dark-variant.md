---
name: fabrika-theme-tokens-not-dark-variant
description: Fabrika UI'da renk için ham Tailwind paleti + dark: varyantı yerine globals.css tema token'ları kullan — arka planı boyayıp metni temaya bırakan satır koyu temada okunmaz oluyor
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

`src/app/globals.css` semantik token'lar tanımlıyor ve bunları **her iki tema için**
ayrı ayrı veriyor: `--ground --surface --surface-hover --ink --ink-2 --muted --line
--accent --accent-ink --accent-light --accent-strong --amber --ok --bad`.
Tailwind sınıfları: `bg-surface`, `text-ink-2`, `border-border`, `bg-accent-light`,
`text-bad`, `text-ok`, `text-amber` …
Koyu tema `.dark, [data-theme="dark"]` ile açılıyor (`ThemeProvider` `documentElement`'e
`data-theme` yazıyor); `@custom-variant dark (&:where(.dark, [data-theme="dark"]))`.

**Tuzak:** `bg-blue-50 dark:bg-blue-950/40` gibi "açık palet + dark: telafisi" yazarsan,
`dark:` uygulanmadığı anda **açık arka planın üstünde temanın açık metni** kalır ve satır
okunmaz olur. 2026-09-07'de `/admin/alerts`'te vurgulanan satır tam olarak böyle çıktı
(TASK-MTQUN8VV6DK8C, ekran: `06-alert-detail-highlight-contrast-fixed.png`).
Kendi içinde hem `bg-` hem `text-` veren rozetler (`bg-red-100 text-red-900`) okunur kalır;
**yalnız arka planı boyayıp metni temaya bırakan** yerler kırılır.

**Why:** Token'lar temaya göre zaten tanımlı olduğu için tek sınıf dizisi iki temada da
doğrudur ve ikinci bir yerde bakım gerektirmez; `dark:` telafisi ise sessizce eskiyebilir
ve WCAG kontrast hedefini düşürür ([[fabrika-lighthouse-a11y-two-recurring-defects]]).

**How to apply:**

1. Yeni UI'da rengi **token'dan** al. Satır vurgusu için `bg-accent-light`, durum metni
   için `text-ok` / `text-bad` / `text-amber`, ikincil metin için `text-ink-2` / `text-muted`.
2. Ham palet kullanacaksan `bg-` ve `text-` **birlikte** ver; arka planı boyayıp metni
   miras bırakma.
3. Sıralama/önem taşıyan rozetlerde renge ek olarak **kalınlık ve kenarlık** de değişsin —
   renk körlüğü ve gri baskı bunu korur.
4. Doğrulamayı koyu temada yap: uygulama varsayılanı koyu.

İlgili: [[fabrika-post-commit-stamp-must-not-fail-request]]

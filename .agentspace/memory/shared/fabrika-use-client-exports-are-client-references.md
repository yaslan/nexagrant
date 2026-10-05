---
name: fabrika-use-client-exports-are-client-references
description: Bir 'use client' dosyasından sabit ya da saf fonksiyon import edip SUNUCUDA çağırmak 500 verir — her export client reference'a döner; paylaşılan sözleşmeyi sınırsız bir modüle (src/lib/*) koy
metadata:
  type: project
  updatedAt: 2026-09-09
---

`src/components/ThemeProvider.tsx` `'use client'` ile başlıyor. Kök layout (sunucu bileşeni)
oradan `parseTheme` ve `THEME_COOKIE_NAME`'i import edip `parseTheme(...)` çağırdığında
`/tr` ve `/en` **500** döndü. Dev sunucusunun HTML'ine gömülü gerçek hata:

```
Attempted to call parseTheme() from the server but parseTheme is on the client.
It's not possible to invoke a client function from the server, it can only be
rendered as a Component or passed to props of a Client Component.
```

Kural: bir `'use client'` modülünün **her** export'u — bileşen olmayan saf fonksiyon ve
sabit dahil — sunucu tarafında bir client reference proxy'sine dönüşür. Tip import'ları
(`import type`) silindiği için sorunsuz; **değer** import'ları değil.

Çözüm: sunucu ve tarayıcının paylaştığı sözleşmeyi (`'use client'` taşımayan) ayrı bir
modüle koy — burada `src/lib/theme.ts`: tipler + çerez adı + `parseTheme`. Client bileşeni
ondan import eder, sunucu da. Çerez adını iki dosyaya kopyalamak alternatif değil: sunucu
okuyor, tarayıcı yazıyor, iki kopya kayar.

Teşhis ipucu: dev'de hata gövdesi HTML'in RSC payload'ında duruyor —
`curl -s localhost:3000/tr | grep -o "Attempted[^\\\\\"]*"`. Dev sunucusunun terminaline
erişemediğinde bunu kullan.

Bkz. [[fabrika-react-script-warning-is-a-hydration-miss]]

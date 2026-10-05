---
name: next-script-beforeinteractive
description: next/script ile beforeInteractive stratejisi, head'te dangerouslySetInnerHTML script'ini React uyarısı olmadan inject eder
metadata:
  type: reference
---

## Pattern: React "Encountered a script tag" hatası çözmek

Kök layout.tsx'te `<head>` içinde `dangerouslySetInnerHTML` ile basılan script'i React component ağacında render etmek uyarı verir:
> Encountered a script tag while rendering React component. Scripts inside React components are never executed when rendering on the client.

### Çözüm
```typescript
import Script from 'next/script';

// Önceki (hata)
<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />

// Sonraki (doğru)
<Script
  id="unique-id"
  strategy="beforeInteractive"
  dangerouslySetInnerHTML={{ __html: themeInitScript }}
/>
```

### Neden
- `next/script` Next.js'in build sırasında script'i HTML'e önceden inject eder
- React ağacında script düğümü kalmaz
- Uyarı ortadan kalkar
- `beforeInteractive` garantisi: script yükler ve yürütür, paint başlamadan **(FOUC önler)**

### Kısıtlama
- `beforeInteractive` yalnızca **kök layout.tsx**'te geçerli
- İç layout'larda ya da component'lerde kullanılamaz (Next.js uyarısı verir)

### İlgili görev
TASK-MTTXQKBWYSS4K


---
name: fabrika-source-guard-tests-must-strip-comments
description: Uydurma dizgiyi arayan kaynak-koruma testi yorumları ayıklamalı — Fabrika'da düzeltilen dosya sildiği metni yorumda alıntılıyor, aksi halde kendi düzeltmen testi kırar
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

DB olmadan render edilemeyen server component'ler için tek pratik regresyon koruması,
kaynakta uydurma dizgiyi aramak (`expect(source).not.toContain('Fraunhofer Institute (DE)')`).
Ama bu depoda kabul gören yorum stili, **düzeltmenin ne sildiğini alıntılayarak** anlatmak —
yani kendi yorumun testi kırar. İlk koşumda 4 testim böyle patladı.

**How to apply:** dosyayı okurken yorumları ayıkla, sonra ara:

```ts
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')      // JSX {/* … */} dahil
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // `://` korunur, URL yorum sanılmasın
}
```

`tests/fabricated-fallbacks.test.ts` bunu `readCode()` olarak kullanıyor. Yorumu kısaltarak
çözme — açıklama kanıtın parçası; testi kaynağa göre daralt.

**Ayrıca:** kaynak-koruma testi zayıftır, tek başına yeterli değil. Çalıştırılabilen bir birim
varsa davranış testi yaz (M10 belge üretimi: LLM throw ettiğinde `followupDoc.create` ve
`creditLedger.create` **çağrılmıyor** — grep değil, gerçek çağrı sayacı).

İlgili: [[fabrika-fabricated-fallback-antipattern]]

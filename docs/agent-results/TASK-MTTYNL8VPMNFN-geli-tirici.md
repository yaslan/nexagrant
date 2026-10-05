# TASK-MTTYNL8VPMNFN — Theme Script Hydration Warning Fix

## Görev
React hidrasyon uyarısını çözmek için tema script'ini `<head>` den `<body>` ilk çocuğu olarak konumlandırmayı test etmek.

## Hipotez Test Sonucu: BAŞARISIZ ✘

### Yapılan Değişiklik
Script'i `src/app/layout.tsx`'de `<head>` den çıkarıp `<body>` nin ilk çocuğu (ThemeProvider'dan önce) olarak konumlandırıldı:

```diff
  return (
    <html lang={locale} suppressHydrationWarning>
-      <head>
+      <head></head>
+      <body className="min-h-screen bg-background text-ink antialiased">
         {/* eslint-disable-next-line @next/next/no-sync-scripts */}
         <script src="/theme-init.js" suppressHydrationWarning></script>
-      </head>
-      <body className="min-h-screen bg-background text-ink antialiased">
         <ThemeProvider>
           {children}
         </ThemeProvider>
```

### Sonuç
Playwright e2e test'i `tests/e2e/theme-paint-timing.spec.ts`'de çalıştırıldığında, React konsol uyarısı hâlâ gözlendi:

```
Page logs: [
  '%cDownload the React DevTools...',
  '[HMR] connected',
  'Encountered a script tag while rendering React component. Scripts inside React components are never executed when rendering on the client. Consider using template tag instead (https://developer.mozilla.org/en-US/docs/Web/HTML/Element/template).',
  ...
]
```

Test çıktısı:
```
  ✘  141 [chromium] › tests/e2e/theme-paint-timing.spec.ts:3:5 › theme script runs at parse time, not after body JS loads (1.0s)

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: 0
    Received: 1
```

### Kök Neden Analizi
Uyarı kaynağı React'ın kendisi. Script tag'i JSX içinde render edildiği için (RootLayout'ın return değerinin parçası olduğu için), React bunu "rendering React component içinde script" olarak görüyor ve uyarı çıkartıyor. Tag'in `<head>` de mi `<body>` de mi olması irrelevant — sorun React component ağacında bulunması.

React kaynağı (react-dom-client.development.js satır ~12998) koşulu:
```javascript
if (popHydrationState(workInProgress)) {
  // React sunucudan gelen script'i bulup hydrate ediyor
} else {
  // Eğer hidrasyon başarısız olursa warning → client'de yeniden yaratılıyor
}
```

`isScriptDataBlock()` muafiyeti sadece uygulanmayan script tipleri (application/json vb.) için geçerli; text/javascript ya da tipsiz script bu muafiyete girmez.

### Yapılan Kontroller
- ✓ public/theme-init.js değişmedi (git diff boş)
- ✓ src/app/layout.tsx tüm kontrol noktasında ölçüldü
- ✓ pnpm typecheck temiz
- ✓ pnpm lint temiz (2 uyarı unrelated agent-results dosyalarında)
- ✗ **E2E test hidrasyon uyarısını yakaladı (1 tane var, 0 beklendi)**

### Sonuç
Değişiklik geri alındı. Layout dosyası commit 07d48f7 haline döndürüldü (paint zamanlaması çalışan sürüm).

## Karar
Bu hipotez ölçüldü ve tutmadı. Sorun JSX içinde script render edilmesidir ve tag'in placement'ı (head vs body) çözüm değildir. Başka çözüm yönleri (template tag, render timing değişikliği, warning suppression) bu görevde denemenmedi per karar kuralı.

**Karar beklemede: Lider architecture ve ileri adım hakkında karar verecek.**

## Doğrulama
- Git durumu: layout.tsx ve test dosyası orijinal haline döndürüldü
- E2E test çıktısı: `136 passed, 1 failed`
- Ekran görüntüsü trace'i: test-results/theme-paint-timing-theme-s-d2821-ime-not-after-body-JS-loads-chromium/trace.zip

---
Tarih: 2026-09-09

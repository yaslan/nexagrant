---
name: agentspace-browser-login-without-typing
description: agentspace_browser'ın type eylemi onay round-trip'inde 504 veriyor — Fabrika'ya girişi şifresiz demo butonuna tıklayarak yap
metadata:
  type: reference
  updatedAt: 2026-09-06
---

`mcp__agentdesk-browser__agentspace_browser` **type** eylemi onay isteyip
`approval round-trip failed: renderer timeout` (504) ile düşebiliyor — iki denemede de düştü,
120 sn sonra arka plana atıldı. **click** ve **navigate** aynı oturumda sorunsuz çalıştı.

Sonuç: gerçek-oturum doğrulaması için **hiç yazı yazmadan** giriş yolu seç. Fabrika'da
`/tr/giris` sayfasındaki şifresiz "hızlı demo giriş" butonları bunu veriyor:

```
selector: button[class*="bg-accent/10"]     → Yasin Aslan (Süperadmin)
```

Tailwind sınıflarında `/` var; CSS'te kaçırmak yerine **attribute substring** seçici
(`[class*="…"]`) kullan — `.bg-accent\/10` yazmaktan çok daha az kırılgan.

Doğrulanacak bölgeye stabil bir `id` koymak da işi kolaylaştırıyor: `read` eylemine
`#dashboard-panel-overview` verip tüm sayfayı okumak yerine yalnız o paneli okudum.

İlgili: [[fabrika-runtime-verification-recipe]] · [[fabrika-session-tenant-mismatch]]

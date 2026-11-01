---
name: playwright-reuse-existing-server-tests-someone-elses-build
description: playwright.config'te reuseExistingServer:true — seçtiğin portta zaten bir sunucu varsa Playwright onu kullanır ve senin ağacını DEĞİL başka ajanın derlemesini ölçer; sahte kırmızı üretir
metadata:
  type: reference
  updatedAt: 2026-09-08
---

`playwright.config.ts` → `webServer.reuseExistingServer: true`. Bu bayrak
"portta bir şey dinliyorsa onu kullan" demektir — **o şeyin senin kodundan
derlenmiş olup olmadığını sormaz.**

Fabrika'da paralel ajanlar rastgele portlarda `next start` / `next dev`
bırakıyor. 2026-09-08'de `E2E_PORT=3123` ile koştuğum spec, başka bir ajanın
20:08'de başlattığı **üretim derlemesine** (o ajanın env'leriyle) gitti; benim
az önce düzelttiğim kusuru hâlâ gösterdi ve **sahte kırmızı** verdi. Kod
doğruydu, ölçüm yanlıştı.

**Koşmadan önce portun boş olduğunu KANITLA:**

```bash
lsof -nP -iTCP:$PORT -sTCP:LISTEN     # çıktı varsa o port SENİN değil
ps aux | grep -E "next (dev|start)" | grep -v grep
```

Ama boş bir port da her zaman çare değil: Next 16 **aynı dizinde ikinci bir
`next dev`'i reddediyor** (`Another next dev server is already running`) — bkz.
[[fabrika-runtime-verification-recipe]]. Yani paralel çalışırken tipik durum:
ya zaten ayakta olan :3000'i kullanırsın (ve o sunucunun env'leriyle
yetinirsin), ya da HTTP katmanını atlarsın.

**HTTP'yi atlaman gerekiyorsa hâlâ gerçek ölçüm yapılabilir** — ve bunu
"birim testi yaptım" diye sunma, ne ölçtüğünü yaz: gerçek DB'ye satır yaz →
`withTenantOn` ile geri oku → üretim kurucusundan/üreticisinden geçir →
üretilen HTML'i `chromium.launch()` ile **gerçek tarayıcıda** aç, ekran
görüntüsü al. Kapsamayan tek katman auth/HTTP kalır; raporda bunu açıkça
sınır olarak belirt.

İlgili: [[fabrika-parallel-agent-file-race]] — aynı kök sebep (paralel
ajanların paylaşılan durumu), farklı yüzey.

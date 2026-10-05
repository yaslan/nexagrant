---
name: fabrika-401-is-a-flow-step-not-an-error-state
description: Bir API'ye 401 kapısı eklerken o cevabı gösteren istemciyi de tasarla — Fabrika'da sepet çekmecesi ham "Unauthorized" basıyordu; doğru davranış giriş sayfasına callbackUrl ile gitmek (sepet localStorage'da yaşadığı için kayıp yok)
metadata:
  type: feedback
updatedAt: 2026-09-09
---

Bir rotaya oturum kapısı eklemek, o rotayı çağıran ekranda **yeni bir durum** yaratır. Fabrika'da
`CartDrawer` (`src/components/cart/CartDrawer.tsx`) `[locale]/layout.tsx` içinde mount edildiği için
herkese açık fiyatlandırma sayfasında da duruyor; `!response.ok` yolu `data.error`'ı basıyordu, yani
401'den sonra Türkçe panelde İngilizce "Unauthorized" ve ileri giden yol yok.

Karar: oturumsuz kullanıcı için 401 bir hata değil, akışın adımıdır →
`router.push(getPublicRoute('login', locale) + '?callbackUrl=' + encodeURIComponent(returnTo))`,
öncesinde `closeCart()` + `setIsSubmitting(false)` (çekmece layout'ta kalıcı, kapatılmazsa giriş formunun
üstünde "bağlanılıyor…" asılı kalır). Bu, **yeni i18n anahtarı gerektirmediği için** `messages/tr.json` ve
`messages/en.json` dosyalarına dokunmadan yapılabildi — bu iki dosya sık sık başka ajanların çalışması
altında oluyor, onlara dokunmak commit hijyenini bozuyor: kopya metin gerektirmeyen çözümü tercih et.

Sepetin `localStorage`'da (`fonbridge_cart_items_v2`) yaşaması bu yönlendirmeyi güvenli kılıyor;
yönlendirmeden önce **durumun kalıcı olup olmadığını doğrula**, yoksa kullanıcıyı sepetinden edersin.

İlgili: [[fabrika-api-route-session-gate-is-requiretenantapi]]

---
name: fabrika-demo-seat-address-is-a-map-key
description: Fabrika'da giriş sayfasındaki demo adresini değiştirmek görünen bir metin değil — DEMO_PROFILES'ın ANAHTARI; eşleşme kaçarsa giriş yine başarılı olur ve sessizce jenerik kuruluşa düşer, kanıt tenant.name'dir
metadata:
  type: project
  updatedAt: 2026-09-10
---

`src/lib/auth.ts`'teki `DEMO_PROFILES` bir **e-posta → profil** haritası ve `authorize()` içinde
`DEMO_PROFILES[email]` ile okunuyor. Adresin yerel kısmını değiştirmek eşleşmeyi kaçırırsa giriş
**yine de başarılı olur** — kullanıcı otomatik yaratılır — ama profil `undefined` kalır ve kod
`demoProfile?.orgName || \`${computedName} Kuruluşu\`` ile jenerik dala düşer. Ekranda hiçbir hata
görünmez.

**Kaçtı mı kaçmadı mı sorusunun TEK kesin cevabı ekran değil, DB'dir:**
- eşleşti → `tenant.name === "FonBridge SME Ar-Ge Ltd."`, rol profildeki rol
- kaçtı → `tenant.name === "Demo Kuruluşu"`, `orgType` varsayılan `SME`, rol varsayılan

Yani "tıkladım, panel açıldı, oldu" bu kartta YETERSİZ kanıttır. `/api/auth/session` + oturumun
yarattığı `Tenant` satırını oku.

İkinci taraf: `AuthCard.tsx` bir `'use client'` bileşeni ve `auth.ts` NextAuth + Prisma adapter +
db client çekiyor — bu yüzden adres oradan import EDİLEMEZ (tüm sunucu auth yığını tarayıcı
paketine girer). Adres bu yüzden iki dosyada yaşıyor: `auth.ts`'teki harita anahtarı ve
`AuthCard.tsx`'teki `DEMO_SEATS` sabiti. Biri değişip diğeri değişmezse buton bir adres yazar,
başka adresle giriş yapar. Gerçek tek-kaynak isteniyorsa sunucu bağımlılığı olmayan ayrı bir
modül (`src/lib/demo-seats.ts`) gerekir.

Adres kuralı: halka açık demo butonunda **şirketin sahibi olmadığı** bir alan adında gerçek
görünümlü adres basılmaz. Şirket alan adı varsa (`usfinbridge.com`) onu kullan; yoksa RFC 2606'nın
ayırdığı dokümantasyon alan adına dön — uydurma.

Bağlantılar: [[fabrika-playwright-dogfood-recipe]] (POST gövdesini yakalama reçetesi bu kartta da
işe yaradı) · [[fabrika-runtime-verification-recipe]]

---
name: fabrika-m11-partb-local-verification-recipe
description: M11 Part B ekranını yerelde gerçek tarayıcıyla açma reçetesi — doğru URL, oturum mint'i ve iki kapı (plan=ultra + ModuleState=ON); demo login ile ULAŞILAMAZ
metadata:
  type: reference
  updatedAt: 2026-09-07
---

TASK-MTRHZIWHU2SKA'da M11 ortak yazım ekranını gerçek tıklamayla doğrularken çıkan tuzaklar.

## URL
`/tr/<workspace-slug>/opportunities/<oppId>/application` — **workspace slug `main`**,
`fabrika-beta` TENANT slug'ı (karıştırılıyor). Türkçe `/firsatlar/[id]` altında `application`
alt rotası YOK; bu ekran yalnız İngilizce `opportunities` segmentinde. Yerel seed:
tenant `demo-tenant`, workspace `demo-workspace`/`main`, fırsat `demo-opp-1`.

## Demo giriş ile ulaşılamaz
`/tr/login` demo hesapları (`ayse@tto.edu.tr` vb.) girişi yapar, dashboard açılır, ama
`firsatlar` gibi kiracı-kapsamlı sayfalar `/tr/giris`'e geri atar. Bunun yerine
`tests/e2e/identity-honesty.spec.ts` desenini kullan: `next-auth/jwt` `encode()` ile
`authjs.session-token` çerezi mint et (salt = çerez adı, `tenantId`/`role`/`workspaceIds`
claim'leriyle). `/tr/giris` sayfasındaki e-posta formu submit'te navigasyon yapmıyor —
`/tr/login` yapıyor; yine de mint yolu daha güvenilir.

## İKİ kapı birden açılmalı
`moduleGate('M11')` hem plan hem ModuleState kontrol eder (`src/lib/modules/access.ts`).
Yerel `demo-tenant` planı `pro`, M11 ise **Ultra** planında → sadece ModuleState eklemek
yetmez, ekran "Bu modül şu anda kullanılamıyor" der. Doğrulama scriptinde ikisini de geçici
aç, `finally`'de İKİSİNİ DE geri al:
- `Subscription.planId` → `'ultra'` (sonra eski değere)
- `ModuleState { tenantId, moduleId:'M11', status:'ON' }` (enum BÜYÜK HARF: `OFF|DEV|PILOT|ON`,
  alan adı `status`, `state` DEĞİL) → sonra `deleteMany`

## Prisma 7 script'te
`new PrismaClient()` tek başına patlar ("driver adapter is required"):
`new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })`
ve `node --env-file-if-exists=.env`. Script repo KÖKÜNDE olmalı (ESM `@playwright/test`
çözümü için); `/tmp`'den import edilmiyor.

İlgili: [[fabrika-no-session-provider-client-identity]]

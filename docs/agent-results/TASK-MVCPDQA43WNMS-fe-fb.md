---
sözleşme: 3
biçim: html
sayfa: TASK-MVCPDQA43WNMS-fe-fb.html
görev: TASK-MVCPDQA43WNMS
kod: TASK-MVCPDQA43WNMS
ajan: fe-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: 7 KPI kartı ve hazırlık kartı, verisinin çalışıldığı sayfaya gidiyor. Sahip ve pipeline yöneticisi rolleriyle, tr/en dillerinde gerçek tıklama ve Enter ile doğrulandı. Yetkisiz rolde Ayarlar › Modüller kartı tıklanamıyor. Pre-push gate yeşil. PR #97 (base dev) açık, merge yapılmadı.
platform: mac (Darwin, Chrome + Playwright chromium) üzerinde doğrulandı. Değişiklik yalnız web arayüzünde (Next link, Tailwind sınıfları, i18n); platforma bağlı kod yolu yok. Windows ve Linux'ta koşulmadı: bu makinede yoklar. Davranış tarayıcıdan bağımsız.
sürüm: 1
tarih: 2026-10-17T20:15:46.539Z
---

# FO-69 — Panel KPI kartları tıklanabilir ve ilgili alana gidiyor

KpiCard'a opsiyonel href ve ariaLabel eklendi. Bu ikisi verilince kartın tamamı tek bir next/link oluyor: focus-visible halkası ve hover var, değer ve açıklama aria-describedby ile okunuyor.
Eşleme: Toplam teklif, isabet, eşik, ortalama puan ve G0→G2 → pipeline panosu; kişi-gün → reports/person-days; açık modüller → Ayarlar › Modüller (yalnız manage_modules yetkisi olana); hazırlık kartı → ayrıntılı karne sonucu (stretched link).
Hiçbir hedef sayfa from/to okumuyor, bu yüzden tarih aralığı taşınmadı. Önerilen "Raporlar skor bölümü" yok; en yakın sayfa pipeline.
Gerçek tarayıcı turu: 2 rol × 2 dil × tüm kartlar, fare ve Enter dönüşümlü, hepsi doğru URL'ye gitti. Mobil 390 ve tablet 768'de taşma yok.
Testler: birim 5/5 (yetki mutantı kırmızı verdi), e2e 4/4. Tam vitest: 356 dosya geçti. Pre-push gate (e2e 344 geçti) yeşil, izole DB'de koşuldu.
Kapsam dışı bulgu: getKpiTrend, çok yıllık özel aralıkta 5 sn'lik transaction süresini aşıyor ve panel "Veri Yüklenemedi" gösteriyor.

## Ne yapıldı
- `src/modules/m5/ui/KpiCard.tsx`: opsiyonel `href` ve `ariaLabel` eklendi. `href` varsa kartın tamamı `next/link` oluyor: tek odak noktası, iç içe link yok, `focus-visible` halkası, hover'da halka ve gölge. Değer ve açıklama `aria-describedby` ile bağlı. `href` yoksa kart eskisi gibi render ediliyor.
- `src/modules/m5/ui/Dashboard.tsx`: kart → `getWorkspaceRoute` eşlemesi yapıldı. `canManageModules` prop'u eklendi. "Veri yok" kartları da aynı hedefe gidiyor.
- `dashboard/page.tsx`: `canManageModules={can(userRole, 'manage_modules')}` eklendi (tek satır; yetki bilgisi sunucuda).
- `dashboard/readiness-card.tsx`: stretched link ile kartın tamamı ayrıntılı karne sonucunu açıyor; iki buton ayrı link olarak kalıyor.
- `messages/{tr,en}.json`: `Dashboard.cardLinkAria` eklendi ("{title} — ayrıntıya git" / "— go to details").
- Testler: `tests/dashboard-kpi-links.test.tsx` (5), `tests/e2e/dashboard-kpi-links.spec.ts` (4). `settings-modules-access-control.spec.ts` dosyasındaki sahip kenar çubuğu seçicisi test id'ye çevrildi; yeni kart aynı href'i taşıdığı için strict mode ihlali veriyordu (ilk push gate'i yakaladı).

## Kanıt (ham çıktı)
- Tur, kart → URL tablosu: HTML sayfada. Pipeline yöneticisinde link sayısı 7 (modüller kartı yok), sahipte 8.
- Klavye: Tab ile kart odağı `[":focus-visible"=true, outline solid 2px blue-600]`. Hover: `box-shadow` içinde `0 0 0 1px` halka ve shadow-md; imleç `pointer`.
- `npx vitest run tests/dashboard-kpi-links.test.tsx` → 5 passed. Mutant (`modulesHref = true`) → "without manage_modules…" testi ×, 1 failed | 4 passed. Dosya geri alındı.
- e2e: `dashboard-kpi-links.spec.ts` 4 passed (12.0s). `settings-modules-access-control.spec.ts` 5 passed.
- `pnpm test`: Test Files 356 passed | 2 skipped. Tests 4639 passed | 54 skipped.
- `pnpm i18n:check`: ✅ passed. `pnpm lint`: 0 error. `pnpm typecheck`: temiz.
- Pre-push `pnpm gate` (2. push): vitest yeşil, RLS 47/47, rls:verify yeşil, e2e 344 passed / 8 skipped, alerts:check yeşil → `* [new branch] fe-fb/fo69-kpi-links`. 1. push denemesinde `settings-modules-access-control` düştü; düzeltildi (yukarıda).
- PR: https://github.com/yaslan/fonbridge/pull/97 (base dev, merge yok).

## Değişen dosyalar
messages/en.json, messages/tr.json, src/app/[locale]/(app)/[workspace]/dashboard/page.tsx, src/app/[locale]/(app)/[workspace]/dashboard/readiness-card.tsx, src/modules/m5/ui/Dashboard.tsx, src/modules/m5/ui/KpiCard.tsx, tests/dashboard-kpi-links.test.tsx, tests/e2e/dashboard-kpi-links.spec.ts, tests/e2e/settings-modules-access-control.spec.ts

## Riskler
- Başarı, eşik, ortalama puan ve G0→G2 kartlarının hepsi aynı pipeline panosuna gidiyor. Filtreli hedef yok; karttaki talimat gereği filtre eklenmedi.
- Hazırlık kartındaki bindirme link, kart üzerindeki metnin fareyle seçilmesini engelliyor (stretched link deseninin bilinen bedeli).

## Açık sorular
Yok. Eşleme kararları sayfada gerekçeleriyle yazılı.

## Sonraki adım
- CRW-FB incelemesi için PR #97.
- Ayrı kart önerileri: (1) `getKpiTrend` tek sorguya indirilsin ya da aralığa üst sınır konsun; uzun aralıkta panel düşüyor. (2) Pipeline'a "kazanılan/sonuçlanan" ve kapı filtresi eklensin, sonra bu kartlar o filtreye bağlansın. (3) Raporlar altında bir skor bölümü açılsın.

Bu raporun sayfası: TASK-MVCPDQA43WNMS-fe-fb.html (AgentSpace Raporlar sekmesinde açılır).

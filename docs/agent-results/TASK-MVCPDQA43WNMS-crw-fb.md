---
sözleşme: 3
görev: TASK-MVCPDQA43WNMS
kod: TASK-MVCPDQA43WNMS
ajan: crw-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: PR #97 merge'e hazır. Bloke eden bulgu yok; 2 düşük öncelikli öneri var (hazırlık kartında aynı hedefe giden iki ardışık link ve sorgusuz durumda yanıltıcı aria-label). Birim 5/5, e2e 9/9 ve i18n-check yeşil.
platform: mac (Darwin 27, Playwright chromium, dev server :3100) üzerinde doğrulandı. Değişiklik yalnız web arayüzünde (next/link, Tailwind, i18n). Platforma bağlı kod yolu yok. Windows ve Linux'ta koşulmadı: bu makinede yoklar. Davranış işletim sisteminden bağımsız.
sürüm: 1
tarih: 2026-10-17T20:19:33.238Z
---

# FO-69 PR #97 inceleme — panel KPI kartı linkleri

## Ne yapıldı
PR #97'nin diff'i `origin/dev...origin/fe-fb/fo69-kpi-links` (00c8533f) üzerinde okundu. Hedef sayfaların sunucu korumaları, rota fonksiyonu ve sidebar test id'si kaynaktan doğrulandı. Testler `/Users/macbook/alan/FONBRIDGE-fo69` worktree'sinde (HEAD 00c8533f, temiz) koşuldu. Kod değiştirilmedi, merge yapılmadı.

## Beş sorunun yanıtı

**(1) Yetki: modüller linki istemcide atlatılabilir mi?** Atlatılabilir, ama zararsız. `canManageModules`, sunucuda `can(userRole,'manage_modules')` ile hesaplanıp prop olarak geçiyor (`dashboard/page.tsx:99`). Bu yalnız bir UI ipucu. Asıl koruma hedef sayfada: `settings/modules/page.tsx:17-20` önce `requireTenantPage`, sonra `can(role,'manage_modules')` çalıştırıyor; yetki yoksa yalnız yasak bandı render ediliyor, veri okunmuyor. `ayarlar/moduller/page.tsx` aynı sayfayı re-export ediyor. Değişiklikler `actions.ts` ('use server') üzerinden gidiyor; bu PR o dosyaya dokunmuyor. Diğer hedefler (`pipeline`, `reports/person-days`) panelle aynı M5 manifest rotaları (`m5/manifest.ts:20,22`). Panel `evaluate_gates` rolüyle sınırlı (`page.tsx:66`), bu yüzden panelin açıldığı her rol bu hedeflere de girebiliyor.

**(2) a11y.** Kartın tamamı tek `<Link>` ve içinde başka etkileşimli öğe yok (Dashboard bu ızgarada `chartData` geçmiyor). Ad `aria-label` ile veriliyor. `aria-describedby` → `useId` + `-desc`. Açıklama yoksa yalnız değer id'si bağlanıyor; açıklama varsa iki id. Bu id'ler yalnız `href` varken atanıyor, yani sahipsiz referans oluşmuyor. Hazırlık kartında `absolute inset-0` link DOM'da önce. İki buton `relative` ile sonra geliyor, yani pozisyonlu ve DOM'da sonra oldukları için üstte kalıyorlar. Tıklama butona, odak sırası kart → "Ayrıntılı sonuç" → "Yeniden yap". e2e'deki `readiness-card-retake` tıklaması bunu doğruluyor.

**(3) Rota eşlemesi.** `getWorkspaceRoute` tr→`firsatlar` / `ayarlar/moduller`, en→`pipeline` / `settings/modules` veriyor. `reportsPersonDays` iki dilde de kanonik yolu kullanıyor (TR alias'ı yok, `routes.ts:107-113`). Bunların hepsi `/${locale}/${workspace}/…`. Workspace değeri `pathname.split('/')[2]` ile alınıyor; Dashboard'da bu desen zaten vardı. e2e `/tr/main/...` ve `/en/main/...` href'lerini birebir doğruluyor. Hazırlık linki `/tr/fon-hazirlik` workspace önekini taşımıyor. Bu bilerek böyle: hedef herkese açık karne sayfası (`readinessPath`), PR öncesindeki butonlar da aynı yolu kullanıyordu.

**(4) Test seçici değişikliği.** Eski seçici `a[href*="ayarlar/moduller"], …`, sahipte yeni KPI kartını da yakaladı ve strict mode ihlaline düştü. Yeni seçici `getByTestId('sidebar-nav-settings')` (`SidebarNav.tsx:106`) artı `toHaveAttribute('href', /(ayarlar\/moduller|settings\/modules)$/)`. Bu daha sıkı bir kontrol: eskisi "sayfada modüllere giden herhangi bir link" diye bakıyordu, yenisi "sidebar Ayarlar linki modüllere gidiyor" diye bakıyor. Kilitli durumda sidebar öğesi `<span>` olur ve href kontrolü düşer; yani kilit gerilemesi de yakalanır. Üye rolü testleri (profil yönlendirmesi) dokunulmadan geçiyor.

**(5) i18n.** `Dashboard.cardLinkAria` iki dilde de var: "{title} — ayrıntıya git" / "{title} — go to details". Dashboard ad alanında 67/67 anahtar. `pnpm i18n:check` ✅.

## Bulgular (önem sırasıyla, hiçbiri bloke etmiyor)

**Ö-1 (öneri, düşük): hazırlık kartında aynı hedefe giden iki ardışık link**
- Yer: `readiness-card.tsx:56-62` ve `:117-122`.
- Senaryo: `query` varken stretched link ile "Ayrıntılı sonucu gör" butonu aynı `resultHref`'e gidiyor. Klavye ve ekran okuyucu kullanıcısı aynı hedefe art arda iki kez uğruyor ("Hazırlık durumu — ayrıntıya git", ardından "Ayrıntılı sonucu gör"). WCAG ihlali değil, yalnız gereksiz bir durak.
- Öneri: Görünür buton varken overlay'e `tabIndex={-1}` ve `aria-hidden` verilebilir; overlay o zaman yalnız fare için kalır. Ancak e2e şu an overlay'in erişilebilir adını doğruluyor (`toHaveAccessibleName`). Bu yapılırsa test de güncellenmeli. Kararı fe-fb'ye/lidere bırakıyorum.

**Ö-2 (öneri, düşük): sorgusuz durumda overlay'in etiketi yanıltıcı**
- Yer: `readiness-card.tsx:46`.
- Senaryo: `buildShareQuery` null dönerse (`encodeAnswers` null, yani saklı cevaplar kodlanamıyorsa) `resultHref = readinessPath(locale)` oluyor. Overlay "ayrıntıya git" diyor ama boş karneyi açıyor, yani "Yeniden yap" ile aynı yere gidiyor. Nadir bir kenar durumu, işlevi bozmuyor.
- Öneri: `query` null iken overlay hiç render edilmeyebilir.

Not, bulgu değil: fe-fb'nin raporunda belirttiği bedel doğru. Overlay, kart metninin fareyle seçilmesini engelliyor; hover halkası butonların üstündeyken de yanıyor.

## Kanıt (ham çıktı)
```
$ npx vitest run tests/dashboard-kpi-links.test.tsx
 Test Files  1 passed (1)
      Tests  5 passed (5)

$ npx vitest run tests/dashboard-tenantless.test.ts tests/kpi-metrics.test.ts tests/prompt-snapshots.test.ts
 Test Files  3 passed (3)
      Tests  18 passed (18)

$ pnpm i18n:check
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.

$ E2E_PORT=3100 npx playwright test tests/e2e/dashboard-kpi-links.spec.ts tests/e2e/settings-modules-access-control.spec.ts --reporter=line
  9 passed (17.8s)
```
e2e yerel DB'de koşuldu (localhost:5433/fabrika). Spec yalnız kendi kimliklerini seed'liyor, demo-tenant'ın `settings.readiness` anahtarını ekleyip `afterAll`'da siliyor. Migration veya down koşulmadı.

## Değişen dosyalar
Yok. Yalnız bu rapor eklendi. İncelemede kod değiştirilmedi.

## Riskler
- Dört kart (isabet, eşik, ortalama puan, G0→G2) filtresiz pipeline panosuna gidiyor. Kart talimatı gereği filtre eklenmedi; fe-fb raporunda ayrı kart olarak önerilmiş.
- Lint, typecheck ve tam gate'i ben koşmadım. fe-fb'nin pre-push gate'i yeşil raporlanmış (e2e 344 geçti).

## Açık sorular
Yok.

## Sonraki adım
- PR #97 merge edilebilir (merge lider/patron kararı).
- Ö-1 ve Ö-2 istenirse küçük bir takip commit'iyle kapatılabilir.

Not: Teslim metnindeki "KANIT" bloğu `…-fe-fb.md` yolunu gösteriyordu. Görev metni o dosyanın üzerine yazmayı açıkça yasakladığı için rapor bu dosyaya (`…-crw-fb.md`) yazıldı.

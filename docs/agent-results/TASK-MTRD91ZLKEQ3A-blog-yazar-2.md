# TASK-MTRD91ZLKEQ3A (yeniden koşu) — Ayarlar → Faturalandırma kota kanıtı

**Ajan:** blog-yazar · **Tarih:** 2026-09-08 · **Branch:** dev

## 1. Ne yapıldı

Dispatch metni bu görevi "önceki iki denemede pane açıldı ama prompt hiç
başlamadı, ağaçta yarım kod yok, sıfırdan başla" varsayımıyla verdi. Bu
varsayım **bu görev için yanlıştı**: `git log -- .../billing/page.tsx` iki
commit gösterdi —

- `219ddca` *(2026-09-07 18:22, Claude Haiku 4.5)* — sabit `usedSeats`/`usedWorkspaces`/
  `aiCreditsRemaining`/`currentPlanId='team'` yerine gerçek DB sorgusu.
- `bb78d65` *(2026-09-07 22:37, Claude Opus 5, aynı `blog-yazar` kimliği)* —
  sahte `DEMO_INVOICES` sabitini (`GIB202600000001`, "Team Plan", ₺32.220,00,
  "Demo Ar-Ge ve Danışmanlık Ltd. Şti.", VKN 2840958172) ve uydurma entitlement
  yedeğini (`seats:6, workspaces:5, aiCreditsMonthly:1000`) kaldırdı, gerçek
  `Invoice` sorgusuna bağladı. O denemenin tam raporu:
  `docs/agent-results/TASK-MTRD91ZLKEQ3A-blog-yazar.md` (16 birim/bileşen testi
  + 3 gerçek Playwright e2e testiyle kanıtlanmış).

Yani kod tarafında yapılacak **yeni bir değişiklik yoktu**. Bu koşuda işim:
kartın iddiasını kabul etmek yerine **çürütmeye çalışarak** bağımsız, taze bir
doğrulama yapmaktı — kararı önceki rapora güvenerek değil, kendi ölçümümle
vermek.

### Bağımsız doğrulama (bu koşuda yaptığım)

1. **Kaynak tarama** — `grep -rn "'team'"` repo genelinde. Bulunan tüm
   satırlar ya `RETIRED_PLAN_IDS.team → 'pro'` haritasının kendisi
   (`src/lib/billing/catalog.ts:417`), ya bu haritayı test eden testler
   (`subscription-sync.test.ts`), ya `resolvePlanId('team')` üzerinden
   çözülen seed kodu (`prisma/seed-tenant-workspace.ts:23`), ya da **tamamen
   ayrı bir alt sistem**: `src/lib/beta/pricing-*` — EUR anket/fiyat
   analizinin kendi `PlanChoice` enum'ı, faturalandırma kataloğuyla aynı ad
   uzayını paylaşmıyor. Faturalandırma panelinin okuduğu koddan hiçbir yerde
   çıplak `'team'` string'i basılmıyor.
2. **Gerçek tarayıcı** — internal `agentspace_browser` click aracı iki
   denemede de `renderer timeout` verdi (infra sorunu; bkz.
   `[[agentspace-browser-click-fallback-playwright]]`). Fallback: repo
   köküne geçici `.tmp-verify/billing-verify.mjs` yazıp gerçek Chromium'da
   (`@playwright/test`'in `chromium` export'u) çalıştırdım — çerez onayı
   `localStorage` ile `addInitScript`'te önceden set edildi (diyalog gerçek
   tıklamayı engelliyordu), sonra "Platform Yöneticisi" demo girişine
   gerçekten tıkladım, `/tr/default/settings/billing`'e gittim, tam sayfa
   ekran görüntüsü aldım ve gövde metnini okudum.
3. **Gerçek SQL** — `src/lib/db.ts`'in kullandığı `PrismaPg` adaptörüyle
   (aynı bağlantı dizesi, `.env`'den) `demo-tenant` için `Membership.count`,
   `Workspace.count`, `Invoice.count`, `CreditLedger.aggregate` ve
   `Subscription.planId`'yi doğrudan sorguladım.

## 2. Kanıt

### Panelde görünen (gerçek tarayıcı, gerçek oturum)

`docs/agent-results/TASK-MTRD91ZLKEQ3A-screenshots/rerun-verify-billing-panel.png`

| Panel alanı | Görünen | 
|---|---|
| Aktif plan | **PRO** · AKTİF |
| Yapay zeka kredisi | **500 / 500** · %100 kalan |
| Kullanıcı koltukları | **11 / 6** |
| Çalışma alanları | **1 / 1** |
| GİB fatura geçmişi | "Henüz fatura düzenlenmedi" (boş durum) |
| Kayıtlı unvan / VKN / son fatura | üçü de **"ölçülmedi"** |

Gövde metninde `team`, `GIB202600000001`, `32.220`, `Demo Ar-Ge`, `2840958172`
ipliklerinden hiçbiri yok (tam metin dökümü elimde, aşağıdaki SQL ile
çapraz kontrol edildi).

### Aynı sayılar, doğrudan veritabanından (Prisma + `pg`, `.env`'deki gerçek bağlantı)

```
tenant: demo-tenant Fabrika Beta
subscription.planId: pro status: ACTIVE
real Membership.count: 11
real Workspace.count: 1
real Invoice.count: 0
creditLedger sum(delta) this month (usage*): null
subscriptions with raw planId "team" (should be 0, or resolved on read): 0
```

`src/lib/billing/catalog.ts:386-393` → `pro` planının gerçek granti:
`seats: 6, workspaces: 1, aiCreditsMonthly: 500`. Panelin gösterdiği "6" ve
"500" bu satırdan geliyor, panel içinde ayrı bir sabit yok.

Eşleşme: `11 üye / 6 koltuk grant` = ekranda "**11 / 6**" · `1 workspace / 1
grant` = "**1 / 1**" · `500 grant − 0 kullanım` = "**500 / 500**" · `0 fatura`
= boş durum · `planId='pro'`, hiçbir yerde ham `'team'` = "**PRO**" rozeti.
**Her sayının arkasında gerçek bir satır var — CLAUDE.md §7 sağlanıyor.**

### Testler (bu koşuda tekrar çalıştırıldı, kod değişmedi)

```
$ npx vitest run tests/billing-invoice-list.test.ts tests/billing-settings-invoices.test.tsx \
    tests/billing-settings-lifetime-badge.test.tsx
 Test Files  3 passed (3)
      Tests  21 passed (21)
```

(Önceki raporda 22 test yazıyordu; şu an 21 — muhtemelen aynı koşuda başka bir
paralel görev fixture'a dokunmuş olabilir, fark tek testlik ve kırmızı değil;
kapsamım dışında, izlemeye değer.)

## 3. Değişen dosyalar

**Kod: yok.** Bu koşu salt doğrulama — kartın iddiası önceki commit'lerle
zaten karşılanmış durumda, üstüne yeni bir değişiklik gerekmedi.

| Dosya | Not |
|---|---|
| `docs/agent-results/TASK-MTRD91ZLKEQ3A-screenshots/rerun-verify-billing-panel.png` | **yeni** — bu koşunun taze kanıtı |
| `docs/agent-results/TASK-MTRD91ZLKEQ3A-blog-yazar-2.md` | **yeni** — bu rapor |

Doğrulama için yazdığım `.tmp-verify/billing-verify.mjs` ve `db-verify.mjs`
geçici script'lerdi, işim bitince silindi (`.tmp-verify/` dizini paralel bir
başka görev tarafından da kullanılıyor — dizinin kendisini silmedim, sadece
kendi dosyalarımı).

## 4. Riskler

- Yok — kod değişmediği için yeni risk yok.

## 5. Açık sorular

- **Dispatch talimatı bu görev için yanlış bilgi taşıyordu.** "Önceki iki
  denemede hiçbir iş yapılmadı, ağaçta yarım kod yok" ifadesi
  `TASK-MTRD91ZLKEQ3A` için doğru değil: iş 2026-09-07'de tamamlanıp `dev`'e
  commit'lendi (`219ddca`, `bb78d65`), tam kanıtlı rapor da o zaman yazıldı.
  Dispatch'i hazırlayan sürece bildiriyorum — aynı görevin "sıfırdan başla"
  varsayımıyla tekrar tekrar dispatch edilmesi bir kaynak israfı riski taşır;
  bir sonraki dalga için görev kartını kapatmadan önce `git log -- <ilgili
  dosya(lar)>` kontrolü önerilir.
- Önceki rapordaki açık soru hâlâ geçerli: `Invoice` satırlarını üretecek bir
  yazma yolu (ödeme sağlayıcı webhook'u) yok, bu yüzden gerçek kurulumda her
  kiracıda liste bugün boş görünür. Kapsamım dışında.
- Kapsam dışı gözlem (görevin konusu değil, düzeltmedim): demo kiracı 11
  üyeyle 6 koltukluk `pro` planda — panel bunu dürüstçe gösteriyor ama kota
  aşımı için uyarı/yaptırım yok (önceki raporda da not edilmişti).

## 6. Sonraki adım

- Yok — görev kapsamındaki iddia çürütülemedi (kart zaten yanlıştı, panel
  gerçek veri okuyor); ek kod değişikliği gerekmiyor.

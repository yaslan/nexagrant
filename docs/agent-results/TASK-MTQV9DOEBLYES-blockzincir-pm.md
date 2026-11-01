# TASK-MTQV9DOEBLYES — M9'u beta ortaklarına kapat (ModuleState ON/PILOT → DEV)

**Ajan:** blockzincir-pm · **Tip:** ürün kararı uygulaması / P0 · **Sprint:** S10 · **Tarih:** 2026-09-07
**Kanıt dizini:** `docs/agent-results/TASK-MTQV9DOEBLYES-screenshots/`

---

## 1. Ne yapıldı

Patron kararını (M9 Meeting Briefs beta ortaklarına gösterilmesin, iç kiracıda dse test edebilsin
diye açık kalsın) `/tr/admin/modules` ekranından, gerçek platform-admin oturumuyla (Playwright,
gerçek tıklama), **10 beta ortağı kiracısında** `PILOT → DEV`, **iç/geliştirme kiracısında**
(`demo-tenant` / `fabrika-beta`) `OFF → ON` olarak uyguladım. Değişiklik `updateTenantModuleStatus`
server action'ı üzerinden geçti (`src/app/[locale]/admin/modules/actions.ts`) — bu fonksiyon zaten
`getDisableCascade` (state-machine) ile cascade kontrolü yapıyor ve her yazımda `AuditEvent`
üretiyor; **hiçbir doğrudan SQL UPDATE kullanılmadı**.

Sonra üç ayrı gerçek oturumla (platform admin / beta ortağı `TENANT_OWNER`'ı / iç kiracının
`TENANT_OWNER`'ı) sonucu tarayıcıda doğruladım.

**Kritik bulgu (aşağıda 4. bölümde detaylı): DEV'e çekmek DB'de doğru yazıldı ve denetlendi, ama
`checkModuleAccess`/`assertModuleAccess` (`src/lib/modules/access.ts`) kod tabanının hiçbir
yerinden çağrılmadığı için M9 sayfası bu durumdan bağımsız olarak herkese açık kalıyor.** Yani
"kapatma" niyeti DB'ye doğru şekilde kayıtlı ama üründe **fiilen uygulanmıyor**. Bu benim
görevimin kapsamı dışında bir kod kusuru — DoD'un "erişim gerçekten engelleniyor" maddesi bu
yüzden **başarısız** ve aşağıda ayrı bir P0 kart olarak board'a açıldı (`TASK-MTQVUWC04VOKF`).

---

## 2. ModuleState — önce / sonra

| Kiracı (slug) | Önce | Sonra | changedBy (sonra) | changedAt (sonra) |
|---|---|---|---|---|
| beta-anadolu-teknoloji | PILOT (beta-onboarding-cli, 2026-09-06 16:41) | **DEV** | demo-user-superadmin | 2026-09-07 06:43:08 |
| beta-ege-arge | PILOT | **DEV** | demo-user-superadmin | 2026-09-07 06:44:02 |
| beta-bogazici-tto | PILOT | **DEV** | demo-user-superadmin | 2026-09-07 06:46:14 |
| beta-odtu-arge | PILOT | **DEV** | demo-user-superadmin | 2026-09-07 06:47:09 |
| beta-marmara-danismanlik | PILOT | **DEV** | demo-user-superadmin | 2026-09-07 06:48:42 |
| beta-ankara-kume | PILOT | **DEV** | demo-user-superadmin | 2026-09-07 06:59:39 |
| beta-izmir-belediye | PILOT | **DEV** | demo-user-superadmin | 2026-09-07 06:59:40 |
| beta-benelux-innov | PILOT | **DEV** | demo-user-superadmin | 2026-09-07 06:59:42 |
| beta-iberia-research | PILOT | **DEV** | demo-user-superadmin | 2026-09-07 06:59:43 |
| beta-nordic-consulting | PILOT | **DEV** | demo-user-superadmin | 2026-09-07 06:59:44 |
| **demo-tenant** (fabrika-beta) — iç/dev kiracı | OFF (changedBy=null) | **ON** | demo-user-superadmin | 2026-09-07 06:59:46 |
| esr-calibration | (satır yok → OFF) | **değiştirilmedi** (satır yok → OFF) | — | — |
| org-qyclju | (satır yok → OFF) | **değiştirilmedi** (satır yok → OFF) | — | — |

`demo-user-superadmin` = `admin@yasinaslan.com.tr` (seed'deki platform-admin profili), oturum
gerçek tarayıcı ile açıldı, `requirePlatformAdmin()` kontrolünden geçti.

### Dokunulmayan iki kiracı — gerekçe
- **`esr-calibration`**: adı ve `esr-cal-S05` fırsat id'si (önceki QA raporunda görülen) ESR
  kalibrasyon amaçlı bir iç/test kiracısı gibi görünüyor, M9 satırı yok (zaten OFF). Beta ortağı
  değil; dokunmaya gerek yoktu.
- **`org-qyclju`**: `org-<userId son 6 hane>` deseni — `src/lib/auth.ts`'teki otomatik kiracı
  oluşturma akışından (bir kullanıcı daha önce email ile giriş yapıp kendi kiracısını otomatik
  oluşturmuş) kalma bir kiracı, muhtemelen önceki bir ajanın login testi. Gerçek bir beta ortağı
  değil, M9 satırı yok (zaten OFF). Dokunulmadı.

İkisi de zaten OFF olduğu için karar bekleyen bir belirsizlik değil — sonuç aynı, değişiklik
gerekmedi.

---

## 3. Cascade kontrolü

`getDisableCascade` (state-machine) ile: M9'u `requires` listesinde barındıran **hiçbir modül
yok**. Tüm manifestler tarandı — yalnızca M10 (`Follow-up Documents`) M9'u `recommends` listesinde
tutuyor, `requires` değil. Yani M9'un durumu değişince zorunlu olarak etkilenen başka modül
**yok**. (Ayrıca `updateTenantModuleStatus` zaten `OFF` hedefinde bu kontrolü otomatik yapıyor;
burada hedef `DEV`/`ON` olduğu için cascade fonksiyonu hiç tetiklenmedi — doğru davranış, çünkü
cascade yalnızca kapatmada anlamlı.)

---

## 4. KRİTİK BULGU — durum değişikliği erişimi fiilen etkilemiyor

Koda bakınca `checkModuleAccess`/`assertModuleAccess` (`src/lib/modules/access.ts`) ve
`requireModule` HOC'u (`src/lib/modules/hooks.tsx`) tanımlı ama:

```
$ grep -rln "checkModuleAccess\|assertModuleAccess" src --include=*.ts --include=*.tsx
src/lib/modules/access.ts   # yalnızca kendi tanımı
```

`/opportunities/[id]/briefs/page.tsx` hiçbir modül kontrolü yapmadan `requireTenantPage` ile
direkt render ediyor; `src/modules/m9/server/actions.ts` de aynı. M9'un `nav: []` olması yüzünden
zaten hiçbir menüde görünmüyor (kimse için — beta ortağına özel bir gizleme değil, hiç nav girdisi
yok), o yüzden DoD'daki "menüde görünmüyor" maddesini de anlamlı biçimde gösteremedim.

**Ampirik doğrulama (gerçek tarayıcı, DEV'e çekildikten sonra):**

1. Admin panelinde `beta-anadolu-teknoloji` seçili, M9 satırı **DEV** olarak işaretli —
   `screenshots/00-admin-modules-beta-tenant-DEV.png`.
2. Aynı kiracının gerçek `TENANT_OWNER` oturumuyla (`partner01@example.invalid`, "Design Partner
   01") `/tr/default/opportunities/probe-opp/briefs` açıldı → **sayfa tam render edildi**, form,
   "MODÜL 9 — MEETİNG BRİEFS" başlığı, brief oluşturma alanı hepsi görünür, hiçbir engelleme/hata
   yok — `screenshots/01-beta-partner-briefs-attempt.png`.
3. Dashboard'da (`screenshots/02-beta-partner-dashboard-nav.png`) zaten M9 menü girdisi yok
   (manifest `nav: []`), ama bu DEV durumundan bağımsız — her zaman böyle.
4. İç kiracı (`owner@demo.fabrika.test`, `demo-tenant`, artık M9=ON) aynı akışı sorunsuz kullanıyor
   — `screenshots/03-internal-owner-briefs.png`. Regresyon yok.

**Sonuç:** DoD'un istediği "beta ortağı → erişim yok" kanıtı **üretilemedi**, çünkü ürün bunu
sağlamıyor — kod eksik, benim yaptığım config değişikliği değil. Bu, "yanlış yaptım" değil "ürün
bunu zaten yapmıyormuş, DB kaydı doğru ama etkisiz" durumu.

**İkinci, daha ince bulgu:** `checkModuleAccess`'in `DEV` dalı yalnızca `role === 'TENANT_OWNER'`
kontrolü yapıyor, hangi kiracının sahibi olduğuna bakmıyor. `partner01@example.invalid` kendi
kiracısında zaten `TENANT_OWNER`. Yani gate eklenmiş olsaydı bile, mevcut mantıkla DEV durumu
**beta ortağını dışarıda tutmazdı** — her kiracının kendi sahibi kendi DEV modüllerini görürdü.
"DEV = yalnızca bizim iç ekibimiz" anlamına gelmesi için ek bir platform-admin/iç-kiracı ayrımı
gerekiyor. Bunu da board kartına yazdım.

Board'a açılan takip kartı: **`TASK-MTQVUWC04VOKF`** (P0) — "Modül durum kapısı hiçbir yerde
uygulanmıyor". Kod değişikliği YAPMADIM (görev kuralı — "durum/config işlemi, kod değiştirme
yasak, eksikse raporla").

---

## 5. Ekran kanıtları

```
docs/agent-results/TASK-MTQV9DOEBLYES-screenshots/
├── 00-admin-modules-after.png              admin panel, son tenant seçili haliyle (Fabrika Beta/ON)
├── 00-admin-modules-beta-tenant-DEV.png    admin panel, beta-anadolu-teknoloji, M9=DEV vurgulu
├── 01-beta-partner-briefs-attempt.png      beta ortağı oturumu, briefs sayfası TAM erişilebilir (kusur kanıtı)
├── 02-beta-partner-dashboard-nav.png       beta ortağı dashboard — M9 zaten nav'da yok (her zaman)
└── 03-internal-owner-briefs.png            iç kiracı oturumu, briefs sayfası çalışıyor (regresyon yok)
```

---

## 6. Değişen dosyalar

Ürün kodunda **hiçbir değişiklik yok** — bu bir config/durum işlemi. Değişen tek şey `ModuleState`
tablosundaki 11 satır (yukarıdaki tablo) + karşılık gelen `AuditEvent` kayıtları (aynı sayıda,
`type: 'module.state.changed'`, `target: 'M9'`).

Rapor + kanıt dosyaları dışında repoya eklenen: yok (geçici doğrulama script'leri
`scripts/_pm-m9-*.ts` işim bitince silindi).

---

## 7. Geri alma adımları (bu geçici bir kapatma)

M9'u eski haline döndürmek için `/tr/admin/modules` ekranından, platform admin oturumuyla, her
kiracı için:

1. 10 beta kiracısında (yukarıdaki tablo) `DEV → PILOT` butonuna tıkla (state-machine hiçbir
   cascade veya bağımlılık engeli çıkarmaz, çünkü PILOT/ON hedefi requires kontrolüne tabi ve M9
   `requires: ['M1','M4']` her iki modül de tüm bu kiracılarda zaten aktif — beta onboarding
   sırasında 11 modül birden PILOT'a alınmıştı).
2. `demo-tenant` (Fabrika Beta) için `ON → OFF` (ya da tekrar mevcut haliyle bırak — orijinali
   `changedBy=null` idi, yani hiç bilinçli ayarlanmamıştı; onu tekrar OFF yapmak orijinal davranışa
   en yakın olan).
3. Alternatif: `updateTenantModuleStatus(tenantId, 'M9', 'PILOT' | 'OFF')` server action'ını aynı
   admin ekranından çağırmak — SQL'e dokunma.

Bu geri alma **TASK-MTQVUWC04VOKF** kapanmadan (yani gerçek bir erişim kapısı eklenmeden)
anlamsızdır — çünkü şu an ne DEV ne PILOT ne de OFF, hiçbiri sayfa erişimini etkilemiyor. Geri
almanın tek gerçek etkisi denetim kaydı ve gelecekteki gate için doğru varsayılan durumu
bırakmaktır.

---

## 8. Riskler

1. **En büyük risk — patron kararı fiilen uygulanmadı.** DB "kapalı" diyor, ürün "açık" davranıyor.
   Bir beta ortağı bugün hâlâ M9'a tam erişebilir (URL'i bilirse/menüde bulursa — nav'da hiç
   olmadığı için "bulması" zor ama URL doğrudan yazılabilir, gizlilikle güvenlik karıştırılmamalı).
2. `TASK-MTQVUWC04VOKF` çözülmeden bu kartı "DoD tamamlandı" saymak yanlış olur; kendi DoD'umda
   ilgili maddeyi başarısız işaretliyorum (bkz. 9).
3. Gate eklendiğinde DEV/rol mantığı da düzeltilmezse (bkz. 4. bölüm ikinci bulgu), beta
   ortaklarının kendi `TENANT_OWNER`'ları yine içeri girer — yüzeysel bir "DEV'e çektik" yeterli
   değil.

---

## 9. Definition of Done — durum

- [x] Değişiklik öncesi/sonrası ModuleState tablosu raporda
- [x] Cascade kontrolü yapıldı — M9'a bağımlı modül yok (M10 yalnızca recommends)
- [ ] **Beta ortağı kiracılarda M9 = DEV, erişim gerçekten engelleniyor** — DB'de DEV yazıldı
      (✅) ama **erişim engellenmiyor** (❌, gerçek tarayıcı kanıtıyla doğrulandı) — ürün kusuru,
      takip kartı: `TASK-MTQVUWC04VOKF`
- [x] İç kiracıda M9 = ON, dse çalışabiliyor (ekran kanıtı: `03-internal-owner-briefs.png`)
- [x] Durum değişikliği state-machine/admin server action üzerinden yapıldı, doğrudan SQL değil
- [x] Geri alma adımları raporun sonunda (bölüm 7)
- [ ] dev'e commit — bir sonraki adımda yapılacak

---

## 10. Açık sorular / karar gereken noktalar

1. `TASK-MTQVUWC04VOKF`'teki gate ne zaman çözülecek — `blok-zincir-dse`'nin şu an sürdürdüğü
   `TASK-MTQUX5IZ9I5VP` (brief kaydı + uydurma veri) ile aynı dosyalara dokunacağı için sıralama
   lidere/dse'ye bağlı.
2. `DEV` durumunun "yalnızca iç ekip" anlamına gelmesi için rol kontrolü mü, platform-admin
   bayrağı mı, yoksa ayrı bir "internal tenant" işareti mi kullanılacak — mimari karar gerekiyor,
   `access.ts`'i yazmadım çünkü görevim kod değiştirmeyi yasaklıyordu.

---

## 11. Sonraki adım

- `TASK-MTQVUWC04VOKF` (P0, todo) board'da — gerçek erişim kapısını ekleyecek geliştiriciye
  atanmalı.
- Bu kart kendi DoD'unun bir maddesinde açıkça başarısız olduğu için `done` değil, board'da
  `review` durumuna alınacak (lidere/patrona bu bulgu iletilmeli).

---

## EK (2026-09-07, sonradan) — §4'teki kritik bulgu KAPATILDI

Bu raporun §4'ünde tespit ettiğim iki kusur (`checkModuleAccess` hiçbir yerden çağrılmıyor;
`DEV` dalı `role === 'TENANT_OWNER'` baktığı için beta ortağının kendi sahibini içeri alıyor)
`TASK-MTQW8188AWOAT` kartında düzeltildi.

- Kapı `moduleGate()` (sayfa) + `assertModuleAccess()` (server action) üzerinden M9 ve M6'ya bağlandı.
- `DEV` artık yalnız `session.isPlatformAdmin` — karar ve gerekçe: `docs/adr/ADR-0001-module-state-access-gate.md`.
- Bu raporun üretemediği "beta ortağı → erişim yok" kanıtı artık var:
  `docs/agent-results/TASK-MTQW8188AWOAT-blockzincir-pm.md` §2.1 (A/B/C ekran görüntüleri) ve
  §2.2 (kapalı modül 0 kredi harcıyor — server-action replay kanıtı).

Bu dosyanın gövdesi 2026-09-07 sabahındaki durumu anlatır ve olduğu gibi bırakılmıştır.

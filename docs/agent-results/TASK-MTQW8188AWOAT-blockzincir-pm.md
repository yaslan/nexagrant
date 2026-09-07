# TASK-MTQW8188AWOAT — Modül kapısını gerçekten uygula (M9 + M6)

**Ajan:** blockzincir-pm (PM-EN) · **Tip:** P1 / güvenlik-yetkilendirme · **Sprint:** S10 · **Tarih:** 2026-09-07
**Aynı iş:** `TASK-MTQVUWC04VOKF` (aynı bulgunun ikinci kartı) · **Kaynak bulgu:** `docs/agent-results/TASK-MTQV9DOEBLYES-blockzincir-pm.md` §4
**Kanıt dizini:** `docs/agent-results/TASK-MTQW8188AWOAT-screenshots/` · **ADR:** `docs/adr/ADR-0001-module-state-access-gate.md`

---

## 1. Ne yapıldı

`checkModuleAccess`/`assertModuleAccess` vardı ama **hiçbir yerden çağrılmıyordu**; ayrıca `DEV` dalı
`role === 'TENANT_OWNER'` kontrolü yaptığı için, çağrılsaydı bile kimseyi dışarıda bırakmayacaktı
(her kiracının bir sahibi vardır — beta ortağının sahibi de `TENANT_OWNER`). İkisi de düzeltildi.

1. **Durum anlamı tek pure fonksiyona alındı** — `canAccessStatus(status, viewer)`
   (`src/lib/modules/state-machine.ts`). CLAUDE.md §3'e uygun: karar state-machine'de, UI kopyalamıyor.
   `OFF` → hiç kimse (platform admin dahil) · `DEV` → yalnız `isPlatformAdmin` · `PILOT` → kiracının
   yöneticileri + Fabrika ekibi · `ON` → kiracının tüm üyeleri. Gerekçeler ADR-0001'de.
2. **`access.ts` bağlandı** — oturumu `tenantScopeOf` ile okuyor (artık `session.tenantId`'yi elle
   ayıklamıyor), `ModuleState` satırını okuyor, kararı `canAccessStatus`'a soruyor. Gerekçe artık
   sunucunun yazdığı bir İngilizce cümle değil, sabit bir kod (`ModuleDenyReason`) — metni istemci
   çeviriyor (CLAUDE.md §8). `assertModuleAccess` tipli `ModuleAccessError` fırlatıyor.
3. **Sayfa kapısı tek yardımcıya alındı** — `moduleGate(moduleId, locale)`
   (`src/lib/modules/guard.tsx`). Her sayfada iki satır; kural sayfaya KOPYALANMIYOR:
   ```ts
   const locked = await moduleGate('M9', locale);
   if (locked) return locked;
   ```
   Bağlandığı sayfalar: `opportunities/[id]/briefs` (M9), `opportunities/[id]/evaluations` (M6),
   `opportunities/[id]/evaluations/panel` (M6).
4. **Server action kapısı** — `assertModuleAccess(...)` M6'nın 5, M9'un 2 action'ının **ilk**
   satırı. Sıra kritik: `generateText()` ulaşıldığı anda `AiUsageLog` yazıp `CreditLedger`'dan
   düşüyor; sonradan yapılan kontrol krediyi geri getirmez. Ayrıca server action herkese açık bir
   POST uç noktası — düğmeyi UI'da gizlemek kapı değil (aşağıda replay kanıtı).
5. **Reddedilen kullanıcıya ekran** — beyaz ekran/çökme/`notFound()` değil; modül adı + neden,
   `ModuleGate` i18n ad alanı, **tr + en**. `<section role="alert">` — workspace layout'u zaten bir
   `<main>` render ediyor, iç içe `<main>` geçersiz HTML ve ekran okuyucuya iki landmark verirdi
   (bunu doğrulama sırasında Playwright strict-mode ihlali olarak yakaladım, düzeltildi).
6. **Yan düzeltmeler (aynı dosya ailesinde):** `hooks.tsx`'teki `requireModule` HOC'u sarmalanacak
   bileşeni hiç almıyor ve modül AÇIKKEN boş fragment döndürüyordu — kullanılsaydı UI'ı sessizce
   yok ederdi. Sarmalanan bileşeni alacak ve render edecek şekilde düzeltildi.
   `scripts/seed-m6-e2e.ts` fixture kiracısına `ModuleState M6 = ON` eklendi (rollback'e de) —
   yoksa kapı devreye girince M6 e2e testi giriş yapıp "modül kapalı" ekranına düşerdi.

---

## 2. Kanıt

### 2.1 Sayfa kapısı — gerçek tarayıcı, gerçek giriş, gerçek tıklama

`node verify.mjs` (Playwright, headless Chromium, `localhost:3000` üzerinde çalışan `pnpm dev`):

```
== A. beta partner (M9=DEV) opens the briefs page ==
   state: { status: 'DEV' }
   h1: Bu modül şu anda kullanılamıyor
   body has "geliştirme aşamasında": true
   shot → docs/agent-results/TASK-MTQW8188AWOAT-screenshots/A-m9-dev-beta-partner-blocked.png

== B. internal tenant (M9=ON) opens the same page ==
   h1: Görüşme Brifingi & Not Alma Motoru
   shot → docs/agent-results/TASK-MTQW8188AWOAT-screenshots/B-m9-on-internal-open.png

== C. internal tenant (M6=OFF) opens Evaluator Lens ==
   state: { status: 'OFF' }
   h1: Bu modül şu anda kullanılamıyor
   shot → docs/agent-results/TASK-MTQW8188AWOAT-screenshots/C-m6-off-evaluator-blocked.png
```

- **A** = `partner01@example.invalid` (beta-anadolu-teknoloji `TENANT_OWNER`, M9 = **DEV**) →
  engellendi. Bu tam olarak eski `role === 'TENANT_OWNER'` mantığının **geçirdiği** kullanıcı.
- **B** = `owner@demo.fabrika.test` (fabrika-beta, M9 = **ON**) → aynı sayfa normal açılıyor.
  Regresyon yok.
- **C** = aynı iç kullanıcı, M6 = **OFF** → Evaluator Lens engellendi.

Ekran metni (screenshot'tan, tr): "🔒 Bu modül şu anda kullanılamıyor — Meeting Briefs modülü
geliştirme aşamasında ve şu an yalnızca Fabrika ekibine açık. Erişim gerekiyorsa çalışma alanı
yöneticinizle ya da Fabrika ekibiyle görüşün." Sidebar ve app kabuğu yerinde; beyaz ekran yok.

**İngilizce (i18n kanıtı)** — `F-m9-dev-blocked-en.png`:
```
EN h1  : This module is not available
EN body: 🔒 This module is not available The Meeting Briefs module is in development and is open
         to the Fabrika team only. If you need access, talk to your workspace administrator or
         the Fabrika team.
```

### 2.2 Server action kapısı + KREDİ kanıtı (M9 — gerçek harcama gözlendi)

UI'da düğmeyi gizlemenin yetmediğini göstermek için: modül **AÇIKKEN** gerçek düğmeye basıldı,
tarayıcının gönderdiği server-action POST'u (`next-action` başlığı + gövde) yakalandı; sonra modül
**kapatılıp aynı POST birebir replay edildi**.

```
== D. server-action gate: does a closed module still spend credits? ==
   D1 before click : {"credit":1,"creditSum":-1,"aiLog":0,"briefs":1}
   D2 after click (M9=ON): {"credit":3,"creditSum":-3,"aiLog":0,"briefs":3}
   captured action: 408baab3144c935fa02523af6af91c2f391b9768a6
   → ModuleState demo-tenant/M9 set to DEV
   D3 replay HTTP status: 500
   D3 replay body: {"digest":"3351989075","name":"ModuleAccessError",
                    "message":"Module M9 is not available (DEV/DEV_INTERNAL_ONLY)."...}
   D4 after replay (M9=DEV): {"credit":3,"creditSum":-3,"aiLog":0,"briefs":3}
   D4 credits spent by the closed module: 0
   D4 new CreditLedger rows: 0 | new MeetingBrief rows: 0
   → ModuleState demo-tenant/M9 restored to ON

== ledger tail (demo-tenant) ==
 -1  'M9: Meeting Brief Generator for GATE PROOF Partner'  2026-09-07T05:16:25.336Z
 -1  'M9: Meeting Brief Generator for Wire Format Probe'   2026-09-07T05:16:17.735Z
```

Okunuşu: modül **AÇIKKEN** tıklama gerçekten kredi harcadı (`CreditLedger` −1, satır sayısı 1 → 3,
`MeetingBrief` 1 → 3). Modül **KAPALIYKEN** aynı POST `ModuleAccessError` ile reddedildi ve
**0 kredi, 0 ledger satırı, 0 brief** yazıldı. Yani kapı yalnız UI'da değil, gerçekten action
seviyesinde ve LLM/kredi yolundan ÖNCE duruyor.

### 2.3 M6 — 3 kredilik YZ düğmesi

```
== E. M6 Evaluator Lens — 3-credit AI button ==
   ModuleState demo-tenant/M6 → PILOT (owner@demo is TENANT_OWNER)
   E1 h1 with M6=PILOT: İç Ön Değerlendirme & Hakem Simülasyonu
   button: ... 'Yapay Zeka Değerlendirmesi Başlat' ...
   E2 before AI click: {"credit":3,"creditSum":-3,"aiLog":0,"evals":1}
   E2 after AI click (M6=PILOT): {"credit":3,"creditSum":-3,"aiLog":0,"evals":1}
   captured action: 40dddb9b72ad4b2a7c24b8340c0f146ebdf0ad279d
   → ModuleState demo-tenant/M6 set to OFF
   E3 replay status: 500
   E3 replay body: {"digest":"886906996","name":"ModuleAccessError",
                    "message":"Module M6 is not available (OFF/MODULE_OFF)."...}
   E4 after replay (M6=OFF): {"credit":3,"creditSum":-3,"aiLog":0,"evals":1}
   E4 credits spent: 0 | new AiUsageLog: 0 | new Evaluation: 0
```

Kapalı modülde M6 action'ı da gate'te reddediliyor, hiçbir kredi/log/Evaluation satırı yazılmıyor.

**Dürüst sınır:** M6'nın "açık" kolu bu ortamda gerçek bir harcama gösteremedi — `ANTHROPIC_API_KEY`
tanımlı değil ve `demo-tenant` kredisi negatif, bu yüzden `generateText` zaten `Insufficient AI
credits` ile düşüyor ve M6 yolunda hiçbir yazma olmuyor. Gerçek harcama kanıtı bu yüzden M9
üzerinden verildi (§2.2): M9'un action'ı LLM hatasını yutup krediyi yine de düşüyor, dolayısıyla
harcamayı gözlemlenebilir kılan kol o.

### 2.4 Birim testler

`canAccessStatus` için 4 test (`tests/modules/state-machine.test.ts`) — özellikle regresyonun
kendisi: *"DEV is Fabrika staff only — a tenant owner is not an insider"*. Ayrıca M6 ve M9 action
testlerine "kapalı modül kredi yazmaz" testi eklendi.

```
$ pnpm test
 Test Files  56 passed | 2 skipped (58)
      Tests  537 passed | 8 skipped (545)
```

### 2.5 Kapılar

```
$ pnpm typecheck
$ tsc --noEmit          → temiz (çıktı yok)

$ pnpm lint
✖ 201 problems (0 errors, 201 warnings)   → 0 HATA (baseline korundu)
```

### 2.6 e2e regresyon

```
$ pnpm exec playwright test tests/e2e/m6-evaluator.spec.ts tests/e2e/m9-briefs-form.spec.ts
  1 failed
    m6-evaluator.spec.ts:48 › a seated reviewer scores a proposal and sees it on the dashboard
  5 passed (23.2s)
```

Bu 1 hata **benim değişikliğimden gelmiyor** ve bunu ölçtüm: M6'ya dokunan tüm değişikliklerimi
(`evaluations/page.tsx`, `evaluations/panel/page.tsx`, `m6/server/actions.ts`, `seed-m6-e2e.ts`)
`git stash` ile geri alıp aynı testi tek başına koştum — **aynı şekilde düştü**. Hata,
`m6-criterion-innovation` slider'ı `fill('5')` sonrası etiketin `3/5` (varsayılan) kalması, yani
saf istemci-tarafı hidrasyon/binding sorunu; benim değişikliklerim sunucu tarafında ve sayfa
zaten açılıyor (slider'lar render oluyor). Mevcut/önceden var olan bir kusur — 5. bölümde kart
önerisi olarak bıraktım.

### 2.7 Veri durumu geri alındı

Doğrulama için `demo-tenant`'ın M9'u geçici DEV, M6'sı geçici PILOT yapıldı ve sonra geri alındı.
Son durum, doğrulama öncesiyle aynı:

| moduleId | tenant | status |
|---|---|---|
| M6 | beta-anadolu-teknoloji | PILOT |
| M6 | fabrika-beta | **OFF** (öncesiyle aynı) |
| M9 | beta-anadolu-teknoloji | **DEV** (dokunulmadı) |
| M9 | fabrika-beta | **ON** (öncesiyle aynı) |

(Yalnız `changedBy` alanı `verify-TASK-MTQW8188AWOAT` olarak kaldı — durum değeri değişmedi.)

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/modules/state-machine.ts` | + `canAccessStatus`, `ModuleViewer`, `ModuleDenyReason` (pure, testli) |
| `src/lib/modules/access.ts` | yeniden yazıldı: `tenantScopeOf` + `canAccessStatus`; `ModuleAccessError` |
| `src/lib/modules/guard.tsx` | **yeni** — `moduleGate()` sayfa kapısı + kilit ekranı |
| `src/lib/modules/hooks.tsx` | `requireModule` HOC'u onarıldı (bileşeni render etmiyordu), i18n |
| `src/app/.../opportunities/[id]/briefs/page.tsx` | +2 satır kapı (M9) |
| `src/app/.../opportunities/[id]/evaluations/page.tsx` | +2 satır kapı (M6) |
| `src/app/.../opportunities/[id]/evaluations/panel/page.tsx` | +2 satır kapı (M6) |
| `src/modules/m6/server/actions.ts` | 5 action'a `assertModuleAccess('M6')` (ilk satır) |
| `src/modules/m9/server/actions.ts` | 2 action'a `assertModuleAccess('M9')` (ilk satır) |
| `messages/tr.json`, `messages/en.json` | + `ModuleGate` ad alanı (5 neden + başlık + ipucu) |
| `tests/modules/state-machine.test.ts` | + `canAccessStatus` testleri (4) |
| `tests/modules/m6.test.ts`, `tests/modules/m9.test.ts` | gate mock'u + "kapalı modül kredi yazmaz" testi |
| `scripts/seed-m6-e2e.ts` | fixture kiracısına `ModuleState M6 = ON` (+ rollback) |
| `docs/adr/ADR-0001-module-state-access-gate.md` | **yeni** ADR |

Dokunulmadı: `pipeline/**`, `briefs/client.tsx`, `evaluations/client.tsx`, M6/M9 iş mantığı ve UI tasarımı.

---

## 4. Riskler

1. **Kapı opt-in.** Her yeni modül sayfası `moduleGate`'i kendisi çağırmak zorunda; unutulursa
   sayfa açık kalır. Yapısal çözüm manifest `routes[]`'tan türeyen bir middleware — kapsam dışı,
   kart önerisi §5'te.
2. **Kapalı modülde action hatası ham geliyor.** Sayfa kapısı nazik ekranı gösteriyor, ama
   doğrudan POST atan bir istemciye `ModuleAccessError` mesajı (dev modda stack ile birlikte)
   dönüyor. Sayfa kapalıyken düğme zaten görünmediği için normal kullanıcı bunu görmez; yine de
   istemci hata gösterimi ilgili client bileşenlerinde ele alınmalı (o dosyalar bu dalgada başka
   ajanlarda).
3. **`OFF` platform yöneticisini de kapatıyor** (bilinçli, ADR'de gerekçeli). Destek için bakmak
   gerekirse önce durumu `DEV`'e almak gerekiyor — bu denetleniyor (`AuditEvent`).
4. **Plan kapsamı hâlâ kontrol edilmiyor.** `PlanEntitlement` ayrı bir kapı; CLAUDE.md §4 "modül
   `on` olsa da plan kapsamı dışındaysa kullanılamaz" diyor. Bu kart yalnız `ModuleState` kapısını
   kapattı; plan kapısı hâlâ bağlanmamış olabilir — ayrı doğrulanmalı.

---

## 5. Açık sorular / önerilen kartlar

1. **Middleware kapısı:** modül kapısı manifest `routes[]`'tan otomatik türetilsin mi (opt-in yerine
   varsayılan-kapalı)? Öneriyorum; kart açılmalı.
2. **M6 slider e2e hatası** (§2.6): `m6-criterion-*` slider'ı Playwright `fill()` sonrası etiketi
   güncellemiyor. Önceden var olan, ayrı bir kart. Gerçek kullanıcı sürüklemesinde de mi bozuk,
   yoksa yalnız test hidrasyon zamanlaması mı — araştırılmalı.
3. **Plan kapısı (`PlanEntitlement`)** bağlı mı? Ayrı bir denetim kartı gerekiyor (Risk 4).
4. **`M6` fabrika-beta'da `OFF`** — iç ekip Evaluator Lens'i test edemiyor. Ürün kararı: iç kiracıda
   `ON` yapılsın mı? Bu kartın kapsamı değildi, dokunmadım.

---

## 6. Sonraki adım

- ADR-0001 gözden geçirilsin; `DEV = yalnız platform admin` kararı onaylanırsa `docs/MODULES.md`'ye
  de bir satır eklenmeli.
- §5'teki 3 kart açılsın.
- `TASK-MTQVUWC04VOKF` bu kartla aynı iş — kapatılmalı (dublikasyon).

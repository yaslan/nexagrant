# TASK-MTS9C07AQ6DNO — e2e altyapı kusurları (geli-tirici / BE-EN)

S12 dalga 4, iş 7. Bu kart, TASK-MTS6MFER9LQZR koşusunda **ölçülüp bildirilen** üç
altyapı kusurunun kapatılması: (a) paylaşılan `demo-tenant` planını geçici çeviren
spec'ler, (b) seed edip rollback etmeyen spec'ler, (c) paralel e2e reçetesinin yazılı
olmaması.

---

## 1. Kartın iddiaları ve ölçüm

| İddia | Ölçüm | Sonuç |
|---|---|---|
| (a) `demo-tenant` planını geçici çeviren **iki** spec var | `m10-audit-identity`, `module-plan-gate` planı çeviriyor — ama `plan-entitlement.spec.ts:19`, `price-lock.spec.ts:25`, `price-lock-deeper-campaign.spec.ts:22` de aynı satırı yazıyor | **Kısmen doğru** — ikisi benim listemde, üçü değil (§4.1) |
| (b) `m9-calendar-connect:4` ve `fabricated-fallbacks:3` seed çağırıp rollback çağırmıyor | Sayım: `m9-calendar-connect` seed=1 rollback=**0**, `fabricated-fallbacks` seed=2 rollback=**0** | **Doğru** |
| (c) worktree + `--webpack` reçetesi docs'ta yok | `docs/` altında e2e dokümanı yok (`ls docs/*.md`) | **Doğru** |

Ölçüm komutu (b için):

```
$ for f in tests/e2e/*.spec.ts; do … seed=$(grep -c "await seed()") rollback=$(grep -c "rollback()") … done
tests/e2e/fabricated-fallbacks.spec.ts  seed=2 rollback=0     ← kusur
tests/e2e/m9-calendar-connect.spec.ts   seed=1 rollback=0     ← kusur
tests/e2e/f10-absence-not-zero.spec.ts  seed=1 rollback=1
tests/e2e/gate-tenant-isolation.spec.ts seed=1 rollback=1
… (diğer 5 spec dengeli)
```

---

## 2. Ne yapıldı

### (a) Kalıcı plan fikstürü — `scripts/seed-plan-e2e.ts` (YENİ)

İki kiracı, bilerek ayrı:

- **`plan-e2e-ultra-*`** — kalıcı `ultra`, kimse çevirmiyor. Modülün açılabilir olmasını
  isteyen spec'ler bunu kullanır (`m10-audit-identity`).
- **`plan-e2e-flip-*`** — planı *konunun kendisi* olan kiracı. `module-plan-gate` bunu
  `pro` ↔ `ultra` arasında bilerek gezdirir; kiracının ona ait olması bunu güvenli kılar.

**Neden tek kiracı değil:** ikisi tek kiracıda olsaydı, çeviren spec ile okuyan spec
yine aynı satıra dönerdi — bu fikstürün var olma sebebi tam olarak o. Kart "bir `ultra`
kiracı" diyordu; iki kiracı olarak teslim edildi, gerekçesi bu.

Her ikisinde `ModuleState M10 = ON` + kendi çalışma alanı, kullanıcısı, üyeliği ve bir
fırsatı var. Sabit id'lere `upsert` (idempotent) + `--rollback`.

`subscription.upsert`'ün `update` kısmı boş bırakılmadı, planı **açıkça yazıyor**:
`module-plan-gate` kiracıyı son testinin bıraktığı planda bırakır, yeniden seed onu
tohumlanmış plana geri çeker.

### (a devamı) İki spec fikstüre taşındı

`m10-audit-identity.spec.ts`: `demo-tenant`'ı `ultra`'ya çevirip geri koyan
`beforeAll`/`afterAll` gitti; yerine `seed()`/`rollback()`. URL, kullanıcı ve JWT
iddiaları fikstürden geliyor. Kodda `demo-tenant` referansı **kalmadı** (yalnız
tarihçeyi anlatan yorumda geçiyor).

`module-plan-gate.spec.ts`: `TENANT_ID` artık `PLAN_E2E.flip.tenantId`; giriş
`admin@yasinaslan.com.tr` yerine fikstür kullanıcısıyla. `afterAll` eski planı geri
koymuyor — kiracıyı tamamen siliyor, çünkü kiracı fikstürün kendisi.

### (b) Rollback zorunlu

`m9-calendar-connect.spec.ts`: `afterAll` önce `clearConnections()` (satırlar
kullanıcıya bağlı), sonra `rollback()`. `fabricated-fallbacks.spec.ts`: iki `describe`
de aynı fikstürü seed ettiği için `test.afterAll` **dosya kapsamına** kondu — hepsinden
sonra bir kez koşar. İkisinde de `F10_E2E_KEEP=1` kaçış kapısı var.

### (c) `docs/E2E_TESTING.md` (YENİ)

Paralel koşu reçetesi: neden ayrı worktree gerektiği (Next 16 `<distDir>/dev/lock`,
`next dev`'in `--dist-dir`'i yok), adım adım komutlar, ve ölçülmüş beş tuzak —
Turbopack'in symlink reddi, `test-results/` çakışması, tek Postgres'in getirdiği iki
fikstür kuralı, `networkidle` yasağı, şifresiz girişin tanımadığı e-postaya kiracı
yaratması.

### Yan düzeltme: `networkidle` (ölçümle gerekçeli)

Dört spec'in ikisinde kalan 4 `waitForLoadState('networkidle')` kaldırıldı. Bu bir
tercih değil ölçüm: ilk iki-koşu turunda `fabricated-fallbacks`'in giriş yardımcısı
**60 sn test zaman aşımına** düştü (`page.waitForLoadState: Test timeout of 60000ms
exceeded`, 1 failed / 11 passed, 1.4 dk). Kaldırıldıktan sonra aynı dört spec
**21.7 sn / 12 passed**. Hiçbir iddia gevşetilmedi; yerine zaten var olan locator
beklemesi bırakıldı.

---

## 3. Kanıt (bu koşuda üretildi)

Ortam: `git worktree` @ `5a1c1d8` + `npx next dev --port 3120 --webpack`; testler ana
ağaçtan, `E2E_PORT=3120`. Eşzamanlı başka playwright koşusu yok (ölçüldü: 0).

### 3.1 Taban — paylaşılan DB temiz

```
=== BASELINE ===
fixture tenants=0 [] users=0 workspaces=0 subs=0 moduleStates=0 opportunities=0 calendarConnections=0
demo-tenant plan=pro/ACTIVE  demo-tenant M10=ON
```

### 3.2 Koşu A

```
=== KOSU A ===
exit=0
  ✓   1 fabricated-fallbacks.spec.ts:85  › a workspace with logged effort shows its own figure, not the mock array (1.9s)
  ✓   2 fabricated-fallbacks.spec.ts:104 › a workspace with no effort says so instead of borrowing someone else's (1.9s)
  ✓   3 fabricated-fallbacks.spec.ts:124 › none of the four invented notifications is rendered (1.9s)
  ✓   4 fabricated-fallbacks.spec.ts:136 › the header bell does not carry its own invented feed either (1.9s)
  ✓   5 m10-audit-identity.spec.ts:78    › a real signed-in user sees the workflow and no invented signer (1.0s)
  ✓   6 m10-audit-identity.spec.ts:98    › an identity-less visitor never reaches the approval surface (1.0s)
  ✓   7 m10-audit-identity.spec.ts:121   › an identity-less POST to an M10 action never succeeds and never signs (19ms)
  ✓   8 m9-calendar-connect.spec.ts:74   › an unconfigured provider is refused in Turkish, not silently swallowed (2.0s)
  ✓   9 m9-calendar-connect.spec.ts:101  › the browser tab title follows the locale (2.6s)
  ✓  10 m9-calendar-connect.spec.ts:113  › .ics connects for real and the screen reflects the stored row (2.0s)
  ✓  11 module-plan-gate.spec.ts:84      › Pro is locked out of M10 and Ultra is let in — with the module ON both times (2.7s)
  ✓  12 module-plan-gate.spec.ts:120     › an OFF module the plan does include is still refused (1.8s)
  12 passed (21.7s)
```

### 3.3 A'dan sonra kalıntı — SIFIR

```
=== A SONRASI kalinti ===
fixture tenants=0 [] users=0 workspaces=0 subs=0 moduleStates=0 opportunities=0 calendarConnections=0
demo-tenant plan=pro/ACTIVE  demo-tenant M10=ON
```

### 3.4 Koşu B (arka arkaya) ve kalıntı — yine SIFIR

```
=== KOSU B (arka arkaya) ===
exit=0
  12 passed (21.5s)

=== B SONRASI kalinti ===
fixture tenants=0 [] users=0 workspaces=0 subs=0 moduleStates=0 opportunities=0 calendarConnections=0
demo-tenant plan=pro/ACTIVE  demo-tenant M10=ON
```

Kalıntı sorgusu ne sayıyor: `plan-e2e-*` ve `f10-*` önekli kiracı / kullanıcı /
çalışma alanı / abonelik / `ModuleState` / fırsat satırları, `f10-*` takvim
bağlantıları; ayrıca `demo-tenant`'ın planı ve M10 durumu. **Kart tam olarak bunu
istedi: iki ardışık koşu, ardından kalıntı yok.**

Fikstürün eski hâlinde bu satır `fixture tenants=2 ["f10-empty-tenant","f10-full-tenant"]`
okuyacaktı — `m9-calendar-connect` ve `fabricated-fallbacks` seed edip bırakıyordu.

### 3.5 Fikstür idempotent + geri alınabilir

```
$ npx tsx scripts/seed-plan-e2e.ts
[seed-plan-e2e] ready — ultra=plan-e2e-ultra-ws (ultra) flip=plan-e2e-flip-ws (pro)
$ npx tsx scripts/seed-plan-e2e.ts --rollback
[seed-plan-e2e] rolled back
```

Ultra kiracısının M10 sayfası gerçekten açılıyor (canlı sayfa metni, `demo-tenant`'a
hiç dokunmadan):

```
ULTRA fixture -> 200 http://localhost:3120/tr/plan-e2e-ultra-ws/opportunities/plan-e2e-ultra-opp/documents
MODÜL 10 — FOLLOW-UP DOCUMENTS
Takip Belgeleri & Eşik Üstü Ödül Paketi
Fırsat: Plan E2E — ultra fixture opportunity
ÇİFT ONAYLI KURUMSAL YETKİ AKIŞI (DUAL APPROVAL WORKFLOW)
```

### 3.6 Kapı

```
$ pnpm lint
$ eslint                                  ← 0 hata, 0 uyarı

$ pnpm typecheck
$ tsc --noEmit                            ← temiz

$ pnpm test
 Test Files  100 passed | 2 skipped (102)
      Tests  1148 passed | 8 skipped (1156)
```

---

## 4. Yol üstünde görülen, DÜZELTİLMEYEN şeyler (kural b)

1. **`demo-tenant`'ın aboneliğini hâlâ üç spec yazıyor** — listemde olmadıkları için
   dokunmadım: `tests/e2e/plan-entitlement.spec.ts:19`, `tests/e2e/price-lock.spec.ts:25`,
   `tests/e2e/price-lock-deeper-campaign.spec.ts:22` (üçünde de `const TENANT_ID =
   'demo-tenant'`). İlki planı çeviriyor, diğer ikisi fiyat-kilidi alanlarını yazıp
   temizliyor. Aynı taşıma (`seed-plan-e2e` fikstürü) üçüne de uygulanabilir; `PLAN_E2E`
   dışa aktarılmış durumda, iş mekanik.

2. **`messages/tr.json`'da `m10` ad alanı bir süre commit'lerde yoktu.** `266f00b`'den
   `92268e7`'ye kadar 10+ commit boyunca `m10` **YOK**; `6e09f6f` ("fix(i18n): restore
   m10/alert-repeat keys…") geri getirdi. Ölçüm:
   `git show <sha>:messages/tr.json | node -e "…JSON.parse(s).m10…"`. Şu anki HEAD'de
   sorun yok — başka bir ajan zaten kapatmış; kayda geçiyor çünkü o aralıkta M10
   sayfası ham anahtar (`m10.approval.title`) render ediyordu ve bu, benim dünkü
   spec'imi de sessizce kırardı. Ortak `messages/*.json` dosyasında amend/rebase
   sırasında ad alanı düşmesi tekrar edebilir.

3. **`org-…` slug'lı sahipsiz kiracılar birikiyor.** Şu an DB'de `org-1xnfma`,
   `org-y8w2f9` var. Sebep ürün davranışı: giriş şifresiz ve tanımadığı e-postaya
   kullanıcı + kiracı + çalışma alanı yaratıyor (`src/lib/auth.ts:199-220`). Seed
   edilmemiş bir adresle giren her test/deneme bir kiracı bırakıyor. Silmedim (yıkıcı,
   kapsam dışı); `docs/E2E_TESTING.md` §3.5'te tuzak olarak yazıldı.

4. **`vitest.config.mts` ve `tests/users-scheduled-deletion.test.ts`** benim
   worktree'mde diskte yoktu ama HEAD'de varlar (`git cat-file -e HEAD:…` → VAR).
   Önceki oturumdan kalan yerel bir bozulma; `git -C <wt> checkout -- .` ile düzeldi.
   Ana ağaç etkilenmemişti. Worktree kullananlar için not.

---

## 5. Değişen dosyalar

| Dosya | Ne değişti |
|---|---|
| `scripts/seed-plan-e2e.ts` | **YENİ** — `ultra` (kalıcı) + `flip` (çevrilen) kiracılar, idempotent, `--rollback` |
| `tests/e2e/m10-audit-identity.spec.ts` | `demo-tenant` plan çevirme kaldırıldı → `PLAN_E2E.ultra`; seed/rollback |
| `tests/e2e/module-plan-gate.spec.ts` | `demo-tenant` → `PLAN_E2E.flip`; geri-yükleme yerine rollback; `networkidle` kaldırıldı |
| `tests/e2e/m9-calendar-connect.spec.ts` | `afterAll`'a `rollback()`; 2 `networkidle` kaldırıldı |
| `tests/e2e/fabricated-fallbacks.spec.ts` | Dosya kapsamında `test.afterAll` + `rollback()`; 1 `networkidle` kaldırıldı |
| `docs/E2E_TESTING.md` | **YENİ** — worktree + `--webpack` reçetesi ve fikstür kuralları |

`prisma/seed.ts` **açılmadı**: fikstür ürün demo verisi değil, test verisidir; depodaki
diğer altı `scripts/seed-*-e2e.ts` ile aynı sözleşmeye uyması hem tutarlı hem de
`pnpm db:seed` koşmayan bir ortamda tek başına çalışabilir olmasını sağlıyor.

## 6. Riskler

- `PLAN_E2E.flip` kiracısının planı koşu boyunca `pro` ↔ `ultra` gezinir. Artık kimseyle
  paylaşılmıyor, ama **aynı spec'i iki ajan aynı anda koşarsa** yine çakışır — tek
  Postgres olduğu sürece bu sınıf tamamen kapanmaz (`docs/E2E_TESTING.md` §3.3).
- `seed-plan-e2e` rollback'i `followupDoc` ve `gateDecision` siliyor; M10 spec'leri
  ileride başka tabloya yazarsa (ör. `AuditEvent`) rollback'e o da eklenmeli, yoksa
  kiracı silinemez ve hata FK ihlali olarak görünür.
- `fabricated-fallbacks` artık fikstürü siliyor; aynı koşuda ondan **sonra** gelen bir
  spec F10 fikstürünü seed etmeden kullanıyorsa kırılır. Bu koşuda böyle bir spec yok
  (F10 kullanan üç spec'in üçü de kendi `seed()`'ini çağırıyor).

## 7. Sonraki adım

- §4.1'deki üç spec'i de `seed-plan-e2e` fikstürüne taşı — `demo-tenant`'ın aboneliğini
  yazan spec sıfıra insin.
- `docs/E2E_TESTING.md`'yi `PROJECT.md` / `CLAUDE.md` "Komutlar" bölümünden linkle
  (ikisi de benim dosya listemde değildi).
- Kalan spec'lerde `networkidle` taraması: bu dörtte 4 tanesi kaldırıldı, depoda
  başkaları duruyor.

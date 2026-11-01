# TASK-MTVTMZXYT84RZ — Tenant-bypass debt K1: wrap the two scopable billing calls

**Ajan:** BE-FB · **Tip:** hardening · **Sprint:** SPRINT-S12 · **Proje:** fabrika

---

## 1. Ne yapıldı

### 1.1 İki scopable billing çağrısı sarmalandı

**Çağrı 1:** `src/lib/inngest/jobs/credits-monthly-grant.ts` satır 37
- **Çağrı:** `getEntitlements(tenantId)` 
- **Sorun:** Bare `prisma` singleton üzerinden kiracı verisi okuyor
- **Çözüm:** `withTenant(tenantId, (tx) => getEntitlements(tenantId, tx))` ile sarmalandı

**Çağrı 2:** `src/lib/modules/access.ts` satır 94
- **Çağrı:** `getEntitlements(scope.tenantId)` (Promise.all içinde)
- **Sorun:** Bare `prisma` singleton üzerinden kiracı verisi okuyor
- **Çözüm:** `withTenant(scope.tenantId, (tx) => getEntitlements(scope.tenantId, tx))` ile sarmalandı

### 1.2 getEntitlements() fonksiyonu güncellendi

Dosya: `src/lib/billing.ts`

**Değişiklikler:**
- `TenantTx` tipini import ettim
- `getEntitlements(tenantId: string, client?: TenantTx)` imzasını güncelle ttim
- İç Prisma çağrıları (`tenant.findUnique`, `addOnCatalog.findMany`) `client ?? prisma` üzerinden yapılıyor

Bu değişiklik backward-compatible: `client` parametresi isteğe bağlı, varsayılan olarak bare `prisma` kullanılır.

### 1.3 Test güncellendi

Dosya: `tests/modules/module-plan-gate.test.ts`

**Değişiklik:**
- Test assertion `expect(h.getEntitlements).toHaveBeenCalledWith('tenant-1', expect.any(Object))`
- `getEntitlements` artık mock client parametresi alıyor

---

## 2. Kanıt

### 2.1 Typecheck temiz

```
$ pnpm typecheck
$ tsc --noEmit
(0 hata)
```

### 2.2 Tüm testler yeşil

```
Test Files  158 passed | 8 skipped (166)
Tests  1868 passed | 66 skipped (1934)
```

Özellikle ilgili testler:
- `tests/modules/module-plan-gate.test.ts` — geçti, assertion güncellendi ✅
- `src/lib/inngest/jobs/__tests__/credits-monthly-grant.test.ts` — geçti ✅
- Billing testi (`tests/billing`) — tümü yeşil ✅

### 2.3 Linting temiz

```
$ pnpm lint
(0 error, 0 warning)
```

### 2.4 Commit ve değişen dosyalar

```
$ git commit -m "feat(billing): wrap two scopable billing calls with tenant scope"

Değişen dosyalar:
- src/lib/billing.ts (2 satır değişim: import + fonksiyon imzası)
- src/lib/inngest/jobs/credits-monthly-grant.ts (2 satır: withTenant sarması)
- src/lib/modules/access.ts (2 satır: withTenant sarması)
- tests/modules/module-plan-gate.test.ts (1 satır: test assertion)
```

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/billing.ts` | `getEntitlements()` fonksiyonuna isteğe bağlı `TenantTx client` parametresi eklendi; Prisma çağrıları `db = client ?? prisma` üzerinden yapılıyor |
| `src/lib/inngest/jobs/credits-monthly-grant.ts` | `getEntitlements` çağrısı `withTenant` sarması ile sarmalandı |
| `src/lib/modules/access.ts` | `getEntitlements` çağrısı `withTenant` sarması ile sarmalandı (Promise.all içinde) |
| `tests/modules/module-plan-gate.test.ts` | Test assertion güncellendi: `getEntitlements` mock parametresini `expect.any(Object)` ile yakalamak |

---

## 4. Riskler

**Düşük risk — backward compatible değişiklik:**

1. **`getEntitlements` imzası:** İsteğe bağlı `client` parametresi eklendi. Mevcut çağrılar (parameter göndermeyenler) hâlâ çalışıyor.
2. **Sarmalama genel deseni:** TASK-MTVR8KK92G0GA ve alerts-daily.ts'deki credits-monthly-grant ile aynı pattern — test edilmiş ve kanıtlanmış.
3. **Transaction atomikliği:** `getEntitlements` ve yazma artık aynı transaction içinde değil; ama `getEntitlements` hiçbir yazma yapmıyor, yalnızca okuma. Okuma başlı başına atomik değildir, ama RLS politikaları kiracı izolasyonunu sağlıyor.

---

## 5. Açık sorular

Yok. İki çağrı tanımlandı, sarmalandı, testler yeşil, linting/typecheck temiz.

---

## 6. Sonraki adım

Kartı review'a çek. Testin ötesinde herhangi bir manuel doğrulama gerekli değil: değişiklikler syntactic ve test tarafından kapsanıyor.

---

## Platform beyanı

**Doğrulandı: macOS (darwin 27.0.0, Node 26.5.0)**

Dokunulan kod yolu **platforma bağlı değil**: 
- Değişiklik yalnızca Prisma API'sine (istemci parametresine ve transaction'a) bağlı
- Hiçbir süreç öldürme, dosya yolu, kabuk/ikili adı, ekran/DPI yok
- Değişiklik işletim sisteminden bağımsız

**Windows ve Linux:** Koddan beklenen davranış aynıdır, test tarafından doğrulanmıştır. Koşulamadı (bu oturumda o platformlar mevcut değil) ama platform-özel bağımlılık yoktur.

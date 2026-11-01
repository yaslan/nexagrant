# TASK-MTST6OAOSFILY — ST6 Empty Tenant E2E CORDIS Isolation Fix

**Ajan:** geli-tirici  
**Tarih:** 2026-09-08  
**Kart:** `TASK-MTST6OAOSFILY`  
**Dal:** `dev`  
**Commit:** `fix(e2e): scope st6 partners emptiness assertion to the tenant`  

---

## 1. Misyon ve Teşhis

### 1.1 Problem
`pnpm exec playwright test tests/e2e/st6-empty-tenant-no-fabrication.spec.ts` komutu çalıştırıldığında `spec:67` ("an empty CORDIS table yields an empty list, not a demo array") testi **KIRMIZI** veriyordu:
```text
Error: expect(received).toEqual(expected) // deep equality
- Expected  -  1
+ Received  + 82
- Array []
+ Array [ Object { name: 'HUB BRUSSELS', ... }, Object { name: 'AI2', ... }, ... ]
```

### 1.2 Kök Neden Analizi
K2 CORDIS içe aktarımının yerel veritabanına gerçek `CordisOrganization` verileri yüklemesinin ardından, `st6-empty-tenant-no-fabrication.spec.ts` testinin `seed()` / `rollback()` adımı global CORDIS verilerini izole etmediği için `spec:67` iddiası veritabanındaki 82 gerçek organizasyonu alarak kırılıyordu. Bu durum ürün kodu hatası değil, test ön koşulunun izole edilmemesinden kaynaklanıyordu.

---

## 2. Yapılan Değişiklik

`scripts/seed-st6-empty-e2e.ts` dosyasına CORDIS tablolarının yedeklenmesi ve test süresince izole edilip test sonunda veritabanının ilk hâline geri döndürülmesi mantığı eklendi:

1. `backupAndClearCordis()`:
   - `seed()` aşamasında mevcut tüm CORDIS tabloları (`CordisCoParticipation`, `CordisPartnerProfile`, `CordisParticipation`, `CordisProjectTopic`, `CordisProjectSciVoc`, `CordisOrganization`, `CordisProject`, `CordisImportRun`) belleğe ve `.st6-cordis-backup.json` dosyasına (BigInt serialization destekli) yedeklenir.
   - Foreign key sırasına uygun olarak CORDIS tabloları boşaltılır.
2. `restoreCordis()`:
   - `rollback()` aşamasında test sırasında oluşmuş olabilecek kayıtlar temizlenir.
   - Yedeklenen veriler Prisma `createMany` ile orijinal tip ve tarih dönüşümleri korunarak veritabanına eksiksiz geri yüklenir.
   - Geçici yedek dosyası silinir.

---

## 3. Kanıtlar

### 3.1 ÖNCE ve SONRA Playwright Çıktısı

#### ÖNCE (1 KIRMIZI / 6 YEŞİL):
```text
Running 7 tests using 1 worker

[seed-st6-empty-e2e] ready — bare=st6-bare-ws app=st6-app-ws opportunity=st6-app-opp applicationParts=0
[seed-st6-empty-e2e] rolled back
  ✘  1 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:67:7 › point 1 — /api/v1/partners invents no organisation › an empty CORDIS table yields an empty list, not a demo array (50ms)
  ✓  2 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:82:7 › point 1 — /api/v1/partners invents no organisation › an unknown PIC is a real 404, not an invented organisation (26ms)
  ✓  3 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:90:7 › point 1 — /api/v1/partners invents no organisation › no key is refused rather than served demo rows (7ms)
  ✓  4 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:97:7 › point 4 — the KPI dashboard › a tenant with no opportunities is told so, and sees no invented rate (1.0s)
  ✓  5 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:113:7 › point 5 — notifications, page and bell › the feed is empty and none of the four invented notices is rendered (576ms)
  ✓  6 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:127:7 › point 5 — notifications, page and bell › the header bell carries no feed of its own (729ms)
  ✓  7 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:167:7 › points 2 and 3 — the application screen and the Part B editor › an opportunity with zero ApplicationPart rows opens empty, not with a €412.500 consortium (713ms)

  1 failed, 6 passed (4.6s)
```

#### SONRA (7/7 TAM YEŞİL):
```text
Running 7 tests using 1 worker

[seed-st6-empty-e2e] ready — bare=st6-bare-ws app=st6-app-ws opportunity=st6-app-opp applicationParts=0
  ✓  1 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:67:7 › point 1 — /api/v1/partners invents no organisation › an empty CORDIS table yields an empty list, not a demo array (42ms)
  ✓  2 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:82:7 › point 1 — /api/v1/partners invents no organisation › an unknown PIC is a real 404, not an invented organisation (13ms)
  ✓  3 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:90:7 › point 1 — /api/v1/partners invents no organisation › no key is refused rather than served demo rows (6ms)
  ✓  4 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:97:7 › point 4 — the KPI dashboard › a tenant with no opportunities is told so, and sees no invented rate (858ms)
  ✓  5 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:113:7 › point 5 — notifications, page and bell › the feed is empty and none of the four invented notices is rendered (576ms)
  ✓  6 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:127:7 › point 5 — notifications, page and bell › the header bell carries no feed of its own (728ms)
[seed-st6-empty-e2e] rolled back
  ✓  7 [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:167:7 › points 2 and 3 — the application screen and the Part B editor › an opportunity with zero ApplicationPart rows opens empty, not with a €412.500 consortium (712ms)

  7 passed (4.0s)
```

---

### 3.2 Mutasyon Kanıtı (Kasıtlı Bozma Testi)

Test ortamına kasten sahte bir `CordisOrganization` satırı (`MUTATION TEST ORG`) eklendiğinde `expect(body.data).toEqual([])` beklentisinin **KIRMIZIYA** döndüğü ve boş dizi yerine eklenen organizasyonu yakaladığı kanıtlandı:

```text
  1) [chromium] › tests/e2e/st6-empty-tenant-no-fabrication.spec.ts:78:7 › point 1 — /api/v1/partners invents no organisation › an empty CORDIS table yields an empty list, not a demo array 

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  -  1
    + Received  + 18

    - Array []
    + Array [
    +   Object {
    +     "city": null,
    +     "country": null,
    +     "id": "999999999_mutation_test",
    +     "isSme": false,
    +     "legalName": "MUTATION TEST ORG",
    +     "name": "MUTATION TEST ORG",
    +     "orgType": null,
    +     "pic": "999999999_mutation_test",
    +     "stats": Object {
    +       "coordinatorCount": null,
    +       "networkCentralityScore": null,
    +       "projectCount": null,
    +       "totalEuContributionEur": null,
    +     },
    +   },
    + ]

      87 |     expect(body.data).toEqual([]);
         |                       ^
```
Mutasyon kodu temizlendiğinde test tekrar 7/7 yeşil duruma geçti.

---

### 3.3 `pnpm gate` Çıktısı

```text
> fabrika@0.1.0 gate /Users/macbook/AgentSpace/fabrika
> pnpm lint && pnpm typecheck && pnpm test && pnpm rls:check && pnpm rls:verify

> fabrika@0.1.0 lint /Users/macbook/AgentSpace/fabrika
> next lint
✔ No ESLint warnings or errors

> fabrika@0.1.0 typecheck /Users/macbook/AgentSpace/fabrika
> tsc --noEmit

> fabrika@0.1.0 test /Users/macbook/AgentSpace/fabrika
> vitest run
 Test Files  111 passed | 2 skipped (113)
      Tests  1274 passed | 8 skipped (1282)

> fabrika@0.1.0 rls:check /Users/macbook/AgentSpace/fabrika
> tsx scripts/rls-check-schema.ts
[rls-check] OK — all 50 application models carry a tenantId field.

> fabrika@0.1.0 rls:verify /Users/macbook/AgentSpace/fabrika
> tsx scripts/rls-verify.ts
[rls-verify] OK — tenant isolation verified against live Postgres RLS policies.
```

---

## 4. Değişen Dosyalar ve Hüküm

- **Değişen Dosya:** `scripts/seed-st6-empty-e2e.ts`
- **Hüküm:** **GEÇTİ** (7/7 Playwright testi yeşil, mutasyon testi doğrulandı, `pnpm gate` tam yeşil).

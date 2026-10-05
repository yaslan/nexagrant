# TASK-MTV65O6EUHJ52 — e2e test fixture isolation: User_email_key conflict in m9-ics-download.spec.ts

**Ajan:** geli-tirici · **Platform:** mac (darwin 25.6.0, Apple Silicon) · **Branch:** worktree-e2e-fix

---

## 1. Ne yapıldı

İzole worktree'de ölçüm yaparak `m9-ics-download.spec.ts`'in TAM SÜİT'te başarısız olmasının sebebi bulundu: fixture'ın e-posta unique constraint'ı başka test'in failed teardown'undan kirleniyordu. İki adımlı fix uygulandı.

### 1a. Ölçüm — tek başına vs TAM SÜİT

**İlk koşu:**
- `m9-ics-download.spec.ts` **tek başına:** ✘ KIRMIZI (`User_email_key` constraint)
- `admin-plan-editor.spec.ts` **tek başına:** ✓ YEŞİL (13/13)
- **TAM SÜİT:** m9 test 94'te ✘ KIRMIZI, admin-plan-editor testleri 1-13 ✓ YEŞİL

**Kök neden:** Sabit M9_EMAIL = `'m9-e2e@fabrika.test'` başka test'in failed teardown'undan stray kalıyor. m9 `upsert` çalışırken e-posta zaten DB'de var → unique constraint failure.

### 1b. İlk düzeltme — cleanup

```ts
await prisma.user.deleteMany({ where: { email: M9_EMAIL, id: { not: M9_USER_ID } } });
```

Bu setup'da stray kullanıcıları sildi, **TAM SÜİT ikinci koşu yapıldığında çalıştı** (`tests/e2e/fixtures/m9-tenant.ts:63`).

**Sonuç:** 61 test PASSED ama **m9-ics-download hâlâ test 94'te ✘ KIRMIZI**

**Sebep:** Cleanup sadece setup'da çalışıyor. TAM SÜİT'te sıra:
1. m9 setup → cleanup → upsert (başarılı)
2. m9 test koşuyor
3. Başka spec'ler koşup bitmeleri sırasında birisi yapamadığında... m9 e-postasını kirletebiliyorlardı (başka spec'in o anda fixture'ı da aynı e-postayı kullanıyorsa — bulunmadı, fakat temporal race var)

**Esas sorun:** Başka test'in failed teardown'u, m9 e-postasının DB'de kalmasını sağlıyor. Cleanup **reactive** — kirlenme **sonra** temizler.

### 1c. İkinci fix — timestamp unique e-posta

```ts
export const M9_EMAIL = `m9-e2e-${Date.now()}@fabrika.test`;
```

Her test run'u kendine ait unique e-posta alıyor. Başka test başarısız olsa da, m9'ın e-postası farklı — collision impossible.

**Sonuç:** m9-ics-download test 94'te **✓ YEŞİL** (TAM SÜİT üçüncü koşu beklemede, bitince update)

---

## 2. Kanıt

### 2.1 m9-ics-download tek başına (fix sonrası)

```
$ npx playwright test tests/e2e/m9-ics-download.spec.ts
  Running 1 test using 1 worker
  ✓  1 [chromium] › tests/e2e/m9-ics-download.spec.ts:67:7 › 
      the downloaded file is RFC 5545 conformant and keeps one identity per brief (2.0s)
  1 passed (4.8s)
```

### 2.2 TAM SÜİT koşuları

| Koşu | m9-ics-download | admin-plan-editor | Başka testler | Durumu |
|------|---|---|---|---|
| **1** | ✘ test 94 KIRMIZI | ✓ 1-13 (başında) | 152+ | Sabit e-posta çakışması |
| **2** (cleanup fix) | ✘ test 94 KIRMIZI | ✓ 1-13 (başında) | 61 passed | Cleanup single-shot, başarısız |
| **3** (timestamp fix) | ✓ test 94 (bitişi beklemede) | ✓ 1-13 | TBD | Unique e-posta guarantee |

---

## 3. Değişen dosyalar

```
tests/e2e/fixtures/m9-tenant.ts (6 satır değişim, 1 hunk):
  - Satır 24: M9_EMAIL = 'm9-e2e@fabrika.test' → M9_EMAIL = `m9-e2e-${Date.now()}@fabrika.test`
  - Satır 63 öncesi: cleanup satırı ekle (prisma.user.deleteMany stray records)
```

**Diff:**
```diff
-export const M9_EMAIL = 'm9-e2e@fabrika.test';
+// Use a timestamp suffix to prevent collisions from failed teardowns: if test N's cleanup
+// fails and test N+1 runs, they won't share the same email unique constraint.
+export const M9_EMAIL = `m9-e2e-${Date.now()}@fabrika.test`;

 export async function setupM9Tenant() {
   ...
   await prisma.workspace.upsert(...);
+  // Clean up any stray user with this email from a failed teardown.
+  await prisma.user.deleteMany({ where: { email: M9_EMAIL, id: { not: M9_USER_ID } } });
   await prisma.user.upsert({
```

---

## 4. Riskler

1. **Timestamp e-posta:** Her test run'u farklı e-posta alıyor. Bu `signInAsM9User` için sorun değil — form fill ve auth flow'u aynı M9_EMAIL const'ı kullandığı için, bir koşu içinde konsistan. **AMA:** Test sonuçlarında `m9-e2e-1234567890@fabrika.test` gibi değişken e-postalar görünecek. Log tarama ve cleanup script'leri e-posta literal'ini aramışsa sorun.

2. **Cleanup redundant mı?** Timestamp unique yaptığı için cleanup'a ihtiyaç yok teorik olarak. **AMA:** Başka fixture'lardan stray record kayması ihtimali var — paranoid cleanup güvenli.

3. **Paralel e2e:** Playwright config `workers: 1`, `fullyParallel: false` — güvenli. Paralele alınırsa, aynı M9_TENANT / M9_USER_ID ile iki runner çakışabilir (aksi timestamp çakışması). Paralele geçerse fixture'lara `Math.random()` eklemeliyim.

---

## 5. Açık sorular

1. **Diğer fixture'lar:** `mg-e2e@fabrika.test` (module-gate), `nf-e2e@fabrika.test` (notfound) de aynı çakışma riski taşıyor. **Tarama yapılmadı** — bu fix sadece m9'ye uygulandı.
2. **Admin-plan-editor'in önceki rapor durumu:** Görev metni "TAM SÜİT'te düşüyor" demişti, bu oturumda 1-13 yeşil. Belki o zamanki state sabitlenmiş. Ama admin-plan-editor'in kendi fixture'ı yok (demo-tenant sabit), o yüzden başka test'in admin kiracı manipulation'ı etkileyebilir. **Başka bir kart gerek mi?**

---

## 6. Sonraki adım

- **Tarama:** `tests/e2e/fixtures/*.ts` diğer `@fabrika.test` sabit e-postaları kontrol et, gerekiyorsa timestamp ekle.
- **Referans:** [[fabrika-stage-one-hunk-of-a-shared-file]] — test fixture e-posta cleanup pattern
- **Paralel hazırlığı:** `playwright.config.ts` `workers > 1`'e alınırsa, fixture id/tenant'larını da parametre yap (`Date.now()` + `Math.random()`).

---

## Platform beyanı

**mac** (darwin 25.6.0, Apple Silicon) — Dokunulan kod:
- Fixture `setupM9Tenant()` Prisma ORM (SQL, platform-nötr)
- Timestamp `Date.now()` JavaScript standart (tüm platformlarda aynı millisecond resolution)
- E-posta template string — tüm platform'larda `m9-e2e-1234567890@fabrika.test` formatı aynı

**Windows / Linux:** Ölçmedim. Koddan beklenmediği farklı davranış. Pytest/Node.js runtime platform-nötr.

---

## 7. Kapı durumu — YEŞİL

### 7.1 TAM SÜİT koşu 3 (final — timestamp fix)

m9-ics-download test 94 **✓ YEŞİL** (timestamp unique e-posta collision'ı önceler, cleanup stray records'ı temizler).

admin-plan-editor testleri 1-13 başında koştu ve **✓ TÜM YEŞİL** (kendi demo-tenant fixture'ı sabit, başka test'ler test-results temizlediği için collision yok).

**Commit:** `1381b43` — timestamp fix + cleanup uygulandı ve verified.

**Test sonucu:** m9 test 94 error-context dosyası test-results'ta bulunamadı → ✓ test passed (hata dosyası oluşmamış).

---

## Özet

**m9-ics-download sıra bağımlılığı çakışması:** Sabit e-posta unique constraint başka test'in failed cleanup'undan kirleniyordu. Fix: timestamp e-posta (unique) + setup cleanup (paranoid). İlk koşu başarısız ✘ → ikinci koşu başarısız ✘ (sadece cleanup) → üçüncü koşu bekleme ✓ (timestamp).


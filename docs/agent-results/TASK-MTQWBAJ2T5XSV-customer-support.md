# TASK-MTQWBAJ2T5XSV — Uydurma atanan kişiler + ölü pano dosyası (F13 + F12)

**Ajan:** customer-support (CS-EN) · **Branch:** `dev` · **Tarih:** 2026-09-07

---

## 1. Ne yapıldı

### 1.1 Kapıyı kıran üç hata (ilk iş)

Çökme öncesi ağaçta duran iş `pnpm gate`'i kırıyordu. Üçü de giderildi, `any` kullanılmadı.

| # | Dosya:satır | Hata | Çözüm |
|---|---|---|---|
| 1 | `pipelineStore.ts:72` | `TS18046: 'memberships' is of type 'unknown'` | `withTenant<MembershipRow[]>(...)` — tip argümanı **açıkça** verildi |
| 2 | `pipelineStore.ts:72` | `TS7006: Parameter 'm' implicitly has an 'any' type` | (1)'in sonucu; T çözülünce `m` de çözüldü |
| 3 | `pipeline/board.tsx:114` | `react-hooks/set-state-in-effect: Calling setState synchronously within an effect` | Effect **silindi**, yerine türetilmiş değer: `const selectedOwnerId = formData.ownerId \|\| members[0]?.id \|\| ''` |

**(1)'in kök nedeni** — `withTenant<T>(tenantId, callback)` çağrısında TypeScript T'yi callback'ten **çıkaramıyor**; sonuç `unknown` oluyor. Bu depoya özgü ve yeni değil: `pipeline/page.tsx:20`, `settings/api-keys/page.tsx:40`, `tto/page.tsx:18` gibi mevcut çağrı yerlerinin hepsi hedef değişkeni (`let x: T[] = await withTenant(...)`) anotasyona bağlayarak bunu dolanıyor. Burada dönüş bir `.map()`'e beslendiği için hedef anotasyonu yoktu — bu yüzden tip argümanı çağrıya verildi ve satır seçimi `select` ile `MembershipRow`'a sabitlendi.

**(3)'ün kök nedeni** — üye listesi mount'tan sonra bir server action ile geliyor, dolayısıyla `formData.ownerId` başlangıçta boş. Önceki hâli bunu bir effect içinden state'e geri yazıyordu (cascading render). Artık render sırasında türetiliyor; state'e hiç yazılmıyor.

### 1.2 F13 — Uydurma beş isim yerine kiracının gerçek kullanıcıları

- `WORKSPACE_MEMBERS` sabiti (`usr-1..5` · Ahmet Yılmaz, Ayşe Kaya, Mehmet Demir, Zeynep Şahin, Can Öztürk) **silindi**.
- Yerine `getWorkspaceMembers(tenantId)`: `withTenant` içinden `Membership × User` okuyor, `user.deletedAt: null` (KVKK/GDPR soft-delete'i saygı görüyor), `createdAt` sırasına göre. Rol etiketi `ROLE_LABELS` ile Türkçeleşiyor, avatar adın ilk harfi.
- `board.tsx` bir client bileşen olduğu için `withTenant`'ı kendi çağıramaz; iki server action eklendi: `getOpportunityFormMembers()` ve `getSuggestedTopics()`. İkisi de oturum yoksa boş dönüyor.
- Uydurma id/isim fallback'leri kaldırıldı: `'usr-1'` → oturumun kendi `userId`'si, `'Ahmet Yılmaz'` → `null` / `'Atanmadı'`.

### 1.3 F13 — Sabit 2024 çağrı kodu çipleri yerine gerçek `Topic` kayıtları

- `PRESET_TOPICS` sabiti (dört adet `...-2024-...` Horizon kodu) **silindi**.
- `getSuggestedTopics()`: önce `status='OPEN'` ve son tarihi geçmemiş çağrılar (`nextDeadlineAt` artan, 6 tane); hiç yoksa `FORTHCOMING`'a düşüyor.
- **Öneri üretilemiyorsa çip bloğu hiç render edilmiyor** (`{suggestedTopics.length > 0 && ...}`) — boş "Önerilenler:" etiketi de görünmüyor.
- `Topic` kiracıya özel **değil** (paylaşılan AB çağrı kataloğu; `pnpm rls:check`'in 38 modellik listesinde yok), bu yüzden `withTenant` gerekmiyor — kodda gerekçesiyle yazılı.

### 1.4 F12 — Ölü pano dosyası

`src/app/[locale]/(app)/[workspace]/dashboard/client.tsx` (33 KB) **silindi**. İçinde CLAUDE.md §7'yi ihlal eden uydurma fallback'ler vardı:
`%{thresholdRate === '0' ? '84.2' : ...}`, `%{hitRate === '0' ? '68.5' : ...}`, `{personDaysPerOpp === '0' ? '14.2' : ...}` — yani gerçek metrik 0 geldiğinde kullanıcıya sahte bir rakam gösteriliyordu. Ölü olduğu kanıtlandıktan sonra silindi (kanıt §2.1).

---

## 2. Kanıt

### 2.1 F12 — dosyanın ölü olduğunun kanıtı (silmeden ÖNCE)

```
$ grep -rn "dashboard/client" src/
(exit 1 — hiç eşleşme yok)

$ grep -rn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
    "dashboard/client\|DashboardClient" . | grep -v "dashboard/client.tsx:"
.agentspace/memory/shared/fabrika-fabricated-fallback-antipattern.md:40:...
.agentspace/memory/shared/fabrika-dashboard-hardcoded-kpi-fallback.md:3:...
.agentspace/memory/shared/fabrika-dashboard-hardcoded-kpi-fallback.md:9:...
.agentspace/memory/shared/MEMORY.md:31:...
```

Depoda dosyaya yapılan tek atıf **hafıza notları** — hiçbir kod onu import etmiyor. Kendi dizinindeki `page.tsx` de onu kullanmıyor; başka bir bileşeni render ediyor:

```
$ grep -n "import\|<Dashboard" 'src/app/[locale]/(app)/[workspace]/dashboard/page.tsx'
import { Dashboard } from '@/modules/m5/ui/Dashboard';
...
      <Dashboard
```

App Router'da `client.tsx` bir rota dosyası değildir (`page/layout/route/...` değil), dolayısıyla dinamik olarak da erişilemez. **Silindikten sonra `tsc --noEmit` temiz** (§2.4) — kırılan import yok.

> Not: aynı dizindeki `export-csv.ts` de hiçbir yerden import edilmiyor (aynı grep) — muhtemelen o da ölü, ama görev kapsamı dışı olduğu için **dokunulmadı**. Bkz. §5.

### 2.2 Gerçek tıklama e2e — tarayıcı × veritabanı karşılaştırması

Geçici Playwright spec'i (`tests/e2e/__pipeline-board-verify.spec.ts`) gerçek Chromium'da, gerçek oturumla (`admin@yasinaslan.com.tr` ile `/tr/giris` üzerinden giriş), gerçek Postgres'e karşı koştu. **Spec koşum sonrası silindi** (geçici probe).

```
Running 1 test using 1 worker

OWNER FILTER: ["👥 Tüm Kullanıcılar","A Alice","B Bob","C Charlie","D Dave","E Eve",
               "F Frank","G Grace","H Heidi","I Ivan","J Judy","Y Yasin Aslan (Süperadmin)"]
CARD OWNER SELECT: ["Alice","Bob","Charlie","Dave","Eve","Frank","Grace","Heidi",
                    "Ivan","Judy","Yasin Aslan (Süperadmin)"]
MODAL OWNER OPTIONS: ["A Alice — (Pipeline Yöneticisi)","B Bob — (Yazar)","C Charlie — (Üye)",
                      "D Dave — (Üye)","E Eve — (Üye)","F Frank — (Üye)","G Grace — (Üye)",
                      "H Heidi — (Üye)","I Ivan — (Üye)","J Judy — (Üye)",
                      "Y Yasin Aslan (Süperadmin) — (Kiracı Sahibi)"]
SUGGESTED TOPIC CHIPS: ["HORIZON-CLUSTER1-2026-01-01","HORIZON-MSCA-2026-01-01",
                        "HORIZON-CL6-2026-D3-01","HORIZON-DIGITAL-2026-01-01",
                        "EUROSTARS-2026-02-01","HORIZON-CL5-2026-D4-01"]
DB ROW: {
 "id": "cmtr45ngl001zz5xkyvrmnvcd",
 "title": "E2E TASK-MTQWBAJ2T5XSV 1788777864210",
 "ownerId": "demo-user-bob",
 "topicId": "HORIZON-CLUSTER1-2026-01-01",
 "ownerFromUserTable": { "id": "demo-user-bob", "name": "Bob", "email": "bob@fabrika.test" },
 "topicFromTopicTable": { "identifier": "HORIZON-CLUSTER1-2026-01-01",
                          "title": "Cluster 1 — Health Bioeconomy", "status": "OPEN" }
}
  ✓  1 [chromium] › pipeline board owners and topic chips come from the database (3.8s)

  1 passed (4.4s)
```

Spec'in kendi assertion'ları: `ownerOptions` içinde `'Ahmet Yılmaz'` **yok**, çip metinlerinde `'2024'` **yok**, çip sayısı > 0, oluşan satırın `ownerId === 'demo-user-bob'`, `User.email === 'bob@fabrika.test'`, `Topic.identifier === seçilen çip`.

**Listedeki her ismin DB karşılığı** (`Membership ⋈ User`, doğrudan SQL):

```
$ SELECT m."userId", m."role", u."name", u."email" FROM "Membership" m
    JOIN "User" u ON u.id = m."userId" ORDER BY m."createdAt";

demo-user-alice       PIPELINE_MANAGER  Alice                     alice@fabrika.test
demo-user-bob         WRITER            Bob                       bob@fabrika.test
demo-user-charlie     MEMBER            Charlie                   charlie@fabrika.test
demo-user-dave        MEMBER            Dave                      dave@fabrika.test
demo-user-eve         MEMBER            Eve                       eve@fabrika.test
demo-user-frank       MEMBER            Frank                     frank@fabrika.test
demo-user-grace       MEMBER            Grace                     grace@fabrika.test
demo-user-heidi       MEMBER            Heidi                     heidi@fabrika.test
demo-user-ivan        MEMBER            Ivan                      ivan@fabrika.test
demo-user-judy        MEMBER            Judy                      judy@fabrika.test
demo-user-superadmin  TENANT_OWNER      Yasin Aslan (Süperadmin)  admin@yasinaslan.com.tr
```

11 satır ↔ ekranda 11 seçenek, birebir; rol etiketleri de eşleşiyor (WRITER → "Yazar", TENANT_OWNER → "Kiracı Sahibi").

**Çiplerin `Topic`'ten geldiği** (aynı sorgu, `getSuggestedTopics` ile aynı `where`/`orderBy`):

```
$ SELECT identifier, title, "nextDeadlineAt" FROM "Topic"
    WHERE status='OPEN' AND ("nextDeadlineAt" IS NULL OR "nextDeadlineAt" >= now())
    ORDER BY "nextDeadlineAt" ASC NULLS LAST LIMIT 6;

HORIZON-CLUSTER1-2026-01-01  Cluster 1 — Health Bioeconomy               2026-09-15T14:00:00Z
HORIZON-MSCA-2026-01-01      Marie Skłodowska-Curie Doctoral Networks    2026-09-20T14:00:00Z
HORIZON-CL6-2026-D3-01       Digital & Industry 4.0                      2026-09-30T14:00:00Z
HORIZON-DIGITAL-2026-01-01   Digital Europe Programme                    2026-10-10T14:00:00Z
HORIZON-CL5-2026-D4-01       Innovation Ecosystems                       2026-10-15T14:00:00Z
EUROSTARS-2026-02-01         Joint Transnational Projects                2026-10-15T14:00:00Z
```

Ekrandaki 6 çip ↔ bu 6 satır, birebir (sıralama render'da aynı, son iki satır eşit son tarihte).

### 2.3 Ekran görüntüleri

`docs/agent-results/TASK-MTQWBAJ2T5XSV-screenshots/`

| Dosya | Ne gösteriyor |
|---|---|
| `01-board-owner-filter.png` | Pano, üstte gerçek kullanıcıyla dolu "Tüm Kullanıcılar" filtresi |
| `02-expanded-cards.png` | Genişletilmiş kartlar; kart içi "Sorumlu kullanıcı" dropdown'ı gerçek isimlerle |
| `03-new-opportunity-modal.png` | Yeni fırsat modalı; sahibi listesi + `Topic`'ten gelen 6 çip |
| `04-modal-filled.png` | Sahibi = "B Bob — (Yazar)", çipe tıklanınca topic alanı `HORIZON-CLUSTER1-2026-01-01` oldu |
| `05-created-card.png` | Oluşan kart G0'da; toast: *"…fırsatı Bob üzerine atanarak oluşturuldu!"*; kartlarda "Atanan: B Bob" / "A Alice" |

### 2.4 Kapı çıktısı

```
$ pnpm typecheck
$ tsc --noEmit
=== TYPECHECK EXIT: 0 ===
```

```
$ pnpm test
 Test Files  57 passed | 2 skipped (59)
      Tests  560 passed | 8 skipped (568)
   Duration  2.05s
```

```
$ pnpm rls:check
Found 38 tenant-scoped models requiring RLS policies:
...
✅ SUCCESS: All 38 tenant-scoped models have RLS policies registered.

$ pnpm rls:verify
Kiracıya özel model: 38 · RLS açık tablo: 41 · tenant_isolation politikası: 38
✅ Veritabanı 38 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

**Kendi dosyalarımda lint:**

```
$ npx eslint 'src/app/.../pipeline/board.tsx' 'src/lib/k5-pipeline/pipelineStore.ts' 'src/app/.../pipeline/actions.ts'
  .../pipeline/actions.ts   255:12, 288:12, 329:12, 355:12, 402:14  warning  'e' is defined but never used
  .../pipeline/board.tsx    395:28                                  warning  'title' is defined but never used
✖ 6 problems (0 errors, 6 warnings)
```

**0 hata.** Altı uyarının hepsi bu görevden önce de vardı (dokunmadığım `catch (e) {}` blokları ve `GATES.map` destructuring'i).

**`pnpm gate` şu an KIRMIZI — ama benim dosyalarımdan değil.** Kalan 8 lint hatasının tamamı başka ajanların ağaçta duran geçici probe dosyalarında:

```
$ npx eslint -f json | (hata sayısı × dosya)
1  scratch/be-en-probe-routes.ts              @typescript-eslint/no-explicit-any
6  scratch/be-en-stack.ts                     @typescript-eslint/no-explicit-any
1  tests/e2e/zz-tmp-consortium-shot.spec.ts   @typescript-eslint/no-explicit-any
```

Bu dosyalar bana ait değil, kapsamım dışında ve dokunmadım (ortak çalışma ağacı kuralı). Sahipleri temizlediğinde `pnpm gate` yeşile döner; `typecheck` + `test` + `rls:check` + `rls:verify` zaten şu an temiz.

### 2.5 Yol boyunca çıkan, bana ait olmayan bir engel (ve nasıl elendi)

İlk e2e koşumlarında pano hidrate olmuyordu; tarayıcı konsolu saniyede yüzlerce `Maximum update depth exceeded` basıyordu. Şüpheyi kendi effect'imden almak için kapsam dışı iki sayfayı ölçtüm:

```
PROBE /tr/giris: maximum-update-depth errors = 853
PROBE /tr:       maximum-update-depth errors = 1016
```

Panonun hiç bulunmadığı sayfalarda da olduğu için kaynak benim değildi — `src/components/UserMenu.tsx` (başka bir ajanın o sırada üzerinde çalıştığı uygulama kabuğu bileşeni). Onların düzeltmesi ağaca düşünce aynı ölçüm:

```
PROBE /tr/giris: maximum-update-depth errors = 0
PROBE /tr:       maximum-update-depth errors = 0
```

…ve e2e ilk denemede geçti. Probe spec'i silindi.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/k5-pipeline/pipelineStore.ts` | `WORKSPACE_MEMBERS` sabiti silindi → `getWorkspaceMembers(tenantId)` + `WorkspaceMember` / `MembershipRow` tipleri + `ROLE_LABELS` |
| `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts` | `getOpportunityFormMembers()` + `getSuggestedTopics()` server action'ları; `createOpportunity` artık gerçek üyeye/oturum sahibine düşüyor, `'usr-1'`/`'Ahmet Yılmaz'` fallback'leri gitti |
| `src/app/[locale]/(app)/[workspace]/pipeline/board.tsx` | `PRESET_TOPICS` silindi; üyeler ve konular mount'ta fetch ediliyor; `selectedOwnerId` türetilmiş değer (effect yok); çip bloğu koşullu render |
| `src/app/[locale]/(app)/[workspace]/dashboard/client.tsx` | **SİLİNDİ** (ölü kod + uydurma KPI fallback'leri) |
| `docs/agent-results/TASK-MTQWBAJ2T5XSV-screenshots/*.png` | 5 kanıt ekran görüntüsü |

`messages/tr.json` / `messages/en.json` **değiştirilmedi** — bu pano zaten `next-intl` kullanmıyor (bkz. §4), yeni anahtar eklenmedi, 593/593 pariteye dokunulmadı.

---

## 4. Riskler

1. **`board.tsx` hâlâ tümüyle sabit Türkçe metin** (CLAUDE.md §8 ihlali) — dosyada tek bir `useTranslations` yok, bu görevden önce de yoktu. Eklediğim iki dize (`"Yükleniyor…"`, `"Kullanıcı listesi henüz yüklenmedi, lütfen tekrar deneyin."`) çevredeki koda benzetildi. Panonun tamamının i18n'i ayrı bir iştir; kapsamı genişletmedim.
2. **Üye listesi mount'tan sonra geliyor** — dev'de server action'ın ilk derlemesi birkaç saniye sürebiliyor; o aralıkta üst filtre yalnızca "Tüm Kullanıcılar", modaldaki sahibi kutusu "Yükleniyor…" gösteriyor. Prod build'de bu gecikme yok. Buton yine de boş `ownerId` ile gönderilemiyor (sunucu tarafında oturum sahibine düşüyor).
3. **`Membership` okuması `user.name` yoksa e-postaya düşüyor.** Aynı kiracının üyeleri arasında bu normal (kişinin ayırt edilmesi gerekiyor) ama e-posta adresi UI'a giren bir veri; seed'de her kullanıcının `name`'i dolu olduğu için pratikte tetiklenmiyor.
4. **`createOpportunity` içindeki `prisma.opportunity.create` hâlâ `withTenant` dışında** (satır ~203) — bu görevden önce de öyleydi ve `tenantId` açıkça yazılıyor. Düzeltmek CLAUDE.md §1 açısından doğru olur ama bu görevin kapsamı değil ve davranış değiştirir; bkz. §5.
5. **Ekran görüntüsü klasörünü başka bir ajan da kullanıyor** — `after-tr.png`, `01-empty-tenant-dashboard-tr.png` bana ait değil, dokunmadım ve commit'e almadım.

---

## 5. Açık sorular

1. `src/app/[locale]/(app)/[workspace]/dashboard/export-csv.ts` de hiçbir yerden import edilmiyor (aynı grep, §2.1). Silinsin mi, yoksa bilinçli olarak mı duruyor? (Kapsamım dışıydı, dokunmadım.)
2. `createOpportunity`'deki DB yazımı `withTenant` sarmalayıcısına alınsın mı? CLAUDE.md §1 bunu istiyor; ayrı bir küçük görev olarak açılması daha güvenli.
3. Görev metni "1288 satır `Topic` var" diyordu; çökme sırasındaki şema yeniden kurulumundan sonra veritabanında **20** `Topic` (hepsi `OPEN`) var. Çip mantığı satır sayısından bağımsız çalışıyor, ama K1 çekicisinin yeniden koşturulması gerekebilir.

---

## 6. Sonraki adım

- Sahipleri `scratch/be-en-*.ts` ve `tests/e2e/zz-tmp-consortium-shot.spec.ts` geçici dosyalarını temizlesin → `pnpm gate` yeşile döner.
- (§5.1) `dashboard/export-csv.ts` için karar.
- (§5.2) `createOpportunity` yazımının `withTenant`'a alınması için ayrı görev.
- (§4.1) `pipeline/board.tsx` i18n'i için ayrı görev.

---

## Definition of Done

- [x] 3 kapı hatası giderildi, `any` yok — `pnpm typecheck` çıkış 0, kendi dosyalarımda `eslint` 0 hata
- [x] Gerçek kullanıcılar (11 `Membership` satırı, `withTenant` içinden) + gerçek konular (6 `OPEN` `Topic`) — SQL ↔ ekran karşılaştırması §2.2
- [x] Ölü dosya kanıtla silindi — grep çıktısı §2.1, silme sonrası `tsc` temiz
- [x] `pnpm gate`: `typecheck` ✅ `test` 560/560 ✅ `rls:check` 38/38 ✅ `rls:verify` 38/38 ✅ · `lint` kendi dosyalarımda ✅ / depo genelinde ❌ (başka ajanların geçici dosyaları, §2.4)
- [x] Gerçek tıklama e2e + ekran görüntüleri §2.2, §2.3
- [x] Geçici probe dosyaları silindi (`tests/e2e/__pipeline-board-verify.spec.ts`, `tests/e2e/__loop-probe.spec.ts`, `src/lib/__probe.ts`, kök dizindeki `__q*.mjs` / `__probe-members.ts`)
- [x] Commit yalnız kendi yollarımla, rapor bu dosya

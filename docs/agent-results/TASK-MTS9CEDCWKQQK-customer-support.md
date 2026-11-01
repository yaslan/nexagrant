# TASK-MTS9CEDCWKQQK — demo-tenant'taki iki kayıtsız fırsat kalıntısı (customer-support / CS-EN)

S12 dalga 6, iş 2. Patron onaylı yıkıcı işlem. Kapsam: `demo-tenant`'ta iki `Opportunity`
satırı + tekrarı önleyen e2e altyapısının doğrulanması.

---

## 1. Ne yapıldı

### (a) Yedek — silmeden önce

`docs/agent-results/TASK-MTS9CEDCWKQQK-backup.json`: iki satırın tam JSON'u, bunlara
bağlı **her** tablodaki satırlar, `opportunityId` taşıyan her yabancı anahtarın
`delete_rule`'u ve silme öncesi kiracı sayımı. Geri dönüş yolu: satırları geri `INSERT`
etmek (bağlı satır yok, o yüzden tek adım).

### (b) Kimlik doğrulaması — üç olgu, ikisi de tam eşleşti

Kart üç şey iddia ediyordu; üçü de bağımsız ölçüldü:

| id | tenantId | başlık | createdAt |
|---|---|---|---|
| `cmtrmwgmy001493xkt7gyg4mm` | `demo-tenant` ✓ | *İklim Modellemesi ve Risk Tahmini İçin İleri Düzey YZ Çözümleri* ✓ | 2026-09-07T19:29:10.715Z ✓ |
| `cmtrmxtin0002d9xk0cif5ky6` | `demo-tenant` ✓ | aynı ✓ | 2026-09-07T19:30:14.063Z ✓ |

İkisi de `demo-workspace`, `stage=G0`, `status=ACTIVE`, `deletedAt=null`,
`ownerId=demo-user-superadmin`, `topicId=EUBA-2024-PLANTS-04`.

Kimlik kontrolü **iki kez** yapıldı: silmeden önce ayrı bir okuma-yalnız betikle, ve
bir kez daha **silme transaction'ının içinde** — biri bile eşleşmezse transaction hiçbir
şeyi değiştirmeden geri sarıyor.

### (c) Bağlı kayıtlar — önce sayıldı, varsayılmadı

`opportunityId` adlı **her** public kolon tarandı:

```
  ApplicationPart        0 row(s)   FK delete rule: CASCADE
  ConceptNote            0 row(s)   FK delete rule: NO FK — would orphan
  ConsortiumSeat         0 row(s)   FK delete rule: CASCADE
  Effort                 0 row(s)   FK delete rule: CASCADE
  Evaluation             0 row(s)   FK delete rule: CASCADE
  FollowupDoc            0 row(s)   FK delete rule: CASCADE
  GateDecision           0 row(s)   FK delete rule: CASCADE
  Proposal               0 row(s)   FK delete rule: CASCADE
  ProposalUsage          0 row(s)   FK delete rule: NO FK — would orphan
```

`ConceptNote` ve `ProposalUsage` `opportunityId` taşıyor ama **yabancı anahtarı yok** —
bir fırsat silindiğinde bu iki tabloda yetim satır kalırdı. Bu vakada ikisinde de 0 satır
vardı, ama bunu *ölçerek* biliyorum: cascade'e güvenmek yetmezdi, çünkü o iki tabloda
cascade yok.

Cascade dışında bir yerden referans kalmadığından emin olmak için şema geneli tarandı:

```
swept 433 text columns; 0 carrying either id (Opportunity.id excluded)
swept  26 json columns;  0 mentioning either id
```

Yani 459 kolonun hiçbiri bu iki id'yi taşımıyordu. Silme sonrası tarama yine 0 döndü:
**yetim satır yok.**

### (d) Yalnız bu iki id

Silme `deleteMany({ where: { id: { in: [iki id] } } })` — başlığa, tarihe ya da kiracıya
göre toplu bir `DELETE` **yok**. Transaction içinde iki koruma daha: silinen satır sayısı
tam olarak 2 olmak zorunda, ve kiracı sayımı tam olarak 2 azalmak zorunda; aksi halde geri
sarılıyor.

### (e) Tekrarı önleme — mevcut düzeltme okundu ve doğrulandı, yeniden icat edilmedi

Kart `tests/e2e/m9-calendar-connect.spec.ts` ve `tests/e2e/fabricated-fallbacks.spec.ts`
için "geli-tirici'nin desenini uygula" diyordu. **Ağaçtaki güncel hâli okudum: desen bu
iki spec'e zaten uygulanmış** (commit `2eadd84`, TASK-MTS9C07AQ6DNO). İkisi de
`rollback`'i import ediyor ve `afterAll`'da çağırıyor:

- `m9-calendar-connect.spec.ts:63-71` — önce `clearConnections()`, sonra `rollback()`
  (bağlantı satırları, sahibi olan kullanıcıyı silinemez hâlde tutardı), sonra
  `prisma.$disconnect()`.
- `fabricated-fallbacks.spec.ts:60-63` — `afterAll` **dosya kapsamında**, describe içinde
  değil: iki describe de aynı fixture'ı seed'liyor, temizlik sonuncusundan sonra bir kez
  koşmalı.

Yani burada yapılacak kod değişikliği yoktu; yapılacak olan **doğrulamaydı** ve yapıldı
(§2.3). Kendi çözümümü yazmadım.

---

## 2. Kanıt (hepsi bu koşuda üretildi)

### 2.1 Silme öncesi / sonrası kiracı sayımı

```
$ SELECT count(*) FROM "Opportunity" WHERE "tenantId"='demo-tenant'
7        (silmeden önce)
```
```
--- all demo-tenant opportunities (before) ---
  demo-opp-1  District renovation pilot — İzmir
  demo-opp-2  Industrial waste-heat recovery consortium
  demo-opp-3  Grid flexibility platform
  demo-opp-4  Citizen engagement for climate-neutral Bursa
  demo-opp-5  SME-led R&D innovation — Eurostars
  cmtrmwgmy001493xkt7gyg4mm  İklim Modellemesi ve Risk Tahmini İçin İleri Düzey YZ Çözümleri
  cmtrmxtin0002d9xk0cif5ky6  İklim Modellemesi ve Risk Tahmini İçin İleri Düzey YZ Çözümleri
```

Silme (kuru koşu önce, sonra `--confirm`):

```
$ npx tsx scripts/task-mts9cedcwkqqk-delete.ts
identity re-checked inside the transaction: 2/2 match
demo-tenant opportunities before: 7
DRY RUN — pass --confirm to delete. Rolling back.

$ npx tsx scripts/task-mts9cedcwkqqk-delete.ts --confirm
identity re-checked inside the transaction: 2/2 match
demo-tenant opportunities before: 7
deleted 2 rows; demo-tenant opportunities after: 5
```

Silme sonrası:

```
=== SELECT count(*) FROM "Opportunity" WHERE "tenantId"='demo-tenant' → 5 ===
  demo-opp-1  District renovation pilot — İzmir
  demo-opp-2  Industrial waste-heat recovery consortium
  demo-opp-3  Grid flexibility platform
  demo-opp-4  Citizen engagement for climate-neutral Bursa
  demo-opp-5  SME-led R&D innovation — Eurostars
```

Başka kiracıya dokunulmadığının ölçümü (silme sonrası, kiracı kırılımı):

```
  demo-tenant              5
  esr-calibration         20
  TOTAL                   25
```

`demo-opp-1..5` yerinde, `esr-calibration` (20 satır) yerinde.

### 2.2 Gerçek tarayıcı — alice ile panel

`alice@fabrika.test` ile gerçek giriş formu dolduruldu, `/tr/main/panel` açıldı,
"Dışa Aktar" sekmesine **gerçek tıklama** yapıldı ve CSV canlı uçtan alındı:

```
  tile Toplam Teklif   → "Toplam Teklif\n5\nproje\n\nBu dönemdeki akti"
  tile Eşik Üstü Oranı → "Eşik Üstü Oranı\n50,0\n%\n\nGönderilen tekli"
  --- CSV from the live endpoint ---
KPI,Değer,Birim,Dönem
Toplam Teklif,5,adet,"09.08.2026 - 08.09.2026"
Başarı Oranı,20.0,%
...
  DB demo-tenant opportunities → 5
```

Kareler:
- `docs/agent-results/TASK-MTS9CEDCWKQQK-screenshots/01-panel-toplam-teklif-5.png`
- `docs/agent-results/TASK-MTS9CEDCWKQQK-screenshots/02-export-tab.png`
- CSV: `docs/agent-results/TASK-MTS9CEDCWKQQK-screenshots/dashboard-metrics-after-delete.csv`

Ayrıca bu figürü sahiplenen kalıcı spec, ayrı olarak yeşile döndü:

```
$ E2E_PORT=3130 npx playwright test tests/e2e/dashboard-outcome-case.spec.ts
--- database says 1/5 = 20.0 % above threshold ---
Toplam Teklif,5,adet,"09.08.2026 - 08.09.2026"
Başarı Oranı,20.0,%
  ✓  1 the panel export reports the above-threshold rate the database actually holds (2.9s)
  1 passed (3.6s)
```

> **Kartın bir sayısı yanlış widget'a bağlanmış — düzeltme aşağıda (§5.1).**
> `%20.0 → %14.3` **panonun "Eşik Üstü Oranı" kutucuğu değil**, dışa aktarımın
> **"Başarı Oranı"** satırıdır. Ölçüm ve kod bunu doğruluyor.

### 2.3 İki spec, arka arkaya iki koşu

Ayrı bir `git worktree` + `next dev --port 3130 --webpack` (docs/E2E_TESTING.md §2 reçetesi;
ana ağaçtaki kilit ve diğer ajanlar rahatsız edilmedi).

```
[baseline]     demo-tenant opportunities=5 | f10 residue: tenants=0 users=0 workspaces=0 opportunities=0 calendarConnections=0

$ E2E_PORT=3130 npx playwright test tests/e2e/m9-calendar-connect.spec.ts tests/e2e/fabricated-fallbacks.spec.ts
  ✓ 1..7  (fabricated-fallbacks ×4, m9-calendar-connect ×3)
  7 passed (19.0s)
[after-run-1]  demo-tenant opportunities=5 | f10 residue: tenants=0 users=0 workspaces=0 opportunities=0 calendarConnections=0

$ (aynı komut, ikinci kez)
  7 passed (14.9s)
[after-run-2]  demo-tenant opportunities=5 | f10 residue: tenants=0 users=0 workspaces=0 opportunities=0 calendarConnections=0
```

Koşu çıktısında `[seed-f10-e2e] ready` ve `[seed-f10-e2e] rolled back` satırları
eşleşiyor — seed eden temizliyor. Sayım **iki koşudan sonra da 5**: kalıntı geri gelmiyor.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `docs/agent-results/TASK-MTS9CEDCWKQQK-backup.json` | **yeni** — silme öncesi yedek (geri dönüş yolu) |
| `scripts/task-mts9cedcwkqqk-audit.ts` | **yeni** — okuma-yalnız kimlik + bağlı satır + FK kuralı denetimi |
| `scripts/task-mts9cedcwkqqk-delete.ts` | **yeni** — iki id'lik, kimliği transaction içinde yeniden doğrulayan silme (`--confirm` gerektirir) |
| `docs/agent-results/TASK-MTS9CEDCWKQQK-screenshots/` | **yeni** — iki kare + canlı CSV |
| `docs/agent-results/TASK-MTS9CEDCWKQQK-customer-support.md` | **yeni** — bu rapor |
| `docs/agent-results/TASK-MTS80DUAF39Z8-customer-support.md` | **yeni** — eksik kalan önceki rapor |

**Ürün kodunda ve test kodunda değişiklik yok.** (e) maddesi zaten `2eadd84` ile
kapanmıştı; buradaki katkı doğrulama.

Veritabanında: `demo-tenant`'tan 2 `Opportunity` satırı silindi. Başka hiçbir tabloya,
hiçbir kiracıya dokunulmadı. Prod'a dokunulmadı — iş dev DB'sinde yapıldı.

---

## 4. Riskler

- **Yedek geri yükleme betiği yok**, yalnız JSON var. Bağlı satır olmadığı için geri alma
  iki `INSERT`; bir betik yazmak, kimsenin koşmayacağı bir betik daha üretmek olurdu.
- **`ConceptNote` ve `ProposalUsage` hâlâ FK'siz.** Bu sefer boştular. Bir dahaki fırsat
  silmede dolu olurlarsa sessizce yetim kalırlar — ve bunu kimse fark etmez, çünkü
  kısıtlama yok. Kapsam dışı, ama §5'te açık madde.
- Silme `demo-tenant`'ı **seed'in ürettiği hâle** geri getirdi; `pnpm db:seed` yeniden
  koşarsa bu beş satır zaten idempotent id'lerle korunur.

---

## 5. Açık sorular

### 5.1 Kartın "Eşik Üstü Oranı %20.0 yerine %14.3" ifadesi yanlış kutucuğu gösteriyor

Kalıntının etkisi gerçekti, ama **panonun "Eşik Üstü Oranı" kutucuğunda değil**:

- `src/modules/m5/server/queries.ts:192` → `thresholdRate(aboveThresholdProposals,
  submittedProposalsInRange)`. Paydası **gönderilmiş teklifler**, fırsatlar değil.
  Silinen iki satırın hiç `Proposal`'ı yoktu (§1c'de ölçüldü: `Proposal 0 row(s)`),
  dolayısıyla bu kutucuğu ne önce ne sonra etkilediler. Ölçüm:
  `above=1 / submitted=2 → %50,0` — silme öncesi de sonrası da aynı. Karedeki `50,0`
  bir hata değil, kutucuğun kendi tanımı.
- `%20.0 ↔ %14.3` olan figür, **dışa aktarımın `Başarı Oranı` satırı**:
  `above / fırsat sayısı` = `1/5 = %20.0`, kalıntı varken `1/7 = %14.3`. Bu satır
  gerçekten düzeldi ve kanıtı §2.2'de.

Yani iş doğru yapıldı; kartın metnindeki etiket düzeltilmeli ki bir sonraki okuyan
"Eşik Üstü Oranı hâlâ %50, iş yarım kalmış" diye okumasın.

### 5.2 Yol üstünde görülen, DÜZELTİLMEYEN kusurlar (kural gereği bildiriliyor)

1. **`ConceptNote.opportunityId` ve `ProposalUsage.opportunityId` yabancı anahtar
   taşımıyor** (`prisma/schema.prisma`, `model ConceptNote` / `model ProposalUsage`).
   Bir `Opportunity` silindiğinde bu iki tablo yetim satır bırakır ve veritabanı bunu
   engellemez. CLAUDE.md'nin "her yeni tabloda ilişki + RLS" disiplinine göre bu bir açık.
   Dokunmadım: şema + migration işi, bu kartın kapsamı dışında.
2. **`SystemAlert` tablosunda düzeltme öncesinden kalma 7 yinelenen satır var.**
   Ayrı işin (TASK-MTS80DUAF39Z8) açık maddesi, orada da yazıldı.
3. **`pnpm dev` başlangıcında `i18n check` sessizce düşüyor:**
   `⚠️ Could not run i18n check: Command failed: tsx scripts/i18n-check.ts`.
   Dev sunucusu yine de kalkıyor, yani kimse fark etmiyor — ama i18n kapısı fiilen
   koşmuyor. Benim dosyam değil, dokunmadım.

---

## 6. Sonraki adım

- Kartın metnindeki "Eşik Üstü Oranı" ifadesini "dışa aktarımdaki Başarı Oranı" olarak
  düzeltmek (§5.1) — yoksa aynı yanlış okuma tekrar eder.
- `ConceptNote` / `ProposalUsage` için FK + `onDelete` kararı (§5.2.1).
- `scripts/task-mts9cedcwkqqk-*.ts` iki betik tek seferlikti; denetim izi olarak
  bırakıldı, sürekli bir araç değiller. Bir sonraki temizlikte silinebilirler.

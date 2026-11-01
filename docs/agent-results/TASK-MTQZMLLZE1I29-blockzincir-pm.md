# TASK-MTQZMLLZE1I29 — `evaluateGate()` kiracı filtresi

**Ajan:** blockzincir-pm (PM) · **Sprint:** S11 · **Branch:** `dev` · **Tarih:** 2026-09-07

---

## 1. Ne yapıldı

`src/lib/gates/evaluate.ts` fırsatı `findUnique({ where: { id } })` ile — kiracı şartı olmadan —
okuyor, sonra kendisine verilen `tenantId` ile `GateDecision` yazıyordu. Bugüne kadar güvenliydi,
çünkü tek çağıran (`pipeline/actions.ts`) sahiplik kontrolünü kendisi yapıyordu; koruma çağıranın
hafızasındaydı, motorun kendisinde değildi.

Turda ayrıca **ikinci ve daha ağır bir kusur** çıktı: geçen kapıda çalışan
`prisma.opportunity.update({ where: { id }, data: { stage } })` de kiracı şartsızdı. Bu bir okuma
değil **yazma**: tahmin edilen bir id ile başka kiracının fırsatının **aşaması ilerletiliyordu**.
Alt görev metni yalnız okumayı işaret ediyordu; yazma yolu da aynı turda kapatıldı.

### Yapılan değişiklikler

| # | Değişiklik | Neden |
|---|---|---|
| 1 | Fırsat okuması `findFirst({ where: { id, tenantId } })` | CLAUDE.md §1 — sorgu kiracıya kapsanır |
| 2 | Tüm gövde `withTenant(tenantId, …)` içine alındı | `app.tenant_id` set edilir → RLS **veritabanı katmanında** da uygular; ifade-bazlı `tenantId` şartı RLS'ten muaf rol (yerel `fabrika` SUPERUSER) için ikinci kilit olarak kalır |
| 3 | `opportunity.update` → `updateMany({ where: { id, tenantId } })` | Çapraz kiracı **yazması** kapatıldı |
| 4 | Yeni `GateOpportunityNotFoundError` (export) | Sessiz `null`/0 puan yerine **açık hata**. Tek mesaj hem "yok" hem "senin değil" için — "var ama senin değil" demek, tahmin edilen bir id'nin sistemde canlı olduğunu doğrulardı |
| 5 | `seats` ve `evaluations` ilişkileri `where: { tenantId }` ile filtrelendi | Yanlış üst-kayda bağlanmış bir satır kapı sonucunu değiştirmemeli (başka kiracının damgasını taşıyan OPEN bir koltuk G2'yi düşürürdü) |
| 6 | Kullanılmayan `proposal: true` include'u kaldırıldı | Fonksiyonda hiç okunmuyordu — gereksiz kiracı verisi okuması |
| 7 | `pipeline/actions.ts` yorumu güncellendi (YALNIZ yorum, kod değil) | Artık "tek koruma" değil "ikinci katman"; çağıranın kontrolü savunma katmanı olarak KALDI |

`evaluateGate` imzası değişmedi — çağıran tarafta kod değişikliği gerekmiyor.

### Yapı notu
Gövde `withTenant` closure'ına gömülmek yerine üst düzey `runGate(tx, …)` fonksiyonuna alındı;
böylece 130 satırlık kapı mantığının girintisi değişmedi ve diff okunabilir kaldı.

---

## 2. Kanıt

### 2.1 Birim test — çapraz kiracı çağrısı (mock)

`tests/gates.test.ts`'e 5 yeni test. Mock'taki `findUnique` **bilerek kiracı şartını yok sayar**,
böylece eski koda dönen bir regresyon burada da üretimdeki gibi başka kiracının satırını okur.

Düzeltilmiş kod (GREEN):
```
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

**RED kontrolü** — `findFirst`→`findUnique` ve `updateMany`→`update` geçici olarak geri alınınca:
```
     × refuses an opportunity id belonging to another tenant 4ms
     × the refusal is an error, never a silent null or a zero score 1ms
     × files no GateDecision and moves no stage on a cross-tenant call 0ms
     × the error does not disclose that the id exists under another tenant 0ms
     × the passing stage update is tenant-scoped, not update-by-id 0ms
 Test Files  1 failed (1)
      Tests  5 failed | 7 passed (12)
```
5 testin 5'i eski koda karşı düşüyor → test gerçekten kusuru ölçüyor.

### 2.2 Gerçek veritabanı — çapraz kiracı (en güçlü kanıt)

`tests/e2e/gate-tenant-isolation.spec.ts` · fixture: `scripts/seed-gate-e2e.ts` (A ve B kiracıları,
her birinde gerçek bir `Opportunity` + CONFIRMED koltuk). Test önce B'nin **var olduğunu** doğrular
(yoksa "bulunamadı" cevabı hiçbir şey kanıtlamaz), sonra A'nın `tenantId`'siyle B'nin id'sini çağırır.

**Eski kod, gerçek Postgres'e karşı:**
```
  ✘  tenant A cannot gate tenant B’s opportunity, against the real database (25ms)
    Error: expect(received).rejects.toBeInstanceOf()
    Resolved to value: {"passed": true, "reasons": []}
```
→ A kiracısı, B kiracısının fırsatını **değerlendirdi ve geçirdi**. Kusur teorik değildi.

**Düzeltilmiş kod:**
```
  ✓  1 › tenant A can still run its own gate, and the decision is filed (1.8s)
  ✓  2 › tenant A cannot gate tenant B’s opportunity, against the real database (28ms)
  2 passed (3.1s)
```

### 2.3 Gerçek tarayıcı — mutlu yol bozulmadı

Gerçek Chromium, gerçek giriş, gerçek tıklama (`/tr/gate-e2e-ws-a/pipeline/gate-e2e-opportunity-a`):

- `docs/agent-results/TASK-MTQZMLLZE1I29-screenshots/01-detail-before-gate.png`
- `docs/agent-results/TASK-MTQZMLLZE1I29-screenshots/02-detail-after-gate.png`
  → yeşil bant **"G2 kapısı geçildi."**, sağ üstte oturum "Gate E2E Owner"

Ekrandaki bant iddia değil; test tıklamadan sonra satırı **doğrudan Postgres'ten** okur:
`GateDecision.tenantId === gate-e2e-tenant-a`, `gate === 'G2'`, `passed === true`.

### 2.4 `pnpm gate` (lint + typecheck + test + rls:check + rls:verify)

```
✖ 194 problems (0 errors, 194 warnings)      ← 0 hata (uyarılar mevcut taban)
$ tsc --noEmit                                ← temiz
 Test Files  58 passed | 2 skipped (60)
      Tests  580 passed | 8 skipped (588)
✅ SUCCESS: All 38 tenant-scoped models have RLS policies registered.
✅ Veritabanı 38 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```
DB'yi sıfırlayan/migrate eden komut **çalıştırılmadı**; `db:rls` / `db:rls-role` gerekmedi.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/gates/evaluate.ts` | Kiracı kapsaması, `withTenant`, `updateMany`, `GateOpportunityNotFoundError` |
| `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts` | **Yalnız yorum bloğu** (satır 366-372) — kod değişikliği yok |
| `tests/gates.test.ts` | `withTenant` mock'u + 5 çapraz-kiracı testi |
| `tests/e2e/gate-tenant-isolation.spec.ts` | **YENİ** — tarayıcı mutlu yolu + gerçek-DB izolasyon testi |
| `scripts/seed-gate-e2e.ts` | **YENİ** — iki kiracılı fixture (idempotent + `--rollback`) |
| `docs/agent-results/TASK-MTQZMLLZE1I29-screenshots/` | **YENİ** — 2 ekran görüntüsü |

---

## 4. Arşiv (`deletedAt`) × kapı — KARAR

**Karar: `evaluateGate` `deletedAt`'i FİLTRELEMEZ. Kararı çağıran verir. Kod değişikliği yok.**

Gerekçe:

1. **Kapı çalıştırmak bir denetim olayıdır, içerik düzenlemesi değil.** Arşivlenmiş bir fırsat için
   halihazırda dosyalanmış bir `GateDecision`'ın hâlâ açıklanabilir olması gerekir. Motora kör bir
   `deletedAt: null` koymak, geçmiş kararın gerekçesini yeniden üretmeyi imkânsız kılar.
2. **"Arşivlenmiş bir fırsat YENİDEN kapıdan geçirilebilir mi" bir ürün kuralıdır**, motor kuralı
   değil. Kullanıcının, düğmenin ve mesajın olduğu yer çağırandır; cevabı orada vermek gerekir.
   Motora gömülürse her çağıran aynı ürün kararına mahkûm olur.
3. **Bugün zaten kapalı:** `evaluateOpportunityGate` sahiplik kontrolünde `deletedAt: null`
   kullanıyor → arşivlenmiş fırsatta düğme `OPPORTUNITY_NOT_FOUND` döner. Davranış değişmedi.

**geli-tirici'ye (paralel arşivleme işi) tavsiye — kod dayatmıyorum:** arşiv düğmesi eklenirken
kapı düğmesi arşivlenmiş fırsatta **gizlensin** (bugün var ama basılınca reddediyor — "her zaman
reddeden bir kontrolü göstermek kendi başına bir kusurdur", ki `page.tsx`'te `canArchive` için
zaten uygulanan ilke bu). Ürün gereksinimi olarak: *arşivlenmiş bir fırsat yeni kapı kararı
üretemez; mevcut kararları okunabilir kalır.*

---

## 5. Riskler

| Risk | Değerlendirme |
|---|---|
| `withTenant` bir `$transaction` açar; G0 yolunda ~10 okuma var | Gerçek tarayıcı turunda kapı 1.8 sn'de tamamlandı, Prisma'nın 5 sn'lik interaktif işlem sınırının çok altında. G0'ın kanıt okuması ağırlaşırsa yeniden ölçülmeli. |
| `evaluateGate` artık `throw` ediyor (eskiden de ediyordu, ama artık tipli) | Tek çağıran zaten `try/catch` içinde ve `GATE_EVALUATION_FAILED` döndürüyor → kullanıcıya ham hata sızmıyor. |
| `seats`/`evaluations` üzerindeki yeni `tenantId` filtresi | Veriler doğruysa sonuç aynı; yanlış üst-kayda bağlı bir satır varsa artık kapı sonucunu **değiştiremez** (istenen davranış). |
| Paralel ajan yarışı | Tur sırasında `pipeline/[id]/page.tsx` başka bir ajanın yarım işi yüzünden `ARCHIVE_ROLES is not defined` ile çöktü; ajan düzeltince e2e geçti. Benim dosyalarımla ilgisi yok. |

---

## 6. Açık sorular

1. **`GateOpportunityNotFoundError` çağırana çevrilmeli mi?** Bugün `evaluateOpportunityGate`
   bunu `GATE_EVALUATION_FAILED`'e düşürüyor; kendi ön kontrolü zaten `OPPORTUNITY_NOT_FOUND`
   döndürdüğü için gerçekçi yolda fark yok. Yine de motorun hatasını ayrı eşlemek daha dürüst
   olurdu — `actions.ts`'in kodu bu turda bana kapalıydı (geli-tirici'de), takip işi.
2. **i18n açığı (benim işim değil, gözlemlendi):** `02-detail-after-gate.png`'de arşiv düğmesi ham
   anahtar `Pipeline.detail.archive.action` olarak görünüyor → `messages/tr.json`'da karşılığı yok.
   geli-tirici'nin arşivleme işine ait; CLAUDE.md §8 ihlali olarak raporluyorum.
3. **G4 zaman kuralı** hâlâ uygulanmıyor (`DEFAULT_GATE_RULES.G4.minHoursBeforeDeadline` okunmuyor)
   — TASK-MTQ60SGW45T0X'te kaydedilmiş, bu turun kapsamında değil.

---

## 7. Sonraki adım

- geli-tirici: arşivlenmiş fırsatta kapı düğmesini gizle (§4 kararı) + eksik i18n anahtarı (§6.2).
- Lead: §6.1'i küçük bir takip görevi olarak açmaya değer mi karar versin.
- `evaluateGate`'e üçüncü bir çağıran eklendiğinde artık ek koruma gerekmiyor — motor kendi
  kiracı filtresini taşıyor.

## Definition of Done

- [x] Tüm okumalar tenant-scoped (`findFirst` + `tenantId`, ilişkiler dahil, `withTenant` içinde)
- [x] **Bonus:** aşama yazması da tenant-scoped (`updateMany`) — çapraz kiracı YAZMASI kapatıldı
- [x] Çapraz kiracı çağrısı hata veriyor — birim test (5 test, RED kontrolü yapıldı)
- [x] Çapraz kiracı çağrısı hata veriyor — **gerçek Postgres** (eski kod `{passed:true}` dönüyordu)
- [x] Mutlu yol bozulmadı — gerçek tarayıcı + ekran görüntüsü + DB'den okunan `GateDecision`
- [x] Arşiv/kapı etkileşimi kararı yazıldı (§4)
- [x] `pnpm gate` temiz (0 lint hatası, typecheck temiz, 580 test, rls:check ✅, rls:verify ✅)
- [x] Geçici script/probe dosyası bırakılmadı (seed script kalıcı ve `--rollback` destekli)

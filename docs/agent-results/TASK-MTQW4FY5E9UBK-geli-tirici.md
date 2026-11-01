# TASK-MTQW4FY5E9UBK + TASK-MTQW6CI3N76EF — Pipeline: gerçek G0 puanı, gerçek kapı düğmesi, tek kart

**Ajan:** geli-tirici (BE-EN, Backend Mühendisi) · **Tip:** bug (P0) · **Sprint:** S10 · **Branch:** `dev`
**Kapsam:** `pipeline/**` + fırsat yaratma akışı · **Tarih:** 2026-09-07
**Ekran görüntüleri:** `docs/agent-results/TASK-MTQW4FY5E9UBK-screenshots/`

---

## 0. Tek cümlelik sonuç

Fırsat detay sayfası artık **kanonik skorlayıcının** ürettiği puanı gösteriyor (sabit 92 gitti),
"Kapıyı Değerlendir" düğmesi **gerçek `evaluateGate()`'i** çağırıp sonucu sayfa içinde `role="alert"`
bandında gösteriyor (iki `alert()` gitti), ve bir fırsat yaratmak panoda **tek kart** üretiyor
(silinen fırsat da hayalet bırakmıyor).

---

## 1. Ne yapıldı

### 1.1 Sabit 92/100 → gerçek puan (F1)

`pipeline/[id]/page.tsx` bir client component'ti ve tüm içeriğini `getOpportunity()` adlı bir
mock'tan alıyordu: sabit başlık, sabit `HORIZON-CL5-2026-09-D4-01` topic'i ve `g0Score: 92`.
URL'e ne yazılırsa yazılsın aynı fırsat ve aynı 92/100 çiziliyordu.

Şimdi:
- `page.tsx` **server component**: `requireTenantPage(locale)` → `withTenant(tenantId, …)` içinde
  `findFirst({ where: { id, tenantId, deletedAt: null } })` (kiracı-kapsamlı; tahmin edilebilir id
  ile `findUnique` yok) ve aynı transaction içinde `computeG0ForOpportunity(tx, tenantId, id)`.
  Skorlayıcı **yeniden yazılmadı, çağrıldı**.
- Sayfa görünümü `pipeline/[id]/client.tsx`'e taşındı (yeni dosya): puan, eşik (70/100), kanıt
  kapsamı (`ölçülen/toplam ölçüt`), `GO/NO_GO` ön kararı ve skorlayıcının gerekçeleri.
- Render **hiçbir şey yazmıyor** (GET'te yan etki yok); yazma yalnız kapı düğmesinde.
- Puan hesaplanamıyorsa (kanıt yok → skorlayıcı `null` döner) ekran **"Hesaplanamadı"** + neden
  yazıyor. 0 da uydurmuyor, 92 de.
- Her iki durumda da "İç ön değerlendirme — resmî puan değildir." etiketi görünür (CLAUDE.md "Yapma").

### 1.2 `alert()` tiyatrosu → gerçek kapı (F3)

Eski kod (23-25. satır): `alert('Evaluating Gate G0…')` → 1 sn `setTimeout` → `alert('Evaluation
passed! Moving to G1.')`. Hiçbir kural okunmadan "geçti" deniyordu.

Şimdi `pipeline/actions.ts` içinde yeni server action `evaluateOpportunityGate({opportunityId, gate})`:
- tenant **oturumdan** gelir (tarayıcıdan değil),
- `evaluateGate()` `findUnique({where:{id}})` ile **tenant filtresi olmadan** okuduğu için, action
  önce `withTenant` içinde sahiplik doğrular; aksi halde başka kiracının id'si tahmin edilip bu
  kiracı adına `GateDecision` yazdırılabilirdi,
- sonuç `{passed, reasons}` olarak döner; UI bunu `role="alert"` bandında gösterir — hata bandı
  kardeş ekran `opportunities/[id]/evaluations/client.tsx:204-213` ile **birebir aynı sınıflar**
  (`rounded-xl border border-rose-300 bg-rose-50 …` + `AlertTriangle`), geçme durumu aynı bandın
  emerald varyantı,
- ham sürücü hatası tarayıcıya gitmez: kod (`GATE_EVALUATION_FAILED` vb.) döner, metin `t()`'den gelir,
- sonrasında `router.refresh()` — kapı puanı ve (geçtiyse) aşamayı yazdığı için sayfa sunucudan tazelenir.

### 1.3 Çift kart + hayalet kart (F4)

Kök neden (dogfood raporuyla aynı teşhis, doğrulandı): `createOpportunity` `addInMemoryOpportunity`'yi
**koşulsuz** çağırıyordu — DB yazımı başarısız olduğunda değil, her seferinde. Bellek satırının id'si
`opp-<timestamp>`, Prisma'nınki cuid; `pipeline/page.tsx` iki listeyi **id'ye göre** birleştirdiği
için ids asla eşleşmiyor ve her fırsat iki kez çiziliyordu. Aynı bellek kopyası, DB'den silinen
fırsatın kartını da çizmeye devam ediyordu.

Şimdi:
- bellek satırı **hazırlanır ama yazılmaz**; DB `create` başarılıysa board'a **DB satırı** (cuid
  dahil) döner, bellek deposuna hiç dokunulmaz,
- bellek deposu yalnız DB satırı reddettiğinde yazılır — `pipelineStore`'un kendi dokümantasyonunda
  yazdığı rol ("veritabanı kesintisi yedeği") bu,
- `updateInMemoryOpportunityScore` çağrısı gereksizleşti (bellek satırı yok), import kaldırıldı,
- ek olarak pano sorgusuna `deletedAt: null` eklendi: soft-delete edilmiş (KVKK/GDPR silme) bir
  fırsat panodan **düşer**; detay sayfası da 404 verir.

### 1.4 i18n

Detay ekranındaki tüm metin `t('Pipeline.detail.*')`. 20 anahtar **hem `messages/tr.json` hem
`messages/en.json`**'a eklendi (hata mesajları dahil). Sabit kullanıcı metni yok.

---

## 2. Kanıt (gerçek tıklama, `pnpm dev` :3000, dev Postgres, `alice@fabrika.test` / demo-tenant)

### 2.1 Ekrandaki puan = skorlayıcı çıktısı

İlk açılış (kanıt tabloları henüz boşken) — ekran **18/100**, DB `Opportunity.g0Score = 18`:
`01-real-g0-score-18.png`

```
G0 PUANI  18/100
Eşik: 70/100 · Kanıt: 3/9 ölçüt ölçüldü
Ön değerlendirme: GEÇME (NO_GO)
PUAN GEREKÇELERİ: composite score 18.00 < 70 / alignment 0.00 < 70 / base rate 0% < 8%
```

Test sırasında **paralel bir ajan kanıt tablolarını seed'ledi** (TopicMatch fitScore, TopicStat
successRate, ConsortiumSeat). Puan buna göre değişti — ve ekran değişimi **takip etti**; bu, sayfanın
gerçekten skorlayıcıyı okuduğunun en güçlü kanıtı oldu. Aynı andaki SQL ve ekran:

```
$ psql -c "select id, stage, \"g0Score\" from \"Opportunity\" where id='demo-opp-1';"
     id     | stage | g0Score
 demo-opp-1 | G0    |   71.95

$ psql -c "select gate,passed,\"decidedBy\",inputs->>'calculatedG0Score' calc,
           round((inputs->'g0Evidence'->>'coverage')::numeric,2) coverage
           from \"GateDecision\" where \"opportunityId\"='demo-opp-1' order by \"decidedAt\" desc limit 2;"
 gate | passed |      decidedBy      | calc  | coverage
 G0   | t      | demo-user-alice     | 71.95 |     0.75     ← düğmeye BASINCA yazıldı
 G0   | f      | verification-script | 18    |     0.18     ← önceki turun script'i
```

Ekran (`02-score-matches-gatedecision-7195.png`): `71.95/100 · Eşik: 70/100 · Kanıt: 7/9 ölçüt
ölçüldü · Ön değerlendirme: GEÇ (GO)` — **7/9 ölçüt = coverage 0.75**, puan birebir aynı.

`en` locale (`08-en-locale.png`, demo-opp-3): `62.65/100 · Threshold: 70/100 · Evidence: 7/9 criteria
measured · Pre-assessment: NO_GO`; DB: `demo-opp-3 → 62.65`. Türkçe sızıntı yok.

### 2.2 Kapı düğmesi gerçekten çalışıyor

- **GEÇTİ** (`03-gate-pass-band.png`): demo-opp-1, yeşil `role="alert"` bandı "G0 kapısı geçildi."
  → DB'de yeni `GateDecision(passed=t, decidedBy=demo-user-alice, calc=71.95)`.
- **GEÇMEDİ** (`05-gate-fail-band-no-evidence.png`): kanıtsız yeni fırsat, kırmızı bant
  "G0 kapısı geçilmedi." + gerçek gerekçe `G0 score could not be calculated: no scoring evidence for
  this opportunity yet` → DB:

```
 gate | passed |    decidedBy    |        decidedAt        | calc
 G0   | f      | demo-user-alice | 2026-09-07 08:19:22.824 | (null)
```

Bu, `evaluateGate()`'in **uygulama kodundan ilk kez** çağrıldığı kayıt (önceki tüm satırlar
`decidedBy=verification-script`, yani script'ten).

### 2.3 Tek kart

`calls/[id]` → "Fırsatlara / Pipet'e Ekle" (fırsat yaratmanın ikinci giriş noktası) → panoya dönüş:

```
DB: 1 satır — cmtqyyhty0012z5xk5o79u51e | İklim Modellemesi… | topicId TASK-MTQW4FY5E9UBK | g0Score (null)
Pano G0 sütunu: 2  → yeni fırsat 1 kez + demo-opp-1 (04-single-card-after-create.png)
```

Düzeltmeden önce aynı akış G0'ı **3'e** çıkarıyor, aynı başlığı iki kez çiziyordu. Puan rozeti de
görünmüyor — `g0Score = null` olduğu için uydurma rakam basılmıyor.

### 2.4 Hayalet kart yok

```
$ psql -c "update \"Opportunity\" set \"deletedAt\"=now() where id='cmtqyyhty0012z5xk5o79u51e' …"
UPDATE 1
```

Pano yenilendi → kart **kayboldu**, G0 tekrar 1 (`06-no-ghost-after-delete.png`).
Detay sayfası da **404** verdi. Uydurma id (`/pipeline/uydurma-id-12345`) de artık 404
(`07-fake-id-now-404.png`) — eskiden 92/100'lük sahte bir fırsat gösteriyordu.

### 2.5 Kapılar

```
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok — temiz)

$ pnpm lint
✖ 201 problems (0 errors, 201 warnings)      ← 0 hata; yeni dosyalarım 0 uyarı üretiyor

$ pnpm test
 Test Files  56 passed | 2 skipped (58)
      Tests  537 passed | 8 skipped (545)

$ grep -rn "alert(" pipeline/[id]/page.tsx pipeline/[id]/client.tsx
(yalnız yorum satırlarında "eskiden alert() vardı" açıklaması; gerçek çağrı 0)
```

### 2.6 Test verisi temizliği

```
before_total 6 → DELETE 1 → after_total 5      (demo-tenant yine 5 seed fırsatı)
orphan_decisions 0                              (GateDecision cascade ile gitti)
```

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/app/[locale]/(app)/[workspace]/pipeline/[id]/page.tsx` | mock client component → kiracı-kapsamlı server component; skoru `computeG0ForOpportunity` ile hesaplar |
| `src/app/[locale]/(app)/[workspace]/pipeline/[id]/client.tsx` | **yeni** — sekmeler, kapı düğmesi, `role="alert"` sonuç bandı, puan/kapsam/karar kartı |
| `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts` | `createOpportunity` tek satır döndürür (bellek yalnız DB hatasında); yeni `evaluateOpportunityGate` server action |
| `src/app/[locale]/(app)/[workspace]/pipeline/page.tsx` | pano sorgusuna `deletedAt: null`; birleştirme yorumu güncellendi |
| `messages/tr.json`, `messages/en.json` | `Pipeline.detail.*` — 20 anahtar × 2 dil |

---

## 4. Riskler

1. **`evaluateGate()` hâlâ kiracı filtresiz okuyor.** `src/lib/gates/evaluate.ts` bu dalgada bana ait
   değil; sahiplik doğrulaması benim action'ımda yapıldı. Gate engine'e ikinci bir çağıran eklenirse
   aynı kontrolü tekrarlamak zorunda — kalıcı çözüm filtrenin engine'in içine girmesi. **Kart açılmalı.**
2. **Kapı G0'ı yeniden yazar.** `evaluateGate` → `persistG0` çağırdığı için düğmeye basmak
   `Opportunity.g0Score`'u günceller. Beklenen davranış, ama benim testim demo-opp-1'i 18 → 71.95
   yaptı (o an geçerli kanıtla tutarlı, veri kaybı yok). Raporluyorum ki "neden değişti" sorulmasın.
3. **Puan kanıt seed'ine bağlı.** Ekran doğru çalışıyor; gösterdiği sayı kanıt tabloları
   doldukça değişir. Bu bir hata değil, ama demo verisi değiştikçe ekran görüntüleri eskir.
4. **`calls/[id]/page.tsx`'te bir `alert()` kaldı** (fırsat ekleme *hata* yolu) ve o dosya baştan sona
   `isTr ? '…' : '…'` deseniyle yazılmış. Tiyatro değil gerçek hata bildirimi olduğu ve dosyanın
   tamamı i18n dönüşümü istediği için scope'a sadık kalıp dokunmadım. **Ayrı kart.**
5. **Paralel ajan yarışı:** `messages/*.json` bu turda başka bir ajan tarafından da düzenlendi ve
   `git add` ile stage'lenmişti. Kendi anahtarlarımın hem çalışma ağacında hem stage'de var olduğunu
   commit öncesi doğruladım (aşağıdaki commit çıktısı).
6. Panodaki **kart formu ile fırsat yaratmayı tarayıcıdan doğrulayamadım**: gömülü tarayıcının `type`
   eylemi React state'ini tetiklemediği için "Fırsatı Oluştur & Ata" düğmesi `disabled` kaldı. Aynı
   `createOpportunity` server action'ını `calls/[id]` yolundan gerçek tıklamayla doğruladım (§2.3) —
   düzeltme action'ın içinde, iki giriş noktası da aynı kodu çağırıyor.

---

## 5. Açık sorular

1. **Eşik hangisi?** Ekran `DEFAULT_GATE_RULES.G0.minScore = 70`'i yazıyor ve kapı da onu uyguluyor;
   PROJECT.md:75'in sert kuralları vs. composite ≥ 70 tartışması (`docs/ROADMAP.md` Açık kararlar #8)
   hâlâ açık. Karar değişirse ekrandaki "Eşik: 70/100" tek satırda güncellenir.
2. **T-6 Görevleri sekmesi hâlâ şablon.** Gerçek göreve bağlı değil; yeni metin bunu açıkça söylüyor
   ("Bu adımlar bir şablondur; henüz gerçek görevlere bağlı değildir") ama sahte "tamamlandı" kutuları
   kaldırıldı. Gerçek T-6 planı ayrı bir iş.
3. **Efor Kaydı sekmesi hâlâ mock** (`effort.tsx`, ayrı dosya, bu görevin DoD'unda yok).

---

## 6. Sonraki adım

1. Kart: `evaluateGate()` içine kiracı filtresi (`findFirst({where:{id, tenantId}})`).
2. Kart: `calls/[id]/page.tsx` → `t()` + `alert()` yerine sayfa içi hata bandı.
3. Kart: `pipeline/[id]/effort.tsx` gerçek `Effort` tablosuna bağlansın.
4. Kart: fırsat için gerçek bir **silme** akışı yok (soft-delete alanı şemada var, UI'da yok);
   "silinen fırsat" bugün ancak SQL'den siliniyor.

---

## Definition of Done

- [x] Ekrandaki puan = skorlayıcı çıktısı (18/100 ve 71.95/100 iki ayrı anda SQL ile eşleşti)
- [x] `alert(` bu iki dosyada 0 (yalnız açıklayıcı yorumlarda geçiyor)
- [x] Tek kart / hayalet yok (gerçek tıklama + SQL sayımı)
- [x] Kapı düğmesi gerçek `evaluateGate()`'i çağırıyor, sonuç `role="alert"` bandında
- [x] Puan hesaplanamadığında "Hesaplanamadı + kanıt eksik" (0 ya da 92 uydurulmuyor)
- [x] `pnpm lint` 0 hata · `pnpm typecheck` temiz · `pnpm test` 537 passed
- [x] Yeni metinlerin tamamı `t()`, anahtarlar tr + en
- [x] Geçici script yazılmadı; test verisi silindi (6 → 5)

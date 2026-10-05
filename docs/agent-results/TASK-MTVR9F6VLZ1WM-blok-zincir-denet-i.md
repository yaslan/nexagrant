# TASK-MTVR9F6VLZ1WM — m6 scoring NaN (A: fixed) + G3 on an empty evaluation list (B: measured, not touched)

**Platform beyanı: macOS (Darwin 25.6.0, zsh, yerel Node 26.5 + pnpm, yerel Postgres).**
Windows/Linux **koşulmadı** — gerekçe ve koddan çıkarım §7'de.

İki parça, iki farklı iş. **A** bir hata: düzeltildi, kırmızı→yeşil kanıtı aşağıda.
**B** bir ürün sorusu: ölçüldü, `src/lib/gates/evaluate.ts`'e **dokunulmadı** (boş `git diff` kanıtı §2-B0).

---

## 1) Ne yapıldı

### A — `src/modules/m6/server/scoring.ts`: marksız değerlendirici artık masada değil

**NaN kullanıcıya "NaN" olarak ulaşmıyor — ondan daha kötüsü oluyor.** Ölçtüm: boş `scores`
nesnesi olan bir değerlendiricinin ortalaması `0/0 = NaN`, ama `Math.abs(NaN - x) <= 1`
sadece `false` döner. Yani NaN yutulmuyor da değil, **makul görünen yanlış bir sayıya
dönüşüyor**: hiç oy vermemiş kişi "kimseyle anlaşmayan" biri olarak sayılıyor.

Fix öncesi ölçüm (§2-A1): oy birliğiyle 5 veren iki kişilik panel + bir marksız kişi →
`{"outcome":"divergent","agreementPercentage":33.33}`. Tek gerçek oy + bir marksız kişi →
`{"outcome":"divergent","agreementPercentage":0}` — yani "iki kişi baktı ve anlaşamadı"
iddiası, tek kişinin oy verdiği bir panel hakkında. Bu, dosyanın `not-measured` sonucunu
eklerken kapattığı uydurma iddianın ta kendisi, bir katman aşağıda.

**İkinci, ayrı bir kullanıcıya-görünür kusur:** herkesin boş olduğu bir kadro erken dönüşü
atlayıp ağırlık döngüsüne düşüyor, `weightSum === 0` çıkıyor ve panoya
`unmeasuredReason: 'no-weighted-criterion'` diyor — yani "marklar var ama ağırlıksız
eksenlere düşüyor" — hiç mark yokken. Panonun `NotMeasured` bileşeni bu iki yokluğu
ayrı ayrı adlandırıyor (`EvaluationDashboard.tsx:34-36`), dolayısıyla yanlış olan **ekrandaki
cümle**.

**Karar: boş skorlu değerlendirici hesaba hiç KATILMAZ (0 sayılmaz).** Gerekçe:

1. **0 skalanın dışında.** Mark 1..5. Dosya bu argümanı zaten kendi içinde kurmuş
   (`scoring.ts` panelAverage yorumu: *"A panel is scored 1..5, so 0 is not a low score —
   it is outside the scale"*). 0 saymak, oy birliğiyle 5 alan bir paneli `divergent`
   yapardı — bugünkü hatanın aynısını, bu sefer kasıtlı olarak.
2. **Kural yeni değil, sadece yanlış yerde duruyordu.** `getPanelScoresForProposal`
   (`scoring.ts:335`) zaten `.filter((r) => Object.keys(r.scores).length > 0)` yapıyor.
   Yani modülün kendi okuma yolu "marksız değerlendirici masada değildir" diyor; dışa
   açık fonksiyonlar bunu bilmiyordu. Kuralı fonksiyonun içine taşımak iki yolu
   **aynı fikirde** yapar; her çağıranın hatırlamasına bırakmaz.
3. **CLAUDE.md §7.** Kullanıcıya gösterilen her oran bir kayda bağlı. Boş `scores` =
   hiç `Score` satırı yok. O kayıtsız kişiden "herkesle anlaşmıyor" sonucu türetmek
   kanıt imal etmektir.
4. **"Hiç mark yok" ile "hiç göndermemiş" aynı durumdur.** Bu yüzden hepsi boşsa yanıt
   `no-submitted-marks` — boş kadronun verdiği yanıtın aynısı.

Değişen davranış (tamamı §2-A3'te ölçülü): `calculateConsensusOutcome` ve
`calculatePanelScore` kadroyu `hasSubmittedMarks` ile süzer; `reviewerCount` artık
**gerçekten marklamış** kişileri sayar; hepsi boşsa `no-submitted-marks` + `not-measured`
+ `agreementPercentage: null`.

**Üretimde bugün ulaşılabilir mi? Hayır — ve bunu saklamıyorum.** Depodaki iki DB-destekli
çağıran da boş kadro üretemiyor: `getPanelScoresForProposal` yukarıdaki filtreyi
uyguluyor, `updateEvaluationScore` (`scoring.ts:~560`) kadroyu `Score` satırlarından
grupluyor, dolayısıyla her grup en az bir markla doğuyor. Kusur, **dışa açık (`export`)
bir fonksiyonun sözleşmesinde** yaşayan gizli bir kusur; üçüncü bir çağıran geldiğinde
panonun "Konsensüs" sütununda sessiz yanlış cevap olarak patlar. `agreementPercentage`
hiçbir yerde kullanıcıya basılmıyor (pano yalnız `consensusOutcome` etiketini gösteriyor,
`EvaluationDashboard.tsx:126-131`); m6 scoring hiçbir `Evidence`/`TopicStat` satırı
yazmıyor. Kullanıcıya bugün ulaşan tek yol `unmeasuredReason`'ın yanlış adlandırılması.

### B — `src/lib/gates/evaluate.ts` G3: boş değerlendirme listesinde `passed: true` (ÖLÇÜLDÜ, DEĞİŞTİRİLMEDİ)

İddiayı **çürütmeyi denedim, çürütemedim**: gerçek Postgres'e karşı gerçek `evaluateGate`
çağrısı `{"passed":true,"reasons":[]}` döndürdü ve `passed: true` bir `GateDecision`
satırı yazdı (§2-B1). "Kodu okudum" değil, canlı çağrı.

Çürütmeyi denediğim ikinci nokta **ulaşılabilirlikti** — "bu yalnız seed/demo'da olur" mu?
Hayır, o da çürüdü. Bir fırsat, hiç `Evaluation` satırı olmadan G3 aşamasına **iki ayrı
üründe-canlı yoldan** varıyor:

- Pipeline "yeni fırsat" formunda **"Başlangıç Kapısı"** seçicisi var ve `G3` seçeneğini
  sunuyor (`pipeline/board.tsx:817-824`); `createOpportunity` bunu doğrudan yazıyor
  (`pipeline/actions.ts:172`, `:230` — `stage: stage || 'G0'`).
- Panodan sürükle-bırak `moveOpportunityStage` aşamayı hiçbir kapı çalıştırmadan
  yazıyor (`pipeline/actions.ts:352-366` — `data: { stage: newStage }`).

Sonra detay ekranındaki tek buton **mevcut aşamayı** koşuyor
(`pipeline/[id]/client.tsx:87` — `gate: opportunity.stage`), yani G3'te duran fırsatta
"G3 kapısını değerlendir" → hiç değerlendirilmemiş teklif → yeşil.

**Patlama yarıçapı (ölçülen, tahmin değil):**

| Nereye | Ne oluyor | Kanıt |
|---|---|---|
| Ekran | `role="alert"` yeşil kutu: **"G3 kapısı geçildi."**, gerekçe listesi boş | `client.tsx:249-268`, `messages/tr.json:114` |
| Denetim kaydı | `GateDecision{gate:G3, passed:true, inputs.mockEvaluation:true, evaluationsCount:0}` kalıcı yazılıyor | §2-B1 |
| Genel API | `/api/v1/opportunities` her fırsatın son 3 `GateDecision` satırını **olduğu gibi** dışarı veriyor — `passed:true` entegratöre gidiyor | `api/v1/opportunities/route.ts:49-52` |
| Aşama | **İlerlemiyor.** Buton mevcut aşamayı gönderdiği için fırsat zaten G3'te; `updateMany data:{stage:'G3'}` no-op | §2-B1 "stage AFTER -> G3" |
| M5 KPI | Etkilenmiyor — yalnız `G0`/`G2` kararlarını okuyor | `m5/server/queries.ts:146-152` |
| G4 | Etkilenmiyor — G3'ün geçmiş olmasına bakmıyor, yalnız `WITHDRAWN`/`REJECTED` statüsüne | `evaluate.ts:182-190` |

Yani zarar **aşama sıçraması değil**; zarar *kaydedilmiş bir "geçti" iddiası* ve onun
ekrana + genel API'ye çıkması. Boş liste "değerlendirilmedi" demek; bugünkü kod bunu
"değerlendirildi ve geçti" diye dosyalıyor.

**Bu davranış az önce testle sabitlendi:** `tests/gates.test.ts:343-353`
(*"an unevaluated opportunity is not scored at all, not scored as NaN"*) `mockEvaluation`
dalını ve `result.passed === true` sonucunu pinliyor. O testin **asıl** koruduğu şey doğru
(boş listeyi `Math.min(undefined,…)` → NaN'a sokmamak); `passed: true` ise o testin hedefi
değil, yanında taşıdığı bir yan-beyan. Bu ayrım önemli: kararı ne yönde verirseniz verin
o testin NaN koruması **kalmalı**.

#### İki seçenek yan yana

| | **Seçenek 1 — davranışı koru** | **Seçenek 2 — boş listede G3 kırmızı** |
|---|---|---|
| Ne değişir | Hiçbir şey | `else { inputs.mockEvaluation = true }` dalına `passed = false` + `reasons.push('No evaluation on file')` |
| Kullanıcı ne görür | "G3 kapısı geçildi." | "G3 kapısı geçilemedi — dosyada değerlendirme yok." |
| Denetim kaydı | Hiç değerlendirilmemiş teklif "geçti" olarak dosyalanır | Yokluk yokluk olarak dosyalanır |
| Kırılan | — | `tests/gates.test.ts:343` güncellenir; G3'te duran ve M6 kullanmayan kiracılar butonu artık kırmızı görür |
| Risk | Sessiz yanlış denetim izi, genel API'ye sızıyor | M6'yı hiç kullanmayan kiracı G3'ü elle geçemez hale gelir (G3 pilotta mı? `ModuleState` sorusu) |

**ÖNERİM: Seçenek 2 — ama `DEFAULT_GATE_RULES.G3`'e açık bir bayrakla, sessizce değil.**
Gerekçe: bu kod tabanının kendi yerleşik kuralı "yokluk 0 değildir, yokluk yokluktur" —
`m6/scoring.ts` bu uğurda `panelAverage: null` + `unmeasuredReason` çiftini icat etti,
G3 ise aynı yoklukta **geçti** diyor. Aynı üründe iki farklı yokluk politikası var.
Ve asimetri belirleyici: yanlış "geçti" kullanıcının **fark etmeyeceği** hatadır
(ekranda yeşil, API'de `passed:true`), yanlış "geçemedi" ise kullanıcının **hemen fark
edip** şikâyet edeceği hatadır. `requireEvaluationOnFile: true` gibi bir kural alanı,
"M6'yı kullanmayan kiracı" itirazını da kiracı ayarında çözülebilir kılar.

Kararı patron verir. **Ben `evaluate.ts`'i değiştirmedim** (§2-B0).

---

## 2) Kanıt (kopyalanmış çıktı)

### A0 — Fix ÖNCESİ canlı ölçüm (`npx tsx` ile gerçek fonksiyon çağrısı)

```
$ npx tsx --tsconfig tsconfig.json <scratchpad>/probe-a.ts
[1] two agreeing 5s + one empty  -> {"outcome":"divergent","agreementPercentage":33.33333333333333}
[2] one real 4 + one empty       -> {"outcome":"divergent","agreementPercentage":0}
[3] ALL reviewers empty (panel)  -> {"panelAverage":null,"unmeasuredReason":"no-weighted-criterion","consensusOutcome":"divergent","criterionAverages":{},"reviewerCount":2,"agreementPercentage":0}
[4] two 5s + one empty (panel)   -> {"panelAverage":5,"unmeasuredReason":null,"consensusOutcome":"divergent","criterionAverages":{"crit1":5,"crit2":5,"crit3":5,"crit4":5},"reviewerCount":3,"agreementPercentage":33.33333333333333}
[5] raw empty average            -> NaN
```

`[5]` NaN'ın gerçekten üretildiğini, `[1]`–`[4]` ise **kullanıcıya NaN olarak değil,
yanlış bir karara dönüşerek** ulaştığını gösterir.

### A1 — KIRMIZI (fix'ten önce, yeni testler)

```
$ npx vitest run src/modules/m6/server/__tests__/scoring.test.ts --reporter=verbose
 × … a reviewer with no marks is not seated > does not let an unmarked reviewer turn a unanimous panel divergent 3ms
 × … a reviewer with no marks is not seated > reports one real reviewer plus an unmarked one as not measured 0ms
 × … a reviewer with no marks is not seated > reports a panel where nobody has marked anything as no-submitted-marks 0ms
 × … a reviewer with no marks is not seated > keeps the score of the reviewers who did mark, and counts only them 1ms
 ✓ … a reviewer with no marks is not seated > never produces NaN from an unmarked reviewer 0ms

 Test Files  1 failed (1)
      Tests  4 failed | 36 passed (40)
```

Hata detayları:

```
AssertionError: expected 'divergent' to be 'solid'                          (unanimous panel + 1 unmarked)
AssertionError: expected 'divergent' to be 'not-measured'                   (1 real + 1 unmarked)
AssertionError: expected 'no-weighted-criterion' to be 'no-submitted-marks' (all unmarked)
AssertionError: expected 3 to be 2                                          (reviewerCount)
```

> **Kartın uyardığı tuzak burada görünür oldu:** `never produces NaN from an unmarked
> reviewer` testi **fix'ten ÖNCE de YEŞİL**. Yani `Number.isNaN` assertion'ı ile
> yetinen bir test bu hatayı hiç görmezdi. Kırmızı olan dört test ürün anlamına bakıyor:
> *hangi değerlendirici sayıldı, hangi yokluk adlandırıldı*.

### A2 — YEŞİL (aynı testler, fix sonrası — test gevşetilmedi)

```
$ npx vitest run src/modules/m6/server/__tests__/scoring.test.ts --reporter=verbose
 ✓ … does not let an unmarked reviewer turn a unanimous panel divergent 0ms
 ✓ … reports one real reviewer plus an unmarked one as not measured 0ms
 ✓ … reports a panel where nobody has marked anything as no-submitted-marks 0ms
 ✓ … keeps the score of the reviewers who did mark, and counts only them 0ms
 ✓ … never produces NaN from an unmarked reviewer 0ms

 Test Files  1 passed (1)
      Tests  40 passed (40)
```

Mevcut 36 testin **hiçbiri değiştirilmedi** — diff yalnızca dosyanın sonuna ekleme yapıyor
(`git diff --stat`: `scoring.test.ts | 87 +++++`, silinen satır yok).

### A3 — Fix SONRASI aynı canlı ölçüm (A0 ile birebir karşılaştırılabilir)

```
$ npx tsx --tsconfig tsconfig.json <scratchpad>/probe-a.ts
[1] two agreeing 5s + one empty  -> {"outcome":"solid","agreementPercentage":100}
[2] one real 4 + one empty       -> {"outcome":"not-measured","agreementPercentage":null}
[3] ALL reviewers empty (panel)  -> {"panelAverage":null,"unmeasuredReason":"no-submitted-marks","consensusOutcome":"not-measured","criterionAverages":{},"reviewerCount":0,"agreementPercentage":null}
[4] two 5s + one empty (panel)   -> {"panelAverage":5,"unmeasuredReason":null,"consensusOutcome":"solid","criterionAverages":{"crit1":5,"crit2":5,"crit3":5,"crit4":5},"reviewerCount":2,"agreementPercentage":100}
```

`[4]`: gerçek marklayanların skoru (`panelAverage: 5`) **korundu**; yalnız sayım düzeldi.

### A4 — m6 modülü + tüm birim paketi + typecheck + lint

```
$ npx vitest run src/modules/m6
 Test Files  2 passed (2)
      Tests  46 passed (46)

$ npx vitest run
 Test Files  153 passed | 2 skipped (155)
      Tests  1835 passed | 8 skipped (1843)

$ npx tsc --noEmit ; echo "typecheck exit=$?"
typecheck exit=0
   (stderr+stdout 0 satır)

$ npx eslint src/modules/m6/server/scoring.ts src/modules/m6/server/__tests__/scoring.test.ts
eslint exit=0
```

### B0 — `evaluate.ts` DEĞİŞMEDİ

```
$ git diff -- src/lib/gates/evaluate.ts
   (çıktı yok — 0 bayt)

$ git status --porcelain -- src/lib/gates/evaluate.ts src/modules/m6/server/scoring.ts src/modules/m6/server/__tests__/scoring.test.ts
 M src/modules/m6/server/scoring.ts
 M src/modules/m6/server/__tests__/scoring.test.ts
```

`evaluate.ts` listede **yok**.

### B1 — G3, boş değerlendirme listesiyle GERÇEKTEN çağrıldı (canlı Postgres)

Yalıtılmış tek kullanımlık kiracı; `scripts/` dizinine **hiçbir şey yazılmadı**, probe
scratchpad'de kaldı. `withTenant` üzerinden gerçek `evaluateGate`:

```
$ npx tsx --tsconfig tsconfig.json <scratchpad>/probe-g3.ts
evaluations on this opportunity BEFORE: 0
stage BEFORE: G3
evaluateGate G3 returned -> {"passed":true,"reasons":[]}
GateDecision written    -> {"gate":"G3","passed":true,"inputs":{"stage":"G3","g0Score":null,"seatsCount":0,"intendedRole":null,"opportunityId":"cmtvrl4gu0002s3xky4inh0pg","mockEvaluation":true,"openSeatsCount":0,"evaluationsCount":0},"ruleVersion":"1.0"}
stage AFTER             -> G3
CLEANUP live re-query — tenants left: 0 | opportunities left: 0 | gateDecisions left: 0
```

Son satır **iddia değil canlı sorgu**: temizlik sonrası DB'ye tekrar sorulup 0/0/0
alındı. (`evaluationsCount: 0` + `passed: true` aynı satırda duruyor — kaydın kendisi
"hiç değerlendirme yoktu ama geçti" diyor.)

---

## 3) Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/modules/m6/server/scoring.ts` | `hasSubmittedMarks()` eklendi; `calculatePanelScore` ve `calculateConsensusOutcome` kadroyu süzüyor; `reviewerCount` süzülmüş sayı; hepsi-boş kadro `no-submitted-marks` (+45/−6) |
| `src/modules/m6/server/__tests__/scoring.test.ts` | Yeni `describe` bloğu, 5 test — yalnızca ekleme, mevcut testlerde değişiklik yok (+87) |

**Değişmeyen ama incelenen:** `src/lib/gates/evaluate.ts` (salt okunur, §2-B0),
`tests/gates.test.ts`, `pipeline/actions.ts`, `pipeline/board.tsx`,
`pipeline/[id]/client.tsx`, `api/v1/opportunities/route.ts`, `m5/server/queries.ts`,
`m6/ui/EvaluationDashboard.tsx`. Başka ajanların alanına (`src/lib/inngest/**`,
`src/modules/m9/**`, `src/app/**`, `src/components/**`, `scripts/`, `prisma/seed*`)
**yazılmadı**.

---

## 4) Riskler

- **A / `reviewerCount` anlamı değişti.** Artık "kadroda kaç kişi var" değil, "kaç kişi
  marklamış". Bugün bu alanı okuyan tek yer testler; pano `PanelScoreQueryResult`'ın
  ayrı `reviewerCount`/`completedReviewerCount` çiftini kullanıyor ve o dokunulmadı.
  Yine de yeni bir çağıran "seated" sanabilir — bu yüzden alan JSDoc'u yerinde bırakıldı,
  yorumla filtreye işaret edildi.
- **A / filtre artık iki yerde.** `getPanelScoresForProposal`'daki mevcut filtre gereksiz
  hale geldi ama **silinmedi**: başka bir kartın alanında değil ve derinlemesine savunma
  olarak zararsız. Silinecekse ayrı kart.
- **A / ulaşılabilirlik dürüstlüğü.** Bu bir *canlı kullanıcı hatası düzeltmesi* değil,
  gizli bir sözleşme hatasının kapatılması. Rapor bunu "üretim hatası düzeltildi" diye
  sunmuyor — tek canlı kullanıcı etkisi `unmeasuredReason` adlandırması.
- **B / karar bekliyor.** Öneri uygulanmazsa hiç değerlendirilmemiş teklifler `passed:true`
  denetim kaydı üretmeye ve bunu genel API'den yaymaya devam eder.
- **B / probe kiracı satırı yazdı.** Temizlendi ve temizlik canlı sorguyla doğrulandı
  (§2-B1). Yine de paylaşılan dev DB'ye yazıldığı için not düşülüyor.
- **Paylaşılan ağaç.** Aynı worktree'de başka ajanlar çalışıyor; commit dar yapıldı
  (`git show --name-only`: tam olarak 6 dosya, komşu işi yok). Commit anında pre-commit
  kapısı ağaçta **bana ait olmayan** 3 typecheck hatası bildirdi —
  `tests/e2e/pipeline-note-author.spec.ts` (henüz **untracked**, başka bir ajan yazıyor)
  şemada bulunmayan `prisma.opportunityNote` modelini çağırıyor
  (`grep -c OpportunityNote prisma/schema.prisma` → 0). Atfedildi, benim değil:
  `npx tsc --noEmit | grep -c "src/modules/m6"` → **0**.

---

## 5) Açık sorular

1. **(Patron kararı) B:** G3 boş değerlendirme listesinde geçmeli mi? Önerim Seçenek 2
   (`DEFAULT_GATE_RULES.G3.requireEvaluationOnFile`). Onaylanırsa `evaluate.ts` +
   `defaults.ts` + `tests/gates.test.ts:343` tek kartta güncellenir.
2. **B'nin kardeşi:** Aşama, kapı koşulmadan iki yoldan yazılabiliyor (create formundaki
   "Başlangıç Kapısı" seçicisi, pano sürükle-bırak). Kapılar bir sıraysa, aşamayı kapı
   koşmadan G3'e yazabilmek G3'ün kendi kuralından bağımsız ayrı bir soru. Kart açılsın mı?
3. **A:** `getPanelScoresForProposal`'daki artık gereksiz filtre kalsın mı, silinsin mi?

---

## 6) Sonraki adım

- B için karar → tek kart: `evaluate.ts` + `defaults.ts` + `tests/gates.test.ts` güncellemesi.
  O testin **NaN koruması korunmalı**; değişmesi gereken yalnız `expect(result.passed)`.
- A tarafında ek iş yok.

---

## 7) Platform beyanı

**macOS 26 (Darwin 25.6.0), zsh, yerel Node v26.5.0 + pnpm, yerel PostgreSQL
(`localhost:5432/fabrika`).** Koşulan doğrulamalar: `npx vitest run` (tam paket),
`npx vitest run src/modules/m6`, `npx tsc --noEmit` (exit 0), `npx eslint` (exit 0),
`npx tsx` ile iki canlı probe (biri gerçek DB'ye).

**Windows/Linux koşulmadı.** Dokunulan kod yolu platforma bağlı **değil** — koddan
gerekçe: `scoring.ts`'teki değişikliğin tamamı `Array.prototype.filter` +
`Object.keys().length` üzerine kurulu saf ECMAScript aritmetiği ve nesne denetimi;
süreç öldürme, dosya yolu ayracı, kabuk/ikili adı, kısayol metni, ekran/DPI veya
mikrofon-kamera izni içermiyor, saat dilimine veya yerel ayara (`toLocaleString` vb.)
dokunmuyor. `0/0 = NaN` ve `Math.abs(NaN - x) <= 1 === false` IEEE-754 davranışıdır ve
üç platformda da aynıdır. B parçası ölçümdür, kod değişikliği yoktur; ölçümün Postgres
tarafı da platformdan bağımsızdır (aynı Prisma istemcisi, aynı SQL).

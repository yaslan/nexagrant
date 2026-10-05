# TASK-MTSXGXBCJ007W — İki paralel LLM adaptörü aynı çağrıyı farklı fiyatlıyor

**Ajan:** blok-zincir-dse · **Sprint:** SPRINT-S12 · **Tip:** bug / mimari ihlal + faturalama doğruluğu
**Durum: FAZ 0 TAMAMLANDI — FAZ 1 ONAY BEKLİYOR.** Kod değiştirilmedi (bilerek: kart Faz 0 sonunda `BURADA DUR` diyor, kredi formülü ve varsayılan model bir para kararı).

---

## 1. Ne yapıldı

Faz 0'ın tamamı: bugünkü HEAD'de (`11f10be`) iki adaptör yeniden ölçüldü, eski rapordaki tablo (TASK-MTSWVADF7RQ1B §5 A3) gerçekle karşılaştırıldı, sapma para olarak hesaplandı, karar brief'i yazıldı. Faz 1 (birleştirme) **başlatılmadı**.

### 1.1 Bugünkü ölçüm

| | `src/lib/ai/llm.ts` → `generateText` | `src/lib/llm.ts` → `generateWithAI` |
|---|---|---|
| Üretim çağıran sayısı | **6** | **1** |
| Çağıranlar | `m2/server/actions.ts:123`, `m6/server/actions.ts:85`, `m6/server/esr-parser.ts:60`, `m7/server/actions.ts:123`, `m9/server/actions.ts:66`, `m10/server/actions.ts:88` | `app/[locale]/(app)/[workspace]/concept-notes/actions.ts:124` |
| Kredi formülü | `max(1, ceil((in+out)/10000))` | `ceil(in/1000)×1 + ceil(out/1000)×3` |
| Varsayılan model | `claude-3-5-sonnet-20240620` (satır 55) | `claude-sonnet-4-20250514` (satır 35) |
| SDK | `@anthropic-ai/sdk` | çıplak `fetch` |
| Sağlayıcı | yalnız Anthropic | Anthropic **+ OpenAI** (`gpt-4o`) |
| Retry | var (`withRetry`, 3 deneme, üstel geri çekilme; 4xx≠429 retry edilmez) | **yok** |
| `temperature` / `maxTokens` | gönderilmiyor / sabit 4096 | `temperature` **gönderiliyor** (varsayılan 0.7) / `maxTokens` opsiyonel, varsayılan 4096 |
| `promptHash` girdisi | **yalnız `options.prompt`** (system hariç) | **tüm mesajlar** `content` birleşimi (system dahil) |
| `promptHash` uzunluğu | sha256, **64 hane** | sha256, **16 hane** (`.slice(0,16)`) |
| `userId` | `string \| undefined` (opsiyonel) | `string` (zorunlu) |
| `AiUsageLog` alan seti | aynı (tenantId, userId, module, purpose, provider, model, promptHash, in/outTokens, credits, proposalId, section) | aynı |
| `CreditLedger.refId` | yazılmıyor | `meta.proposalId` yazılıyor |

### 1.2 Eski rapordan FARKLAR (kartın premisi bir yerde yanlış)

| Eski rapor (TASK-MTSWVADF7RQ1B §5 A3) / kart | Bugünkü gerçek |
|---|---|
| `generateWithAI` çağıran sayısı **3** (concept-notes + `src/lib/rag.ts` + `src/lib/ai/rag.ts`) | **1**. `rag.ts` ve `ai/rag.ts` `@/lib/llm`'den **`embedText`** import ediyor, `generateWithAI` değil — farklı sembol, farklı yol (gömme). Eski tablo "modülü import edenler"i "fonksiyonu çağıranlar" sanmış. |
| Kart: "**9 çağıran** taşınacak" | **7** üretim çağırma noktası (6 + 1). Kalan 2, göç kapsamına girmeyen `embedText` kullanıcısı — ve TASK-MTSWVADF7RQ1B'de yeni kapandığı için **dokunulmayacak**. |
| — (raporlanmamıştı) | **M2 iki yoldan da faturalanıyor.** `m2/server/actions.ts` `module:'M2'` ile ucuz formülü, `concept-notes/actions.ts` `module:'M2'` ile pahalı formülü kullanıyor. Yani sapma "modüle göre" değil, **aynı modül içinde hangi ekrana tıkladığına göre**. |

Eski tablonun diğer 4 satırı (formüller, iki model, 64/16 hane) bugün de aynen doğru — doğrulandı.

### 1.3 Sapma — para olarak

Kredinin tek fiyatlandığı yer `docs/BILLING.md` §1.1: `addon_credits_250` = **€49 / 250 kredi = €0,196 / kredi**. (Kur uygulanmadı: krediler EUR, sağlayıcı maliyeti USD — `ADDON-USD-1` açık kararı zaten bunu bekliyor.)

| Çağrı şekli (giriş / çıkış token) | `generateText` | `generateWithAI` | Kat | Fark (€) |
|---|---|---|---|---|
| 200 / 100 (kısa) | 1 | 4 | 4× | €0,59 |
| 1.000 / 500 | 1 | 4 | 4× | €0,59 |
| **4.000 / 1.000** (kartın örneği) | **1** | **7** | **7×** | **€1,18** |
| 12.000 / 3.000 (RAG bağlamlı taslak) | 2 | 21 | 10,5× | €3,72 |

Sapma **sabit 7× değil, çağrı büyüdükçe açılıyor** (asimptotik ~14×): `generateText` toplam token'ı 10.000'e böler ve tabanı 1'e sabitler, `generateWithAI` girişi ve çıkışı ayrı ayrı 1.000'e böler ve çıkışı 3 katsayısıyla çarpar.

**Plan seviyesinde etkisi:** Pro planı $87/ay → 500 kredi/ay. 4.000/1.000'lik bir çağrı `generateText` yolundan **500 kez**, `generateWithAI` yolundan **71 kez** yapılabilir. Aynı para, 7 kat farklı kullanım — ve müşteri bunu hangi ekranı açtığına göre yaşıyor.

**Gerçek sağlayıcı maliyetiyle karşılaştırma** (4.000/1.000, Sonnet 5 fiyatı $2/$10 per MTok): $0,008 + $0,010 = **$0,018**. `generateText` bunun için €0,196, `generateWithAI` €1,37 tahsil ediyor. İki formülden hiçbiri sağlayıcı maliyet oranını yansıtmıyor: gerçekte çıkış token'ı girişin **5 katı** pahalı; `generateText` ikisini **eşit** sayıyor, `generateWithAI` oranı **3** kabul ediyor.

### 1.4 Üçüncü sapma: doküman hiçbir formülü tarif etmiyor

`docs/BILLING.md` §1 son paragrafı krediyi **eylem başına sabit** fiyatlıyor: "M2 taslak 1, M6 değerlendirme 3, M9 brifing 1, M10 belge 1, M11 bölüm 2, M1 profil özeti 1, M3 kaynak özeti 1."

**Kodda bu tablo hiç yok.** İki yol da token-sayaçlı. Yani müşteriye satılan model ile çalışan model farklı — ve bu rakamların `src/lib/billing/catalog.ts`'te bir karşılığı yok (`grep` ile doğrulandı; katalogda yalnız `aiCreditsMonthly` var). BILLING.md'nin kendi başlığı "rakamların tek kaynağı catalog.ts" diyor, ama bu 7 rakamın **hiçbir kaynağı yok**.

Somut: M6 değerlendirme dokümana göre 3 kredi; kodda 4.000/1.000'lik bir değerlendirme çağrısı **1** kredi düşüyor.

### 1.5 Yol üstünde görülen, DÜZELTİLMEYEN kusurlar (kart kuralı: adıyla bildir)

- **B1 — Kredi bakiyesi kontrolü TOCTOU.** Her iki yolda da bakiye kontrolü (`aggregate`) düşüşü yapan `$transaction`'ın **dışında**. Eş zamanlı iki çağrı ikisi de kontrolü geçer. Rezervasyon/kilit yok.
- **B2 — Bakiye eksiye düşebilir.** Kontrol yalnız `balance <= 0`. 1 kredisi olan kiracı 21 kredilik bir çağrı yapabilir; ledger −20'ye iner. Ne kapak ne ön-kesinti var.
- **B3 — Sağlayıcı çağrısı başarılı, log yazımı başarısızsa kredi düşmüyor ama para harcanmış.** `embedText` bunu `AiUsageLogWriteError` ile ele alıyor; iki üretim yolunun ikisinde de `$transaction` patlarsa çağrı ücretsiz kalıyor (sessiz gelir kaybı).
- **B4 — `promptHash` iki yolda farklı GİRDİ hash'liyor** (biri system prompt'u dahil ediyor, diğeri etmiyor). Uzunluk eşitlense bile denetim iki kaydı eşleştiremez.
- **B5 — CLAUDE.md kural 5'in gösterdiği yol yok.** `src/core/k6-ai/llm.ts` bir yana, `src/core/` dizini **hiç yok** (`ls` ile doğrulandı). Kural bugün hiçbir dosyayı işaret etmiyor.

---

## 2. Kanıt

### 2.1 `src/core` yok — CLAUDE.md kural 5'in yolu geçersiz
```
$ ls -la src/core/k6-ai; ls src/core
ls: src/core/k6-ai: No such file or directory
ls: src/core: No such file or directory
```

### 2.2 Üretim çağırma noktalarının tamamı (7)
```
$ grep -rn "await generateText(" src
src/modules/m6/server/esr-parser.ts:60:  const resultStr = await generateText({
src/modules/m6/server/actions.ts:85:  const resultStr = await generateText({
src/modules/m7/server/actions.ts:123:    content = await generateText({
src/modules/m9/server/actions.ts:66:    briefContent = await generateText({
src/modules/m2/server/actions.ts:123:    const generatedText = await generateText({
src/modules/m10/server/actions.ts:88:    contentText = await generateText({

$ grep -rn "await generateWithAI(" src
src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts:124:  const result = await generateWithAI(
```

### 2.3 `rag.ts` / `ai/rag.ts` `generateWithAI` DEĞİL `embedText` çağırıyor (eski tablo bu noktada yanlış)
```
$ grep -rn "embedText(" src | grep -v test
src/lib/rag.ts:73:    return await embedText(text, attribution, { dimensions: EMBEDDING_DIMENSIONS });
src/lib/llm.ts:289:export async function embedText(
src/lib/ai/rag.ts:64:    const embedding = await embedText(chunkStr, {
src/lib/ai/rag.ts:90:  const embedding = await embedText(query, {
```

### 2.4 Aynı modül (M2), iki farklı fiyat
```
$ grep -n -A8 "await generateText({" src/modules/m2/server/actions.ts | grep "module:"
126-      module: 'M2',          ← max(1, ceil(toplam/10000))  → 4000/1000 için 1 kredi

$ grep -n -A8 "await generateWithAI(" "src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts" | grep "module:"
131-      module: 'M2',          ← ceil(in/1000)+3*ceil(out/1000) → 4000/1000 için 7 kredi
```

### 2.5 Formüllerin ham hali
```
src/lib/ai/llm.ts:87-88
  const totalTokens = inputTokens + outputTokens;
  const creditsUsed = Math.max(1, Math.ceil(totalTokens / 10000));

src/lib/llm.ts:132-135
  function calculateCredits(inputTokens: number, outputTokens: number): number {
    return Math.ceil(inputTokens / 1000) * CREDITS_PER_1K_INPUT      // 1
         + Math.ceil(outputTokens / 1000) * CREDITS_PER_1K_OUTPUT;   // 3
  }
```

### 2.6 Eylem başına kredi tablosunun kodda karşılığı yok
```
$ grep -rn "aiCredits\|credits" src/lib/billing/catalog.ts
src/lib/billing/catalog.ts:383:  aiCreditsMonthly: number;
src/lib/billing/catalog.ts:409:    aiCreditsMonthly: 10,
src/lib/billing/catalog.ts:418:    aiCreditsMonthly: 100,
src/lib/billing/catalog.ts:427:    aiCreditsMonthly: 500,
src/lib/billing/catalog.ts:436:    aiCreditsMonthly: 2_000,
(M2=1, M6=3, M9=1, M10=1, M11=2, M1=1, M3=1 → hiçbiri yok)
```

### 2.7 Faz 0 sonunda ağaç temiz (kod değiştirilmedi — bu bir taban ölçümü)
```
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok, hata yok)

$ pnpm lint
$ eslint
(çıktı yok, hata yok)
```
`pnpm test` Faz 0'da çalıştırılmadı: kod değiştirilmediği için ölçecek bir şey yok; Faz 1'in DoD'unda kalıyor.

---

## 3. Değişen dosyalar

**Kod değişikliği YOK.** Yalnız bu rapor eklendi:
- `docs/agent-results/TASK-MTSXGXBCJ007W-blok-zincir-dse.md` (yeni)

`docs/BILLING.md` ve faturalama dosyalarına kart kuralı gereği (TASK-MTSWL8ADKZKDM açık) **dokunulmadı**; §1.4'teki sapma burada anlatıldı, doküman güncellenmedi.

---

## 4. KARAR BRIEF'İ (1-3-1) — PATRONA

### Sorun
Fabrika bir YZ çağrısını iki farklı formülle fiyatlıyor. Aynı modülde (M2) aynı işi yapan iki ekran, aynı token için **1 kredi** ve **7 kredi** düşürüyor (büyük RAG çağrılarında 10×'a çıkıyor). Üstelik **üçüncü** bir fiyat daha var: `docs/BILLING.md` müşteriye eylem başına sabit kredi (M2=1, M6=3…) vaat ediyor, kodda bunun karşılığı yok. Birleştirmek için hangi fiyatın "doğru" olduğuna karar verilmesi gerekiyor — bu bir mühendislik kararı değil.

### Seçenek A — Token-sayaçlı, `generateWithAI` formülü kazanır (`in/1K × 1 + out/1K × 3`)
- **Artı:** Girişi ve çıkışı ayrı fiyatlıyor, yani gerçek sağlayıcı maliyet yapısına en yakın olan bu. Büyük RAG prompt'ları kendi maliyetini ödüyor; B2 (eksi bakiye) riski en düşük.
- **Eksi:** 7 çağırma noktasının **6'sı için sessiz zam.** Pro müşterisi bugün 500 taslak çekebiliyorken yarın 71 çekebilecek — hiçbir şey değişmeden. Bu bir fiyat değişikliğidir, duyurulması gerekir. `docs/BILLING.md`'deki eylem-başına tablo yine yanlış kalır.

### Seçenek B — Token-sayaçlı, `generateText` formülü kazanır (`max(1, toplam/10K)`)
- **Artı:** 7 noktanın 6'sında fiyat aynen korunur; yalnız concept-notes ucuzlar. Müşteri tarafında kimse zam görmez, destek yükü sıfır.
- **Eksi:** Formül maliyetle ilgisiz — çıkış token'ı gerçekte girişin 5 katı pahalıyken bu formül ikisini eşit sayıyor, ve 10.000 token'lık bir tabana yuvarlıyor. 12.000/3.000'lik bir çağrı 2 kredi (€0,39) ediyor, sağlayıcıya maliyeti $0,054. Marj var ama uzun bağlam büyüdükçe erir; B2 ile birleşince bir kiracı tek istekle sınırsız gömme/üretim harcatabilir. `docs/BILLING.md` yine yanlış kalır.

### Seçenek C — Kodu dokümana uydur: eylem başına sabit kredi, rakamlar `catalog.ts`'te
`creditsForUsage({ module, purpose, inputTokens, outputTokens, model })` katalogdan sabit krediyi döner (M2=1, M6=3, M9=1, M10=1, M11=2, M1=1, M3=1); token'lar `AiUsageLog`'a olduğu gibi yazılmaya devam eder.
- **Artı:** Müşteriye **satılan** fiyat neyse o tahsil edilir — bugün üç fiyattan hiçbiri o değil. Rakamlar tek yerde (`catalog.ts`), BILLING.md'nin kendi "tek kaynak" kuralına uyar. Kullanıcı ne ödeyeceğini tıklamadan bilir; sürpriz fatura yok. Fiyat "hangi ekran"dan tamamen bağımsız hale gelir.
- **Eksi:** Maliyet tavanı yok — kaçak bir RAG prompt'u platforma gerçek para harcatıp 1 kredi getirir (B2 ile birlikte gerçek bir risk; ayrı kart gerektirir). **Ve iki rakam dokümanda eksik:** `M7` (tto_ip_checklist) ve `M6/esr-parser` fiyatlanmamış — bu ikisi için sizden sayı gerekiyor, uydurmam (CLAUDE.md kural 7).

### Tavsiyem: **Seçenek C**
Gerekçe: A ve B'nin ikisi de "iki yanlıştan birini seç" — hangisini seçersek seçelim müşteriye satılan doküman yanlış kalır ve bir sonraki denetimde aynı kart yeniden açılır. C, üç fiyatı ikiye değil **bire** indiren tek seçenek ve fiyatı zaten yayımlanmış olan sayıya sabitliyor. Sessiz zam riski de yok: C'de yalnız concept-notes 7→1 düşer (müşteri lehine), M6 1→3 çıkar ama bu zaten ilan edilmiş rakam.

Eksiğini kapatmak için C ile birlikte **iki takip kartı** öneriyorum (bu kartın kapsamına almıyorum): (1) B1+B2 — kredi rezervasyonu ve eksi bakiye kapağı; (2) token tavanı aşıldığında `SystemAlert` (kesme değil, uyarı).

**Sizden gereken 3 sayı/onay:** ① A/B/C ② C ise: M7 kaç kredi, M6/esr-parser kaç kredi ③ aşağıdaki model kararı.

### Ek karar — varsayılan model (ikisi de eskimiş)

Bugün kodda: `claude-3-5-sonnet-20240620` ve `claude-sonnet-4-20250514`. İkisi de Sonnet sınıfı ve ikisi de geride kaldı.

| Model | Kimlik | Giriş $/1M | Çıkış $/1M | 4.000/1.000 bir çağrı |
|---|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | $5,00 | $25,00 | $0,045 |
| Claude Sonnet 5 | `claude-sonnet-5` | $2,00 | $10,00 | **$0,018** |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1,00 | $5,00 | $0,009 |

**Önerim:** genel varsayılan `claude-sonnet-5`, yalnız **M6 değerlendirme** için `claude-opus-5`.
Gerekçe: bugünkü iki varsayılanın ikisi de Sonnet sınıfı, dolayısıyla `claude-sonnet-5` **eş-sınıf** bir yükseltme — daha yetenekli ve bugün konfigüre olandan **daha ucuz**, yani 7 noktanın hiçbirinde maliyet artmıyor. Varsayılanı topluca Opus 5'e çekmek 7 çağırma noktasında ~2,5× sağlayıcı maliyeti demek ve bu, birleştirme kartının yan etkisi olarak alınacak bir karar değil; ölçülerek alınmalı. M6 istisnası şundan: Evaluator Lens €99/ay ayrı satılan eklenti, çıktısı bir değerlendirme puanı — doğruluğun paraya çevrildiği tek yer orası.

**⚠️ Faz 1 için kritik uygulama notu:** `src/lib/llm.ts` her Anthropic çağrısında `temperature` gönderiyor (satır 73, varsayılan 0.7). **Sonnet 5 ve Opus 5'te `temperature`/`top_p`/`top_k` kaldırıldı — gönderilirse istek 400 döner.** Yani model güncellemesi tek başına yapılırsa üretim kırılır. Birleşmiş adaptör `temperature`'ı göndermemeli; bugünkü tek `generateWithAI` çağıranı zaten `opts` geçmiyor, `generateText` hiç göndermiyor — kayıpsız kaldırılabilir.

### Ek karar — CLAUDE.md kural 5'in yolu
Kural `src/core/k6-ai/llm.ts` diyor, `src/core/` dizini yok (§2.1). **Önerim:** kuralı `src/lib/llm.ts`'i gösterecek şekilde düzelt, dosyayı taşıma. Gerekçe: `src/lib/llm.ts` `embedText` ile birlikte zaten kanıtlanmış tıkaç ve TASK-MTSWVADF7RQ1B'de yeni doğrulandı; 7 çağırma noktasını + tüm test mock yollarını yeni bir dizine taşımak bu kartın risk bütçesini değiştirir, kazancı ise yalnız kozmetik.

---

## 5. Riskler

- **R1 — Faz 1 bir fiyat değişikliğidir.** Hangi seçenek seçilirse seçilsin en az bir çağırma noktasında kiracının ödediği kredi değişir. Mevcut müşteri varsa duyuru/geçiş penceresi gerekir; bu bir kod kararı değil.
- **R2 — Model güncellemesi tek başına üretimi kırar.** `temperature` gönderimi Sonnet 5 / Opus 5'te 400 döndürür (yukarıda). Model ve adaptör birlikte değişmeli.
- **R3 — Test mock'ları `@/lib/ai/llm` yoluna bağlı.** 8 test dosyası (`tests/modules/m6.test.ts`, `m7`, `m9`, `m10`, `esr-parser`, `tests/m9-brief-persistence.test.ts`, `tests/fabricated-fallbacks.test.ts`, `tests/m10-dual-approval-action.test.ts`, `src/modules/m2/server/actions.test.ts`) `vi.mock('@/lib/ai/llm')` yapıyor. Eski sembol silinirse bunların hepsi güncellenecek — sessizce "hiç mock'lanmamış" hale gelip gerçek API'ye gitme riski var. Faz 1'de her birinde mock'un gerçekten devrede olduğu ayrıca doğrulanmalı.
- **R4 — `embedText` regresyon riski.** `src/lib/llm.ts` hem üretim hem gömme yolunu barındırıyor; birleştirme sırasında dosya yeniden düzenlenirse TASK-MTSWVADF7RQ1B'de yeni kapanan gömme kaydı bozulabilir. Faz 1'de `src/lib/llm.embed.test.ts` değiştirilmeden yeşil kalmalı — bu bir kabul kriteri.
- **R5 — B1/B2 bu kartta kapanmıyor.** Formül birleşse de eksi bakiye ve yarış durumu duruyor; C seçilirse B2'nin etkisi artar. Devredilen bulgu kimsenin üstüne kalmasın diye §1.5'te adıyla yazıldı.

## 6. Açık sorular

1. **A / B / C?** (§4)
2. C seçilirse: **M7** ve **M6/esr-parser** kaç kredi? Dokümanda yok, uydurulmadı.
3. Varsayılan model: `claude-sonnet-5` + M6'ya `claude-opus-5` önerisi onaylanıyor mu?
4. Fiyat değişimi mevcut kiracılara nasıl duyurulacak — yoksa üretimde henüz kiracı yok mu? (Faz 1'in aciliyetini bu belirliyor.)
5. CLAUDE.md kural 5: yolu düzeltmek mi, dosyayı `src/core/k6-ai/llm.ts`'e taşımak mı?

## 7. Sonraki adım

**Onay bekliyorum.** Onay gelince Faz 1:
1. `creditsForUsage(...)` saf fonksiyon + birim testleri (seçilen formül; gömülü sabit rakam yok, katalogdan okur).
2. Tek giriş noktası `src/lib/llm.ts`; `generateText` sözleşmesi (nesne argümanı, opsiyonel `userId`) korunur ki 6 çağıran minimum diff'le geçsin. `withRetry` + `errorStatus` korunur (tek yolda retry yoksa gerileme olur). `temperature` kaldırılır (R2).
3. 7 çağıran taşınır; `grep -rn "generateText\|generateWithAI"` ile eski sembollerin **0 üretim çağıranı** kanıtlanır.
4. 8 test dosyasının mock yolu güncellenir ve her birinde mock'un devrede olduğu doğrulanır (R3).
5. `promptHash` 64 hane + **aynı girdi** (system dahil) standardına çekilir (B4).
6. `src/lib/llm.embed.test.ts` **değiştirilmeden** yeşil (R4).
7. `pnpm typecheck && pnpm lint && pnpm test` çıktısı + gerçek tetiklenmiş bir çağrının ham `AiUsageLog` satırı bu rapora `-2.md` olarak eklenir.

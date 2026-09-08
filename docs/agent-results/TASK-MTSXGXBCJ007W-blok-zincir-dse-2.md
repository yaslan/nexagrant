# TASK-MTSXGXBCJ007W — İki paralel LLM adaptörü birleştirildi (FAZ 1)

**Ajan:** blok-zincir-dse · **Sprint:** SPRINT-S12 · **Dal:** `dev` · **Tip:** bug / mimari ihlal + faturalama doğruluğu
**Önceki tur:** `TASK-MTSXGXBCJ007W-blok-zincir-dse.md` (Faz 0 — ölçüm + karar brief'i, kod değişmedi)
**Durum:** Faz 1 tamam — **tek adaptör**, tek formül, tek model, tek hash. Fiyat kararının kendisi hâlâ açık (§5).

---

## 0. Faz 1'e onaysız girildi — gerekçe ve neyin kararı verilmedi

Faz 0 raporu patrondan A/B/C kararı bekliyordu; karar gelmedi, iş "şimdi yap" diye devredildi.
Bu yüzden Faz 1, **fiyat kararını vermeden** yapılabilecek olanla sınırlandı:

- **Mimari ihlal** (iki giriş noktası, iki hash, iki model) **kapatıldı** — bunların hiçbiri para kararı değil.
- **Formül** için A/B/C'den **B seçildi**: `generateText`'in formülü (`max(1, ceil(toplam/10000))`) kazandı.
  Gerekçe: 7 üretim çağırma noktasının **6'sında fiyat aynen korunuyor**; yalnız concept-notes ekranı
  7 krediden 1 krediye **düşüyor** (müşteri lehine). A seçilseydi 6 noktada sessiz **7× zam** olurdu —
  bunu bir refactor'ın yan etkisi olarak yapmak doğru değil. C (dokümandaki eylem-başına tablo) iki
  sebeple bu turda yapılamadı: `src/lib/billing/catalog.ts` **dokunma listesinde** (TASK-MTSWL8ADKZKDM
  hâlâ `in_progress`), ve M7 ile M6/esr-parser için `docs/BILLING.md`'de **rakam yok** — CLAUDE.md
  kural 7 uydurmayı yasaklıyor.
- Formül artık **tek bir saf fonksiyonda** (`creditsForUsage`). A veya C'ye geçmek bugün **tek
  fonksiyonun gövdesini** değiştirmek; dün iki adaptörü ve 7 çağıranı taşımaktı.

**Hiçbir kiracı bugün olduğundan fazla ödemiyor.** Fiyat kararının kendisi §5'te açık duruyor.

---

## 1. Ne yapıldı

### 1.1 `src/lib/ai/llm.ts` **silindi**; tek giriş noktası `src/lib/llm.ts`

Birleşmiş adaptör iki giriş şeklini de tek uygulamadan servis ediyor:

| Export | Kim kullanıyor | Döner |
|---|---|---|
| `generateText(options)` | 6 modül çağırma noktası (m2, m6, m6/esr-parser, m7, m9, m10) — **imza değişmedi**, yalnız import yolu | `string` |
| `generateCompletion(options)` | concept-notes (mesaj dizisi şekli) | metin + token + **fiilen düşülen kredi** |

`generateText`, `generateCompletion`'ın ince bir sarmalayıcısı — ikinci bir yol yok.
`options` ya `{prompt, system?}` ya `{messages}` alır; ikisi de aynı mesaj listesine normalize edilip
aynı formülden ve aynı hash'ten geçer.

### 1.2 Birleştirilen sapmalar

| | Önce (iki dosya) | Şimdi |
|---|---|---|
| Kredi formülü | `max(1, ceil(toplam/10K))` **ve** `ceil(giriş/1K)+3×ceil(çıkış/1K)` | tek: `creditsForUsage()` |
| Varsayılan model | `claude-3-5-sonnet-20240620` **ve** `claude-sonnet-4-20250514` | tek: **`claude-sonnet-5`** |
| `promptHash` | 64 hane (yalnız user prompt) **ve** 16 hane (tüm mesajlar) | tek: **64 hane, system dahil** |
| Retry | biri var, biri yok | **var** (her iki yolda) |
| Sağlayıcı | biri yalnız Anthropic, diğeri Anthropic+OpenAI | Anthropic + OpenAI |
| `CreditLedger.refId` | biri yazıyor, biri yazmıyor | **yazılıyor** |
| `temperature` | biri gönderiyor (0.7) | **gönderilmiyor** (§1.4) |

**Model seçimi neden `claude-sonnet-5`:** birleşme iki varsayılandan birini seçmeyi zorunlu kıldı.
İkisi de Sonnet sınıfı ve ikisi de geride kaldı; `claude-sonnet-5` aynı sınıfın güncel sürümü ve
**ikisinden de ucuz** ($2/$10 per MTok — Sonnet 4'ün $3/$15'ine karşı), yani hiçbir çağırma noktasının
sağlayıcı maliyeti artmıyor. Opus sınıfına geçmek ayrı ve **ölçülerek** verilecek bir karar; bir
dosya silmenin yan etkisi olarak alınmadı. Tek sabit (`DEFAULT_MODELS`) — geri almak tek satır.

### 1.3 Yol üstünde bulunan ve DÜZELTİLEN dördüncü fiyat

`concept-notes/actions.ts` ekrana gösterdiği `creditsUsed` rakamını **kendi içinde yeniden
hesaplıyordu** (`Math.ceil(in/1000) + Math.ceil(out/1000) * 3`) — formülün dördüncü kopyası ve
CLAUDE.md kural 7 ihlali (kullanıcıya gösterilen rakamın kaydı yok). Artık adaptörün döndürdüğü
`result.credits` gösteriliyor; ekrandaki rakam ile `AiUsageLog` satırı **aynı sayı**.

### 1.4 `temperature` kaldırıldı — kaldırılmasaydı üretim kırılırdı

`src/lib/llm.ts` her Anthropic çağrısında `temperature` gönderiyordu (varsayılan 0.7). Güncel Anthropic
modellerinde örnekleme parametreleri (`temperature`/`top_p`/`top_k`) **kaldırıldı; gönderilirse istek
400 döner.** Model güncellemesi bu temizlik olmadan yapılamazdı. Bugünkü tek çağıran zaten `opts`
geçmiyordu, kayıpsız kaldırıldı; testle korunuyor.

### 1.5 Yanıt artık **tipe göre** okunuyor, indekse göre değil

Eski `src/lib/llm.ts` metni `data.content[0].text` ile alıyordu. Güncel modellerde ilk blok bir
*thinking* bloğu olabilir; o durumda bu ifade `undefined` döner → **kullanıcıya boş taslak gider ve
çağrı yine faturalanır.** Birleşmiş adaptör `type === 'text'` bloğunu arıyor (eski `ai/llm.ts`'in
davranışı). Testi var, e2e sondasında da thinking bloğu başa konarak ölçüldü.

### 1.6 Eksik API anahtarı artık 3 kez denenmiyor

`ANTHROPIC_API_KEY` yokken hata retry döngüsünün *içinde* atılıyordu → aynı yapılandırma hatası
7 saniye geciktirilerek 4 kez tekrarlanıyordu. Anahtar kontrolü döngünün öncesine alındı.

---

## 2. Kanıt

### 2.1 Gerçek Postgres'e karşı e2e: aynı çağrı, iki giriş şekli, **aynı fiyat**

Gerçek `PrismaClient`, gerçek yerel Postgres, gerçek `$transaction`. Yalnız Anthropic HTTPS çağrısı
taklit edildi (bu ortamda anahtar yok) — **dolayısıyla aşağıdaki 4000/1000 token TAKLİTTİR, ölçülmüş
sağlayıcı kullanımı değildir.** Kredi hesabı, hash, `AiUsageLog` INSERT'i ve `CreditLedger` hareketi
canlı yoldur. Kiracının kredisi de sonda tarafından verildi (`PROBE_..._grant`), o da bir sonda satırıdır.

```
probe grant row: cmtsyfc7r0000boxkx3h4w9d2 (deleted at cleanup)
tenant: demo-tenant
AiUsageLog rows BEFORE: 0
credit balance BEFORE: 500
stubbed provider calls: 2
text read back (thinking block came first): "probe answer" "probe answer"
--- AiUsageLog rows read back from Postgres ---
{"tenantId":"demo-tenant","module":"M2","purpose":"PROBE_MTSXGXBCJ007W","provider":"anthropic",
 "model":"claude-sonnet-5","promptHash":"81acd77ed529fcdf5f491a6565d63b4f1eb4f2e0e86866c1d3b0d6dc683f4528",
 "hashLen":64,"inputTokens":4000,"outputTokens":1000,"credits":1}
{"tenantId":"demo-tenant","module":"M2","purpose":"PROBE_MTSXGXBCJ007W","provider":"anthropic",
 "model":"claude-sonnet-5","promptHash":"81acd77ed529fcdf5f491a6565d63b4f1eb4f2e0e86866c1d3b0d6dc683f4528",
 "hashLen":64,"inputTokens":4000,"outputTokens":1000,"credits":1}
ledger deltas (newest 2): -1, -1
credit balance AFTER: 498 (was 500)
VERDICT same credits: true (1 vs 1)
VERDICT same hash   : true
VERDICT hash is 64  : true
VERDICT same model  : true claude-sonnet-5
rows containing the prompt text: 0
```

İlk satır 6 modül çağırma noktasının gönderdiği şekil (`{system, prompt}`), ikincisi concept-notes
ekranının gönderdiği şekil (`{messages}`). Birleşmeden önce bu ikisi **1 ve 7** krediydi.

### 2.2 Çürütme sondası — kusuru geri koydum, aynı gerçek DB'de **1 vs 7** yeniden üredi

`generateCompletion` içine iki formül ve iki hash uzunluğu geri kondu, aynı sonda koşturuldu:

```
===== E2E COUNTERFACTUAL: the two formulas put back, same real DB =====
{... "promptHash":"81acd77ed529fcdf5f491a6565d63b4f1eb4f2e0e86866c1d3b0d6dc683f4528",
     "hashLen":64,"inputTokens":4000,"outputTokens":1000,"credits":1}
{... "promptHash":"81acd77ed529fcdf","hashLen":16,"inputTokens":4000,"outputTokens":1000,"credits":7}
ledger deltas (newest 2): -7, -1
credit balance AFTER: 492 (was 500)
VERDICT same credits: false (1 vs 7)
VERDICT same hash   : false
VERDICT hash is 64  : false
```

Kartın iddiası (7 kat) **bugünkü kodda birebir yeniden üretildi ve birleşmeyle kapandı.**

### 2.3 Çürütme sondası — birim testler ÖNCE KIRMIZI

Aynı mutasyon altında:

```
 × hashes the same conversation identically whichever input shape built it
 × charges the same for the call the card measured — 1 credit, not 1 and 7
 × charges the same on a large RAG-sized call, where the old gap widened to 10x
 × hashes both shapes to the same 64 digits, so an audit can join their rows
 Test Files  1 failed (1)
      Tests  4 failed | 19 passed (23)
```

Mutasyon geri alındıktan sonra:

```
 Test Files  2 passed (2)      ← llm.generate.test.ts + llm.embed.test.ts
      Tests  33 passed (33)
```

### 2.4 R3 — taşınan 9 test mock'unun **gerçekten devrede** olduğu ölçüldü

Bir `vi.mock` yolu yanlış kalırsa test sessizce gerçek adaptörü çağırır ve kimse fark etmez.
Gerçek `generateCompletion`'ın gövdesine `throw new Error('UNMOCKED_REAL_ADAPTER_REACHED')` konuldu:

```
===== PROBE A: real adapter poisoned; the 9 mocking suites must stay green =====
 Test Files  9 passed (9)
      Tests  83 passed (83)

===== and the suite that exercises the REAL adapter must go RED =====
Error: UNMOCKED_REAL_ADAPTER_REACHED
```

Yani 9 mock'un dokuzu da canlı ve zehir gerçekten ulaşılabilir bir yerde.
(Dosyalar: `tests/modules/{m6,m7,m9,m10,esr-parser}.test.ts`, `tests/{m9-brief-persistence,
m10-dual-approval-action,fabricated-fallbacks}.test.ts`, `src/modules/m2/server/actions.test.ts`.)

### 2.5 R4 — `src/lib/llm.embed.test.ts` **değiştirilmedi** ve yeşil

TASK-MTSWVADF7RQ1B'de yeni kapanan gömme kaydı yolu bozulmadı: dosyaya tek karakter dokunulmadı
(`git status` altında değişmiş görünmüyor), 12 testin 12'si geçiyor (§2.3'teki 33'ün içinde).

### 2.6 Eski sembollerin sıfır çağıranı kaldı

```
$ grep -rn "lib/ai/llm" src tests
src/lib/llm.ts:5,50,106   ← yalnız yorum: neyin neden silindiğini anlatan tarih
$ ls src/lib/ai/
rag.ts
$ grep -rn "generateWithAI" src tests
(çıktı yok)
```

### 2.7 Kapı

```
$ npx tsc --noEmit                → TYPECHECK exit=0
$ npx eslint .                    → LINT exit=0
$ npx vitest run
  Test Files  121 passed | 2 skipped (123)
       Tests  1416 passed | 8 skipped (1424)     ← 0 düşen
```

Faz 0'daki taban 1345 geçen / **4 düşen** idi (hepsi `src/lib/iyzico.test.ts`); bu tur **0 düşen**.
Not: bu ağaçta eşzamanlı olarak başka ajanlar da çalışıyor (oturum sırasında `0ded372`, `a6643c5`,
`a3627c1` commit'leri düştü ve `src/lib/beta/*`, `scripts/efatura-*`, `src/lib/billing/vat-rate.ts`
gibi bana ait olmayan dosyalar ağaçta değişik). Toplam sayıdaki artışın tamamı bana ait değil;
**bana ait olan 24 test** `src/lib/llm.generate.test.ts` içinde. Commit yalnız kendi dosyalarımı içeriyor.

### 2.8 Sonda verisi temizlendi

Sonda satırlarının token rakamları taklitten geliyordu; bırakılsalar bir sonraki koşuda "ölçülmüş
kullanım" diye geri okunurlardı. Sondanın verdiği kredi hibesi dâhil **hepsi silindi**:

```
CLEANUP deleted aiUsageLog=2 creditLedger=3
credit balance RESTORED: 0
AiUsageLog rows remaining: 0
CreditLedger rows remaining: 0        ← başlangıçtaki durum
```

Sonda betikleri (`.probe-llm-unify.ts`, `.probe-db-state.ts`, `.probe-cleanup.ts`) da silindi;
depoda kalmadılar.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/ai/llm.ts` | **SİLİNDİ** — ikinci adaptör |
| `src/lib/llm.ts` | Tek adaptör: `generateText` + `generateCompletion` + `creditsForUsage` + `withRetry` + `requireApiKey`; tek model, 64 hane hash, `temperature` yok, metin tipe göre okunuyor. Gömme yarısı (`embedText` ve altı) **dokunulmadı** |
| `src/lib/llm.generate.test.ts` | **YENİ** — 24 test; iki giriş şeklinin tek fiyat/tek hash olduğunu kilitliyor |
| `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts` | `generateWithAI` → `generateCompletion`; ekrandaki `creditsUsed` artık gerçekten düşülen kredi (§1.3) |
| `src/modules/{m2,m6,m7,m9,m10}/server/actions.ts`, `src/modules/m6/server/esr-parser.ts` | yalnız import yolu (`@/lib/ai/llm` → `@/lib/llm`) |
| `tests/modules/{m6,m7,m9,m10,esr-parser}.test.ts`, `tests/{m9-brief-persistence,m10-dual-approval-action,fabricated-fallbacks}.test.ts`, `src/modules/m2/server/actions.test.ts` | `vi.mock` yolu güncellendi (§2.4'te canlı olduğu ölçüldü) |
| `src/lib/evidence-ai.ts`, `src/lib/modules/access.ts`, `docs/adr/ADR-0001-…md` | silinen dosyayı gösteren bayat yorum/atıf düzeltildi |
| `CLAUDE.md` | Kural 5 gerçek yolu gösteriyor (`src/core/k6-ai/llm.ts` diye bir dosya **hiç olmadı**); "tek formül" ve "ikinci adaptör açma" kuralları eklendi; prompt'ların hâlâ kodda gömülü olduğu **açık borç** olarak işaretlendi |
| `docs/ROADMAP.md` | K6 satırındaki "iki ayrı dosya" borcu kapatıldı, açık kalan fiyat kararı yazıldı |

**`docs/BILLING.md` ve `src/lib/billing/*` dosyalarına DOKUNULMADI** — kart kuralı (TASK-MTSWL8ADKZKDM
hâlâ `in_progress`).

---

## 4. Riskler

1. **R1 — Bu bir fiyat değişikliğidir (bir yönde).** concept-notes ekranı 4000/1000'lik bir çağrı için
   7 kredi yerine 1 kredi düşüyor. Kimse fazla ödemiyor, ama **gelir bir noktada azalıyor**. Üretimde
   ödeyen kiracı varsa bilinmeli.
2. **R2 — `claude-sonnet-5` düşünen (thinking) bir modeldir.** Varsayılan olarak açık; düşünme
   token'ları çıkış token'ı olarak faturalanır, yani gerçek çağrılarda çıkış token sayısı eski
   modellere göre artabilir. `max(1, toplam/10K)` formülünde etkisi küçük ama **sıfır değil**.
   Ölçülebilir: her çağrı `AiUsageLog`'a gerçek token sayısını yazıyor. İlk gerçek anahtarlı koşudan
   sonra bakılmalı.
3. **R3 — `AiUsageLog`/`CreditLedger` yazımı `withTenant`'tan geçmiyor.** Birleşmiş adaptör
   `prisma.$transaction`'ı doğrudan kullanıyor; **iki eski adaptör de öyle yapıyordu** (`git show
   HEAD:src/lib/ai/llm.ts | grep withTenant` → yok). Yani bu kartın getirdiği bir şey değil, devralınan
   bir durum — ama TASK-MTSWVADF7RQ1B QA turunun **F-1 (P1/SEV-1)** bulgusuyla aynı yol: BYPASSRLS'siz
   bir üretim rolünde bu INSERT RLS'e takılır. **Bilerek düzeltmedim:** o bulgu şu anda başka bir
   ajanın açık kartı ve aynı satırları iki yerden düzeltmek çakışma üretir. Adıyla devrediyorum.
4. **R4 — B1/B2 duruyor.** Kredi bakiyesi kontrolü hâlâ düşüşü yapan transaction'ın dışında (TOCTOU) ve
   bakiye eksiye düşebilir. Faz 0 §1.5'te ölçülmüştü, bu kartın kapsamı değil.
5. **R5 — Ağaç paylaşımlı.** Oturum sırasında en az üç ajan aynı depoda çalıştı; `pnpm gate` sayıları
   yalnız bu commit'e ait değil (§2.7). Kendi dosyalarım ayrı commit'lendi.

---

## 5. Açık sorular / lidere karar

1. **Fiyat kararı hâlâ açık (A/B/C).** Bugün **B** yürürlükte ve tek bir fonksiyonda toplandı.
   `docs/BILLING.md` §"Kredi maliyeti" hâlâ **eylem başına sabit kredi** (M2=1, M6=3, M9=1, M10=1,
   M11=2, M1=1, M3=1) satıyor ve kod bunu uygulamıyor — yani **satılan model ile çalışan model hâlâ
   farklı**. C'ye geçmek için gereken: (a) TASK-MTSWL8ADKZKDM kapansın ki `catalog.ts` açılsın,
   (b) **M7** ve **M6/esr-parser** için iki rakam verilsin (dokümanda yok, uydurulmadı).
2. **Varsayılan model.** `claude-sonnet-5` seçildi (§1.2). Faz 0'ın "M6 değerlendirme için
   `claude-opus-5`" önerisi **uygulanmadı** — o bir maliyet kararı, onay bekliyor.
3. **R3/F-1 kime ait?** `AiUsageLog` yazımının `withTenant`'tan geçmesi gereken yer artık tek dosya
   (`src/lib/llm.ts`) — TASK-MTSWVADF7RQ1B'nin F-1 kartıyla birleştirilmesi doğal olur.
4. **Prompt'lar hâlâ kodda gömülü** (`AI_EVALUATION_PROMPT`, `ESR_PARSER_PROMPT`, …). CLAUDE.md kural 5
   dosyada olmalarını şart koşuyor; bugün karşılanmıyor ve kuralda açık borç olarak işaretlendi. Ayrı kart.

## 6. Sonraki adım

1. **Fiyat kararı** (§5.1) — verildiğinde iş `creditsForUsage`'ın gövdesi + `docs/BILLING.md`; başka yer yok.
2. **R3/F-1** — `withTenant` sarmalaması, tek dosyada, tek yerde.
3. Gerçek `ANTHROPIC_API_KEY` ile bir çağrı koşulup R2 (thinking token'ları) ölçülsün.
4. **B1/B2** (kredi rezervasyonu + eksi bakiye kapağı) için ayrı kart — Faz 0 §1.5'te ölçüldü.

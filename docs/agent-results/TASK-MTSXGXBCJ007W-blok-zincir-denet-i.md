# TASK-MTSXGXBCJ007W — QA doğrulaması: iki LLM adaptörü birleşti mi, ve bir çağrı gerçekten bir kez mi fiyatlanıyor?

**Ajan:** blok-zincir-denet-i (QA-EN) · **Sprint:** SPRINT-S12 · **Tip:** doğrulama + regresyon avı
**Ölçülen sürüm:** temiz `git worktree`, HEAD `269f182`; bütün sondalar F-1 indikten sonra HEAD `5c09f40`'ta **tekrar koşuldu, sonuç aynı** (kanıt §F) · **Kanıt:** `docs/agent-results/TASK-MTSXGXBCJ007W-evidence/`
**Karar:** kartın kendi iddiası **KAPANDI**. Ama aynı fatura yolunda **SEV-1 bir çift düşüş** duruyor → **bugünkü haliyle yayına uygun DEĞİL.**

---

## 1. Ne yapıldı

Kart "körlemesine güvenme, yeniden ölç" diyordu; öyle yapıldı.

Paylaşımlı ağaçta `src/lib/llm.ts` üzerinde **başka bir ajanın commit'lenmemiş** değişikliği vardı
(F-1 / `withTenant` sarmalaması, TASK-MTSYH8LDGV5YU). O değişikliğe **dokunulmadı**; ölçüm için
HEAD'de ayrı bir `git worktree` açıldı. Bu raporun bütün sayıları HEAD `269f182`'ye aittir.

Üç gerçek-yol sondası yazıldı ve gerçek yerel Postgres'e karşı koşuldu. Taklit edilen tek şey
sağlayıcıya giden HTTPS çağrısı, oturum (auth), modül kapısı ve `next/cache`'tir —
**fatura yolunun (llm.ts + prisma + withTenant + CreditLedger + AiUsageLog) tamamı gerçektir.**
Her sonda kendi satırlarını siliyor; DB bulunduğu gibi bırakıldı (`AiUsageLog=0 CreditLedger=0`).

---

## 2. Kanıt

Tam çıktı: `TASK-MTSXGXBCJ007W-evidence/qa-run-output.txt`. Sonda betikleri aynı dizinde.

### 2.1 Kartın asıl iddiası — **GEÇTİ**

Aynı 4000 giriş / 1000 çıkış çağrısı, M2'nin kullandığı iki giriş şeklinden geçirildi:

```
AiUsageLog: {"model":"claude-sonnet-5","promptHash":"8cb4ab33…4fca63ac","credits":1,"hashLen":64}
AiUsageLog: {"model":"claude-sonnet-5","promptHash":"8cb4ab33…4fca63ac","credits":1,"hashLen":64}
ledger debits: [{"delta":-1,"reason":"usage:M2"},{"delta":-1,"reason":"usage:M2"}]
screen shows credits: 1 | row says: 1
same credits: true | same hash: true | hash 64: true | same model: true
```

`src/lib/ai/llm.ts` yok, `generateWithAI` sıfır çağıran, `AiUsageLog`'a yazan tek dosya
`src/lib/llm.ts`, kredi formülünün deposunda ikinci bir kopyası yok.

**Çürütme sondası:** ikinci formül ve 16 haneli hash `generateCompletion`'a geri kondu; aynı gerçek
DB'de kartın tarif ettiği tablo birebir yeniden üredi (`credits: 1` vs `credits: 7`, `hashLen 64` vs
`16`, defter `-1` vs `-7`) ve sondam kırmızıya döndü (`expected 1 to be 7`). Mutasyon geri alındı.
Yani buradaki yeşil bir anlam taşıyor.

### 2.2 BULGU QA-1 (SEV-1) — bir YZ eylemi, **iki** kredi düşüşü

Gerçek M6 sunucu eylemi (`generateAiEvaluation('demo-opp-1')`), tek çağrı:

```
balance BEFORE: 500
--- debit rows written by ONE evaluation ---
{"delta":-3,"reason":"M6: Evaluator Lens AI pre-assessment"}
{"delta":-1,"reason":"usage:M6"}
--- AiUsageLog rows ---
{"module":"M6","purpose":"evaluation","model":"claude-sonnet-5","inputTokens":4000,"outputTokens":1000,"credits":1}
balance AFTER: 496 | total debited: 4
```

**Denetim kaydı 1 kredi diyor; kiracıdan 4 kredi alındı.** Aynı desen M9 ve M10'da da ölçüldü:

| Modül | `AiUsageLog.credits` | `CreditLedger` toplam | Sapma |
|---|---|---|---|
| **M6** | 1 | **−4** (−3 sabit + −1 token) | **4×** |
| **M9** | 1 | **−2** (−1 sabit + −1 token) | **2×** |
| **M10** | 1 | **−2** (−1 sabit + −1 token) | **2×** |
| M2 / M7 / M6-esr-parser / concept-notes | 1 | −1 | doğru |

**Tekrar üretim:** `docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-double-charge.probe.test.ts`
ve `qa-m9m10.probe.test.ts` dosyalarını depoya koy, `npx vitest run <dosya>`. Beklenen: tek çağrı
için tek düşüş satırı. Gözlenen: iki satır.

**Etki.** (a) Kiracı, kendi kullanım ekranında gördüğünden 2–4 kat fazla ödüyor. (b) `AiUsageLog` ile
`CreditLedger` mutabakatı imkânsız — CLAUDE.md kural 7 (ekrandaki her rakam bir kayda bağlı) bu yolda
karşılanmıyor. (c) Fiyat modüle göre tutarsız: aynı büyüklükteki çağrı M6'da 4, M2'de 1 kredi.

**Kart öncesinden mi geliyor?** Evet — silinen `src/lib/ai/llm.ts` de kredi düşüyordu
(`git show b6f1642^:src/lib/ai/llm.ts` satır 107–110). Yani bu, birleştirmenin **getirdiği** bir
regresyon değil; birleştirmenin **kapatmadığı**, aynı kartın konusu olan (faturalama doğruluğu) bir
kusur. Kartın kapanışını bu haliyle imzalamam.

**Geliştirici raporunun bir tespiti yanlış.** `TASK-MTSXGXBCJ007W-blok-zincir-dse-2.md` §5.1 ve
`src/lib/llm.ts:56-62` yorumu "docs/BILLING.md eylem-başına sabit krediyi satıyor ve **hiçbir kod
bunu uygulamıyor**" diyor. Uyguluyor: `docs/BILLING.md` satır 53'teki M6=3, M9=1, M10=1 rakamları
`m6/m9/m10 server/actions.ts` içindeki `delta` değerleriyle **birebir aynı**. Sabit model kodda var;
token modeli onun **üstüne** ekleniyor. Fiyat kararı (A/B/C) bu yüzden düşünülenden dar değil —
"formülü seç" değil, "iki tahakkuktan hangisi kalacak" sorusu.

### 2.3 BULGU QA-2 (SEV-2) — 1424 yeşil test bunu neden görmüyor

```
tests/modules/m6.test.ts:98: vi.mock('../../src/lib/llm', () => ({ generateText: h.generateText }));
tests/modules/m6.test.ts:155: expect(h.creditLedgerCreate).toHaveBeenCalledWith(…)
```

Test adaptörü mock'luyor, dolayısıyla adaptörün kendi `CreditLedger` yazımı testin görüş alanında
değil; sonra modülün sabit düşüşünü doğrulayıp "doğru" diyor. **Depoda, defterin `AiUsageLog`'un
yazdığı kadar hareket ettiğini doğrulayan tek bir test yok.** Kapı bu yüzden 4× fazla tahakkukun
üstünden yeşil geçiyor. Düzeltme hangi yönde yapılırsa yapılsın, yanına bu invaryantı kilitleyen bir
test gerekiyor (mock'suz, gerçek DB'li; sondalarım hazır iskelet).

### 2.4 Kapı (HEAD, temiz worktree)

```
$ npx tsc --noEmit   → TYPECHECK exit=0
$ npx eslint .       → LINT exit=0
$ npx vitest run     → Test Files 121 passed | 2 skipped (123)
                       Tests 1416 passed | 8 skipped (1424)   0 düşen
```

`pnpm rls:check` / `rls:verify` **koşulmadı**: `scripts/check-rls-live.ts` şu anda
TASK-MTSYG783RIIEE altında yeniden yazılıyor ve ağaçta commit'siz duruyor; koşmak başka bir ajanın
yarım işini ölçmek olurdu.

### 2.5 Ölçüm ortamının sınırı (dürüstlük notu)

Yerel DB rolü SUPERUSER; RLS uygulanmıyor. Sonda sırasında ölçüldü: `demo-tenant` ile
`esr-calibration` **aynı** workspace ve opportunity satırlarını okuyor. Yukarıdaki sayılar
**kredi muhasebesi** için geçerlidir, herhangi bir RLS iddiası için değildir. Ayrıca token
rakamları (4000/1000) taklittir; ölçülmüş sağlayıcı kullanımı değildir.

---

## 3. Değişen dosyalar

Üretim kodunda **hiçbir değişiklik yapılmadı** (QA turu). Eklenenler:

| Dosya | Ne |
|---|---|
| `docs/agent-results/TASK-MTSXGXBCJ007W-blok-zincir-denet-i.md` | bu rapor |
| `docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-run-output.txt` | ham koşu çıktısı |
| `docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-card-claim.probe.test.ts` | kartın iddiasını ölçen sonda (+ çürütme) |
| `docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-double-charge.probe.test.ts` | M6 çift düşüş sondası |
| `docs/agent-results/TASK-MTSXGXBCJ007W-evidence/qa-m9m10.probe.test.ts` | M9/M10 çift düşüş sondası |

Sondalar `docs/` altında duruyor, `src/` altında değil — böylece `pnpm test` onları toplamıyor ve
gerçek DB'ye bağlanan bir test kapıya sızmıyor. Düzeltmeyi yapan kişi bunları `src/lib/` altına
taşıyıp regresyon testine çevirebilir.

---

## 4. Riskler

1. **Çift düşüş üretimde para kaybettiriyor olabilir** — ödeyen kiracı varsa fazla tahsilat söz
   konusudur; düzeltme geriye dönük bir mutabakat da gerektirebilir. Bu, bir yazılım kararı değil.
2. **Düzeltme yönü bir fiyat kararıdır.** Sabit tahakkuku silmek M6'yı 4→1 krediye düşürür (gelir
   azalır); token tahakkukunu silmek büyük çağrıları ucuzlatır ve `docs/BILLING.md`'ye uyar ama M7 ile
   M6/esr-parser için dokümanda rakam yok. QA olarak yön önermiyorum; **iki tahakkumdan yalnız birinin
   kalması gerektiğini** ölçüyorum.
3. **Ağaç paylaşımlı.** Ölçüm sırasında `src/lib/llm.ts` başka bir ajanın elindeydi (F-1). O iş
   rapor yazılırken `30c3c6c` ile indi; üç sonda da HEAD `5c09f40`'ta **tekrar koşuldu ve birebir
   aynı sonucu verdi** (`qa-run-output.txt` §F). `withTenant` sarmalaması iki düşüşten hiçbirini
   kaldırmıyor — bulgu F-1 sonrasında da geçerli.
4. **Sondalar `demo-tenant` üzerinde çalışıyor** ve `AiUsageLog`/`CreditLedger` satırlarını siliyor.
   Aynı DB'de ölçüm yapan başka bir ajan varsa çakışır; koşmadan önce haberleşilmeli.

---

## 5. Açık sorular

1. **Hangi tahakkuk kalacak?** (sabit / token) — patron kararı. Karar `creditsForUsage` gövdesini
   **ve** üç modül eylemini ilgilendiriyor; geliştirici raporunun "tek fonksiyon" tahmini eksik.
2. **Üretimde fazla tahsilat oldu mu?** `CreditLedger` içinde `reason LIKE 'M6:%'` ile `reason =
   'usage:M6'` satırlarının çakıştığı kiracılar sorgulanmalı. Bu ortamdan üretim DB'sine erişilmiyor.
3. `AiUsageLog.credits`'in "gerçekten düşülen" mi yoksa "token maliyeti" mi olduğu tanımlanmalı;
   bugün ikisi aynı şey sanılıyor ve üç modülde değil.

---

## 6. Sonraki adım

1. **QA-1 için kart açıldı: `TASK-MTSZ21XP2R42B`** (SPRINT-S12, todo, P1) — orada düzeltilecek: M6/M9/M10'daki `creditLedger.create` ile adaptörünki arasından
   biri kalsın; yanına §2.3'teki eksik invaryant testi (`ledger toplamı == AiUsageLog.credits`)
   yazılsın. Kanıt: bu rapordaki sondalar aynen koşulup **1 satır** dönmeli. Yön (sabit mi token mi)
   bir fiyat kararıdır ve kartta patrona iki seçenek olarak bırakıldı.
2. TASK-MTSXGXBCJ007W'yi **kapatma**; kartın başlığı ("bir çağrı, bir fiyat") QA-1 kapanmadan
   karşılanmıyor.
3. `src/lib/llm.ts:56-62` yorumu ve `-dse-2.md` §5.1 düzeltilsin ("hiçbir kod uygulamıyor" yanlış).
4. ~~F-1 (`withTenant`) commit'lendikten sonra §2.2 sondaları tekrarlansın.~~ **Yapıldı** — `5c09f40`'ta
   aynı sonuç (§F).

**Sondaları koşarken:** her dosya AYRI bir `vitest run` çağrısıyla koşulmalı. Üçü de `demo-tenant`
üzerinde çalışıp kendi satırlarını sildiği için vitest'in varsayılan dosya paralelliği altında
birbirlerinin satırlarını siliyorlar; üçünü birlikte koşan ilk denemem anlamsız bir karışım üretti
(bakiye −3, boş `AiUsageLog`, 1503 düşüş) — bu bir ölçüm hatasıydı, ürün kusuru değil.

# TASK-MUN4PSBP19RKK — devop-fb — FB LLM yarım cevap: stop_reason okunuyor

**Sprint:** FB-GAP-1 · **Dal:** dev · **Commit:** `5927c64d` · **Kaynak:** docs/agent-results/TASK-MUN3FWZWT11MX-se-fb.md §2, §4, §5, §6

## 1. Ne yapıldı

**Sorun:** `src/lib/llm.ts` `callProvider`, Anthropic yanıtındaki `stop_reason`'ı hiç okumuyordu. `max_tokens` ile kesilen belge de, `refusal` da "başarılı" sayılıyordu: metin kaydediliyor, kullanıcıya gösteriliyor ve kredi düşülüyordu.

**Değişiklik:**

1. **stop_reason okunuyor ve taşınıyor.** `callProvider` Anthropic `stop_reason` + `stop_details.category`, OpenAI `choices[0].finish_reason` okuyor. `LlmCompletion.stopReason: string | null` alanı eklendi (ham değer). Bunlar tek bir `outcomeOf()` ile üç sonuca eşleniyor:
   | Sağlayıcı değeri | Sonuç |
   |---|---|
   | `end_turn`, `stop_sequence`, OpenAI `stop`, değer yok | tamam → metin döner, katalog fiyatı düşülür |
   | `max_tokens`, `model_context_window_exceeded`, OpenAI `length` | **kesik** → `LlmTruncatedError` |
   | `refusal`, OpenAI `content_filter` | **ret** → `LlmRefusalError` (`category` taşır) |
2. **max_tokens → açık hata (devam isteği değil).** Kesik ya da ret olan çağrıda `AiUsageLog` satırı **credits 0** ile yazılıyor (istem sağlayıcıya ulaştı; CLAUDE.md kural 5 / GDPR md. 30 kaydı sürüyor). `CreditLedger` satırı **yazılmıyor**. Ardından hata fırlatılıyor. `generateText` de fırlatıyor, yani yarım metni string olarak alabilen bir çağrı noktası kalmadı. Hatalar yeniden denenmiyor: aynı istem aynı yerde kesilir ve bir kez daha faturalanır.
   - **Neden devam isteği (continuation) değil?**
     (a) `claude-sonnet-5`'te assistant prefill **400 döndürüyor** (claude-api skill: "Prefill removed … Sonnet 5"). Devam ettirmenin tek yolu "kaldığın yerden sürdür" diyen yeni bir user mesajı. Hukuki metinde (NDA, beyan) bu, madde tekrarı ya da atlaması riski taşıyan bir ek yeri bırakır.
     (b) Devam isteği tek eylemde iki sağlayıcı çağrısı ve iki `AiUsageLog` satırı demek. Bu da "1 eylem = 1 kayıt = katalog fiyatı" değişmezini bozar.
     (c) İkinci çağrı da kesilebilir.
     (d) Asıl kaldıraç tavanı yükseltmek (madde 4). Canlı ölçümde 8192 ile kesilme 0/5.
3. **refusal → anlamlı hata, kredi düşmez.** `LlmRefusalError` (`digest = LLM_REFUSED`), kayıt credits 0, ledger yok.
4. **Ekranda görünüyor.** Yeni `src/lib/llm-outcome.ts` (client-safe) `LLM_TRUNCATED` / `LLM_REFUSED` digest'lerini tanımlıyor. Mekanizma `pilot-expired.ts` ile aynı: prod'da tarayıcıya yalnız digest ulaşır. `useActionErrorText` bu iki digest'i `Common.aiTruncated` / `Common.aiRefused` cümlesine çeviriyor (tr + en). Çağrı noktaları:
   - **M10** `generateStandardDoc`: bu iki hatayı genel "Document generation failed" hatasına çevirmeden yeniden fırlatıyor. Belge oluşmuyor, `recordAlert` yine yazılıyor.
   - **M7** `generateIpChecklist`: her hatayı hazır (canned) listeyle örten catch bloğu artık bu iki hatayı yeniden fırlatıyor.
5. **Purpose bazında maxTokens.** `MAX_TOKENS_OVERRIDES = { M7: 8192, M10: 8192 }`, diğer eylemler 4096. Öncelik sırası: açık `maxTokens` > tablo (`module:purpose` > `module`) > varsayılan. `maxTokensFor()` dışa açık.
6. **OpenAI yolu** aynı davranışta (`length` / `content_filter`).
7. **Varsayılan model değişmedi:** `claude-sonnet-5`. `DEFAULT_MODELS` satırına dokunulmadı.

## 2. Kanıt

**Hedefli testler** (fetch mock, `@/lib/db` mock):
```
npx vitest run src/lib/llm.stop-reason.test.ts src/lib/llm.generate.test.ts src/lib/llm.embed.test.ts
 Test Files  3 passed (3)
      Tests  79 passed (79)
npx vitest run tests/modules/m10.test.ts tests/modules/m7.test.ts          → 19 passed
npx vitest run tests/llm-outcome-message.test.tsx tests/pilot-expired-action-message.test.tsx → 14 passed
npx vitest run tests/double-charge-prevention.test.ts tests/fabricated-fallbacks.test.ts tests/modules/ai-module-gate.test.ts tests/prompt-snapshots.test.ts tests/modules src/lib
 Test Files  75 passed (75)
      Tests  1007 passed (1007)
```
`llm.stop-reason.test.ts` şunları kapsıyor: `end_turn`, `stop_sequence`, değer yok, `max_tokens`, `model_context_window_exceeded`, `refusal` (category'li ve category'siz), OpenAI `stop` / `length` / `content_filter`. Her durumda ledger yazıldı mı, usage satırında `credits` kaç, digest ve yeniden deneme sayısı ayrı ayrı doğrulanıyor. Ayrıca istek gövdesinde `max_tokens` 8192/4096 kontrol ediliyor.

**Mutantlar: 11/11 kırmızı.** Betik kaynakta tek satırı değiştiriyor, 5 test dosyasını koşuyor, sonra dosyayı geri yüklüyor:
```
M1 anthropic stop_reason ignored: exit=1 -> RED | 8 failed | 83 passed (91)
M2 charge unusable: exit=1 -> RED | 5 failed | 86 passed (91)
M3 ledger guard removed: exit=1 -> RED | 5 failed | 86 passed (91)
M4 no throw on unusable: exit=1 -> RED | 10 failed | 81 passed (91)
M5 openai length ignored: exit=1 -> RED | 1 failed | 90 passed (91)
M6 refusal->truncated: exit=1 -> RED | 2 failed | 89 passed (91)
M7 max tokens table empty: exit=1 -> RED | 3 failed | 88 passed (91)
M8 M10 rethrow removed: exit=1 -> RED | 2 failed | 89 passed (91)
M9 M7 rethrow removed: exit=1 -> RED | 2 failed | 89 passed (91)
M10 hook truncated removed: exit=1 -> RED | 3 failed | 88 passed (91)
M11 stop_reason not read: exit=1 -> RED | 10 failed | 81 passed (91)
```

**Kapılar:**
- `npx tsc --noEmit` → exit 0
- `npx eslint <dokunulan 9 dosya>` → exit 0
- `pnpm i18n:check` → "✅ i18n check passed: both catalogs agree…" (exit 0). Çıktıda bir baseline notu da var (`admin/settings/page.tsx 9 → 7`). O dosya başka bir işe ait; baseline'a dokunmadım.
- **Temiz worktree build:** `git worktree add --detach … HEAD(5927c64d)` → `pnpm install --frozen-lockfile` exit 0 → `pnpm db:generate` → `pnpm build` **exit 0** ("✓ Compiled successfully", 30 sayfa). Not: taze worktree'de `prisma generate` yapılmadan build `Can't resolve '.prisma/client/index-browser'` hatasıyla düşüyor. Bu ön koşul bu değişiklikten bağımsız. Worktree sonra silindi.
- **Tam süit koşulmadı.** Görev "yalnız izole DB'de" diyor. Değişiklik DB şemasına dokunmuyor; DB'ye dokunan tüm yollar mock'lu testlerde kapsandı (1007 test).

**Canlı API** (gerçek `generateCompletion`, gerçek fetch; yalnız `@/lib/db` mock'lu, DB'ye yazım yok). Sentetik fırsat başlığı, tr prompt'lar, `claude-sonnet-5`:
```
AWARD_PACK#0  end_turn  out 4953  credits 1  ledger 1  53.8 s  0.0503 USD
AWARD_PACK#1  end_turn  out 4604  credits 1  ledger 1  47.2 s  0.0468 USD
AWARD_PACK#2  end_turn  out 5033  credits 1  ledger 1  51.0 s  0.0511 USD
NDA#0         end_turn  out 3223  credits 1  ledger 1  31.3 s  0.0329 USD
M7#0          end_turn  out 4182  credits 1  ledger 1  50.9 s  0.0424 USD
forced-cutoff (M10 NDA, maxTokens=300): LlmTruncatedError digest=LLM_TRUNCATED stopReason=max_tokens 300/300, usage row credits 0, ledger writes 0, 3.4 s
Toplam: 0.2272 USD (≤ 2 USD)
```
Bu ölçümde üç AWARD_PACK'in üçü de (4604–5033) ve M7 (4182) eski 4096 tavanında **kesilirdi**. Önceki spike'ta bu oran 2/3'tü. 8192 ile beşi de `end_turn` ile bitti. En uzun çıktı tavanın %61'i.

**Maliyet etkisi** (fiyat claude-api skill'iyle doğrulandı: claude-sonnet-5 $2 / $10 per MTok):
- `max_tokens` bir tavan; faturaya giren yalnızca üretilen token. Zaten bitmiş bir çağrının maliyeti değişmiyor.
- Çağrı başına ek maliyet (4096 tavanına göre, canlı ortalamalarla):
  - AWARD_PACK: ort. 4863 − 4096 = 767 token → **+0,0077 USD**
  - M7: +86 token → +0,0009 USD
  - NDA: 0
  - En kötü durum (8192'ye dayanan bir çağrı): ~0,083 USD, 4096'ya göre +0,041 USD.
- Aylık: se-fb tablosundaki varsayımı kullandım (8 senaryo eşit ağırlıklı; M7 / NDA / AWARD_PACK karışımın 3/8'i). Ortalama çağrı başına ek maliyet (0,0077 + 0,0009 + 0) / 8 ≈ 0,00108 USD:

| Aylık çağrı | sonnet-5 önce (se-fb) | ek | yeni |
|---|---|---|---|
| 500 | 9,77 USD | +0,54 USD | 10,31 USD (+%5,5) |
| 5.000 | 97,73 USD | +5,4 USD | 103,1 USD |
| 25.000 | 488,67 USD | +27 USD | 515,7 USD |

- Üst sınır (M7/M10 çağrılarının hepsi 8192'ye dayanırsa): 25.000 çağrıda +384 USD. Canlı ölçümde gözlenmedi.
- Kredi tarafı: kesik ya da ret olan çağrı artık 0 kredi. Sağlayıcı maliyeti ise yine oluşuyor; bkz. §5 S-2.

## 3. Değişen dosyalar
(commit `5927c64d`; `git show --stat` ile 11 dosyanın hepsinin commit'te olduğu doğrulandı)
- `src/lib/llm.ts`: stop_reason okuma, `outcomeOf`, `LlmTruncatedError` / `LlmRefusalError`, `stopReason` alanı, `MAX_TOKENS_OVERRIDES` + `maxTokensFor`, kesik/ret çağrıda ledger'sız credits-0 kaydı
- `src/lib/llm-outcome.ts` (yeni, client-safe): digest sabitleri, `isLlmTruncated` / `isLlmRefused` / `isLlmUnusableOutcome`
- `src/lib/hooks/use-action-error-text.ts`: iki yeni cümle
- `src/modules/m10/server/actions.ts`, `src/modules/m7/server/actions.ts`: yeniden fırlatma
- `messages/tr.json`, `messages/en.json`: `Common.aiTruncated`, `Common.aiRefused`
- Testler: `src/lib/llm.stop-reason.test.ts` (yeni), `tests/llm-outcome-message.test.tsx` (yeni), `tests/modules/m10.test.ts` (+3), `tests/modules/m7.test.ts` (+2)

## 4. Riskler
- **DB'de stop_reason kolonu yok.** `AiUsageLog`'da `stopReason` yok. Kesik ya da ret satırı yalnız `credits = 0` ile ayırt ediliyor, bu da katalogda zaten 0 kredili eylemlerle (M6 esr-parser) karışabilir. Operatör sinyali şimdilik yapılandırılmış `console.warn('[generateCompletion] unusable outcome', {module, purpose, model, stopReason, outputTokens, maxTokens, refusalCategory})`; kiracı içeriği içermiyor. Şema değişikliği paralel ajanların DB'sini ve Prisma client'ını etkileyeceği için bu kartta yapılmadı (bkz. §5 S-1).
- **Gecikme arttı.** Uzun belgeler artık tamamlandığı için M10 AWARD_PACK ~47–54 sn sürüyor; 8192'ye dayanan en kötü çağrı ~90 sn olur. İstek non-streaming. Next.js server action'ında bu ortamda süre sınırı görmedim; bir barındırma platformu `maxDuration` koyarsa sorun çıkabilir.
- **Diğer ekranlar.** M9 hatada şablon brief'e düşüyor (`aiGenerated=false`, kredi yok, şablon olarak etiketli; önceden de böyleydi). M2, M6 ve concept-notes hatayı yukarı fırlatıyor; `useActionErrorText` kullanmayan bir ekran kendi genel hata metnini gösterir. Sessiz kesik metin hiçbir yolda kalmadı, ama "uzunluk sınırı" cümlesi yalnız bu hook'u kullanan ekranlarda çıkıyor.
- **M7'nin hazır listesi.** Diğer hatalarda (ağ hatası, 5xx) M7 hâlâ hazır bir listeyi AI çıktısı gibi gösteriyor. Bu davranış bu kartın kapsamı dışında ve eskiden de vardı.

## 5. Açık sorular (ürün kararı)
- **S-1:** `AiUsageLog.stopReason String?` migration'ı açılsın mı? Önerim evet: ayrı bir kart, izole DB'de, nullable ve geriye uyumlu.
- **S-2:** Kesik ya da ret olan çağrıda sağlayıcı maliyeti ev tarafından karşılanıyor (kiracıdan 0 kredi). Kötüye kullanım yüzeyi dar: M10 istemi yalnız belge türü ile fırsat başlığından oluşuyor. Patron "kesik çağrı da ücretlidir" derse değişiklik tek satır: `llm.ts` içinde `const credits = outcome === 'complete' ? price : 0`.
- **S-3:** M10 belgeleri için hedef uzunluk ne? Sonnet 5 AWARD_PACK'te ~4.9K token üretiyor. İstemde "en fazla N kelime" sınırı konursa hem maliyet hem gecikme düşer.

## 6. Sonraki adım
1. S-1 kararına göre `stopReason` kolonu kartı.
2. se-fb §6 madde 2: bu düzeltme girdiği için 5.5 + `max_tokens` 8192–16000 + `output_config.effort` spike'ı artık adil koşulabilir.
3. İzleme: prod log'unda `unusable outcome` satırının `purpose` bazında sayısı. M7/M10 dışında bir eylemde görünürse o eylem de tabloya eklenmeli.

## Platform beyanı
Doğrulama **macOS**'ta (darwin) yapıldı: vitest, tsc, eslint, i18n:check, temiz worktree'de `pnpm build`, canlı API. Dokunulan kod platformdan bağımsız: `fetch` + JSON ayrıştırma + Prisma çağrıları + React hook. Süreç, dosya yolu, kabuk ya da ikili adı kullanılmıyor, yani Linux ve Windows'ta davranış aynı. Linux ve Windows'ta koşulmadı, çünkü bu makinede yalnız macOS var; CI (Linux) aynı vitest süitlerini koşacak.

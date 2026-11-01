# TASK-MUN5CLXDHNJSO — crw-fb — FB İNCELEME-43: TASK-MUN4PSBP19RKK (LLM yarım cevap / stop_reason)

**Sprint:** FB-GAP-1 · **Dal:** dev · **İncelenen:** `5927c64d` (kod) + `06d50a96` (rapor), yazar devop-fb · **Kod değiştirilmedi.**

## KARAR: **ONAY** — bloke eden bulgu yok

Kart DoD'unu karşılıyor. Stop reason her yolda okunuyor. Kesik ya da reddedilmiş metin hiçbir çağıranda kaydedilmiyor ve ücretlendirilmiyor. Token kullanımı yine de `AiUsageLog`'a gerçek sayılarla yazılıyor. tr/en mesajlar ekranda çıkıyor. 8192 tavanının maliyet hesabı güncel fiyatla tutuyor. Varsayılan model değişmemiş. Aşağıdaki Ö-1..Ö-5 bloke etmeyen öneriler; Ö-1 ve Ö-2 için ayrı kart öneriyorum.

## 1. Ne yapıldı
1. Diff satır satır okundu: `llm.ts`, `llm-outcome.ts`, `use-action-error-text.ts`, m7/m10 actions, `messages/*`.
2. Bütün LLM çağıranları tarandı (`generateCompletion|generateText|api.anthropic|api.openai|@anthropic-ai/sdk`, `/usr/bin/grep`). Her birinde hata yolu okundu, ayrıca her birinin ekranındaki catch bloğu da (§2.2).
3. Temiz worktree açıldı (HEAD `bf213b0d`, `5927c64d`'yi içeriyor). Önce hedefli testler, sonra 9 kendi mutantım koşuldu.
4. Canlı DB testleri için izole DB kuruldu: `crwfb_in43`, `fabrika`'nın `pg_dump` kopyası. Üzerinde kendi probum ve para yolundaki canlı testler koşuldu. İş bitince DB `dropdb` ile, worktree `git worktree remove` ile silindi.
5. Fiyat ve stop_reason semantiği claude-api skill'iyle doğrulandı. Next.js 16.3.4'ün digest davranışı kaynak koddan kontrol edildi.

## 2. Kanıt

### 2.1 Kontrol listesi

| İstenen kontrol | Sonuç |
|---|---|
| **stop_reason kapsamı**<br>`end_turn`, `stop_sequence` → tamam<br>`max_tokens`, `model_context_window_exceeded` → kesik<br>`refusal` → ret<br>`pause_turn`, `tool_use` → tamam | ✔ `llm.ts` `outcomeOf`. `pause_turn` / `tool_use` hiçbir çağıran tools göndermediği için oluşamaz (bkz. Ö-4). |
| **OpenAI `finish_reason`**<br>`length` → kesik, `content_filter` → ret | ✔ OpenAI yolu şu an ölü kod: `DEFAULT_PROVIDER = 'anthropic'` (`llm.ts:31`) ve hiçbir çağıran `provider` geçmiyor. |
| **Kesik/ret yeniden denenmiyor** | ✔ `callProvider` normal dönüyor, `withRetry` yalnız throw'da tekrar ediyor. Canlı probda `calls === 1`. |
| **Kesik metin hiçbir yerde sessizce kaydedilmiyor** | ✔ Çağıranların tamamı aşağıda (§2.2). |
| **Kredi ve AiUsageLog tutarlılığı** | ✔ Gerçek Postgres + RLS üzerinde (§2.4): kesik ya da ret → usage satırı `credits 0`, `inputTokens` / `outputTokens` gerçek değerler, `CreditLedger` satırı yok, bakiye aynı. `end_turn` kontrolünde bakiye 1000 → 997. |
| **UI mesajı tr/en** | ✔ `Common.aiTruncated` / `aiRefused` her iki katalogda var; `i18n:check` geçti. İlgili ekranların hepsi `errorText(err, …)` kullanıyor. Next 16.3.4 mevcut `digest`'i koruyor (`create-error-handler.js:79-81` "If the error already has a digest, respect the original digest"). |
| **8192 maliyet etkisi** | ✔ §2.5 |
| **En az 3 mutant** | ✔ 9 mutant: 7 kırmızı, 2 hayatta (düşük önem, Ö-3) |
| **Varsayılan model `claude-sonnet-5`** | ✔ `llm.ts:43` satırı en son `b6f16427`'de değişmiş (`git log -L43,43`); `5927c64d` bu satıra dokunmuyor. |

### 2.2 Çağıranlar: kesik ya da ret gelince ne oluyor

| Çağıran | Davranış | Ekran |
|---|---|---|
| M10 `generateStandardDoc` | Hata yeniden fırlatılıyor; `FollowupDoc` yazılmıyor (canlı probla kanıtlı). | `documents/client.tsx`: `errorText(err, null)` |
| M7 `generateIpChecklist` | Hata yeniden fırlatılıyor; hazır liste gösterilmiyor. | `tto/client.tsx`: `errorText(err, null)` |
| M6 `generateAiEvaluation` / `esr-parser` | `generateText` fırlatıyor, JSON parse ve kayıt adımına hiç gelinmiyor (canlı prob: Evaluation satır sayısı değişmedi). | `evaluations/client.tsx`: `errorText` |
| M9 `generateMeetingBrief` | catch bloğu şablon brief'e düşüyor; `aiGenerated=false`, kredi yok, kayıt şablon olarak etiketli. Kesik AI metni kaydedilmiyor. | "uzunluk sınırı" cümlesi çıkmıyor (eskisi gibi) |
| M2 `generateConceptNoteDraft` | Bölüm döngüsünde hata fırlatılıyor, not yazılmıyor. Kısmi ücret sorunu için bkz. **Ö-1**. | `ConceptNoteEditor.tsx`: `errorText` |
| concept-notes `generateSectionDraft` | `generateCompletion` fırlatıyor, not güncellenmiyor. | `editor.tsx`: `errorText` |
| m11 `generateSectionDraftAi` | LLM çağrısı **yok**, sabit şablon döndürüyor (`m11/server/actions.ts:427`); bu değişiklikten etkilenmiyor. | — |

Not: Paylaşılan ağaçta commit edilmemiş m11 değişiklikleri var (`actions.ts` heartbeat, `PartBCollaborativeEditor.tsx`). Bunlar TASK-MUN4H2RL79D8B'ye ait ve bu incelemenin konusu değil. Onlara dokunmadım.

### 2.3 Temiz worktree: hedefli testler + kapılar
```
npx vitest run src/lib/llm.stop-reason.test.ts src/lib/llm.generate.test.ts tests/modules/m10.test.ts tests/modules/m7.test.ts tests/llm-outcome-message.test.tsx
 Test Files  5 passed (5)
      Tests  91 passed (91)
npx tsc --noEmit                 → tsc=0
pnpm i18n:check                  → ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
```
Aynı worktree'de, DB bağlantısı olmadan geniş küme de koşuldu (`tests/modules src/lib` …). Sonuç: 35 test kırmızı. Kırmızıların hepsi `PrismaClientKnownRequestError: Authentication failed … fabrika`; yani `.env` olmadığı için canlı-DB testleri bağlanamadı (plan-repository, plan-admin, double-charge). Bu değişiklikle ilgisi yok. DB'ye dokunan testler aşağıda izole DB'de yeniden koşuldu.

### 2.4 İzole DB (`crwfb_in43`, fabrika kopyası) — canlı prob + para yolu testleri
Kendi probum (atılabilir, commit edilmedi) `tests/zz-crwfb-probe.live.test.ts`. Yalnız sağlayıcı fetch'i ve oturum/gate modülleri mock'lu. Prisma, `withTenant`/RLS ve `llm.ts` gerçek.
```
 ✓ M10 AWARD_PACK max_tokens: throws LLM_TRUNCATED, no FollowupDoc, ledger unchanged, usage row credits 0 with real tokens
     M10 usage row { credits: 0, inputTokens: 1234, outputTokens: 8192, … } balance 1000 -> 1000
 ✓ M6 evaluation refusal: throws LLM_REFUSED, no Evaluation row, ledger unchanged
 ✓ control: end_turn charges once        control balance 1000 -> 997
      Tests  3 passed (3)
```
Para yolundaki mevcut canlı testler aynı izole DB'de, dosya dosya koşuldu:
```
tests/double-charge-prevention.test.ts          Tests  5 passed (5)
tests/concept-template-tenant-scope.live.test.ts Tests  6 passed (6)
tests/m9-brief-opportunity.live.test.ts         Tests  4 passed (4)
```
İzolasyon kanıtı (`pg_stat_database.xact_commit`): önce `crwfb_in43=919 fabrika=11065`, sonra `crwfb_in43=1044 fabrika=11067`.
- `fabrika`'daki +2, aynı anda çalışan diğer ajanlardan ve uygulamadan geliyor. Worktree `.env`'indeki üç DB URL'sinin (`DATABASE_URL`, `_MIGRATE`, `_RLS_TEST`) üçü de `crwfb_in43`'e yönlendirilmişti.
- Bu dosyaları paralel koşunca aynı `demo-tenant` ledger'ını ortak kullandıkları için birbirlerini bozdular (5 kırmızı). Bu bir test altyapısı notu; tek tek koşunca hepsi yeşil.

**Tam süit koşulmadı.** Değişiklik şemaya dokunmuyor. Para ve kayıt yolu yukarıda izole DB'de koşuldu.

### 2.5 Mutantlar (kendi 9 mutantım; yazarın 11'inden farklı)
Temiz worktree'de, 5 hedefli test dosyasına karşı koşuldu. Her mutantta perl ile uygula → koş → geri yükle.
```
X1 ctx-window->complete:             Tests  1 failed | 90 passed  → KIRMIZI
X2 openai content_filter->complete:  Tests  1 failed | 90 passed  → KIRMIZI
X3 explicit maxTokens ignored:       Tests  1 failed | 90 passed  → KIRMIZI
X4 pair-key lookup dropped:          Tests  91 passed             → HAYATTA (Ö-3)
X5 hook refusal->truncated text:     Tests  1 failed | 90 passed  → KIRMIZI
X6 M7 rethrow only truncated:        Tests  1 failed | 90 passed  → KIRMIZI
X7 refusal category dropped:         Tests  1 failed | 90 passed  → KIRMIZI
X8 digest-only (code ignored):       Tests  91 passed             → HAYATTA (Ö-3)
X9 charge on refused (≠complete):    Tests  3 failed | 88 passed  → KIRMIZI
```

### 2.6 Maliyet (claude-api skill, önbellek 2026-09-25: claude-sonnet-5 **$2 / $10 per MTok**)
- `max_tokens` bir tavan; faturaya yalnız üretilen token giriyor. Skill de "hitting the cap truncates output … requires a retry" diyor ve non-streaming için ~16000'e kadar tavanı normal sayıyor. 8192 bu sınırın içinde.
- AWARD_PACK: canlı ortalama (4953+4604+5033)/3 = 4863 token, yani 4096'nın 767 üstü. 767 × $10/MTok = **+$0.0077/çağrı**. M7: +86 token, yani **+$0.0009**. NDA: 0.
- En kötü durum (8192'ye dayanan çağrı): çıktı başına $0.082, bunun 4096'ya göre farkı **+$0.041**.
- Aylık: (0.0077 + 0.0009 + 0) / 8 senaryo ≈ **$0.00107/çağrı**. 500 çağrıda **+$0.53** (yazar +$0.54 demiş; fark yuvarlama), 25.000 çağrıda **+$26.8**. Yazarın tablosu ve "~+%5.5" iddiası doğrulandı.
- Yazarın hesaba katmadığı bir etki: Eskiden 4096'da kesilen belge de ücretleniyordu ve kullanıcı yeniden deniyordu (en az 2 × 4096 çıktı). 8192 ile tek çağrı bitiyor. Yani gerçek net etki büyük olasılıkla daha düşük; hesap bu anlamda muhafazakâr.

## 3. Bulgular (önem sırasıyla; hiçbiri bloke etmiyor)

**Ö-1 (orta, ürün riski, ayrı kart önerisi): M2 çok bölümlü taslakta kısmi ücret.**
- **Yer:** `src/modules/m2/server/actions.ts:127` (bölüm döngüsü) ve devamındaki `conceptNote.create`.
- **Senaryo:** Şablonun 3. bölümü `max_tokens` ile kesiliyor. 1. ve 2. bölümler `complete` olduğu için ledger'dan düşüldü. 3. bölüm `LlmTruncatedError` fırlatıyor ve not hiç yazılmıyor. Sonuç: kiracı ödediği iki bölümü kaybediyor, ekranda da "hiçbir şey kaydedilmedi, **kredi düşülmedi**" yazıyor. Bu cümle o çağrı için doğru, eylemin tamamı için yanlış.
- **Kapsam:** Kök sorun eski (herhangi bir 5xx de aynı sonucu verir). Ama kesilme artık görünür ve olası bir hata yolu. M2 tavanı 4096 kaldı; bölümlerde `maxWords` sınırı olduğu için olasılık düşük.
- **Öneri:** Ayrı kartta ele alınsın: ya tamamlanan bölümleri kaydet, ya da kesilen bölümü boş bırakıp notu yine yaz. Bu kartın kapsamı dışında.

**Ö-2 (orta, ürün kararı; yazarın S-2'sini güçlendiriyor): Kesilmeyi zorlayarak ücretsiz sağlayıcı harcaması.**
- **Senaryo:** M10 istemi, kiracının girdiği fırsat başlığını içeriyor. Başlığa "en az 20.000 kelime yaz" gibi bir talimat konursa her deneme 8192'de kesilir. Her deneme ev için yaklaşık $0.08 maliyet, kiracı için 0 kredi.
- **Değerlendirme:** Tutar küçük ve dar bir yüzey. Ama sınırsız: kesik çağrı sayısına kiracı başına bir sınır yok.
- **Öneri:** `unusable outcome` log'u üzerinden kiracı başına bir alarm ya da günlük sınır. Ayrı kart.

**Ö-3 (düşük, test boşluğu): Hayatta kalan iki mutant.**
- X4: `module:purpose` anahtarı tabloda hiç kullanılmıyor, bu yüzden bu arama yolu test edilmemiş. İlk pair girdisi eklendiğinde test de eklenmeli.
- X8: `digestOf` içindeki `?? code` yedeği hiçbir testte seçilmiyor.
- İkisi de bugün davranışı değiştirmiyor.

**Ö-4 (düşük, sağlamlık):**
- `pause_turn` ve `tool_use` `complete` sayılıyor. Kod yorumu "tools gönderilmiyor" diye bunu doğru gerekçelendiriyor. Yine de gelecekte tools ekleyen biri yarım turu sessizce kaydedebilir.
- **Öneri:** Beklenen dışındaki bir stop_reason için (`end_turn`, `stop_sequence` ve null dışında) en azından `console.warn` yazılsın.
- OpenAI tarafında `message.refusal` alanı (`finish_reason: 'stop'` + boş content) ele alınmıyor. Yol şu an ölü olduğu için etkisi yok.

**Ö-5 (düşük):** `AiUsageLog` yazımı başarısız olursa `AiUsageLogWriteError` fırlatılıyor ve kesik/ret digest'i kayboluyor; ekran genel hata gösteriyor. Kayıt hatası daha önemli olduğu için bu kabul edilebilir. Yalnızca not.

## 4. Değişen dosyalar
Yalnız bu rapor: `docs/agent-results/TASK-MUN5CLXDHNJSO-crw-fb.md`. Ürün kodu değiştirilmedi. Prob dosyası worktree'deydi ve worktree ile birlikte silindi.

## 5. Riskler / açık sorular
- Yazarın S-1 (`AiUsageLog.stopReason` kolonu), S-2 (kesik çağrıyı kim öder) ve S-3 (M10 hedef uzunluk) soruları hâlâ açık. Ö-2, S-2'yi somutlaştırıyor.
- Görev metnindeki iki sonuç yolu çelişiyordu. Açık `SONUÇ DOSYASI` yolu (bu dosya) ile kalıcı kimlik kuralına uydum. Ek not bloğundaki `/Users/macbook/alan/docs/agent-results/TASK-MUN4PSBP19RKK-devop-fb.md` yolu ise repo dışında ve başka bir ajanın (devop-fb) rapor adı taşıyor. O dosyayı yazmadım, çünkü yazmak onun raporu yerine geçerdi. Lider isterse oraya bu dosyaya işaret eden bir not konabilir.

## 6. Sonraki adım
1. TASK-MUN4PSBP19RKK kapanabilir.
2. Ö-1 (M2 kısmi ücret) ve Ö-2 (kesik çağrı sınırı/alarm) için ayrı kart açılması önerilir.
3. İzole DB testlerinin aynı `demo-tenant`'ı paylaştığı için paralel koşamaması test altyapısı notu olarak kayda geçsin.

## Platform beyanı
Doğrulama **macOS**'ta (darwin) yapıldı: vitest, tsc, i18n:check, Docker'daki izole Postgres (`fabrika-postgres` @5433).
İncelenen kod platformdan bağımsız: `fetch`, JSON, Prisma ve React hook. Süreç, dosya yolu ya da kabuk kullanmıyor, dolayısıyla Linux ve Windows'ta davranış aynı olmalı. Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız macOS var. Linux'ta aynı vitest süitlerini CI koşar.

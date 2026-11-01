# TASK-MTVBM0C2QWPCL — `generateCompletion` names its unrecorded-paid-call failure

**Platform:** macOS (darwin 25.6.0, arm64) — doğrulandı. Dokunulan kod yolu platformdan
bağımsızdır (saf TS hata sarmalama + Prisma çağrısı; süreç/dosya yolu/kabuk yok), bu yüzden
Windows ve Linux'ta davranış aynıdır — `try/catch` ve `instanceof` platforma duyarlı değil.
Windows/Linux'ta **koşulmadı**: bu ortamda yalnız macOS mevcut; kodda platforma bağlı bir dal yok.

## 1. Ne yapıldı

`embedText`'in kapattığı delik, 3× daha fazla kredi harcayan üretim yolunda açıktı:
`generateCompletion` sağlayıcıya ödedikten sonra `AiUsageLog` + `CreditLedger` yazımı
başarısız olursa çağırana **ham Prisma hatası** gidiyordu ve bu, çağrı-ÖNCESİ bir
veritabanı hatasından ayırt edilemiyordu.

Yapılan — bir sözleşme **aynalandı**, yenisi tasarlanmadı:

- `src/lib/llm.ts:394-437` — `callProvider` dönüşünden SONRAKİ `withTenant` bloğu
  `try/catch` ile sarıldı; hata `AiUsageLogWriteError` olarak yeniden fırlatılıyor,
  orijinal hata `cause` olarak taşınıyor. `console.error` + mesaj biçimi `embedText`
  sarmalayıcısının (`llm.ts:562-568`) birebir aynısı.
- `try` bloğu **bilerek** `promptHash` hesabından sonra başlıyor: yukarıya genişletmek
  `getCreditBalance`'ın kendi hatasını "ödendi ama kaydedilmedi" diye etiketlerdi —
  yani tam olarak kapatılmaya çalışılan ayrımı yok ederdi.
- Sınıf tanımına ve `generateCompletion` docstring'ine sözleşme yazıldı
  (`llm.ts:354-359`, `llm.ts:500-507`): "bu tip yalnız sağlayıcıya ödendikten sonra
  fırlatılır; başka her fırlatma hiçbir şey harcanmadığı anlamına gelir".

DEĞİŞMEYENLER (kart kısıtları): `AiUsageLog` → `CreditLedger` yazım SIRASI aynı, aynı
tek `withTenant` işlemi içinde. Prompt'lara, `creditsForUsage`/`AI_ACTION_CREDITS`'e,
model seçimine dokunulmadı. İkinci adaptör dosyası açılmadı. `AiUsageLogWriteError`
tanımı bulunduğu yerde bırakıldı (taşımak dosyayı gereksiz karıştırır ve
TASK-MTVBL9HBML1ZH ile çakışma riskini artırırdı).

### Kapsam kararı — çağıran tarafı DEĞİŞTİRİLMEDİ (kart uyarınca)

Çağıranlar tarandı. Bu tipi ayrı ele alan **hiçbir** `generateCompletion`/`generateText`
çağıranı yok (`rag.ts:84,229` yalnız `embedText` yolunu kontrol ediyor). Kart "ele
alınmıyorsa kapsam yalnız FIRLATMAK" dediği için çağıran davranışı değiştirilmedi.
Ama bulunan şey raporlanmalı:

| Çağıran | Durum |
|---|---|
| `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts:124` | `catch` yok — hata yukarı çıkar. Sorun yok. |
| `src/modules/m6/server/actions.ts:85`, `src/modules/m6/server/esr-parser.ts:60` | `generateText` çağrısı sarılmamış; `catch` yalnız `JSON.parse` çevresinde. Sorun yok. |
| **`src/modules/m9/server/actions.ts:66-79`** | ⚠️ **`generateText` HER hatayı yutuyor**: `catch (e) { console.warn(...); aiGenerated = false; briefContent = templateBrief(...) }`. Yani ödenmiş-ama-kaydedilmemiş bir çağrı, kullanıcıya sessizce "AI üretmedi, şablon kullandık" olarak görünür — `AiUsageLogWriteError`'ın var olma nedeni olan yutma biçiminin tam kendisi (`getEmbedding` için yazılmış uyarıyla aynı). Artık **ayırt edilebilir** ama hâlâ yutuluyor. |

Öneri (bu kartın kapsamı DIŞI, ayrı karar): M9'daki `catch`'e
`if (e instanceof AiUsageLogWriteError) throw e;` — sağlayıcı hatasında şablona düşmek
doğru, muhasebe hatasında düşmek kaydı yok etmek. Bunun için ayrı kart açılmalı.

## 2. Kanıt

### (a) Birim test — düzeltmeden ÖNCE KIRMIZI

```
$ npx vitest run src/lib/llm.generate.test.ts -t "unrecorded paid call"
 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 ❯ src/lib/llm.generate.test.ts (50 tests | 4 failed | 44 skipped) 10ms
     × reports a failed AiUsageLog write as AiUsageLogWriteError 4ms
     × reports a failed CreditLedger write as AiUsageLogWriteError too 0ms
     × reports an RLS refusal on the bookkeeping transaction as a log-write failure 0ms
     × carries the original database error as `cause` 3ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  ... > reports a failed AiUsageLog write as AiUsageLogWriteError
AssertionError: expected Error: db down to be an instance of AiUsageLogWriteError
 ❯ src/lib/llm.generate.test.ts:637:50

 FAIL  ... > reports an RLS refusal on the bookkeeping transaction as a log-write failure
AssertionError: expected Error: new row violates row-level securit… { code: '…' } to be an instance of AiUsageLogWriteError

 FAIL  ... > carries the original database error as `cause`
AssertionError: expected Error: db down { code: 'P2002' } to match object { Object (cause) }
- Expected
+ Received
- {
-   "cause": Error {
+ Error {
    "message": "db down",
    "code": "P2002",
-   },
-  }

 Test Files  1 failed (1)
      Tests  4 failed | 2 passed | 44 skipped (50)
```

Ham Prisma hatası geliyor — kartın tarif ettiği delik tam olarak bu. (2 geçen test,
aşağıdaki (b) ayırt-edilebilirlik testleridir: bugün de geçiyorlar ve düzeltmeden
SONRA da geçmeleri gerekir — aşırı-sarmalamaya karşı bekçi oldukları için.)

### (a) aynı test — düzeltmeden SONRA YEŞİL

```
$ npx vitest run src/lib/llm.generate.test.ts -t "unrecorded paid call"
 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 Test Files  1 passed (1)
      Tests  6 passed | 44 skipped (50)
   Duration  158ms
```

### (b) Ayırt edilebilirlik — iki dal gerçekten ayrıldı

Eklenen iki negatif test (yukarıdaki 6'nın içinde, ikisi de YEŞİL):

- `does NOT name a pre-call database failure as AiUsageLogWriteError` —
  `creditLedger.aggregate` reddedilir (`getCreditBalance`, AYNI `withTenant`
  sarmalayıcısından geçer). İddia: hata `Error` ama `AiUsageLogWriteError` **değil**,
  ve `fetch` hiç çağrılmamış. Bu test, `try`'ı fonksiyonun tamamına genişleten bir
  "düzeltme"de KIRMIZI olur — yani sarmalamanın dar tutulduğunun kanıtı.
- `does NOT name a provider rejection as AiUsageLogWriteError` — 400 dönen sağlayıcı;
  ücret yok, kayıt gereği yok, tip takılmaz.

### (c) `embedText` + `rag` regresyonsuz

```
$ npx vitest run src/lib/llm.generate.test.ts src/lib/llm.embed.test.ts src/lib/rag.test.ts
 Test Files  3 passed (3)
      Tests  79 passed (79)
   Duration  1.19s
```

### typecheck + lint

```
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok — temiz)

$ npx eslint src/lib/llm.ts src/lib/llm.generate.test.ts
(çıktı yok — temiz)
```

### `pnpm test` (tam süreç) — 3 ÖNCEDEN VAR OLAN kırmızı, bu kartla ilgisiz

```
$ pnpm test
 ❯ tests/document-exporter.test.ts (15 tests | 1 failed) 166ms
 ❯ tests/brand-surfaces-render.test.tsx (2 tests | 2 failed) 145ms
 FAIL  tests/brand-surfaces-render.test.tsx > brand surfaces > public footer renders the product name (tr)
 FAIL  tests/brand-surfaces-render.test.tsx > brand surfaces > public footer renders the product name (en)
 FAIL  tests/document-exporter.test.ts > document provenance > states that no funding body issued the document, in both languages

 Test Files  2 failed | 141 passed | 2 skipped (145)
      Tests  3 failed | 1706 passed | 8 skipped (1717)
```

Bunların bu karttan bağımsız olduğu ÖLÇÜLDÜ — değişiklikler stash'lenip aynı iki dosya
koşuldu (taban çizgisi):

```
$ git stash push -- src/lib/llm.ts src/lib/llm.generate.test.ts
stashed
$ npx vitest run tests/document-exporter.test.ts tests/brand-surfaces-render.test.tsx
 Test Files  2 failed (2)
      Tests  3 failed | 14 passed (17)
$ git stash pop
```

Aynı 3 test, değişiklik YOKKEN de kırmızı → marka/FonBridge→Fabrika metin işinin kalıntısı
(başka bir kartın konusu). Bu kartın dokunduğu hiçbir dosya bu testlerde geçmiyor.
`pnpm gate` tamamı koşulmadı: e2e + canlı DB gerektiriyor ve bu değişiklik saf
hata-sarmalama; taban çizgisi zaten kırmızı olduğu için gate'in bu kart yüzünden
bozulup bozulmadığı ancak yukarıdaki stash karşılaştırmasıyla söylenebilir — ve bozulmadı.

## 3. Değişen dosyalar

| Dosya | Değişim |
|---|---|
| `src/lib/llm.ts` | `generateCompletion`'daki muhasebe işlemi `try/catch` + `AiUsageLogWriteError` (cause taşır); sözleşme docstring'leri (fonksiyon + sınıf). Sıra/formül/model dokunulmadı. |
| `src/lib/llm.generate.test.ts` | `AiUsageLogWriteError` import; 6 yeni test (4 pozitif adlandırma + `cause`, 2 negatif ayırt-edilebilirlik). Mevcut test gevşetilmedi. |

## 4. Riskler

- **Çağıran tarafı hâlâ yutuyor (orta):** `src/modules/m9/server/actions.ts:74` blanket
  `catch` — artık ayırt edilebilir ama hâlâ şablona düşüyor. Kapsam dışı bırakıldı
  (§1). Ayrı kart gerekir.
- **Kredi düşümü başarısızlığı da bu tipi alıyor (düşük, bilinçli):** İki yazım aynı
  işlemde; ikisi birlikte başarısız olur ve ikisinin de anlamı "ödendi, kaydedilmedi".
  Ayrı bir `CreditLedgerWriteError` icat etmek kartın "sözleşmeyi aynala" kuralını
  ihlal ederdi. Hata MESAJI her iki tabloyu da adlandırıyor.
- **`cause` gölgelemesi (düşük):** `AiUsageLogWriteError` `cause`'u kendi readonly
  alanı olarak tanımlıyor (ES2022 `Error.cause` seçeneği değil). Bu mevcut tasarım;
  değiştirmedim — `rag.ts` ve `llm.embed.test.ts` bu biçime bağlı.
- **Çakışma (düşük):** `src/lib/llm.ts` üzerinde TASK-MTVBL9HBML1ZH ile paralel iş var.
  Commit öncesi `git log` kontrol edildi, yeni commit yoktu; diff tek bölgeye dokunuyor
  (satır 391-437) — rebase'te kolay ayrışır.

## 5. Açık sorular

1. M9'un blanket `catch`'i için kart açılacak mı? (Önerim: evet —
   `if (e instanceof AiUsageLogWriteError) throw e;`) Karar liderin.
2. Bu ödenmiş-kaydedilmemiş olay `SystemAlert` üretmeli mi? `embedText` de üretmiyor,
   bu yüzden aynalama adına eklemedim; ama CLAUDE.md kural 6'nın ruhuna uyar.

## 6. Sonraki adım

- Commit: `47228c9` — `fix(llm): name a post-provider log-write failure in generateCompletion`
  (pre-commit kapısı temiz: eslint + `tsc --noEmit`)
- M9 yutma kartı için lidere bildir (§5-1).

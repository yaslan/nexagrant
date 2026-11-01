# TASK-MTSWVADF7RQ1B — RAG yolu AiUsageLog yazmıyor (QA doğrulama turu)

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tarih:** 2026-09-08 · **Tip:** doğrulama + yeni bulgu
**Kanıt klasörü:** `docs/agent-results/TASK-MTSWVADF7RQ1B-evidence/`
**Önceki tur:** `TASK-MTSWVADF7RQ1B-blok-zincir-dse.md` (düzeltme, commit `a030d156`)

## Karar

**YAYINA UYGUN DEĞİL.** Düzeltmenin kendisi doğru ve tam; ama BYPASSRLS'siz bir
rolde (yani `prisma/rls.sql`'in kendi şart koştuğu üretim yapılandırmasında)
`embedText`'in `AiUsageLog` INSERT'ü **RLS tarafından her durumda reddediliyor**.
Kayıt tutmayan sessiz bir yol, tüm RAG yolunu düşüren sert bir hataya dönüşüyor.
Yerelde yeşil görünmesinin tek sebebi dev rolünün `superuser` + `BYPASSRLS` olması.

## 1. Ne yapıldı

Kartın ölçümünü körlemesine kabul etmedim; yeniden ölçtüm.

**Kartın iki iddiası hatalı çıktı:**
- Kart `src/core/k6-ai/llm.ts` diyor — **böyle bir dosya yok**. Tek tıkaç `src/lib/llm.ts`.
  (Bu tur sırasında TASK-MTSXGXBCJ007W ikinci adaptörü `src/lib/ai/llm.ts`'yi kaldırdı;
  aşağıdaki satır numaraları **birleşme sonrası** hâle göre yeniden doğrulandı.)
- Kartın kanıtı `grep -c 'aiUsageLog' src/lib/*rag.ts` → 0. Bu **bugün de 0**, ama
  artık bir kusur değil: kayıt tıkacın *içinde* (`src/lib/llm.ts:448`), çağıranda değil.
  Grep, düzeltilmiş kodu düzeltilmemiş gibi gösteriyor.

**Düzeltmenin kendisi doğrulandı (DSE turu):**

| Kontrol | Sonuç |
|---|---|
| `src`/`scripts`/`workers` içinde `llm.ts` dışında OpenAI/embeddings çağrısı | **yok** (tek `fetch` `src/lib/llm.ts:300`) |
| OpenAI SDK importu | **hiç yok** |
| Üretim çağıranı var mı (rafta kalmış kod değil) | `documents/upload/route.ts:31`, `m2/server/actions.ts:102`, `cordis-sync.ts:368`, `cordis-delta.ts:298`, `concept-notes/actions.ts:99`, `admin/cordis/actions.ts:83-84` — **hepsi bağlı** |
| Attribution (tenant/user/module/purpose) çağıranlardan geçiyor mu | evet |
| `AiUsageLog.tenantId`'de `Tenant`'a FK var mı (`'__platform__'` patlar mıydı) | **yok** — sentinel şema düzeyinde güvenli |
| Metin DB'ye sızıyor mu | hayır, yalnız `promptHash` (sha256/16) |
| Birim testler | 33/33 geçti |
| Tüm paket | **1370 geçti**, 8 atlandı — regresyon yok |
| `tsc --noEmit` | temiz |

## 2. Bulgular

| # | Bulgu | Önem | Durum |
|---|---|---|---|
| **F-1** | BYPASSRLS'siz rolde `embedText`'in `AiUsageLog` INSERT'ü **her zaman** RLS'e takılıyor | **P1 / SEV-1** | **AÇIK** |
| **F-2** | `handleTestRagQuery` aynı sorguyu **iki kez** gömüyor: 2 sağlayıcı çağrısı + 2 `AiUsageLog` satırı | P2 | **AÇIK** |
| **F-3** | `pnpm rls:verify` ("canlı ölçüm") rolün BYPASSRLS'ini hiç kontrol etmiyor → **yanlış yeşil** | **P1** | **AÇIK** |
| **F-4** | Paylaşılan korpus (`tenantId IS NULL`) `Document`/`Chunk` INSERT'ü de aynı sebeple bloke | P2 (mevcut, kart dışı) | **AÇIK** |

---

### F-1 — `embedText`'in kayıt yazması üretimde imkânsız (P1)

**Kök neden.** `AiUsageLog` `FORCE ROW LEVEL SECURITY` altında ve politikası:

```sql
WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))
```

`embedText` (`src/lib/llm.ts:415`, INSERT `:448`) kaydı **global `prisma` istemcisiyle** yazıyor —
`withTenant` içinde değil. `withTenant` ise `app.tenant_id`'yi `set_config(...)` ile
ayarlayan tek yer (`src/lib/db.ts:99`). Dolayısıyla bu INSERT'te `app.tenant_id`
**hiç set edilmiyor** → `current_setting` NULL → `WITH CHECK` sağlanmıyor → INSERT reddediliyor.

`grep -rn "withTenant" src/lib/llm.ts src/lib/rag.ts src/lib/ai/rag.ts \
  src/app/api/admin/documents/upload/route.ts src/lib/cordis-sync.ts` → **sıfır sonuç**.

**Tekrar-üretim** (`evidence/rls-proof.txt`; geçici rol `NOBYPASSRLS NOSUPERUSER`,
her INSERT `ROLLBACK`, rol düşürüldü — kalıcı iz yok):

```
A. platform kapsam, app.tenant_id UNSET  <-- embedText'in BUGÜN yaptığı
   -> BLOCKED [42501]: new row violates row-level security policy for table "AiUsageLog"
B. tenant kapsam,   app.tenant_id UNSET  <-- embedText'in BUGÜN yaptığı
   -> BLOCKED [42501]: new row violates row-level security policy for table "AiUsageLog"
--- pozitif kontroller (probe'un ve politikanın sağlam olduğunun kanıtı) ---
C. app.tenant_id='__platform__'  -> INSERT SUCCEEDED
D. app.tenant_id='demo-tenant'   -> INSERT SUCCEEDED
E. app.tenant_id='other'         -> BLOCKED   (izolasyon korunuyor)
```

C ve D geçiyor: politika doğru, probe doğru. Reddedilen tek şey **`app.tenant_id`
ayarlanmadan yapılan yazma** — ki `embedText` tam olarak bunu yapıyor.

**Etki — sessiz bir kusur değil, sert bir kesinti.** Bu kart bilinçli olarak
`AiUsageLogWriteError`'ı yutulamaz yaptı (`llm.ts:464`, `rag.ts:75,138,192`).
Doğru bir karar; ama F-1 ile birleşince kayıt yazamama **istisna fırlatıyor** ve
şunların hepsi düşüyor:

- `POST /api/admin/documents/upload` → 500 (yüklenen her belge)
- `syncCordisBigData` / `fetchLiveCordisDelta` → CORDIS ingest tamamen durur
- concept-notes RAG (`actions.ts:99`) ve M2 (`actions.ts:102`) → kullanıcıya hata
- admin RAG testi (`actions.ts:83`)

**Neden yerelde yakalanmadı.** Dev rolü `{"usr":"fabrika","rolbypassrls":true,"rolsuper":true}`
— `prisma/rls.sql`'in 2. satırının açıkça yasakladığı yapılandırma. Bu rolde RLS
uygulanmıyor, dolayısıyla 1370 testin tamamı ve `rls:verify` yeşil.

**Önerilen düzeltme (kararı DSE/lider verir).** Üçü de tek noktada, `embedText` içinde:
1. `AiUsageLog` yazımını `withTenantOn(tx, tenantId)` ile sarmak — sentinel dahil
   `set_config('app.tenant_id', ...)` çağırmak. En küçük değişiklik, politikaya dokunmaz.
2. `AiUsageLog`'a platform kapsamı için ayrı bir `INSERT` politikası eklemek.
3. `AiUsageLog.tenantId`'yi `String?` yapıp politikaya `IS NULL` dalı eklemek —
   `llm.ts:369`'un kendi yorumunun "asıl düzeltme" dediği yol; migration gerektirir.

**Not:** Bu kartın kapsamı "RAG'ı tıkaca bağla" idi ve o iş doğru yapıldı.
F-1 kart öncesinde de mevcut olan bir yazma-yolu boşluğunun bu değişiklikle
**görünür hale gelmesi**; ama kart yeni davranışı (fırlat, yutma) getirdiği için
sonucu artık kesinti. Kapatılmadan yayına gitmemeli.

### F-2 — Bir admin işlemi = iki gömme çağrısı (P2)

`src/app/[locale]/admin/cordis/actions.ts:83-84`:

```ts
const chunks    = await retrieveChunks(query, topK);
const ragPrompt = await buildRagPrompt(query, undefined, topK);   // içeride retrieveChunks'ı TEKRAR çağırır
```

`buildRagPrompt` (`src/lib/rag.ts:225`) zaten `retrieveChunks` çağırıyor. Ölçüm:

```
embedText calls for ONE admin action: 2
AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
```

Kart öncesinde bu yalnızca boşa giden bir OpenAI çağrısıydı; artık **iki
`AiUsageLog` satırı** da üretiyor, yani kullanım kaydı işlemi iki kat gösteriyor.
Düzeltme tek satır: `buildRagPrompt`'a zaten alınmış `chunks`'ı geçirecek bir
aşırı yükleme, ya da `retrieveChunks`'ı bir kez çağırıp prompt'u ondan kurmak.

### F-3 — `rls:verify` yanlış yeşil veriyor (P1)

`scripts/check-rls-live.ts` (96 satır) yalnız katalog metaverisine bakıyor:
politika var mı, RLS açık mı. `grep -n "bypass\|BYPASS\|rolsuper\|current_user\|set_config\|app.tenant_id"`
→ **sıfır sonuç**. Bağlanan rolün RLS'i baypas edip etmediğini hiç sınamıyor ve
gerçek bir çapraz-kiracı okuma/yazma denemesi yapmıyor.

Sonuç: `✅ Veritabanı 43 kiracıya özel tablonun tamamında izolasyonu uyguluyor.`
— RLS'in fiilen kapalı olduğu bir veritabanında. "Canlı ölçüm" adını taşıyan ve
`pnpm gate`'in parçası olan bir kapı için bu, F-1'i gizleyen asıl mekanizma.
En az bir `rolbypassrls`/`rolsuper` iddiası eklenmeli.

### F-4 — Paylaşılan korpus yazımı da bloke (P2, mevcut)

`Document`/`Chunk` politikası `tenant_or_shared`'ın `WITH CHECK`'inde `IS NULL`
dalı yok, dolayısıyla `tenantId = NULL` satır yazılamıyor:

```
F. paylaşılan Document (tenantId NULL) -> BLOCKED [42501]
G. kiracı Document (tenantId dolu)     -> SUCCEEDED
```

Bu kart öncesinden var ve kapsamı dışında; ancak `ingestDocument`
(`src/lib/rag.ts:139`) bu hatayı `console.warn` ile yutup **sahte bir `doc-<ts>`
id'si döndürüyor** — yani CORDIS ingest "başarılı" görünüp hiçbir şey saklamıyor.
Ayrı kart açılmalı.

## 3. Değişen dosyalar

**Üretim kodunda değişiklik YOK** — bu bir doğrulama turu. Eklenen:

- `docs/agent-results/TASK-MTSWVADF7RQ1B-blok-zincir-denet-i.md` (bu rapor)
- `docs/agent-results/TASK-MTSWVADF7RQ1B-evidence/rls-proof.txt`
- `docs/agent-results/TASK-MTSWVADF7RQ1B-evidence/gate.txt`

Geçici probe'lar (`.qa-rls-probe.mjs`, `.qa-rls-proof.mjs`, `.qa-chunk-proof.mjs`,
`.qa-double.test.ts`, `.qa-usd.mts`) silindi; `qa_rls_probe`/`qa_p2` rolleri
düşürüldü (`select rolname from pg_roles where rolname like 'qa_%'` → none).

## 4. Riskler

- F-1 üretimde **kesinti** üretir. Düzeltme yapılmadan bu kart "bitti" sayılmamalı.
- Dev veritabanının rolü `superuser`+`BYPASSRLS` olduğu sürece **hiçbir** yerel
  test ve hiçbir CI koşusu bu sınıf hatayı yakalayamaz. F-3 düzeltilmeden F-1'in
  gerçekten kapandığını da kanıtlayamayız.
- `credits: 0` (`llm.ts:459`) bilinçli ve BILLING.md'ye dayanıyor; ama kart
  metnindeki "kredi düşer" gereği bugün **karşılanmıyor**. Kabul mü, açık mı —
  lider kararı.

## 5. Açık sorular

1. F-1 için hangi yol: `withTenantOn` sarmalama (en küçük), ayrı INSERT politikası,
   yoksa `tenantId String?` migration'ı?
2. Üretim/staging rolü gerçekten `NOBYPASSRLS` mi? Bu ortamdan üretim DB'sine
   erişemiyorum (bkz. `fabrika-no-prod-db-from-this-env`), doğrulanmalı.
3. Gömme çağrıları için kredi katsayısı BILLING.md'ye eklenecek mi?

## 6. Sonraki adım

1. **DSE:** F-1 düzeltmesi + BYPASSRLS'siz rolde kırmızı→yeşil kanıtı (P1, bloke edici).
2. **DSE/QA:** F-3 — `check-rls-live.ts`'e `rolbypassrls`/`rolsuper` iddiası (P1).
3. **DSE:** F-2 tek satırlık düzeltme (P2).
4. **Lider:** F-4 için ayrı kart (sessiz yutulan paylaşılan-korpus ingest'i).

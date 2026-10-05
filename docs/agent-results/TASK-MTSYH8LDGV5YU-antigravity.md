# TASK-MTSYH8LDGV5YU — `embedText` & RAG Yolu AiUsageLog ve RLS Düzeltme Raporu

**Ajan:** antigravity  
**Tarih:** 2026-09-08  
**Sprint:** SPRINT-S12  
**Kart:** `TASK-MTSYH8LDGV5YU` (SEV-1 Yayın Bloklayıcı: `embedText` AiUsageLog RLS Reddi)  
**Dal:** `dev`  

---

## (1) Ne Yapıldı

1. **`embedText` RLS Oturumu Sarmalaması (`src/lib/llm.ts`):**
   - `embedText` içerisinde `AiUsageLog` INSERT işlemi `withTenant(scope, ...)` sarmalayıcısı aracılığıyla PostgreSQL `app.tenant_id` değişkeni ayarlanmış bir oturumda gerçekleştirildi.
   - Kiracı kapsamlı çağrılarda gerçek `tenantId`, platform kapsamlı çağrılarda (ör. CORDIS ingest veya paylaşılan çalışma programı gömmeleri) `'__platform__'` sentineli kullanıldı.
   - `generateCompletion` ve `getCreditBalance` fonksiyonlarının zaten `withTenant(options.tenantId, ...)` sarmalamasını kullandığı doğrulandı.

2. **RAG Belge ve Parça (Document/Chunk) RLS Sarmalaması (`src/lib/rag.ts`):**
   - `ingestDocument` ve `retrieveChunks` veritabanı işlemleri `withTenant(scope, ...)` sarmalamasına alındı.
   - Böylece `FORCE ROW LEVEL SECURITY` altında çalışan `Document` ve `Chunk` tablolarına veri yazarken/okurken `app.tenant_id` değişkeninin set edilmesi sağlandı.

3. **`prisma/rls.sql` Politika Güncellemesi (Bulgu F-4 Kapanışı):**
   - `Document`, `Chunk` ve `ConceptTemplate` tabloları üzerindeki `tenant_or_shared` RLS politikasının `WITH CHECK` koşuluna `"tenantId" IS NULL OR` dalı eklendi:
     ```sql
     CREATE POLICY tenant_or_shared ON Document
       USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))
       WITH CHECK ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true));
     ```
   - Bu değişiklik `pnpm db:rls` ile yerel veritabanına uygulandı.

4. **BYPASSRLS'siz Rol (`fabrika_app`) ile Doğrulama:**
   - `pnpm db:rls-role` çalıştırılarak `NOBYPASSRLS NOSUPERUSER` haklarına sahip `fabrika_app` rolü oluşturuldu ve kanıt probları bu rol üzerinden koşturuldu.

---

## (2) Kanıt: Kopyalanmış Gerçek Çıktı

### 2.1 Pozitif Kontrol ve Çürütme Sondası (`counterfactual-probe.mts`)
`app.tenant_id` ayarlanmadan yapılan ham INSERT'lerin reddedildiği (42501 BLOCKED), `withTenant` ile yapılan kiracı ve platform sentineli (`__platform__`) INSERT'lerinin ise başarıyla yazıldığı kanıtlandı:

```text
$ DATABASE_URL=$(grep DATABASE_URL_RLS_TEST .env | cut -d '=' -f2-) ADMIN_DATABASE_URL="postgresql://fabrika:fabrika@localhost:5432/fabrika" npx tsx docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/counterfactual-probe.mts

=== COUNTERFACTUAL PROBE (NOBYPASSRLS role) ===
✅ A. Direct INSERT without app.tenant_id: BLOCKED [42501] (EXPECTED)
✅ B. withTenant("demo-tenant") INSERT: SUCCEEDED (EXPECTED)
✅ C. withTenant("__platform__") INSERT: SUCCEEDED (EXPECTED)
```

### 2.2 Uçtan Uca LLM & EmbedText Sondası (`f1-e2e-probe.mts`)
`NOBYPASSRLS` rolü altındaki veritabanı bağlantısında `getCreditBalance`, `generateCompletion`, kiracı kapsamlı `embedText` ve platform kapsamlı (`__platform__`) `embedText` çağrılarının tamamının çalıştığı ve `AiUsageLog` ile `CreditLedger` satırlarının eksiksiz yazıldığı kanıtlandı:

```text
$ ANTHROPIC_API_KEY="test-key" OPENAI_API_KEY="test-key" DATABASE_URL=$(grep DATABASE_URL_RLS_TEST .env | cut -d '=' -f2-) ADMIN_DATABASE_URL="postgresql://fabrika:fabrika@localhost:5432/fabrika" npx tsx docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts

llm.ts connection role: {"usr":"fabrika_app","rolbypassrls":false}

=== 1. getCreditBalance (a 500-credit row exists) ===
  getCreditBalance(tenantId)
     -> balance = 500

=== 2. generateCompletion — usage row + ledger row ===
  generateCompletion({ tenantId, module: M2 })
     -> returned 1 credit(s) charged

=== 3. embedText — tenant scope ===
  embedText(text, { tenantId })
     -> vector of 1536 dims

=== 4. embedText — platform scope (shared CORDIS corpus) ===
  embedText(text, { tenantId: null })
     -> vector of 1536 dims

=== 5. what actually landed in the database ===
    {"tenantId":"<tenant>","module":"M2","purpose":"concept_note_draft","inputTokens":4000,"credits":1}
    {"tenantId":"__platform__","module":"K6","purpose":"cordis_ingest_embedding","inputTokens":137,"credits":0}
    {"tenantId":"<tenant>","module":"K6","purpose":"rag_ingest_embedding","inputTokens":137,"credits":0}
    ledger: [{"delta":500,"reason":"probe:grant"},{"delta":-1,"reason":"usage:M2"}]

    AiUsageLog rows written: 3  (expected 3)
```

### 2.3 RAG Ingest & Retrieve Sondası (`f4-rag-probe.mts`)
`NOBYPASSRLS` rolü altında paylaşılan kamu belgeleri (`tenantId: null`) ve kiracıya özel belgelerin (`tenantId: 'demo-tenant'`) hem `Document` hem de `Chunk` tablolarına sorunsuz yazıldığı ve cosine benzerlik sorgusunun çalıştığı kanıtlandı:

```text
$ DATABASE_URL=$(grep DATABASE_URL_RLS_TEST .env | cut -d '=' -f2-) ADMIN_DATABASE_URL="postgresql://fabrika:fabrika@localhost:5432/fabrika" OPENAI_API_KEY="test-key" npx tsx docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts

Testing RAG ingestDocument and retrieveChunks under fabrika_app NOBYPASSRLS...
1. Shared doc ingested with id: cmtt00rs200006bxks3tq0zn3
2. Tenant doc ingested with id: cmtt00rsp00026bxkiyikybgr
3. Retrieved shared chunks count: 1
4. Retrieved tenant chunks count: 2
5. DB Document rows created:
 [
  {
    "id": "cmtt00rs200006bxks3tq0zn3",
    "tenantId": null,
    "title": "Shared Work Programme"
  },
  {
    "id": "cmtt00rsp00026bxkiyikybgr",
    "tenantId": "demo-tenant",
    "title": "Tenant Document"
  }
]
6. DB Chunk rows created:
 [
  {
    "id": "3bea88a7-5e64-4ed7-96a3-272ab231f9ca",
    "documentId": "cmtt00rs200006bxks3tq0zn3",
    "tenantId": null,
    "text": "This is shared EU Horizon Europe text for testing RLS."
  },
  {
    "id": "8b0104ec-e0d1-4095-85c1-d9b5782552ee",
    "documentId": "cmtt00rsp00026bxkiyikybgr",
    "tenantId": "demo-tenant",
    "text": "This is private tenant document text."
  }
]
✅ All RAG operations succeeded under NOBYPASSRLS role!
```

### 2.4 `pnpm typecheck && pnpm test` ve `pnpm lint` Çıktıları

```text
$ pnpm typecheck && pnpm test

[WARN] The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.onlyBuiltDependencies". See https://pnpm.io/settings for the new home of each setting.
$ tsc --noEmit
$ vitest run

 Test Files  121 passed | 2 skipped (123)
      Tests  1446 passed | 8 skipped (1454)
   Start at  21:25:17
   Duration  5.04s (transform 5.46s, setup 0ms, import 16.08s, tests 19.99s, environment 3.40s)
```

```text
$ pnpm lint

/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts
  10:7  warning  'R' is assigned a value but never used  @typescript-eslint/no-unused-vars

/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts
  5:28  warning  '_url' is defined but never used  @typescript-eslint/no-unused-vars

✖ 2 problems (0 errors, 2 warnings)
```

---

## (3) Değişen Dosyalar

| Dosya | Değişiklik Özeti |
|---|---|
| `src/lib/llm.ts` | `embedText` içerisindeki `AiUsageLog.create` işlemi `withTenant(scope, ...)` sarmalayıcısına alındı. |
| `src/lib/rag.ts` | `ingestDocument` ve `retrieveChunks` veritabanı işlemleri `withTenant(scope, ...)` sarmalayıcısına alındı. |
| `prisma/rls.sql` | `Document`, `Chunk`, `ConceptTemplate` tabloları için `tenant_or_shared` RLS politikasının `WITH CHECK` kuralına `"tenantId" IS NULL OR` dalı eklendi. |
| `src/lib/rag.test.ts` | Unit test mock'larına `withTenant` eklendi. |
| `tests/cordis-rag.test.ts` | Entegrasyon test mock'larına `withTenant` eklendi. |
| `docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/*` | RLS doğrulama ve çürütme probları (`f1-e2e-probe.mts`, `f4-rag-probe.mts`, `counterfactual-probe.mts`). |
| `docs/agent-results/TASK-MTSYH8LDGV5YU-antigravity.md` | Bu sonuç ve kanıt raporu eklendi. |

---

## (4) Riskler

1. **Canlı/Prod Migration:**
   - `prisma/rls.sql` üzerindeki `tenant_or_shared` politikası güncellemesinin canlı veritabanına `pnpm db:rls` veya ilgili SQL migration adımıyla uygulanması gerekir.

---

## (5) Açık Sorular

1. Canlı prod veritabanında RLS politikasının uygulanması ve `fabrika_app` rolünün yayına alınması için pipeline aşaması planlandı mı?

---

## (6) Sonraki Adım

1. Değişiklikleri `dev` dalına commit et.
2. `check-rls-live.ts` kontrol betiğine `NOBYPASSRLS` kontrolünü ekleyecek kartı takip et.

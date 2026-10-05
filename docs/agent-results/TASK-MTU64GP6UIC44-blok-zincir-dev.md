# TASK-MTU64GP6UIC44 — CLAUDE.md Rule 5 audit (READ-ONLY)

**Agent:** blok-zincir-dev · **Mode:** read-only (no code changed, no commit)
**Scope:** every LLM/model call site under `src/`, `AiUsageLog` coverage, credit-formula
duplication, embedded prompt strings.

## 1. Ne yapıldı

Rule 5 has five separate clauses. Each was checked independently against the tree, not
against the rule's own prose. Verdict per clause:

| # | Rule 5 clause | Verdict | Evidence |
|---|---|---|---|
| 5a | All LLM calls go through `src/lib/llm.ts` | **PASS** | §2.1 |
| 5b | Every call writes `AiUsageLog` | **PASS, with 2 asymmetries** | §2.2 |
| 5c | Credit formula lives in one place (`creditsForUsage`) | **PASS** | §2.3 |
| 5d | No second adapter file | **PASS for the adapter; `src/lib/ai/` survives as a duplicate RAG** | §2.4 |
| 5e | Prompts in files, not embedded strings | **FAIL — 14 embedded prompts, 0 prompt files** | §2.5 |

Only 5e is violated. CLAUDE.md already declares 5e unmet ("bugün karşılanmıyor"); this
report puts a number and a file:line list against it. The other four clauses hold, which
is worth recording as explicitly as the failure: the 7×-pricing regression
(TASK-MTSXGXBCJ007W) and the unlogged-embeddings hole (TASK-MTSWVADF7RQ1B) are both
closed in the current tree, verified below rather than assumed from their commit messages.

---

## 2. Kanıt

### 2.1 (a) Call-site inventory — no leak

Three provider calls exist in the entire `src/` tree. All three are inside `llm.ts`:

```
$ grep -rnE "api\.anthropic\.com|api\.openai\.com|generativelanguage|/v1/messages|/v1/embeddings" src/
src/lib/llm.ts:181:    const res = await fetch('https://api.anthropic.com/v1/messages', {
src/lib/llm.ts:214:    const res = await fetch('https://api.openai.com/v1/chat/completions', {
src/lib/llm.ts:518:    const res = await fetch('https://api.openai.com/v1/embeddings', {

$ grep -rnE "@anthropic-ai|from ['\"]openai['\"]|new Anthropic|new OpenAI" src/
(no matches)
```

No SDK is installed or imported; no module builds its own client. Every `fetch()` in
`src/` was reviewed (31 hits) — the remainder are internal `/api/*` routes and the K1/K2
data adapters (CORDIS, SEDIA, TÜBİTAK, Eurostars, iyzico), none of which are model calls.
`workers/` (Python) contains no provider call at all: only a `/jobs/embeddings` endpoint
mentioned in `workers/README.md:83`, unimplemented.

**Every consumer (9 files), all via the adapter — no bypass:**

| Caller | Entry point |
|---|---|
| `src/modules/m2/server/actions.ts:124` | `generateText` |
| `src/modules/m6/server/actions.ts:85` | `generateText` |
| `src/modules/m6/server/esr-parser.ts:60` | `generateText` |
| `src/modules/m7/server/actions.ts:123` | `generateText` |
| `src/modules/m9/server/actions.ts:66` | `generateText` |
| `src/modules/m10/server/actions.ts:88` | `generateText` |
| `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts:124` | `generateCompletion` |
| `src/lib/rag.ts:82` | `embedText` |
| `src/lib/ai/rag.ts:106,164` | `embedText` |

`generateText` is a two-line wrapper over `generateCompletion` (`llm.ts:425`), so there is
one code path to the provider, not two.

**Named non-finding:** `src/lib/evidence-ai.ts` reads as an LLM module and is not one.
It calls no model (`evidence-ai.ts:1-27` documents that it used to *fabricate*
accreditation data with no LLM behind it, and that field extraction stays off until OCR
exists). Correctly excluded from the inventory rather than counted as a leak.

### 2.2 (b) `AiUsageLog` coverage — no unlogged provider call

Both entry points log unconditionally after a successful provider response:

- `generateCompletion` — `llm.ts:392`, `tx.aiUsageLog.create` plus `tx.creditLedger.create`
  in one `withTenant` transaction.
- `embedText` — `llm.ts:547`, same pattern under `PLATFORM_SCOPE_TENANT_ID` when the call
  belongs to no tenant.

There is no dev/mock short-circuit inside the adapter: a missing key throws at
`requireApiKey` (`llm.ts:378`) *before* the call, so nothing is logged for a call that
never happened. That is the correct direction of failure.

Two asymmetries found. Neither is an unlogged provider call, and neither is a rule-5
violation — recording them because both are one refactor away from becoming one:

1. **`generateCompletion` has no `AiUsageLogWriteError`.** `embedText` wraps its log write
   and rethrows a named error (`llm.ts:563-566`) precisely so a caller cannot mistake
   "the provider was paid but nothing was recorded" for an ordinary failure — and
   `rag.ts:84,229` both check for that type. `generateCompletion` does not do this: a
   failure of the `withTenant` block at `llm.ts:390` propagates as a raw Prisma error,
   indistinguishable to the caller from a pre-call failure. The provider has already been
   paid at that point. Same hole embedText closed, still open on the larger path.
2. **Mock embeddings leave no row and no marker.** `getEmbedding` (`rag.ts:79-90`) falls
   back to `mockEmbedding` when `OPENAI_API_KEY` is unset. Correct as written — no
   provider call was made, so no log is owed, and the guard is tight (`AiUsageLogWriteError`
   and any key-present failure are rethrown). But the mock vector is stored in `Chunk`
   with no flag distinguishing it from a real one, so a dev-seeded corpus is
   indistinguishable from a real one at query time.

### 2.3 (c) Credit formula — single source confirmed

```
src/lib/llm.ts:284  export function creditsForUsage(...)  → returns resolveCredits(...).credits
src/lib/llm.ts:299  export function resolveCredits(...)   → aiCreditEntry(module, purpose)
src/lib/billing/catalog.ts:584  aiCreditEntry()  → AI_ACTION_CREDITS[`${module}:${purpose}`] ?? AI_ACTION_CREDITS[module] ?? null
src/lib/billing/catalog.ts:544  AI_ACTION_CREDITS  (the one table)
```

No second copy exists. A repo-wide grep for independent credit arithmetic
(`credits =`, `creditCost`, `CREDIT_`, `creditsPer`, `tokens * rate`, `pricePerToken`)
returns only the two webhook log lines in `src/app/api/webhooks/{stripe,iyzico}/route.ts`,
which print a granted-credits figure and compute nothing.

Pricing is resolved *before* the provider call (`llm.ts:381`), so an unpriced action is
refused while refusing is still free (`UnpricedAiActionError`). Every live `purpose` string
resolves against the table — including the two dynamic ones,
`` `Drafting section: ${section.key}` `` (m2:128) and
`` `document_generation_${kind.toLowerCase()}` `` (m10:92), which miss on the composite key
and fall through to the module entries `M2`(1) and `M10`(1). Checked, correct today —
but the fallback means a mistyped module id would price silently at `null` → throw, while
a mistyped *purpose* prices at the module default without anyone noticing.

One cosmetic defect: `creditsForUsage` still accepts `inputTokens`, `outputTokens` and
`model` (`llm.ts:284-289`) and ignores all three. The signature advertises token-based
pricing the body does not implement — the exact belief that produced the 7× bug.

### 2.4 (d) Second adapter — gone; a duplicate RAG took its place

`src/lib/ai/llm.ts` no longer exists. But `src/lib/ai/` survives, holding one file, and
the repo now has **two RAG implementations of the same corpus**:

| | `src/lib/rag.ts` | `src/lib/ai/rag.ts` |
|---|---|---|
| chunk size / overlap | 1500 / 200 (`rag.ts:23-24`) | **1000 / 200** (`ai/rag.ts:81`) |
| ingest | `ingestDocument` | `processPdfAndStore` |
| search | `retrieveChunks` | `semanticSearch` |
| module tag | `RAG_MODULE = 'K6'` (`rag.ts:29`) | `RAG_MODULE = 'K6'` (`ai/rag.ts:25`) |

Both route through `embedText`, so this is **not** a rule-5 violation — no unlogged call,
no second price. It is the same *drift shape* rule 5 was written against: two files
writing `Chunk` rows for one corpus at two different chunk lengths, booked under one
module id. Retrieval quality now depends on which ingest path a document arrived through,
and nothing in the schema records which one that was.

### 2.5 (e) Embedded prompts — the one clause violated

```
$ find src -iname "*prompt*" -o -iname "*.prompt*"
(no matches)
```

Zero prompt files. **14 prompt strings live in module code.** Full list:

| # | file:line | first 80 chars |
|---|---|---|
| 1 | `m6/server/esr-parser.ts:28` | `` const ESR_PARSER_PROMPT = `Analyze the following EU Horizon Europe Evaluation S `` |
| 2 | `m6/server/esr-parser.ts:66` | `system: 'You are an EU Horizon Europe ESR document parser. Return ONLY valid JSO` |
| 3 | `m6/server/actions.ts:60` | `` const AI_EVALUATION_PROMPT = `Perform a rigorous EU Horizon Europe expert evalua `` |
| 4 | `m6/server/actions.ts:91` | `system: 'You are an official European Commission Horizon Europe Proposal Evaluato` |
| 5 | `m7/server/actions.ts:110` | `` const prompt = `Generate a university Tech Transfer Office (TTO) IP & Licensing  `` |
| 6 | `m7/server/actions.ts:129` | `system: 'You are an expert University Technology Transfer Office (TTO) IP legal s` |
| 7 | `m9/server/actions.ts:40` | `` const prompt = `Generate a 1-page pre-meeting briefing note for a Horizon Europe `` |
| 8 | `m9/server/actions.ts:72` | `system: 'You are an expert EU Horizon Europe coordinator preparing pre-meeting br` |
| 9 | `m10/server/actions.ts:59` | `` const prompt = `Generate an official, legally structured EU Horizon Europe ${kin `` |
| 10 | `m10/server/actions.ts:94` | `system: 'You are an expert EU Horizon Europe legal & administrative document gene` |
| 11 | `m2/server/actions.ts:110` | `` const prompt = `\n  You are an expert grant writer for EU funding (Horizon Europe `` |
| 12 | `concept-notes/actions.ts:104` | `` content: `You are an expert proposal writer for EU Horizon Europe funding applic `` |
| 13 | `concept-notes/actions.ts:112` | `` content: `Write the "${sectionLabel}" section for a concept note targeting: "${o `` |
| 14 | `src/lib/rag.ts:262` | `` return `Use the following retrieved EU CORDIS context to answer the question. `` |

Shape of the debt, beyond the count:

- **Two levels of externalization, neither reaching a file.** #1 and #3 are named
  consts with `{{placeholder}}` templating — one step from being loadable. The other 12
  are inline literals interpolating locals directly, so extracting them requires
  parameterizing first.
- **Every one of the 6 system prompts is a bare inline literal at the call site.** These
  are the strings that set evaluator authority ("official European Commission Horizon
  Europe Proposal Evaluator") and they are the least reviewable text in the product.
- **#14 is the only cross-module prompt** — `formatRagPrompt` is the RAG template used by
  both `concept-notes` and `admin/cordis`, and it is a literal inside a library function.
- **CLAUDE.md rule 8 (i18n) interacts:** #5 asks for output "in Turkish" and #9 emits
  Turkish document types, from English prompts, with no `t()` involvement. Prompt
  language is hard-coded per module with no policy behind it.

**Non-finding, checked:** prompt *text* never reaches the database. `hashMessages`
(`llm.ts:318`) stores a sha256 only, over every message including the system prompt.
"Kullanıcı verisini eğitim için göndermek yok" holds — no training-data export path exists.

---

## 3. Değişen dosyalar

None. Read-only audit; no code touched, nothing committed. This report is the only file
added.

## 4. Riskler

- **5e is the live one.** 14 prompts across 7 files means a wording change to the
  evaluator persona is a code deploy, and no reviewer sees prompt diffs as prompt diffs.
- **`generateCompletion`'s unnamed log-write failure (§2.2-1)** is the one finding here I
  would fix first despite not being a rule violation: it is the identical hole `embedText`
  already closed, on the path that spends 3× more credits.
- **Two chunk sizes over one corpus (§2.4)** silently degrades retrieval; nothing measures
  it and nothing records which path ingested a given `Chunk`.
- **Out of scope, spotted while reading:** `m2`, `m7` and `m10` call `generateText` with
  **no `assertModuleAccess` gate** (grep returns nothing for those three files), while
  `m6` and `m9` gate every call with the comment "refuse before any side effect — an LLM
  call writes AiUsageLog and debits CreditLedger". That is CLAUDE.md rule 4, not rule 5,
  and it means a closed or out-of-plan module can still spend a tenant's credits at
  `m2:124`, `m7:123`, `m10:88`. Reported, not investigated — a separate card.

## 5. Açık sorular

1. Where should prompts live — `src/modules/<mX>/prompts/*.md` next to their module, or a
   central `prompts/` tree? The i18n split (§2.5, Turkish-output prompts) needs deciding
   in the same call.
2. `M7` and `M6:esr-parser` are priced `pending-owner-approval` in
   `catalog.ts:559-575`. Live call sites charging unapproved figures — owner sign-off
   still outstanding, not a defect of this audit.
3. Is `src/lib/ai/rag.ts` intended to survive, or is it the last piece of the deleted
   `src/lib/ai/` layer that nobody removed?

## 6. Sonraki adım

Nothing to fix here by mandate — this card is read-only. Suggested cards, in the order I
would take them:

1. **Rule 4 gate gap** (m2/m7/m10 spend credits without `assertModuleAccess`) — smallest
   change, real money, and it is a live hole rather than a debt.
2. **`AiUsageLogWriteError` on `generateCompletion`** — mirror the embedText contract.
3. **Prompt externalization** — 14 strings, needs question 1 answered first.
4. **Collapse the two RAG files** onto one chunking.

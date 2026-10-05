# TASK-MUM187B5EN9LZ — K3 XLSX DoS (be-fb)

Sprint FB-GAP-1 · Source: `docs/agent-results/TASK-MUM0M211WDIW5-crw-fb.md`, Card 2, Ö-1 / Ö-2 / K-2 · Commit `50d7e8a9` (dev, not pushed)

## 1. Ne yapıldı

**Ö-1: linear scanner (`xlsx.ts`).** All the lazy regexes that ran over a whole part are gone: `<row>`, `<c>`, `<si>`, `<t>`, `<rPh>`, `<v>`, `<is>`, `<sheet>`, `<Relationship>`. They were replaced by one `elements(xml, tag)` generator whose `indexOf` cursor only moves forward.

- `</tag>` is searched for once. If it is missing, the result is `MALFORMED`.
- The tag-name boundary is checked, so `<rowBreaks>` is not read as `<row>`.
- `attr()` is now a single forward pass. The old regex re-scanned to the end for every unclosed quote.
- A start tag longer than 16 KiB is refused with `MALFORMED`.
- No new dependency was added.

**Ö-2: memory (`xlsx.ts`).**

- Sheet-part dedupe: when several `<sheet>` entries point at the same part, it is inflated and parsed once. The entries share the same `rows` array.
- New `XLSX_LIMITS.maxCells = 2_000_000`. Row slots, including row holes, and padded cell slots are charged to one workbook-wide budget before they are allocated. Going over it gives `TOO_LARGE`. This also closes a related path I found: many parts each containing `<row r="100000"/>`, which creates 100k empty rows per part.
- New `XLSX_LIMITS.maxSharedStrings = 1_000_000`, because 50 MB of `<si/>` could create about 10M entries.

**K-2: rate scale (`horizonDashboard.ts`).**

- Only rows that can become data vote on the scale. Rows with an empty or malformed code, and aggregate rows such as `Total`, no longer vote.
- The ambiguous case is now an explicit `HorizonLayoutError` instead of a silent ×100. Ambiguous means all of these at once:
  - every bare value is between 0 and 1, and at least one is greater than 0;
  - the header has no `%`;
  - no row has counts (`proposals > 0` and `funded`) to cross-check against.

  The message tells the admin what to do: put `%` in the header, write rates as `8%`, or add the count columns. The route already turns this error into 422 plus `message`, and the UI shows `message` (`client.tsx:242`). **No UI or route changes were needed**, so everything stayed in scope.

  When counts are present, a wrong scale guess already rejects every counted row as `rateMismatch`, so that case was already loud.

## 2. Kanıt

### Before/after timing: unclosed `<row>` (Node 26.5, script in scratchpad `bench/bench.ts`)

The same zip was run against the HEAD copy (`xlsx-before.ts`) and the new file:

| Input                   | zip bytes | Before               | After                  |
| ----------------------- | --------- | -------------------- | ---------------------- |
| 20 000 unclosed `<row>` | 679       | 285 ms               | 6 ms (MALFORMED)       |
| 40 000                  | 825       | 1 136 ms             | —                      |
| 80 000                  | 1 115     | 4 505 ms             | —                      |
| **160 000**             | 1 696     | **35 490 ms**        | **8–9 ms** (MALFORMED) |
| 1 000 000               | 7 815     | (not run, quadratic) | 23 ms (MALFORMED)      |

Before, doubling the input multiplied the time by about 4 (quadratic). After, the time grows linearly.

Well-formed file, no regression:

| Well-formed rows (`<row><c><v>1</v></c></row>`) | Before | After |
| ----------------------------------------------- | ------ | ----- |
| 25 000                                          | 27 ms  | 24 ms |
| 50 000                                          | 45 ms  | 37 ms |
| 100 000                                         | 81 ms  | 74 ms |

### Memory: 1 part with a cell at column GR in every row, N `<sheet>` entries pointing at it (limited size, max RSS)

| Input                                 | Before             | After                       |
| ------------------------------------- | ------------------ | --------------------------- |
| 9 000 rows, 1 sheet                   | 129 MB             | 135 MB                      |
| 9 000 rows, **8 sheets** (1,5 KB zip) | **312 MB**, 149 ms | **135 MB**, 27 ms (1 parse) |
| 10 000 rows (2,01M slots)             | 134 MB, ok         | 137 MB, `TOO_LARGE`         |

Before, memory grew linearly with the sheet count. The reviewer measured 1.7 GB for a 475 KB file with 8 sheets. After, repeating a sheet adds nothing, and total slots are capped at 2M. I did not run a crash test on the shared machine; all sizes above are limited.

### Tests

- `tests/k3-topic-stats-parse.test.ts`: 48/48 ✓. New tests:
  - growth curve for 2^14/2^16/2^18 unclosed `<row>`, each under 1 s;
  - unclosed `<c>`/`<si>`/`<rPh>`;
  - tag-length cap;
  - 50 sheets pointing at one part (one shared grid);
  - column bomb (`TOO_LARGE`, under 2 s);
  - row-hole budget;
  - self-closing, `rPh` and `<rowBreaks>` read correctly;
  - K-2: guessed scale refused, header-only counts do not count as a cross-check, all-zero column is fine, `Total` row does not vote.
- **Negative check:** with the old `xlsx.ts` swapped in temporarily, **all 5** new memory/scanner tests fail. The unclosed `<c>`/`<si>`/`<rPh>` test took 5 994 ms there. The file was restored afterwards.
- All 3 K3 files (`parse`, `authz`, `import.live`, with `.env` loaded): **61/61 ✓**.
- `npx tsc --noEmit`: **0 errors** outside `src/lib/agency/`. The only errors, in `src/lib/agency/codes.test.ts`, come from fe-fb's uncommitted work.
- `npx eslint .`: exit 0.
- `set -a; source .env; set +a; npx vitest run`: all K3 tests are green. **15 red** tests are in `tests/agency-invite.live.test.ts` (14) and `src/lib/agency/funnel.attack.test.ts` (1). The cause is `AgencyInviteError: maxUses must be an integer between 6 and 10000`, from fe-fb's uncommitted change to `src/lib/agency/codes.ts`. These files are outside my scope and I did not touch them.

## 3. Değişen dosyalar

- `src/lib/k3-topic-stats/xlsx.ts`: scanner, attribute reader, budget, sheet dedupe, header comment.
- `src/lib/k3-topic-stats/horizonDashboard.ts`: `isDataCode`, `TOPIC_CODE`, scale vote and ambiguity error.
- `tests/k3-topic-stats-parse.test.ts`: the tests above. One existing test changed on purpose: "8% and 0.08" now includes count columns, because without them the case is ambiguous under the new rule.

## 4. Riskler

- **Behaviour change (K-2):** a real export with rates written only as fractions, no `%` in the header and no count columns is now refused. Before, it was imported with a guess. This is intentional (no silent guessing), and the message tells the admin how to fix the file.
- The error goes through the `layout_changed` code, so the UI title says "layout changed" while the message explains the scale problem. A dedicated code would need route and i18n changes, which are outside this card's scope.
- `maxCells` = 2M: 100k rows × 20 padded columns is the limit. A normal Horizon export is about 10 columns. A file with one cell at column 200 on every row is now `TOO_LARGE`.
- A missing close tag is now `MALFORMED`. The old regex silently skipped such an element. Excel output is always well-formed.
- `elements()` does not nest, same as the old lazy regex: a body ends at the first `</tag>`.

## 5. Açık sorular

- K-3 (`route.ts` reads the body without limit when there is no `Content-Length`) was not part of this card. It is in `src/app`, outside my scope, and still open.

## 6. Sonraki adım

- crw-fb re-review of Ö-1/Ö-2/K-2.
- A separate card if a dedicated error code (`rate_scale_ambiguous`) plus an i18n message is wanted for K-2.

**Platform:** verified on **macOS** (Darwin 27, Node 26.5.0). The changed code is pure string and zip processing: no file paths, processes, shell or binaries. It behaves the same on Windows and Linux. I did not run it on Windows or Linux because no machine was available, and there is no platform-dependent code path.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * The guard for the bug class that took M8 down.
 *
 * `src/modules/m8/server/matching.ts` queried `prisma.organization`,
 * `prisma.orgTopicStat` and `prisma.collab`, and the pages asked for
 * `include: { organization: true }` on `ConsortiumSeat` and
 * `where: { opportunity: { callId } }`. None of those models, relations or
 * columns are in prisma/schema.prisma, so every one of them threw
 * PrismaClientValidationError on a real click.
 *
 * The unit test that was supposed to cover this mocked `@/lib/db` wholesale, so
 * the *mock* decided what a model was and the suite stayed green while the
 * feature returned a 500. A mock can never catch this; only the schema can. This
 * test reads prisma/schema.prisma and checks the queries M8 actually writes
 * against it — no database, no mock.
 *
 * TASK-MTRK8YPNJDCIT widened it, because the class was not closed. The public
 * API (`src/app/api/v1/partners`) was still calling `prisma.organization` after
 * M8 had been "fixed" twice, and nothing caught it: `prisma generate` is not
 * part of the install or the gate, so src/types/prisma-override.d.ts types every
 * delegate as `any` and `pnpm typecheck` sees a call to a model that does not
 * exist as perfectly well typed. At runtime the delegate is `undefined` and the
 * call throws a TypeError, which the route's try/catch swallowed into a
 * fabricated demo response — a green build and a 200 OK over a query that never
 * ran.
 *
 * So there are now two guards:
 *
 * 1. The field-level check over SCANNED — model, relation *and* column names for
 *    the surfaces listed there.
 * 2. A repo-wide sweep of `src/`: no file anywhere may call a Prisma model the
 *    schema does not declare. KNOWN_UNKNOWN_MODEL_CALLS below is the ledger of
 *    the ones that remain, and it can only shrink.
 */

const REPO = resolve(__dirname, '../../../..');

/** Files whose Prisma queries serve M8. */
const SCANNED = [
  'src/modules/m8',
  'src/lib/scoring/consortium.ts',
  'src/app/[locale]/(app)/[workspace]/opportunities/[id]/matching/page.tsx',
  'src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page.tsx',
  'src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions.ts',
  'src/app/api/v1/partners',
];

/** Everything the repo-wide sweep looks at. */
const SWEEP_ROOT = 'src';

/**
 * Files allowed to call a model prisma/schema.prisma does not declare, with the
 * model each one names.
 *
 * **It is empty, and the intent is that it stays empty.** As of
 * TASK-MTRK8YPNJDCIT no file in `src/` calls an undeclared model: the last four
 * were src/app/api/v1/partners (both routes, fixed there) and
 * src/lib/cordis-sync.ts / src/lib/cordis-delta.ts (fixed in the same wave).
 *
 * The map exists so that a call that genuinely cannot be fixed yet is *written
 * down* rather than left to fail the build. It may only shrink: an entry whose
 * call has been fixed fails the staleness test below, and a call in a file that
 * is not listed fails the sweep. It can never quietly absorb a new one.
 */
const KNOWN_UNKNOWN_MODEL_CALLS = new Map<string, string[]>([]);

const QUERY_METHODS = [
  'findMany', 'findFirst', 'findUnique', 'findFirstOrThrow', 'findUniqueOrThrow',
  'create', 'createMany', 'update', 'updateMany', 'upsert',
  'delete', 'deleteMany', 'count', 'aggregate', 'groupBy',
];

/** Argument keys whose value is an object of *model fields*. */
const FIELD_BEARING = new Set(['where', 'select', 'include', 'orderBy']);
/** Logical combinators inside `where`; their contents belong to the same model. */
const LOGICAL = new Set(['AND', 'OR', 'NOT']);

interface Field {
  name: string;
  /** Target model when the field is a relation, otherwise null. */
  relationTo: string | null;
}

function parseSchema(): Map<string, Map<string, Field>> {
  const schema = readFileSync(join(REPO, 'prisma/schema.prisma'), 'utf8');
  const models = new Map<string, Map<string, Field>>();

  const modelRe = /^model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)^}/gm;
  const bodies = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(schema)) !== null) {
    if (m[1] && m[2]) bodies.set(m[1], m[2]);
  }

  for (const [name, body] of bodies) {
    const fields = new Map<string, Field>();
    for (const rawLine of body.split('\n')) {
      const line = rawLine.split('//')[0]?.trim() ?? '';
      if (!line || line.startsWith('@@')) continue;
      const fieldMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z0-9_]+)/.exec(line);
      if (!fieldMatch) continue;
      const [, fieldName, type] = fieldMatch;
      if (!fieldName || !type) continue;
      fields.set(fieldName, { name: fieldName, relationTo: bodies.has(type) ? type : null });
    }
    models.set(name, fields);
  }
  return models;
}

/** `consortiumSeat` → `ConsortiumSeat`. */
function delegateToModel(delegate: string): string {
  return delegate.charAt(0).toUpperCase() + delegate.slice(1);
}

function listFiles(target: string): string[] {
  const abs = join(REPO, target);
  if (!statSync(abs).isDirectory()) return [abs];
  const out: string[] = [];
  for (const entry of readdirSync(abs)) {
    const child = join(abs, entry);
    if (statSync(child).isDirectory()) out.push(...listFiles(join(target, entry)));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) out.push(child);
  }
  return out;
}

/**
 * Blanks comment text, keeping the file's length and line breaks.
 *
 * Both scanners match on source text, so without this a doc comment that merely
 * *names* a call — `prisma.organization.findMany(...)`, as src/types/db-rows.ts
 * does when it explains why that model is gone — is reported as a call. A `//`
 * that has an odd number of quotes before it on its line is inside a string
 * (`'https://...'`) and is left alone.
 */
function stripComments(source: string): string {
  const out = source.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  /** Is `at` inside a string literal, judged from the quotes earlier on its line? */
  const inString = (at: number): boolean => {
    const lineStart = source.lastIndexOf('\n', at - 1) + 1;
    let single = 0, double = 0, back = 0;
    for (let k = lineStart; k < at; k++) {
      if (source[k] === '\\') { k++; continue; }
      if (source[k] === "'") single++;
      else if (source[k] === '"') double++;
      else if (source[k] === '`') back++;
    }
    return single % 2 === 1 || double % 2 === 1 || back % 2 === 1;
  };

  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if ((two === '//' || two === '/*') && !inString(i)) {
      const end = two === '//' ? source.indexOf('\n', i) : source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : two === '//' ? end : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Reads the balanced `(...)` that starts at `open`, returning its inner text. */
function balanced(source: string, open: number, pair: [string, string]): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === pair[0]) depth++;
    else if (ch === pair[1]) {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return '';
}

/**
 * Top-level `key: value` pairs of an object-literal body. Deliberately simple —
 * enough for the query literals in these files, and it skips anything it cannot
 * read rather than guessing.
 */
function topLevelEntries(body: string): { key: string; value: string }[] {
  const entries: { key: string; value: string }[] = [];
  let depth = 0;
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (depth === 0) {
      const keyMatch = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*:/.exec(body.slice(i));
      const isKeyStart = i === 0 || /[,\n]/.test(body.slice(0, i).replace(/\s+$/, '').slice(-1) || ',');
      if (keyMatch && keyMatch[1] && isKeyStart) {
        const valueStart = i + keyMatch[0].length;
        const rest = body.slice(valueStart).replace(/^\s+/, '');
        const offset = valueStart + (body.slice(valueStart).length - rest.length);
        let value = '';
        if (rest.startsWith('{')) value = balanced(body, offset, ['{', '}']);
        else if (rest.startsWith('[')) value = balanced(body, offset, ['[', ']']);
        entries.push({ key: keyMatch[1], value });
        i = offset + (value ? value.length + 2 : 0);
        continue;
      }
    }
    i++;
  }
  return entries;
}

interface Problem {
  file: string;
  message: string;
}

function checkFieldObject(
  body: string,
  model: string,
  models: Map<string, Map<string, Field>>,
  file: string,
  problems: Problem[],
  path: string
) {
  const fields = models.get(model);
  if (!fields) return;

  for (const { key, value } of topLevelEntries(body)) {
    if (LOGICAL.has(key)) {
      if (value) checkFieldObject(value, model, models, file, problems, `${path}.${key}`);
      continue;
    }
    // Prisma operators, not model fields.
    if (key.startsWith('_') || ['take', 'skip', 'cursor', 'distinct', 'mode'].includes(key)) continue;

    const field = fields.get(key);
    if (!field) {
      problems.push({
        file,
        message: `${path}.${key} — \`${key}\` is not a field of model \`${model}\` in prisma/schema.prisma`,
      });
      continue;
    }

    // Only a relation's value is another model's field object; a scalar's value
    // is a filter like `{ in: [...] }` and must not be walked.
    if (field.relationTo && value) {
      const nested = topLevelEntries(value);
      const carriers = nested.filter((e) => FIELD_BEARING.has(e.key));
      if (carriers.length) {
        for (const c of carriers) {
          if (c.value) {
            checkFieldObject(c.value, field.relationTo, models, file, problems, `${path}.${key}.${c.key}`);
          }
        }
      } else {
        checkFieldObject(value, field.relationTo, models, file, problems, `${path}.${key}`);
      }
    }
  }
}

const CALL_SOURCE = `\\b(?:prisma|tx)\\.([a-z][A-Za-z0-9_]*)\\.(${QUERY_METHODS.join('|')})\\s*\\(`;

function scan(models: Map<string, Map<string, Field>>): Problem[] {
  const problems: Problem[] = [];

  for (const target of SCANNED) {
    for (const file of listFiles(target)) {
      // Built per file on purpose: a `g` regex carries `lastIndex` between
      // strings, so a match near the end of one file silently skips the next
      // shorter one.
      const callRe = new RegExp(CALL_SOURCE, 'g');
      const source = stripComments(readFileSync(file, 'utf8'));
      const rel = file.slice(REPO.length + 1);
      let m: RegExpExecArray | null;

      while ((m = callRe.exec(source)) !== null) {
        const delegate = m[1];
        if (!delegate) continue;
        const model = delegateToModel(delegate);

        if (!models.has(model)) {
          problems.push({
            file: rel,
            message: `prisma.${delegate}.* — there is no \`model ${model}\` in prisma/schema.prisma`,
          });
          continue;
        }

        const argsOpen = source.indexOf('(', m.index + m[0].length - 1);
        const args = balanced(source, argsOpen, ['(', ')']);
        const objOpen = args.indexOf('{');
        if (objOpen === -1) continue;
        const objBody = balanced(args, objOpen, ['{', '}']);

        for (const { key, value } of topLevelEntries(objBody)) {
          if (!FIELD_BEARING.has(key) || !value) continue;
          checkFieldObject(value, model, models, rel, problems, `${delegate}.${m[2]}.${key}`);
        }
      }
    }
  }
  return problems;
}

/**
 * Every `prisma.<delegate>.<query>` in `src/`, as file -> model names — the
 * models that exist as well as the ones that do not, so the sweep can prove it
 * actually read something before it reports "nothing wrong". Model existence
 * only; the field-level check above is what walks `where`/`select`/`include` for
 * the surfaces it covers.
 */
function sweepModelCalls(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();

  for (const file of listFiles(SWEEP_ROOT)) {
    const callRe = new RegExp(CALL_SOURCE, 'g');
    const source = stripComments(readFileSync(file, 'utf8'));
    const rel = file.slice(REPO.length + 1);
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(source)) !== null) {
      const delegate = m[1];
      if (!delegate) continue;
      const set = found.get(rel) ?? new Set<string>();
      set.add(delegateToModel(delegate));
      found.set(rel, set);
    }
  }
  return found;
}

describe('M8 Prisma queries match prisma/schema.prisma', () => {
  const models = parseSchema();

  it('parses the schema it is validating against', () => {
    // A silent parse failure would make every assertion below vacuously pass.
    expect(models.size).toBeGreaterThan(50);
    expect(models.get('ConsortiumSeat')?.has('organizationId')).toBe(true);
    expect(models.get('Opportunity')?.get('seats')?.relationTo).toBe('ConsortiumSeat');
  });

  it('names only models, relations and columns that exist', () => {
    const problems = scan(models);
    const report = problems.map((p) => `  ${p.file}: ${p.message}`).join('\n');
    expect(report, `M8 queries reference things the schema does not have:\n${report}`).toBe('');
  });

  it('would have caught the models this module used to invent', () => {
    // The three delegates the 500 came from, asserted absent so a future
    // re-introduction is a failing test rather than a runtime crash.
    for (const gone of ['Organization', 'OrgTopicStat', 'Collab', 'Participation']) {
      expect(models.has(gone), `model ${gone} unexpectedly exists`).toBe(false);
    }
    // …and the two field references that broke the pages.
    expect(models.get('ConsortiumSeat')?.has('organization')).toBe(false);
    expect(models.get('Opportunity')?.has('callId')).toBe(false);
    expect(models.get('Opportunity')?.has('topic')).toBe(false);
  });
});

describe('no Prisma call in src/ names a model the schema does not have', () => {
  const models = parseSchema();

  it('actually reads the queries it is checking', () => {
    // A sweep that walked nothing, or whose regex stopped matching, would report
    // a clean repo and make the assertion below vacuous. Pin it to calls that
    // are known to be there — including the two this task rewrote.
    const found = sweepModelCalls();
    expect(found.size).toBeGreaterThan(20);
    expect(found.get('src/app/api/v1/partners/route.ts')?.has('CordisOrganization')).toBe(true);
    expect(
      found.get('src/app/api/v1/partners/[pic]/route.ts')?.has('CordisParticipation')
    ).toBe(true);
  });

  it('has no unknown-model call outside the known-broken list', () => {
    const found = sweepModelCalls();
    const unexpected: string[] = [];

    for (const [file, called] of found) {
      const allowed = KNOWN_UNKNOWN_MODEL_CALLS.get(file) ?? [];
      for (const model of called) {
        if (models.has(model) || allowed.includes(model)) continue;
        unexpected.push(
          `  ${file}: prisma.${model.charAt(0).toLowerCase()}${model.slice(1)}.* — ` +
            `there is no \`model ${model}\` in prisma/schema.prisma`
        );
      }
    }

    const report = unexpected.sort().join('\n');
    expect(
      report,
      `A Prisma call names a model the schema does not declare. The delegate is ` +
        `\`undefined\` at runtime and the call throws a TypeError; \`pnpm typecheck\` ` +
        `cannot see it because prisma-override.d.ts types every delegate as \`any\`. ` +
        `Bind the query to a model that exists — do not add it to ` +
        `KNOWN_UNKNOWN_MODEL_CALLS.\n${report}`
    ).toBe('');
  });

  it('keeps the known-broken list from going stale', () => {
    const found = sweepModelCalls();
    const stale: string[] = [];

    for (const [file, allowed] of KNOWN_UNKNOWN_MODEL_CALLS) {
      const called = found.get(file);
      for (const model of allowed) {
        if (!called?.has(model) || models.has(model)) {
          stale.push(`  ${file}: no longer calls \`${model}\` — drop it from the list`);
        }
      }
    }

    const report = stale.sort().join('\n');
    expect(
      report,
      `KNOWN_UNKNOWN_MODEL_CALLS is out of date. The list may only shrink, so a ` +
        `fixed entry has to be deleted rather than left behind.\n${report}`
    ).toBe('');
  });
});

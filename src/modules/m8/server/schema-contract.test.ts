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
 */

const REPO = resolve(__dirname, '../../../..');

/** Files whose Prisma queries serve M8. */
const SCANNED = [
  'src/modules/m8',
  'src/lib/scoring/consortium.ts',
  'src/app/[locale]/(app)/[workspace]/opportunities/[id]/matching/page.tsx',
  'src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page.tsx',
  'src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions.ts',
];

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

function scan(models: Map<string, Map<string, Field>>): Problem[] {
  const problems: Problem[] = [];
  const callRe = new RegExp(
    `\\b(?:prisma|tx)\\.([a-z][A-Za-z0-9_]*)\\.(${QUERY_METHODS.join('|')})\\s*\\(`,
    'g'
  );

  for (const target of SCANNED) {
    for (const file of listFiles(target)) {
      const source = readFileSync(file, 'utf8');
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

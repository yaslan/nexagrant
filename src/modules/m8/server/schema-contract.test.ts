import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
 * TASK-MTRKVWOGQFSO3 widened it again, for the same reason. The model-level
 * sweep was already repo-wide, but the *field*-level check still only looked at
 * a hand-listed set of M8 surfaces — so M2's `include: { topic: true }` and
 * `include: { opportunity: true }` on models that declare neither relation walked
 * straight through the gate, and the concept note threw on every call.
 *
 * Pointing the field check at `src/` needed one piece of schema the parser did
 * not have: compound keys. `@@unique([tenantId, moduleId])` makes
 * `where: { tenantId_moduleId: {...} }` legal, and without that knowledge the
 * check called 19 correct queries broken. So the parser now reads `@@unique`
 * and `@@id` blocks, registers the key name they generate, and validates the
 * fields *inside* the key object against the same model.
 *
 * TASK-MTS8002I6YD3L widened it once more. The field-level check only read
 * `where`/`select`/`include`/`orderBy`, so the *write* half of every query was
 * unguarded: `create({ data: { titel } })` and every nested
 * `create` / `connect` / `connectOrCreate` / `upsert` under a relation could name
 * a column the schema does not have and walk through the gate — the same
 * PrismaClientValidationError, on a save instead of a read. The check now walks
 * write bodies too, with the nested-write grammar Prisma actually uses: a
 * relation's `create`/`update`/`upsert`/`createMany` value is the *related*
 * model's write body, its `connect`/`disconnect`/`set`/`delete` value is a
 * `where` on that model, and a scalar's `{ increment: 1 }` is an operator, not a
 * field object. 548 write-body field references in `src/` are validated this
 * way; none of them was broken when the check went in, so this closes the hole
 * rather than fixing a live bug.
 *
 * TASK-MTSJK8VVG9MKM widened the *scope* rather than the grammar. Both guards
 * read `src/` only, so the code the product runs was checked and the code we
 * run — `prisma/seed-*.ts`, `scripts/seed-*-e2e.ts`, one-off maintenance
 * scripts — was not. `prisma/seed-m6-evaluations.ts` had been writing
 * `Opportunity.callId`, `Proposal.status` and `Proposal.title`, none of which
 * the schema declares, since the day it was written: `pnpm test` never looked,
 * `pnpm typecheck` cannot see columns through prisma-override.d.ts, and the
 * file is not on any happy path, so it sat there until someone ran it and got
 * PrismaClientValidationError. Seeds and scripts talk to the same database the
 * product does; they get the same gate.
 *
 * So there are now two guards, both over `src/`, `prisma/` and `scripts/`:
 *
 * 1. The field-level check — model, relation *and* column names, including
 *    compound-key members, in read arguments *and* write bodies.
 *    KNOWN_UNKNOWN_FIELD_REFS is its ledger.
 * 2. The model-level sweep: no file may call a Prisma model the schema does not
 *    declare. KNOWN_UNKNOWN_MODEL_CALLS is its ledger.
 *
 * Known limit, measured under TASK-MTS8002I6YD3L and deliberately left: an
 * object literal's shorthand properties (`data: { tenantId, title }`) carry no
 * `key:` token, so topLevelEntries does not see them — 212 of the 760 write-body
 * references in `src/` today. Teaching it shorthand would also make a
 * `where: { OR: [baseFilter, extra] }` read as two unknown fields, so closing
 * that gap is its own task, not a side effect of this one.
 *
 * Both ledgers may only shrink: a fixed entry fails a staleness test, and an
 * unlisted problem fails the check.
 */

const REPO = resolve(__dirname, '../../../..');

/**
 * What both checks read. Repo-wide since TASK-MTRKVWOGQFSO3 — the M8-only list
 * it replaced is exactly why M2's phantom `include`s shipped.
 *
 * TASK-MTSJK8VVG9MKM added `prisma` and `scripts`. `src` alone meant the gate
 * only saw the code the *user* runs; the code *we* run — seeds, one-off
 * maintenance scripts, e2e fixtures — wrote to whatever column it liked.
 * `prisma/seed-m6-evaluations.ts` had been naming three columns the schema does
 * not declare (`Opportunity.callId`, `Proposal.status`, `Proposal.title`) since
 * it was written; nothing failed, because no gate looked there and
 * prisma-override.d.ts hides it from `pnpm typecheck`. It throws
 * PrismaClientValidationError the moment anyone runs it.
 */
const SCANNED = ['src', 'prisma', 'scripts'];

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

/**
 * Files allowed to name a field, relation or column the schema does not declare,
 * with the query path each one takes. Same contract as the model ledger above:
 * **it may only shrink.** An entry whose reference has been fixed fails the
 * staleness test below, and an unlisted bad reference fails the check.
 *
 * **It is empty, and the intent is that it stays empty.** The one reference that
 * was still broken when the field check went repo-wide —
 * `savedSearch.findMany.include.tenant` in src/lib/jobs/tasks/alerts-daily.ts,
 * a `tenant` relation `model SavedSearch` does not have — was fixed under
 * TASK-MTRKWBLXUYSHS in the same wave, so its entry is gone with it.
 */
const KNOWN_UNKNOWN_FIELD_REFS = new Map<string, string[]>([]);

const QUERY_METHODS = [
  'findMany', 'findFirst', 'findUnique', 'findFirstOrThrow', 'findUniqueOrThrow',
  'create', 'createMany', 'update', 'updateMany', 'upsert',
  'delete', 'deleteMany', 'count', 'aggregate', 'groupBy',
];

/** Argument keys whose value is an object of *model fields*. */
const FIELD_BEARING = new Set(['where', 'select', 'include', 'orderBy']);
/** Logical combinators inside `where`; their contents belong to the same model. */
const LOGICAL = new Set(['AND', 'OR', 'NOT']);

/**
 * Argument keys whose value is a *write body* — an object of model fields on the
 * write side — per query method. `upsert` carries two of them and no `data`.
 */
const WRITE_BEARING: Record<string, string[]> = {
  create: ['data'],
  createMany: ['data'],
  update: ['data'],
  updateMany: ['data'],
  upsert: ['create', 'update'],
};

/**
 * Nested-write operators under a relation whose value is the *related* model's
 * write body. `connectOrCreate`, `upsert`, `update` and `createMany` are shaped
 * differently again and are handled by name in checkWriteObject.
 */
const NESTED_WRITE_DATA = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'connectOrCreate']);
/**
 * Nested-write operators whose value is a `where` on the related model — they
 * point at rows that already exist rather than describing new ones.
 */
const NESTED_WRITE_WHERE = new Set(['connect', 'disconnect', 'delete', 'deleteMany', 'set']);

interface Field {
  name: string;
  /** Target model when the field is a relation, otherwise null. */
  relationTo: string | null;
  /**
   * True for the synthetic field a compound key generates —
   * `@@unique([tenantId, moduleId])` makes `tenantId_moduleId` addressable in a
   * `where`. Its value object holds fields of the *same* model, not of another.
   */
  compound: boolean;
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
      fields.set(fieldName, {
        name: fieldName,
        relationTo: bodies.has(type) ? type : null,
        compound: false,
      });
    }

    // `@@unique([a, b])` / `@@id([a, b])` generate the addressable key `a_b`
    // (schema order, joined with `_`), or the given `name:` when one is set.
    // Without this every correct compound-key `where` reads as an unknown field.
    const keyRe = /^\s*@@(?:unique|id)\s*\(\s*\[([^\]]*)\]([^)]*)\)/gm;
    let k: RegExpExecArray | null;
    while ((k = keyRe.exec(body)) !== null) {
      const members = (k[1] ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      if (members.length === 0 || !members.every((member) => fields.has(member))) continue;
      const named = /\bname\s*:\s*['"]([^'"]+)['"]/.exec(k[2] ?? '');
      const keyName = named?.[1] ?? members.join('_');
      // A real column of that name always wins; do not shadow it.
      if (fields.has(keyName)) continue;
      fields.set(keyName, { name: keyName, relationTo: null, compound: true });
    }

    models.set(name, fields);
  }
  return models;
}

/** `consortiumSeat` → `ConsortiumSeat`. */
function delegateToModel(delegate: string): string {
  return delegate.charAt(0).toUpperCase() + delegate.slice(1);
}

/**
 * Paths git has in its index, repo-relative — or `null` when git cannot answer.
 *
 * The gate checks what the repository *contains*, not whatever happens to be
 * lying in the working tree. TASK-MTSJK8VVG9MKM added `scripts/`, and the first
 * widened run tripped over `scripts/_cs-st6-probe3.ts`, an untracked debugging
 * probe another agent had open at that moment. A gate whose colour depends on
 * one machine's scratch files is red here, green in CI, and trusted nowhere.
 *
 * The index, not the commit: `git ls-files -c` lists staged additions too, so a
 * new file is scanned as soon as it is `git add`ed — which is exactly when the
 * pre-commit hook runs the gate. Untracked debris is never scanned, and it is
 * also never shipped.
 */
function trackedFiles(): Set<string> | null {
  const git = spawnSync('git', ['ls-files', '-c', '-z', '--', ...SCANNED], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (git.status !== 0 || typeof git.stdout !== 'string') return null;
  const paths = git.stdout.split('\0').filter(Boolean);
  // An empty answer means the checkout is not a repo (or SCANNED is wrong).
  // Scanning everything is the safe failure; scanning nothing is the vacuous one.
  return paths.length > 0 ? new Set(paths) : null;
}

/**
 * Null when git is unavailable (a tarball, a vendored copy) — over-scanning is
 * the safe direction, so the walk falls back to the whole tree.
 */
const TRACKED = trackedFiles();

function listFiles(target: string): string[] {
  const abs = join(REPO, target);
  if (!statSync(abs).isDirectory()) return [abs];
  const out: string[] = [];
  for (const entry of readdirSync(abs)) {
    const child = join(abs, entry);
    const rel = join(target, entry);
    if (statSync(child).isDirectory()) out.push(...listFiles(rel));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) {
      if (TRACKED && !TRACKED.has(rel)) continue;
      out.push(child);
    }
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
  /** Full query path, e.g. `savedSearch.findMany.include.tenant`. */
  path: string;
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
        path: `${path}.${key}`,
        message: `${path}.${key} — \`${key}\` is not a field of model \`${model}\` in prisma/schema.prisma`,
      });
      continue;
    }

    // A compound key's value is an object of this same model's fields —
    // `where: { tenantId_moduleId: { tenantId, moduleId } }` — so walk it, and a
    // typo inside the key is caught like any other.
    if (field.compound) {
      if (value) checkFieldObject(value, model, models, file, problems, `${path}.${key}`);
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

/**
 * How many write bodies the last `scan()` walked. A write check whose parser
 * silently read nothing would report a clean repo and make the assertion over
 * `src/` vacuous, exactly the way a mocked client did before this file existed.
 */
let writeBodiesWalked = 0;

/**
 * One `{...}` body, or each element of an `[{...}, {...}]` list.
 *
 * `createMany({ data: [row, row] })` and `seats: { create: [a, b] }` are as
 * ordinary as the single-object form, and reading only the first shape would
 * leave every bulk write unchecked.
 */
function objectBodies(value: string): string[] {
  if (!value.trim().startsWith('{')) return [value];
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        out.push(value.slice(start + 1, i));
        start = -1;
      }
    }
  }
  return out;
}

/**
 * The write-side twin of checkFieldObject: every top-level key of a `data`
 * (or `upsert`'s `create`/`update`) body is a field of `model`, and a relation's
 * value is a nested write whose grammar decides which model its contents belong
 * to.
 *
 * A scalar's value is never walked — `views: { increment: 1 }` and
 * `tags: { set: [...] }` are operators, not field objects, and reading them as
 * fields would report a working query as broken.
 */
function checkWriteObject(
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
    const field = fields.get(key);
    if (!field) {
      problems.push({
        file,
        path: `${path}.${key}`,
        message: `${path}.${key} — \`${key}\` is not a field of model \`${model}\` in prisma/schema.prisma`,
      });
      continue;
    }
    if (!field.relationTo || !value) continue;

    const target = field.relationTo;
    for (const nested of objectBodies(value)) {
      for (const op of topLevelEntries(nested)) {
        if (!op.value) continue;
        const opPath = `${path}.${key}.${op.key}`;

        // `{ where, create }` and `{ where, create, update }` — a lookup and a
        // write body side by side, each read in its own grammar.
        if (op.key === 'connectOrCreate' || op.key === 'upsert') {
          for (const inner of objectBodies(op.value)) {
            for (const part of topLevelEntries(inner)) {
              if (!part.value) continue;
              if (part.key === 'where') {
                checkFieldObject(part.value, target, models, file, problems, `${opPath}.where`);
              } else if (part.key === 'create' || part.key === 'update') {
                for (const b of objectBodies(part.value)) {
                  checkWriteObject(b, target, models, file, problems, `${opPath}.${part.key}`);
                }
              }
            }
          }
          continue;
        }

        // `createMany: { data: [...] }` — one level of indirection before the rows.
        if (op.key === 'createMany') {
          for (const inner of objectBodies(op.value)) {
            for (const part of topLevelEntries(inner)) {
              if (part.key !== 'data' || !part.value) continue;
              for (const b of objectBodies(part.value)) {
                checkWriteObject(b, target, models, file, problems, `${opPath}.data`);
              }
            }
          }
          continue;
        }

        // To-many `update: { where, data }`; to-one `update: { …fields }`.
        if (op.key === 'update' || op.key === 'updateMany') {
          for (const inner of objectBodies(op.value)) {
            const parts = topLevelEntries(inner).filter((e) => e.key === 'where' || e.key === 'data');
            if (parts.length === 0) {
              checkWriteObject(inner, target, models, file, problems, opPath);
              continue;
            }
            for (const part of parts) {
              if (!part.value) continue;
              if (part.key === 'where') {
                checkFieldObject(part.value, target, models, file, problems, `${opPath}.where`);
              } else {
                for (const b of objectBodies(part.value)) {
                  checkWriteObject(b, target, models, file, problems, `${opPath}.data`);
                }
              }
            }
          }
          continue;
        }

        if (NESTED_WRITE_DATA.has(op.key)) {
          for (const b of objectBodies(op.value)) {
            checkWriteObject(b, target, models, file, problems, opPath);
          }
        } else if (NESTED_WRITE_WHERE.has(op.key)) {
          for (const b of objectBodies(op.value)) {
            checkFieldObject(b, target, models, file, problems, opPath);
          }
        }
      }
    }
  }
}

const CALL_SOURCE = `\\b(?:prisma|tx)\\.([a-z][A-Za-z0-9_]*)\\.(${QUERY_METHODS.join('|')})\\s*\\(`;

/** Every file the field-level check walks. */
function scannedFiles(): string[] {
  return SCANNED.flatMap((target) => listFiles(target));
}

/** Every Prisma query in one file's (comment-stripped) source. */
function scanSource(
  source: string,
  rel: string,
  models: Map<string, Map<string, Field>>
): Problem[] {
  const problems: Problem[] = [];
  // Built per source on purpose: a `g` regex carries `lastIndex` between
  // strings, so a match near the end of one file silently skips the next
  // shorter one.
  const callRe = new RegExp(CALL_SOURCE, 'g');
  let m: RegExpExecArray | null;

  while ((m = callRe.exec(source)) !== null) {
    const delegate = m[1];
    if (!delegate) continue;
    const model = delegateToModel(delegate);

    if (!models.has(model)) {
      problems.push({
        file: rel,
        path: `${delegate}.${m[2]}`,
        message: `prisma.${delegate}.* — there is no \`model ${model}\` in prisma/schema.prisma`,
      });
      continue;
    }

    const argsOpen = source.indexOf('(', m.index + m[0].length - 1);
    const args = balanced(source, argsOpen, ['(', ')']);
    // `findMany(SAVED_SEARCH_ALERT_QUERY)` — a query hoisted into a const is
    // still a query. Without this, extracting one out of the call is enough
    // to hide it from the gate.
    const hoisted = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(args)?.[1];
    const literal = hoisted
      ? (() => {
          const declRe = new RegExp(`\\bconst\\s+${hoisted}\\b[^=]*=\\s*\\{`);
          const decl = declRe.exec(source);
          return decl ? source.slice(decl.index + decl[0].length - 1) : '';
        })()
      : args;
    const objOpen = literal.indexOf('{');
    if (objOpen === -1) continue;
    const objBody = balanced(literal, objOpen, ['{', '}']);

    const writeKeys = WRITE_BEARING[m[2] ?? ''] ?? [];
    for (const { key, value } of topLevelEntries(objBody)) {
      if (!value) continue;
      if (FIELD_BEARING.has(key)) {
        checkFieldObject(value, model, models, rel, problems, `${delegate}.${m[2]}.${key}`);
      } else if (writeKeys.includes(key)) {
        for (const b of objectBodies(value)) {
          writeBodiesWalked++;
          checkWriteObject(b, model, models, rel, problems, `${delegate}.${m[2]}.${key}`);
        }
      }
    }
  }
  return problems;
}

function scan(models: Map<string, Map<string, Field>>): Problem[] {
  writeBodiesWalked = 0;
  return scannedFiles().flatMap((file) =>
    scanSource(stripComments(readFileSync(file, 'utf8')), file.slice(REPO.length + 1), models)
  );
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

  for (const file of scannedFiles()) {
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

describe('every Prisma query in src/, prisma/ and scripts/ matches prisma/schema.prisma', () => {
  const models = parseSchema();

  it('parses the schema it is validating against', () => {
    // A silent parse failure would make every assertion below vacuously pass.
    expect(models.size).toBeGreaterThan(50);
    expect(models.get('ConsortiumSeat')?.has('organizationId')).toBe(true);
    expect(models.get('Opportunity')?.get('seats')?.relationTo).toBe('ConsortiumSeat');
  });

  it('reads compound keys out of the schema', () => {
    // Compound-key blindness is what kept the field check off `src/`: without
    // this, 19 correct `where: { tenantId_moduleId: {...} }` queries read as
    // unknown fields and the noise buried the one real bug.
    const moduleState = models.get('ModuleState');
    expect(moduleState?.get('tenantId_moduleId')?.compound).toBe(true);
    expect(models.get('CordisCoParticipation')?.get('orgA_orgB')?.compound).toBe(true);
    // `@@id([projectId, topicCode])`, not `@@unique`.
    expect(models.get('CordisProjectTopic')?.get('projectId_topicCode')?.compound).toBe(true);
    // A key name is synthetic; it must not shadow or invent a real column.
    expect(moduleState?.get('tenantId')?.compound).toBe(false);
    expect(moduleState?.has('tenantId_state')).toBe(false);
  });

  it('actually reads the queries it is checking', () => {
    // A scan that walked nothing would report a clean repo and make the
    // assertion below vacuous. Pin it to files that are known to be walked.
    const walked = new Set(scannedFiles().map((f) => f.slice(REPO.length + 1)));
    expect(walked.size).toBeGreaterThan(200);
    expect(walked.has('src/modules/m8/server/matching.ts')).toBe(true);
    expect(walked.has('src/lib/jobs/tasks/alerts-daily.ts')).toBe(true);
    expect(walked.has('src/modules/m2/server/actions.ts')).toBe(true);
    // TASK-MTSJK8VVG9MKM. Pin one file per added root: a `SCANNED` entry that
    // silently resolved to nothing would leave the new coverage imaginary.
    expect(walked.has('prisma/seed-m6-evaluations.ts')).toBe(true);
    expect(walked.has('prisma/seed.ts')).toBe(true);
    expect(walked.has('scripts/seed-m6-e2e.ts')).toBe(true);
  });

  it('reads the git index, not the working tree', () => {
    // An untracked scratch probe is not part of the repo and CI never sees it,
    // so it must not decide whether the gate is red — the first widened run
    // tripped over one another agent had open. Staged additions *are* in the
    // index, so a new file is covered from the moment it is `git add`ed.
    expect(TRACKED, 'git ls-files answered nothing — the scope check is vacuous').not.toBeNull();
    const untracked = spawnSync('git', ['ls-files', '-o', '--exclude-standard', '-z', '--', ...SCANNED], {
      cwd: REPO,
      encoding: 'utf8',
    });
    const loose = (untracked.stdout ?? '')
      .split('\0')
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'));
    const walked = new Set(scannedFiles().map((f) => f.slice(REPO.length + 1)));
    expect(loose.filter((f) => walked.has(f))).toEqual([]);
  });

  it('follows a query hoisted into a const', () => {
    // src/lib/jobs/tasks/alerts-daily.ts moved its query into
    // SAVED_SEARCH_ALERT_QUERY. If the scanner only read inline literals, then
    // lifting a query out of the call would be all it took to leave the gate.
    const sound =
      'const Q = { where: { notify: true }, select: { id: true, tenantId: true } } as const;\n' +
      'await prisma.savedSearch.findMany(Q);';
    expect(scanSource(sound, 'fixture.ts', models)).toEqual([]);

    // `model SavedSearch` has the scalar `tenantId` and no `tenant` relation —
    // the reference that stopped the daily alert job from ever sending mail.
    const broken =
      'const Q = { include: { tenant: true } } as const;\n' +
      'await prisma.savedSearch.findMany(Q);';
    expect(scanSource(broken, 'fixture.ts', models).map((p) => p.path)).toEqual([
      'savedSearch.findMany.include.tenant',
    ]);
  });

  it('reads the write body, not just the read arguments', () => {
    // TASK-MTS8002I6YD3L. `where`/`select`/`include`/`orderBy` were the whole
    // check, so a column that does not exist was caught on a read and waved
    // through on a save — the same PrismaClientValidationError, one click later.
    const sound =
      "await prisma.opportunity.create({ data: { tenantId: t, workspaceId: w, title: 'x' } });";
    expect(scanSource(sound, 'fixture.ts', models)).toEqual([]);

    const broken = "await prisma.opportunity.create({ data: { titel: 'x' } });";
    expect(scanSource(broken, 'fixture.ts', models).map((p) => p.path)).toEqual([
      'opportunity.create.data.titel',
    ]);

    // `upsert` carries two write bodies and no `data` at all.
    const upsert =
      "await prisma.opportunity.upsert({ where: { id: 'o1' }, " +
      "create: { titel: 'x' }, update: { stagee: 'G1' } });";
    expect(scanSource(upsert, 'fixture.ts', models).map((p) => p.path)).toEqual([
      'opportunity.upsert.create.titel',
      'opportunity.upsert.update.stagee',
    ]);

    // A bulk write is a list of write bodies; reading only the first shape
    // would leave every `createMany` unchecked.
    const many =
      "await prisma.consortiumSeat.createMany({ data: [{ roleKey: 'coordinator' }, { roleKy: 'x' }] });";
    expect(scanSource(many, 'fixture.ts', models).map((p) => p.path)).toEqual([
      'consortiumSeat.createMany.data.roleKy',
    ]);
  });

  it('reads nested create, connect and connectOrCreate against the related model', () => {
    // The relation's value is not a field object of the parent — each
    // nested-write operator decides which model its contents belong to, and
    // getting that wrong is how `include: { organization: true }` shipped.
    const soundCreate =
      "await prisma.opportunity.create({ data: { title: 'x', " +
      "seats: { create: [{ roleKey: 'coordinator' }, { roleKey: 'research' }] } } });";
    expect(scanSource(soundCreate, 'fixture.ts', models)).toEqual([]);

    const brokenCreate =
      "await prisma.opportunity.create({ data: { seats: { create: { orgId: 'p' } } } });";
    expect(scanSource(brokenCreate, 'fixture.ts', models).map((p) => p.path)).toEqual([
      'opportunity.create.data.seats.create.orgId',
    ]);

    // `connect` points at a row that exists, so its body is a `where` on
    // ConsortiumSeat — `organization` is the relation this module invented.
    const brokenConnect =
      "await prisma.opportunity.update({ where: { id: 'o1' }, " +
      "data: { seats: { connect: { organization: 'p' } } } });";
    expect(scanSource(brokenConnect, 'fixture.ts', models).map((p) => p.path)).toEqual([
      'opportunity.update.data.seats.connect.organization',
    ]);

    // `connectOrCreate` is a lookup and a write body side by side; both halves
    // are read, each in its own grammar.
    const brokenBoth =
      "await prisma.opportunity.update({ where: { id: 'o1' }, data: { seats: { " +
      "connectOrCreate: { where: { seatId: 's' }, create: { roleKy: 'x' } } } } });";
    expect(scanSource(brokenBoth, 'fixture.ts', models).map((p) => p.path)).toEqual([
      'opportunity.update.data.seats.connectOrCreate.where.seatId',
      'opportunity.update.data.seats.connectOrCreate.create.roleKy',
    ]);
  });

  it('does not read a scalar update operator as a field object', () => {
    // `{ increment: 1 }` and `{ set: [...] }` are operators on the column, not
    // fields of a model. Walking them would report working queries as broken
    // and the noise would bury the real ones — the failure mode compound keys
    // caused before the parser learned them.
    const ops =
      "await prisma.opportunity.update({ where: { id: 'o1' }, " +
      "data: { g0Score: { increment: 1 }, notes: { set: 'x' } } });";
    expect(scanSource(ops, 'fixture.ts', models)).toEqual([]);
  });

  it('actually walks the write bodies in src/', () => {
    // Same guard as the read side: a parser that silently walked nothing would
    // report a clean repo. The scanned roots hold ~180 write calls; pin it well
    // under that so the number is a floor, not a moving target.
    scan(models);
    expect(writeBodiesWalked).toBeGreaterThan(100);
  });

  it('names only models, relations and columns that exist', () => {
    const unexpected = scan(models).filter(
      (p) => !(KNOWN_UNKNOWN_FIELD_REFS.get(p.file) ?? []).includes(p.path)
    );
    const report = [...new Set(unexpected.map((p) => `  ${p.file}: ${p.message}`))]
      .sort()
      .join('\n');
    expect(
      report,
      `A Prisma query names a model, relation or column the schema does not ` +
        `declare. It throws PrismaClientValidationError on a real click, and ` +
        `\`pnpm typecheck\` cannot see it because prisma-override.d.ts types every ` +
        `delegate as \`any\`. Fix the query — do not add it to ` +
        `KNOWN_UNKNOWN_FIELD_REFS.\n${report}`
    ).toBe('');
  });

  it('keeps the known-broken field list from going stale', () => {
    const problems = scan(models);
    const stale: string[] = [];

    for (const [file, allowed] of KNOWN_UNKNOWN_FIELD_REFS) {
      for (const path of allowed) {
        if (!problems.some((p) => p.file === file && p.path === path)) {
          stale.push(`  ${file}: \`${path}\` is no longer broken — drop it from the list`);
        }
      }
    }

    const report = stale.sort().join('\n');
    expect(
      report,
      `KNOWN_UNKNOWN_FIELD_REFS is out of date. The list may only shrink, so a ` +
        `fixed entry has to be deleted rather than left behind.\n${report}`
    ).toBe('');
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

  it('would have caught the phantom includes that crashed M2 concept notes', () => {
    // TASK-MTRKV25PNBHPX. Both models carry the scalar id and no relation, so
    // `include: { topic: true }` / `include: { opportunity: true }` threw on
    // every concept-note call while this check still only looked at M8.
    expect(models.get('Opportunity')?.has('topicId')).toBe(true);
    expect(models.get('Opportunity')?.has('topic')).toBe(false);
    expect(models.get('ConceptNote')?.has('opportunityId')).toBe(true);
    expect(models.get('ConceptNote')?.has('opportunity')).toBe(false);
  });
});

describe('no Prisma call in src/, prisma/ or scripts/ names a model the schema does not have', () => {
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
    // TASK-MTSJK8VVG9MKM — the sweep reaches the new roots too.
    expect(found.get('prisma/seed-m6-evaluations.ts')?.has('Evaluation')).toBe(true);
    expect(found.get('scripts/seed-m6-e2e.ts')?.has('Evaluation')).toBe(true);
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

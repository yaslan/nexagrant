/**
 * TASK-MUN2KUHP1BP18 — ids that reach a `where` from outside the server.
 *
 * A server action's arguments come from the client, whatever its TypeScript
 * signature says: React's Flight encoding carries `undefined` as `$undefined`,
 * so an id typed `string` can arrive as `undefined`, `null`, a number or "".
 * Prisma reads a `where` key whose value is `undefined` as "not set", so
 * `updateMany({ where: { id: partId, tenantId } })` with `partId` missing
 * rewrites every row of the tenant (İNCELEME-27 B-1: every m11 part and every
 * m2 concept note overwritten on an isolated DB).
 *
 * Every client-supplied id is checked with one of these before it is used.
 * tests/where-guard-src.test.ts fails when an `updateMany` / `deleteMany`
 * under src/ takes an id that did not go through them.
 */

/** Thrown by {@link requireActionId}; route handlers map it to HTTP 400. */
export class MissingIdError extends Error {
  readonly status = 400;
  constructor(readonly label: string) {
    super(`${label} is missing`);
    this.name = 'MissingIdError';
  }
}

/** True for a non-empty string. Use as `if (!isPresentId(id)) return …;` at the top of an action. */
export function isPresentId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** The id, or a {@link MissingIdError} — never a silently dropped filter. */
export function requireActionId(value: unknown, label: string): string {
  if (!isPresentId(value)) throw new MissingIdError(label);
  return value;
}

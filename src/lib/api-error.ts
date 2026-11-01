import { NextResponse } from 'next/server';

/**
 * The one way a route handler answers with a 5xx (TASK-MUNY0O53ITDU4,
 * İNCELEME-75 Y-1/D-1).
 *
 * A server error's cause belongs in the server log. Its body used to be written
 * by hand at every call site, and a thrown value's text kept finding its way in
 * — `err.message`, `String(err)`, a Prisma error passed through an action's
 * `{ error }` — which showed callers table names and query shapes.
 *
 * Every field this helper puts in the body must have a literal type: a string,
 * number or boolean written in the source. A value computed at run time (an
 * error's message, a template string, anything typed plain `string`) does not
 * type-check, so the body cannot carry what was thrown. The source guard in
 * tests/api/api-error-body-guard.test.ts makes sure no route builds a 5xx any
 * other way.
 */

export type ServerErrorStatus = 500 | 502 | 503 | 504;

type Literal = string | number | boolean | null;

/** `T` with every field that is not a literal type turned into `never`. */
export type LiteralFields<T> = {
  // An empty object has every key of `Record<T[K], 1>` only when those keys
  // are open-ended: `string` or a template type such as `x${string}`. A union
  // of written-out strings has required keys, so the empty object lacks them.
  [K in keyof T]: T[K] extends string
    ? Record<never, never> extends Record<T[K], 1>
      ? never
      : T[K]
    : T[K] extends number
      ? number extends T[K]
        ? never
        : T[K]
      : T[K] extends boolean
        ? boolean extends T[K]
          ? never
          : T[K]
        : T[K] extends null
          ? null
          : never;
};

export interface InternalErrorInit {
  status?: ServerErrorStatus;
  headers?: HeadersInit;
  /**
   * Identifiers the server created for this request (an import run, a
   * correlation id), so a caller can quote them to support. They are the only
   * run-time values a 5xx body may carry, and only under these names.
   */
  ids?: { runId?: string; requestId?: string };
}

/**
 * A 5xx JSON response with a fixed body. With no fields the body is
 * `{ error: 'internal_error' }`; routes whose clients expect another shape
 * (`{ success: false, error: … }`, a code of their own) pass it as literals.
 */
export function internalError<const F extends Record<string, Literal> = { error: 'internal_error' }>(
  fields?: F & LiteralFields<F>,
  init: InternalErrorInit = {}
): NextResponse {
  return NextResponse.json({ ...(fields ?? { error: 'internal_error' }), ...init.ids }, {
    status: init.status ?? 500,
    headers: init.headers,
  });
}

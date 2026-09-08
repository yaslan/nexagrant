/**
 * What a `Json` column can actually hold.
 *
 * `Record<string, unknown>` is the shape most of this repo reached for when it
 * built a payload destined for a Prisma `Json` field, and it does not fit: an
 * `unknown` value may be a `Date`, a `Map`, a function or a class instance, none
 * of which survive the round-trip through Postgres. The generated client says so
 * — `Prisma.InputJsonValue` rejects `Record<string, unknown>` — and while
 * src/types/prisma-override.d.ts was in place nothing said it at all.
 *
 * Declaring a payload as `JsonObject` puts the check back at the place the
 * payload is *built*, which is where a non-serialisable value can still be
 * named, rather than at the write, where all that is left is a cast.
 *
 * Written as type aliases, not interfaces, on purpose: only an object literal
 * type or an alias of one gets TypeScript's implicit index signature, and
 * without that implicit signature a payload type is not assignable to
 * `Prisma.InputJsonValue` however JSON-safe its fields are.
 */
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** A JSON object — the shape of every `Json` column payload in this repo. */
export type JsonObject = { [key: string]: JsonValue };

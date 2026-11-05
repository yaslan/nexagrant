/** Shared by the form and its action, so both read a keyword list and an unset TRL range the same way. */

/** What the form shows and a first save stores until someone picks a TRL range. */
export const DEFAULT_TRL_RANGE = { min: 3, max: 8 } as const;

export function parseKeywords(raw: string): string[] {
  return raw
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

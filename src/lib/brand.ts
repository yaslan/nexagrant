/**
 * The product name, in one place.
 *
 * The platform shipped under the name "FonBridge" and no longer carries it. The rename found
 * the old name copied as a literal into 32 source files — page copy, logo alt text, the SMTP
 * "from" default, the evidence-pack download filename, the generated-document footer — so the
 * name had to be corrected 52 times and any site that was missed kept printing the dead brand
 * onto a customer's document. That is the defect this module exists to prevent: the name is a
 * value read from here, never a string re-typed at the call site.
 *
 * User-visible SENTENCES still belong in `messages/<locale>.json` (CLAUDE.md rule 8). The
 * catalogue entries that mention the product carry a `{brand}` placeholder and the caller
 * interpolates {@link PRODUCT_NAME} into it, so a catalogue never hard-codes the name either.
 */

/** The product name as it is written to users, in both languages. */
export const PRODUCT_NAME = 'Fabrika';

/**
 * Substitutes `{brand}` in a catalogue string with {@link PRODUCT_NAME}.
 *
 * For callers that cannot pass interpolation values to `next-intl` — the document exporter is
 * a synchronous, non-React function that reads the catalogue JSON directly. React callers use
 * `t('key', { brand: PRODUCT_NAME })` instead and never need this.
 */
export function withBrand(text: string): string {
  return text.replaceAll('{brand}', PRODUCT_NAME);
}

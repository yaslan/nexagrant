export const REGIONS: Record<string, { name: string; code: string }> = {
  turkey: { name: 'Türkiye', code: 'TR' },
  germany: { name: 'Almanya', code: 'DE' },
  belgium: { name: 'Belçika', code: 'BE' },
  france: { name: 'Fransa', code: 'FR' },
  italy: { name: 'İtalya', code: 'IT' },
};

/**
 * The region a URL segment names, or undefined.
 *
 * `REGIONS[region]` alone also answers for the keys every object inherits:
 * /tr/calls/constructor rendered 200 with the title "Object", and `__proto__`,
 * `toString`, `hasOwnProperty` likewise — indexable soft-404s
 * (TASK-MUNWZGWA70P16, İNCELEME-71 B-1). Only the table's own keys count.
 */
export function regionOf(region: string): { name: string; code: string } | undefined {
  return Object.hasOwn(REGIONS, region) ? REGIONS[region] : undefined;
}

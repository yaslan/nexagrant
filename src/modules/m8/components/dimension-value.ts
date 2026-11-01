import type { DimensionScale } from '@/lib/scoring/seat-dimension-scale';

/** The `Consortium` messages a dimension value is rendered with. */
type DimensionT = (
  key: 'dimensionOutOf' | 'dimensionRange',
  values: { score: string; min?: string; max: string }
) => string;

/**
 * Formats a number in the viewer's locale — `format.number` from next-intl's
 * `getFormatter()` (server) or `useFormatter()` (client). Passed in rather than
 * imported so this file stays plain and callable from both (FO-162).
 */
export type NumberFormat = (value: number, options: FractionDigits) => string;

/** The only options this file sets; a subset both `Intl` and next-intl accept. */
type FractionDigits = { minimumFractionDigits: number; maximumFractionDigits: number };

/** A score: always one decimal, so a column of them lines up ("3,0", "61,5"). */
const SCORE: FractionDigits = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
/** A range bound: as written in the scale, "35" or "1,5". */
const BOUND: FractionDigits = { minimumFractionDigits: 0, maximumFractionDigits: 1 };

/** A score in the viewer's locale: "61,5" in Turkish, "61.5" in English. */
export function scoreNumberText(format: NumberFormat, value: number): string {
  return format(value, SCORE);
}

/**
 * One breakdown dimension against its own range (FO-155): "3,0 / 35", or for a
 * penalty "-10,0 (aralık -10…0)". Without a known range — a breakdown neither
 * scorer wrote — only the number is shown. Numbers follow the viewer's locale;
 * a fixed "." separator printed "1.5 / 1.5" to Turkish users (FO-162).
 */
export function dimensionValueText(
  t: DimensionT,
  format: NumberFormat,
  scale: DimensionScale | null,
  value: number
): string {
  const score = scoreNumberText(format, value);
  if (!scale) return score;
  const max = format(scale.max, BOUND);
  if (scale.min < 0) return t('dimensionRange', { score, min: format(scale.min, BOUND), max });
  return t('dimensionOutOf', { score, max });
}

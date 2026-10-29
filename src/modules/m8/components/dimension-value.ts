import type { DimensionScale } from '@/lib/scoring/seat-dimension-scale';

/** The `Consortium` messages a dimension value is rendered with. */
type DimensionT = (
  key: 'dimensionOutOf' | 'dimensionRange',
  values: { score: string; min?: string; max: string }
) => string;

/**
 * One breakdown dimension against its own range (FO-155): "3.0 / 35", or for a
 * penalty "-10.0 (range -10…0)". Without a known range — a breakdown neither
 * scorer wrote — only the number is shown.
 */
export function dimensionValueText(t: DimensionT, scale: DimensionScale | null, value: number): string {
  const score = value.toFixed(1);
  if (!scale) return score;
  if (scale.min < 0) return t('dimensionRange', { score, min: String(scale.min), max: String(scale.max) });
  return t('dimensionOutOf', { score, max: String(scale.max) });
}

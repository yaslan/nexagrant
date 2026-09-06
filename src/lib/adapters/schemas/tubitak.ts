import { z } from 'zod';
import { BaseTopicSchema } from './common';

/** Normalized TÜBİTAK programme call. */
export const TubitakTopicSchema = BaseTopicSchema;
export type TubitakTopic = z.infer<typeof TubitakTopicSchema>;

/**
 * TÜBİTAK publishes an HTML programme catalogue, not dated calls.
 *
 * Primary shape (tubitak.gov.tr/tr/destekler, verified 2026-09-06):
 *   <a href="/tr/destekler/<category>/<slug>/1501-…">1501 - TÜBİTAK Sanayi Ar-Ge …</a>
 * Group 1 = href, group 2 = 4-digit programme code, group 3 = programme name.
 */
export const TUBITAK_PROGRAMME_LINK_PATTERN =
  /<a[^>]+href="([^"]*\/destekler\/[^"]+)"[^>]*>\s*(\d{4})\s*(?:-|–)\s*([^<]{3,200}?)\s*<\/a>/gi;

/** Legacy code shapes, kept as a fallback for the older English pages. */
export const TUBITAK_PROGRAMME_PATTERNS: RegExp[] = [
  /(?:TÜBİTAK|TUBITAK)[-\s]([\d]{4}[-][A-Z0-9]{1,3})/gi,
  /(?:program|call)[-\s]*(\d{4}[-][A-Z0-9]{1,3})/gi,
];

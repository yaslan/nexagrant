/**
 * Reading-time estimate for a blog post (TASK-MVDPA19QP3M9A). The admin form
 * fills its "read time" field from this until the admin types their own value.
 * Pure and client-safe: it only looks at the Markdown text.
 */

/**
 * Read time bounds, in whole minutes (TASK-MVDSY96TB1EPM): the admin form's
 * number field, the server validation and the CHECK in
 * prisma/migrations/blog-read-minutes.sql.
 */
export const BLOG_READ_MINUTES = { min: 1, max: 120 } as const;

/** Words an average reader gets through in a minute. */
export const WORDS_PER_MINUTE = 200;

/**
 * Words a reader sees in `markdown`: link and image targets, HTML tags and the
 * Markdown markers themselves (`#`, `**`, `-`, `1.`, `>`, backticks) are not words.
 */
export function countReadableWords(markdown: string): number {
  const text = markdown
    // ![alt](url) and [text](url) -> alt / text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    // Ordered-list markers carry a digit, so they are dropped before counting.
    .replace(/^\s*\d+[.)]\s+/gm, ' ');
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/**
 * Minutes to read `markdown`: 0 when there is nothing to read, otherwise within
 * {@link BLOG_READ_MINUTES}.
 */
export function estimateReadMinutes(markdown: string): number {
  const words = countReadableWords(markdown);
  if (words === 0) return 0;
  return Math.min(BLOG_READ_MINUTES.max, Math.max(BLOG_READ_MINUTES.min, Math.round(words / WORDS_PER_MINUTE)));
}

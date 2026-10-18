/**
 * Reading-time estimate for a blog post (TASK-MVDPA19QP3M9A). The admin form
 * fills its "read time" field from this until the admin types their own value.
 * Pure and client-safe: it only looks at the Markdown text.
 */

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

/** Minutes to read `markdown`: 0 when there is nothing to read, otherwise at least 1. */
export function estimateReadMinutes(markdown: string): number {
  const words = countReadableWords(markdown);
  return words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

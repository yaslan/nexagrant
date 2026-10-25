/**
 * TASK-MVDPHZQCTVJ2R — links and images inside a blog post (`BlogPost.content`).
 *
 * The stored content stays the plain markdown subset of src/lib/blog-markdown.ts;
 * this file adds two forms to it and is the ONE place that says which of them
 * are allowed. Three callers use it and none of them repeats a rule:
 *   - the admin editor (src/components/editor/RichTextEditor.tsx) refuses a
 *     link or an image here before it is inserted;
 *   - the save path (`validateBlogInput`, src/lib/blog-shared.ts) refuses
 *     content that carries anything else, whoever posted it;
 *   - the post page renderer (`renderBlogContent`) prints anything else as
 *     plain text, so content stored before these rules can do no harm.
 *
 * The forms (the patterns below are shared with the renderer and the
 * converter, so all three read a post the same way):
 *   - inline link `[text](href)`: text without `[` `]`, href without
 *     whitespace or parentheses;
 *   - block image `![alt](src)`: the whole (trimmed) line, nothing else on it.
 *
 * Owner's decisions: an image is only ever an upload to the public bucket's
 * `/blog/` folder (no outside image hosts) and it must have alt text; a link
 * is `https:`, `http:`, `mailto:` or a path on this site.
 *
 * Pure: no env, no DOM, safe in a client bundle.
 */

/** Longest link or image address accepted, as for cover images (BLOG_LIMITS.url). */
export const BLOG_CONTENT_URL_MAX = 2_000;

/** One inline link token, as the renderer splits a line on it. */
export const BLOG_LINK_SPLIT = /(\[[^[\]]+\]\([^\s()]+\))/g;
const LINK_TOKEN = /^\[([^[\]]+)\]\(([^\s()]+)\)$/;
/**
 * What the save treats as an attempted link: `[text](` and the address up to
 * the first `)` or whitespace. Wider than LINK_TOKEN on purpose — the page
 * shows `[x](javascript:alert(1))` as text (the `(` ends no address), but such
 * content is refused, not stored.
 */
const LINK_ATTEMPT = /\[[^[\]]+\]\(([^\s)]*)/g;
/**
 * The file name the upload route gives an image (src/lib/blog-image.ts):
 * something, then a lowercase `.png`, `.jpg`, `.jpeg` or `.webp`.
 */
const IMAGE_FILE = /\/[^/]+\.(?:png|jpe?g|webp)$/;
/** A line that is an image and nothing else; alt and src may be empty so a save can say which is wrong. */
const IMAGE_LINE = /^!\[([^[\]]*)\]\(([^\s()]*)\)$/;

export type BlogLinkKind = 'internal' | 'external' | 'mailto';

/**
 * What kind of link `href` is, or null when it is not allowed. Nothing is
 * cleaned up first: an address with whitespace, control characters or a
 * backslash in it is refused, because browsers strip or reinterpret those
 * (`java\tscript:`, `/\evil.com`) and the check must see what the browser sees.
 * `//host` is another site, not a path. URL-encoding cannot hide a scheme —
 * `javascript%3A…` parses as no URL at all.
 */
export function blogLinkKind(href: string): BlogLinkKind | null {
  if (href.length === 0 || href.length > BLOG_CONTENT_URL_MAX) return null;
  if (/[\s\u0000-\u001f\u007f\\]/.test(href)) return null;
  if (href.startsWith('/')) return href.startsWith('//') ? null : 'internal';
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol === 'mailto:') return url.pathname.length > 0 ? 'mailto' : null;
  if (url.protocol === 'https:' || url.protocol === 'http:') {
    return url.hostname !== '' && url.username === '' && url.password === '' ? 'external' : null;
  }
  return null;
}

export function isAllowedLinkHref(href: string): boolean {
  return blogLinkKind(href) !== null;
}

/**
 * Whether `src` is an image uploaded to the public bucket's blog folder:
 * `<publicBase>/blog/…` on the same scheme, host and port, with no
 * credentials, query, fragment or `..` segment, and a `.png`, `.jpg`,
 * `.jpeg` or `.webp` name (TASK-MVDTW6KVN5BSA). A host that merely starts
 * with the bucket's host (`bucket.host.evil.com`) is another host.
 * Also the rule for cover images and author portraits.
 */
export function isAllowedBlogImageSrc(src: string, publicBase: string | undefined): boolean {
  if (!publicBase || src.length > BLOG_CONTENT_URL_MAX) return false;
  let url: URL;
  let base: URL;
  try {
    url = new URL(src);
    base = new URL(publicBase);
  } catch {
    return false;
  }
  const prefix = `${base.pathname.replace(/\/+$/, '')}/blog/`;
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    url.protocol === base.protocol &&
    url.hostname === base.hostname &&
    url.port === base.port &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    url.pathname.startsWith(prefix) &&
    url.pathname.length > prefix.length &&
    IMAGE_FILE.test(url.pathname) &&
    !url.pathname.split('/').includes('..')
  );
}

/** `[text](href)` read from one token of {@link BLOG_LINK_SPLIT}; null when the token is not a link. */
export function parseBlogLink(token: string): { text: string; href: string } | null {
  const m = token.match(LINK_TOKEN);
  return m ? { text: m[1] ?? '', href: m[2] ?? '' } : null;
}

/** An allowed link in `token`, or null: then the token is plain text. */
export function blogLink(token: string): { text: string; href: string; kind: BlogLinkKind } | null {
  const link = parseBlogLink(token);
  const kind = link ? blogLinkKind(link.href) : null;
  return link && kind ? { ...link, kind } : null;
}

/**
 * An allowed image on a trimmed `line`, or null: then the line is an ordinary
 * paragraph line. Alt text is required — an image without it is not an image.
 */
export function blogImage(line: string, publicBase: string | undefined): { alt: string; src: string } | null {
  const m = line.match(IMAGE_LINE);
  const alt = m?.[1]?.trim() ?? '';
  const src = m?.[2] ?? '';
  return alt && isAllowedBlogImageSrc(src, publicBase) ? { alt, src } : null;
}

/**
 * Text that can sit inside `[…]` or `![…]`: no brackets (they would end the
 * token) and no line break. Brackets become parentheses, runs of whitespace
 * one space.
 */
export function cleanBracketText(text: string): string {
  return text.replace(/\[/g, '(').replace(/\]/g, ')').replace(/\s+/g, ' ').trim();
}

/**
 * An address written into `(…)`: the characters the patterns stop at, and `*`
 * (which the bold split reads), percent-encoded — the browser decodes them
 * back, so the link goes where it went.
 */
export function encodeContentUrl(url: string): string {
  return url.replace(/[\s()*[\]]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

export type BlogContentRefusal = 'invalid_content_link' | 'invalid_content_image';

/**
 * The first reason `content` may not be saved, or null. Every image-shaped
 * line must be an allowed upload with alt text; every link-shaped token must
 * have an allowed address. Stricter than the renderer on purpose: a token the
 * renderer would show as text is refused rather than stored (LINK_ATTEMPT).
 */
export function blogContentRefusal(content: string, publicBase: string | undefined): BlogContentRefusal | null {
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (IMAGE_LINE.test(line)) {
      if (!blogImage(line, publicBase)) return 'invalid_content_image';
      continue;
    }
    for (const [, href = ''] of line.matchAll(LINK_ATTEMPT)) {
      if (href && !isAllowedLinkHref(href)) return 'invalid_content_link';
    }
  }
  return null;
}

import { blogContentRefusal, isAllowedBlogImageSrc } from '@/lib/blog-content-policy';

/**
 * The database-free half of src/lib/blog.ts (AKTAR-MURBCJ0A-1): types, the
 * refusal codes, validation, slug and date helpers. Split out so the admin
 * editor (a client component) can import them without pulling Prisma into the
 * browser bundle. src/lib/blog.ts re-exports all of it.
 */
import { z } from 'zod';
import { BLOG_READ_MINUTES } from './blog-read-time';

export { BLOG_READ_MINUTES };

export interface BlogAuthor {
  name: string;
  role: string;
  /** Optional: no stock photograph stands in for a missing portrait. */
  avatar?: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  /** Minutes to read; the pages format it per reader locale (blog.readMinutes). */
  readMinutes: number;
  publishedAt: Date;
  /** Absent when the post has no recorded author. Never a placeholder. */
  author?: BlogAuthor;
  image: string;
  featured: boolean;
}

/** What the admin editor submits. Free text; nothing here is trusted. */
export interface BlogPostInput {
  title: string;
  /** Empty or absent: derived from the title on create. Ignored on update. */
  slug?: string;
  excerpt: string;
  content: string;
  category: string;
  /** Whole minutes, {@link BLOG_READ_MINUTES}. */
  readMinutes: number;
  /** Empty: the post has no byline. */
  authorName?: string;
  authorRole?: string;
  authorAvatar?: string;
  image: string;
  featured?: boolean;
}

/**
 * Every refusal a write can return. The admin UI maps each code to a message
 * under `adminBlog.errors.<code>` in messages/tr.json and messages/en.json —
 * same spelling on both sides (tests/blog-validation.test.ts pins it).
 */
export const BLOG_WRITE_ERRORS = [
  'invalid_title',
  'invalid_slug',
  'invalid_excerpt',
  'invalid_content',
  'invalid_content_link',
  'invalid_content_image',
  'invalid_category',
  'invalid_read_time',
  'invalid_image',
  'invalid_author',
  'slug_taken',
  'not_found',
  'save_failed',
] as const;
export type BlogWriteError = (typeof BLOG_WRITE_ERRORS)[number];

export type BlogWriteResult = { ok: true; post: BlogPost } | { ok: false; error: BlogWriteError };
export type BlogDeleteResult = { ok: true } | { ok: false; error: 'not_found' | 'save_failed' };

/** Upper bounds, in characters. Lower bounds are in {@link validateBlogInput}. */
export const BLOG_LIMITS = {
  title: 200,
  slug: 120,
  excerpt: 500,
  content: 50_000,
  category: 60,
  authorName: 120,
  authorRole: 120,
  url: 2_000,
} as const;

/** Lower-case ASCII words joined by single hyphens: the URL segment itself. */
export const BLOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Hosts a cover image or an author avatar may come from — exactly the hosts in
 * `images.remotePatterns` in next.config.ts. `next/image` throws on any other
 * host, and the blog list, the post page and the landing page all render these
 * images, so one bad URL used to be a 500 on the public landing page
 * (TASK-MTQ63RR8Z0G8E). tests/blog-validation.test.ts keeps the two lists equal.
 */
export const BLOG_IMAGE_HOSTS = ['images.unsplash.com', 'lh3.googleusercontent.com'] as const;

/**
 * A URL slug from a title. Turkish letters are transliterated first — the old
 * `[^a-z0-9]+` replace turned "Çağrı Şartları" into "a-r-artlar".
 */
export function slugifyTitle(title: string): string {
  return title
    .toLocaleLowerCase('tr-TR')
    // ı has no decomposition; ç ş ğ ö ü â î û lose their marks under NFKD.
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BLOG_LIMITS.slug)
    .replace(/-+$/g, '');
}

/** Publication date as the blog shows it: "28 Ağustos 2026" / "28 August 2026". */
export function formatBlogDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function isAllowedImageUrl(value: string, publicImageBase?: string): boolean {
  if (value.length > BLOG_LIMITS.url) return false;
  if (isAllowedBlogImageSrc(value, publicImageBase)) return true;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    (BLOG_IMAGE_HOSTS as readonly string[]).includes(url.hostname)
  );
}

export const trimmedText = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
export const lengthWithin = (v: string, min: number, max: number) => v.length >= min && v.length <= max;

/**
 * The one-line byline shown wherever a post's author appears: "<Ünvan> <İsim>",
 * or just the name when there is no ünvan. Blank parts drop out, so no stray
 * space leads or trails the result.
 */
export function authorByline(author: Pick<BlogAuthor, 'name' | 'role'> | undefined): string {
  return [author?.role, author?.name]
    .map((part) => trimmedText(part).replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(' ');
}

const readMinutesSchema = z.number().int().min(BLOG_READ_MINUTES.min).max(BLOG_READ_MINUTES.max);

/** The columns a validated input writes. Author columns are null when cleared. */
type BlogColumns = {
  title: string;
  excerpt: string;
  content: string;
  category: string;
  readMinutes: number;
  image: string;
  featured: boolean;
  authorName: string | null;
  authorRole: string | null;
  authorAvatar: string | null;
};

/**
 * Server-side validation of a complete editor submission. Pure: no database.
 * Returns the trimmed column values, or the first refusal.
 *
 * `publicImageBase` is the public bucket's base URL when one is configured;
 * images uploaded there (`<base>/blog/…`) are accepted besides BLOG_IMAGE_HOSTS.
 * The caller passes it, so this file stays free of server-only env.
 */
export function validateBlogInput(
  input: BlogPostInput,
  publicImageBase?: string
): { ok: true; data: BlogColumns } | { ok: false; error: BlogWriteError } {
  const title = trimmedText(input.title);
  if (!lengthWithin(title, 3, BLOG_LIMITS.title)) return { ok: false, error: 'invalid_title' };
  const excerpt = trimmedText(input.excerpt);
  if (!lengthWithin(excerpt, 10, BLOG_LIMITS.excerpt)) return { ok: false, error: 'invalid_excerpt' };
  const content = trimmedText(input.content);
  if (!lengthWithin(content, 20, BLOG_LIMITS.content)) return { ok: false, error: 'invalid_content' };
  // Links and images in the body: the rules of src/lib/blog-content-policy.ts (TASK-MVDPHZQCTVJ2R).
  const contentRefusal = blogContentRefusal(content, publicImageBase);
  if (contentRefusal) return { ok: false, error: contentRefusal };
  const category = trimmedText(input.category);
  if (!lengthWithin(category, 1, BLOG_LIMITS.category)) return { ok: false, error: 'invalid_category' };
  const readMinutes = readMinutesSchema.safeParse(input.readMinutes);
  if (!readMinutes.success) return { ok: false, error: 'invalid_read_time' };
  const image = trimmedText(input.image);
  if (!isAllowedImageUrl(image, publicImageBase)) return { ok: false, error: 'invalid_image' };

  const authorName = trimmedText(input.authorName);
  const authorRole = trimmedText(input.authorRole);
  const authorAvatar = trimmedText(input.authorAvatar);
  if (authorName.length > BLOG_LIMITS.authorName || authorRole.length > BLOG_LIMITS.authorRole) {
    return { ok: false, error: 'invalid_author' };
  }
  // A role or portrait without a name would be a byline for nobody.
  if (!authorName && (authorRole || authorAvatar)) return { ok: false, error: 'invalid_author' };
  if (authorAvatar && !isAllowedImageUrl(authorAvatar, publicImageBase)) return { ok: false, error: 'invalid_image' };

  return {
    ok: true,
    data: {
      title,
      excerpt,
      content,
      category,
      readMinutes: readMinutes.data,
      image,
      featured: input.featured === true,
      authorName: authorName || null,
      authorRole: authorName ? authorRole || null : null,
      authorAvatar: authorName ? authorAvatar || null : null,
    },
  };
}

/**
 * Applies an update patch to the stored post's input. A patch that carries no
 * `authorName` leaves the recorded byline alone; one that carries it replaces
 * the byline — an empty name clears it (role and portrait with it) rather than
 * keeping the old one. Neither path invents a name. Pure.
 */
export function mergeBlogPatch(current: BlogPostInput, patch: Partial<BlogPostInput>): BlogPostInput {
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([k, v]) => v !== undefined && k !== 'slug')
  ) as Partial<BlogPostInput>;
  const merged: BlogPostInput = { ...current, ...defined };
  if (patch.authorName !== undefined) {
    merged.authorRole = patch.authorRole ?? '';
    merged.authorAvatar = patch.authorAvatar ?? '';
  }
  return merged;
}


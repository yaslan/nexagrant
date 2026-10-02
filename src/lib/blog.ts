/**
 * The public blog (/[locale]/blog, /[locale]/blog/<slug>, the landing
 * BlogSection) and the platform-admin editor behind /admin/blog.
 *
 * AKTAR-MURBCJ0A-1 — posts live in the `BlogPost` table. They used to live in a
 * module-level array that the admin actions mutated, so a post an admin
 * published was a 404 after the next restart and two server instances served
 * two different blogs. Reads go to the database on every request; writes are
 * validated here, written with their AuditEvent in one transaction, and only
 * ever reached through the /admin/blog actions behind requirePlatformAdmin().
 * The launch posts and the rules they were cleaned under (TASK-MTRNQHC3IV2BE no
 * invented byline, TASK-MTS6MRKDP168Q no unsourced figure) are in
 * src/lib/blog-seed.ts.
 *
 * Byline: `author` is optional and there is no default author string anywhere.
 * A post with no recorded author is shown unattributed.
 */
import type { BlogPost as BlogPostRow, Prisma } from '@prisma/client';
import { prisma } from './db';
import { errorCode } from './errors';
import { logger } from './logger';
import { withSystemScope, type SystemTx } from './system-scope';
import {
  BLOG_LIMITS,
  BLOG_WRITE_ERRORS,
  BLOG_SLUG_PATTERN,
  mergeBlogPatch,
  slugifyTitle,
  trimmedText,
  validateBlogInput,
  lengthWithin,
  type BlogDeleteResult,
  type BlogPost,
  type BlogPostInput,
  type BlogWriteError,
  type BlogWriteResult,
} from './blog-shared';

export * from './blog-shared';

function toBlogPost(row: BlogPostRow): BlogPost {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    category: row.category,
    readTime: row.readTime,
    publishedAt: row.publishedAt,
    ...(row.authorName
      ? {
          author: {
            name: row.authorName,
            role: row.authorRole ?? '',
            ...(row.authorAvatar ? { avatar: row.authorAvatar } : {}),
          },
        }
      : {}),
    image: row.image,
    featured: row.featured,
  };
}

/** The row back as editor input, so a partial update is validated as a whole. */
function toInput(row: BlogPostRow): BlogPostInput {
  return {
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    category: row.category,
    readTime: row.readTime,
    authorName: row.authorName ?? '',
    authorRole: row.authorRole ?? '',
    authorAvatar: row.authorAvatar ?? '',
    image: row.image,
    featured: row.featured,
  };
}

const ORDER: Prisma.BlogPostOrderByWithRelationInput[] = [{ publishedAt: 'desc' }, { createdAt: 'desc' }];

/** Every post, newest first. */
export async function getBlogPosts(): Promise<BlogPost[]> {
  const rows = await prisma.blogPost.findMany({ orderBy: ORDER });
  return rows.map(toBlogPost);
}

/** The newest `count` featured posts — the landing page's BlogSection. */
export async function getFeaturedBlogPosts(count: number = 3): Promise<BlogPost[]> {
  const rows = await prisma.blogPost.findMany({ where: { featured: true }, orderBy: ORDER, take: count });
  return rows.map(toBlogPost);
}

/** One post by its slug, or null (the page answers 404). */
export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  if (!BLOG_SLUG_PATTERN.test(slug) || slug.length > BLOG_LIMITS.slug) return null;
  const row = await prisma.blogPost.findUnique({ where: { slug } });
  return row ? toBlogPost(row) : null;
}

// ─── Writes: platform admin only, each with its AuditEvent ───
//
// The callers are the /admin/blog actions, which run requirePlatformAdmin()
// first. The write and its AuditEvent share one transaction. The AuditEvent row
// is tenant-less (tenantId NULL), which the strict tenant_isolation policy on
// AuditEvent admits only inside withSystemScope — so the transaction is opened
// there, once, for all four writes. BlogPost itself has no RLS (SYSTEM_WIDE).

function adminWrite<T>(context: string, callback: (tx: SystemTx) => Promise<T>): Promise<T> {
  return withSystemScope('platform-admin', `admin-blog.${context}`, callback);
}

/** Thrown inside a write transaction to roll it back with a refusal code. */
class BlogRefusal extends Error {
  constructor(readonly code: BlogWriteError) {
    super(code);
  }
}

/**
 * A caught value as a refusal code — never the value itself: the result goes
 * back to the browser (tests/api/api-error-body-guard.test.ts). Only a code
 * from the closed BLOG_WRITE_ERRORS list can come out; anything else is logged
 * here and answered as `save_failed`.
 */
function failure(context: string, slug: string, error: unknown): { ok: false; error: BlogWriteError } {
  const code = errorCode(error);
  if (code === 'P2002') return { ok: false, error: 'slug_taken' };
  if (code === 'P2025') return { ok: false, error: 'not_found' };
  const known = BLOG_WRITE_ERRORS.find((c) => c === code);
  if (error instanceof BlogRefusal && known) return { ok: false, error: known };
  logger.error(`blog ${context} failed`, error, { slug });
  return { ok: false, error: 'save_failed' };
}

export async function createBlogPost(input: BlogPostInput, actorId: string): Promise<BlogWriteResult> {
  const valid = validateBlogInput(input);
  if (!valid.ok) return valid;
  const slug = trimmedText(input.slug) || slugifyTitle(valid.data.title);
  if (!BLOG_SLUG_PATTERN.test(slug) || !lengthWithin(slug, 3, BLOG_LIMITS.slug)) {
    return { ok: false, error: 'invalid_slug' };
  }

  try {
    const row = await adminWrite('create', async (tx) => {
      const created = await tx.blogPost.create({
        data: { ...valid.data, slug, publishedAt: new Date(), createdById: actorId },
      });
      await tx.auditEvent.create({
        data: { actorId, type: 'blog.post.created', target: slug, data: { title: created.title } },
      });
      return created;
    });
    return { ok: true, post: toBlogPost(row) };
  } catch (error) {
    return failure('create', slug, error);
  }
}

export async function updateBlogPost(
  slug: string,
  patch: Partial<BlogPostInput>,
  actorId: string
): Promise<BlogWriteResult> {
  try {
    const row = await adminWrite('update', async (tx) => {
      const current = await tx.blogPost.findUnique({ where: { slug } });
      if (!current) throw new BlogRefusal('not_found');
      const valid = validateBlogInput(mergeBlogPatch(toInput(current), patch));
      if (!valid.ok) throw new BlogRefusal(valid.error);
      const updated = await tx.blogPost.update({ where: { slug }, data: valid.data });
      await tx.auditEvent.create({
        data: {
          actorId,
          type: 'blog.post.updated',
          target: slug,
          data: { fields: Object.keys(patch).filter((k) => k !== 'slug').sort() },
        },
      });
      return updated;
    });
    return { ok: true, post: toBlogPost(row) };
  } catch (error) {
    return failure('update', slug, error);
  }
}

export async function deleteBlogPost(slug: string, actorId: string): Promise<BlogDeleteResult> {
  try {
    await adminWrite('delete', async (tx) => {
      // `delete`, not `deleteMany`: it needs a unique where and raises P2025
      // when nothing matches, so no shape of `slug` can widen it to the table.
      await tx.blogPost.delete({ where: { slug } });
      await tx.auditEvent.create({ data: { actorId, type: 'blog.post.deleted', target: slug } });
    });
    return { ok: true };
  } catch (error) {
    const f = failure('delete', slug, error);
    return { ok: false, error: f.error === 'not_found' ? 'not_found' : 'save_failed' };
  }
}

export async function toggleFeaturedBlogPost(slug: string, actorId: string): Promise<BlogWriteResult> {
  try {
    const row = await adminWrite('toggle-featured', async (tx) => {
      const current = await tx.blogPost.findUnique({ where: { slug }, select: { featured: true } });
      if (!current) throw new BlogRefusal('not_found');
      const updated = await tx.blogPost.update({ where: { slug }, data: { featured: !current.featured } });
      await tx.auditEvent.create({
        data: { actorId, type: 'blog.post.featured', target: slug, data: { featured: updated.featured } },
      });
      return updated;
    });
    return { ok: true, post: toBlogPost(row) };
  } catch (error) {
    return failure('toggle', slug, error);
  }
}

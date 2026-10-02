'use server';

import {
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  toggleFeaturedBlogPost,
  type BlogDeleteResult,
  type BlogPostInput,
  type BlogWriteResult,
} from '@/lib/blog';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/tenant';

/**
 * Blog editor actions. Posts are published on the public site, so every action
 * is platform-admin only (TASK-MUMJ2ERCFP964): the admin layout 404s other
 * users, but a server action is its own HTTP entry point, so the role is
 * checked again here — same pattern as the feedback and alerts actions. A
 * caller who is not platform staff is refused by a throw, before any input is
 * read.
 *
 * AKTAR-MURBCJ0A-1 — each action now answers `{ ok: true, … }` only after the
 * row is in the database (src/lib/blog.ts) and `{ ok: false, error }` with a
 * code from BLOG_WRITE_ERRORS otherwise. They used to return `success: true`
 * unconditionally while writing to an in-memory array.
 *
 * TASK-MTRNQHC3IV2BE — no default byline: an empty author name is stored as no
 * author, and the public surfaces render no byline for it.
 */

/** Every surface that renders posts: the list, a post page, the landing BlogSection, the editor. */
function revalidateBlog(): void {
  revalidatePath('/[locale]/blog', 'page');
  revalidatePath('/[locale]/blog/[slug]', 'page');
  revalidatePath('/[locale]', 'page');
  revalidatePath('/[locale]/admin/blog', 'page');
}

/** Server actions take whatever the client posts; a slug must at least be a string. */
function slugArg(slug: unknown): string {
  return typeof slug === 'string' ? slug : '';
}

export async function createBlogPostAction(data: BlogPostInput): Promise<BlogWriteResult> {
  const { userId } = await requirePlatformAdmin();
  const result = await createBlogPost(data, userId);
  if (result.ok) revalidateBlog();
  return result;
}

export async function updateBlogPostAction(
  slug: string,
  data: Partial<BlogPostInput>
): Promise<BlogWriteResult> {
  const { userId } = await requirePlatformAdmin();
  const result = await updateBlogPost(slugArg(slug), data ?? {}, userId);
  if (result.ok) revalidateBlog();
  return result;
}

export async function deleteBlogPostAction(slug: string): Promise<BlogDeleteResult> {
  const { userId } = await requirePlatformAdmin();
  const result = await deleteBlogPost(slugArg(slug), userId);
  if (result.ok) revalidateBlog();
  return result;
}

export async function toggleFeaturedBlogPostAction(slug: string): Promise<BlogWriteResult> {
  const { userId } = await requirePlatformAdmin();
  const result = await toggleFeaturedBlogPost(slugArg(slug), userId);
  if (result.ok) revalidateBlog();
  return result;
}

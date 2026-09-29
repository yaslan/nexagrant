'use server';

import { createBlogPost, updateBlogPost, deleteBlogPost, toggleFeaturedBlogPost, BlogPost } from '@/lib/blog';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/tenant';

/**
 * Blog editor actions. Posts are published on the public site, so every action
 * is platform-admin only (TASK-MUMJ2ERCFP964): the admin layout 404s other
 * users, but a server action is its own HTTP entry point, so the role is
 * checked again here — same pattern as the feedback and alerts actions.
 */

export async function createBlogPostAction(data: {
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
  category: string;
  readTime: string;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  image: string;
  featured?: boolean;
}) {
  await requirePlatformAdmin();
  const newPost: BlogPost = {
    title: data.title,
    slug: data.slug || '',
    excerpt: data.excerpt,
    content: data.content,
    category: data.category || 'Horizon Europe',
    readTime: data.readTime || '5 min read',
    publishedAt: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
    // TASK-MTRNQHC3IV2BE — no default byline. An empty author field used to be
    // filled with "FonBridge Editörü / AB Uzmanı" and a stock portrait, so the
    // post went out signed by a person and a job title nobody entered. A post
    // submitted without an author is now stored without one, and the three
    // public surfaces render no byline for it (src/lib/blog.ts).
    ...(data.authorName?.trim()
      ? {
          author: {
            name: data.authorName.trim(),
            role: data.authorRole?.trim() || '',
            ...(data.authorAvatar?.trim() ? { avatar: data.authorAvatar.trim() } : {}),
          },
        }
      : {}),
    image: data.image || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
    featured: data.featured ?? true,
  };

  const created = createBlogPost(newPost);
  revalidatePath('/[locale]/blog', 'layout');
  revalidatePath('/[locale]/admin/blog', 'page');
  return { success: true, post: created };
}

export async function updateBlogPostAction(
  slug: string,
  data: Partial<{
    title: string;
    excerpt: string;
    content: string;
    category: string;
    readTime: string;
    authorName: string;
    authorRole: string;
    image: string;
    featured: boolean;
  }>
) {
  await requirePlatformAdmin();
  const updated = updateBlogPost(slug, {
    title: data.title,
    excerpt: data.excerpt,
    content: data.content,
    category: data.category,
    readTime: data.readTime,
    image: data.image,
    featured: data.featured,
    // Same rule on edit: a byline the editor cleared is cleared, not refilled.
    author: data.authorName?.trim()
      ? { name: data.authorName.trim(), role: data.authorRole?.trim() || '' }
      : undefined,
  });

  revalidatePath('/[locale]/blog', 'layout');
  revalidatePath('/[locale]/admin/blog', 'page');
  return { success: true, post: updated };
}

export async function deleteBlogPostAction(slug: string) {
  await requirePlatformAdmin();
  const success = deleteBlogPost(slug);
  revalidatePath('/[locale]/blog', 'layout');
  revalidatePath('/[locale]/admin/blog', 'page');
  return { success };
}

export async function toggleFeaturedBlogPostAction(slug: string) {
  await requirePlatformAdmin();
  const updated = toggleFeaturedBlogPost(slug);
  revalidatePath('/[locale]/blog', 'layout');
  revalidatePath('/[locale]/admin/blog', 'page');
  return { success: true, post: updated };
}

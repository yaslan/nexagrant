'use server';

import { createBlogPost, updateBlogPost, deleteBlogPost, toggleFeaturedBlogPost, BlogPost } from '@/lib/blog';
import { revalidatePath } from 'next/cache';

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
  const newPost: BlogPost = {
    title: data.title,
    slug: data.slug || '',
    excerpt: data.excerpt,
    content: data.content,
    category: data.category || 'Horizon Europe',
    readTime: data.readTime || '5 min read',
    publishedAt: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
    author: {
      name: data.authorName || 'FonBridge Editörü',
      role: data.authorRole || 'AB Uzmanı',
      avatar: data.authorAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
    },
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
  const updated = updateBlogPost(slug, {
    title: data.title,
    excerpt: data.excerpt,
    content: data.content,
    category: data.category,
    readTime: data.readTime,
    image: data.image,
    featured: data.featured,
    author: data.authorName ? { name: data.authorName, role: data.authorRole || 'AB Uzmanı', avatar: '' } : undefined,
  });

  revalidatePath('/[locale]/blog', 'layout');
  revalidatePath('/[locale]/admin/blog', 'page');
  return { success: true, post: updated };
}

export async function deleteBlogPostAction(slug: string) {
  const success = deleteBlogPost(slug);
  revalidatePath('/[locale]/blog', 'layout');
  revalidatePath('/[locale]/admin/blog', 'page');
  return { success };
}

export async function toggleFeaturedBlogPostAction(slug: string) {
  const updated = toggleFeaturedBlogPost(slug);
  revalidatePath('/[locale]/blog', 'layout');
  revalidatePath('/[locale]/admin/blog', 'page');
  return { success: true, post: updated };
}

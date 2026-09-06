import React from 'react';
import { getBlogPosts } from '@/lib/blog';
import AdminBlogClient from './client';

export default async function AdminBlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const initialPosts = getBlogPosts();

  return <AdminBlogClient initialPosts={initialPosts} locale={locale} />;
}

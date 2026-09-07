import React from 'react';
import { getBlogPosts } from '@/lib/blog';
import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { displayUserName } from '@/lib/user-display';
import AdminBlogClient from './client';

export default async function AdminBlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const initialPosts = getBlogPosts();

  // TASK-MTRNQHC3IV2BE — the "new post" form opened pre-filled with
  // `authorName: 'Dr. Mehmet Yılmaz'`, `authorRole: 'AB Proje Başdanışmanı'` and
  // a stock portrait, so a post published without touching those fields was
  // signed by somebody who does not exist. The default is now the identity of
  // whoever is signed in, derived by the same rule as the app frame; when the
  // session carries no name the field starts empty rather than borrowed.
  const session = await auth();
  const t = await getTranslations({ locale, namespace: 'UserIdentity' });
  const sessionUserName = session?.user
    ? displayUserName(session.user.name, session.user.email, t('unnamedUser'))
    : '';

  return (
    <AdminBlogClient
      initialPosts={initialPosts}
      locale={locale}
      sessionUserName={sessionUserName}
    />
  );
}

import React from 'react';
import { getBlogPosts, type BlogPost } from '@/lib/blog';
import { errorMessage } from '@/lib/errors';
import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { displayUserName } from '@/lib/user-display';
import { publicAssetStore } from '@/lib/storage';
import AdminBlogClient from './client';

export default async function AdminBlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // A failed read is shown as a failed read, not as an empty blog the admin
  // might then "fill" with duplicates (AKTAR-MURBCJ0A-1).
  let initialPosts: BlogPost[] = [];
  let loadError = false;
  try {
    initialPosts = await getBlogPosts();
  } catch (e) {
    console.error(`[AdminBlogPage] DB query failed: ${errorMessage(e)}`);
    loadError = true;
  }

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
      loadError={loadError}
      publicImageBase={publicAssetStore()?.baseUrl}
    />
  );
}

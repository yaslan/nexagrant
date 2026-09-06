import React, { Suspense } from 'react';
import PublicNavbar from '@/components/PublicNavbar';
import PublicFooter from '@/components/PublicFooter';
import AuthCard from './AuthCard';

export default async function LoginPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-accent selection:text-white">
      <PublicNavbar locale={locale} />

      <main className="flex-1 flex items-start justify-center px-4 pt-2 pb-12 sm:pt-4 sm:pb-16">
        <Suspense fallback={<div className="text-center py-12 text-xs text-muted">Yükleniyor...</div>}>
          <AuthCard locale={locale} defaultMode="login" />
        </Suspense>
      </main>

      <PublicFooter locale={locale} />
    </div>
  );
}

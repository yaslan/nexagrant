import React, { Suspense } from 'react';
import { connection } from 'next/server';
import { configuredOAuthProviders, isDemoLoginEnabled } from '@/lib/demo-login';
import AuthCard from '../login/AuthCard';

export default async function RegisterPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Read per request, not baked in at build: which sign-in methods exist is a
  // property of the environment the server runs in (TASK-MULSCEK4JHK8X).
  await connection();
  const demoLoginEnabled = isDemoLoginEnabled();
  const oauthProviders = configuredOAuthProviders();

  return (
    <div className="flex-1 flex flex-col bg-background selection:bg-accent selection:text-white">
      <main className="flex-1 flex items-start justify-center px-edge sm:px-4 pt-2 pb-12 sm:pt-4 sm:pb-16">
        <Suspense fallback={<div className="text-center py-12 text-xs text-muted">Yükleniyor...</div>}>
          <AuthCard
            locale={locale}
            defaultMode="register"
            demoLoginEnabled={demoLoginEnabled}
            oauthProviders={oauthProviders}
          />
        </Suspense>
      </main>
    </div>
  );
}

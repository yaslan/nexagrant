import React from 'react';
import { getDeletionStatus } from '@/actions/user/request-deletion';
import PrivacySettingsClient from './client';

/**
 * KVKK/GDPR data subject console: export your data, request erasure,
 * cancel a pending erasure during the grace period.
 */
export default async function PrivacySettingsPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const status = await getDeletionStatus();

  return (
    <PrivacySettingsClient
      locale={locale}
      workspace={workspace}
      initialStatus={status}
    />
  );
}

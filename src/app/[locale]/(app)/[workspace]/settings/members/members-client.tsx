'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { errorMessage } from '@/lib/errors';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';
import TeamList from './team-list';

export default function MembersSettingsClient() {
  const params = useParams();
  const locale = (params?.locale as string) || 'tr';
  const isTr = locale === 'tr';
  const t = useTranslations('settings.members.page');

  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const errorText = useActionErrorText();

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setMessageIsError(false);

    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role })
      });
      const data = await res.json();
      if (!res.ok) {
        // `code` carries a 403 PILOT_EXPIRED through to `errorText` below (İNCELEME-24 B-2):
        // the body's `error` is a Turkish sentence, shown as is in every locale before.
        throw Object.assign(new Error(data.error || t('sendFailed')), {
          code: data.code,
        });
      }
      // `reason` (POST /api/invitations): recently_sent = this address was
      // mailed less than 10 minutes ago, so no mail went out and no link comes
      // back — the token was kept and the link in that mail still works;
      // daily_limit = the tenant's daily invitation email limit is used up, and
      // the link below is the one to pass on by hand; role_change_blocked =
      // recently_sent with another role, which the mailed link keeps.
      const notSent =
        data.reason === 'daily_limit' ? t('dailyLimitNotSent') : t('notSent');
      setMessage(
        data.reason === 'role_change_blocked'
          ? t('roleChangeBlocked')
          : data.reason === 'recently_sent'
          ? t('recentlySent')
          : data.emailSent
            ? t('emailSentWithLink', { link: data.inviteLink })
            : t('notSentWithLink', { notSent, link: data.inviteLink })
      );
      // Nothing was changed, so it is not shown as a success.
      setMessageIsError(data.reason === 'role_change_blocked');
      setEmail('');
      // The invitation holds a seat now: re-read the list from the server.
      setListVersion((v) => v + 1);
    } catch (error) {
      setMessage(errorText(error, () => t('errorPrefixed', { message: errorMessage(error) })));
      setMessageIsError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-3xl font-bold font-heading mb-6 text-ink">
        {t('title')}
      </h1>

      <div className="bg-surface border border-border rounded-2xl p-6 mb-8 shadow-2xs">
        <h2 className="text-xl font-semibold mb-4 text-ink">
          {t('inviteHeading')}
        </h2>
        <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-semibold text-muted mb-1">
              {t('emailLabel')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-ground border border-border rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder={t('emailPlaceholder')}
              required
            />
          </div>
          <div className="w-full md:w-56">
            <label className="block text-xs font-semibold text-muted mb-1">
              {t('roleLabel')}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-ground border border-border rounded-xl px-3 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
            >
              <option value="MEMBER">{t('roleMember')}</option>
              <option value="WRITER">{t('roleWriter')}</option>
              <option value="PIPELINE_MANAGER">{t('rolePipelineManager')}</option>
              <option value="TENANT_ADMIN">{t('roleTenantAdmin')}</option>
              <option value="TENANT_OWNER">{t('roleTenantOwner')}</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full md:w-auto bg-accent hover:opacity-90 text-white px-6 py-2 rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-50 cursor-pointer shrink-0"
          >
            {loading ? t('sending') : t('submit')}
          </button>
        </form>
        {message && (
          <div
            role={messageIsError ? 'alert' : 'status'}
            className={`mt-4 p-3 rounded-xl text-xs font-medium break-all ${messageIsError ? 'bg-bad/15 text-bad border border-bad/30' : 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'}`}
          >
            {message}
          </div>
        )}
      </div>

      <TeamList isTr={isTr} refreshKey={listVersion} />
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { errorMessage } from '@/lib/errors';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';
import TeamList from './team-list';

export default function MembersSettingsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'tr';
  const isTr = locale === 'tr';

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
        throw Object.assign(new Error(data.error || (isTr ? 'Davet gönderilemedi' : 'Failed to send invite')), {
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
        data.reason === 'daily_limit'
          ? isTr
            ? 'Kurumunuzun günlük davet e-postası sınırına ulaşıldı; e-posta gönderilmedi. Bağlantıyı elle iletin'
            : "Your organisation's daily invitation email limit is reached, so no email was sent. Share this link yourself"
          : isTr
            ? 'Davet oluşturuldu ancak e-posta gönderilemedi; bağlantıyı elle iletin'
            : 'Invitation created but the email could not be sent; share this link yourself';
      setMessage(
        data.reason === 'role_change_blocked'
          ? isTr
            ? 'Davet az önce gönderildi; rolü değiştirmek için 10 dakika sonra yeniden davet edin'
            : 'The invitation was sent a moment ago; to change the role, invite again in 10 minutes'
          : data.reason === 'recently_sent'
          ? isTr
            ? 'Davet e-postası az önce gönderildi; davetli e-postadaki bağlantıyı kullanabilir'
            : 'The invitation email was sent a moment ago; the invitee can use the link in that email'
          : data.emailSent
            ? isTr
              ? `Davet e-postası gönderildi. Bağlantı: ${data.inviteLink}`
              : `Invitation email sent. Link: ${data.inviteLink}`
            : `${notSent}: ${data.inviteLink}`
      );
      // Nothing was changed, so it is not shown as a success.
      setMessageIsError(data.reason === 'role_change_blocked');
      setEmail('');
      // The invitation holds a seat now: re-read the list from the server.
      setListVersion((v) => v + 1);
    } catch (error) {
      setMessage(errorText(error, () => `${isTr ? 'Hata' : 'Error'}: ${errorMessage(error)}`));
      setMessageIsError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-3xl font-bold font-heading mb-6 text-ink">
        {isTr ? 'Ekip Üyeleri & Yetkilendirme' : 'Team Members'}
      </h1>
      
      <div className="bg-surface border border-border rounded-2xl p-6 mb-8 shadow-2xs">
        <h2 className="text-xl font-semibold mb-4 text-ink">
          {isTr ? 'Yeni Üye Davet Et' : 'Invite new member'}
        </h2>
        <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-semibold text-muted mb-1">
              {isTr ? 'E-posta Adresi' : 'Email Address'}
            </label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-ground border border-border rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder={isTr ? "meslektas@kurum.com" : "colleague@example.com"}
              required 
            />
          </div>
          <div className="w-full md:w-56">
            <label className="block text-xs font-semibold text-muted mb-1">
              {isTr ? 'Kullanıcı Rolü & Yetkisi' : 'Role'}
            </label>
            <select 
              value={role} 
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-ground border border-border rounded-xl px-3 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
            >
              <option value="MEMBER">{isTr ? 'Üye (Okuma & Katkı)' : 'Member'}</option>
              <option value="WRITER">{isTr ? 'Teklif Yazarı (Writer)' : 'Writer'}</option>
              <option value="PIPELINE_MANAGER">{isTr ? 'Pipeline Yöneticisi' : 'Pipeline Manager'}</option>
              <option value="TENANT_ADMIN">{isTr ? 'Kurum Yöneticisi (Admin)' : 'Tenant Admin'}</option>
              <option value="TENANT_OWNER">{isTr ? 'Kurum Sahibi (Owner)' : 'Tenant Owner'}</option>
            </select>
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full md:w-auto bg-accent hover:opacity-90 text-white px-6 py-2 rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-50 cursor-pointer shrink-0"
          >
            {loading ? (isTr ? 'Gönderiliyor...' : 'Sending...') : (isTr ? 'Davet Gönder' : 'Send Invite')}
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

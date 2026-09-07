'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { errorMessage } from '@/lib/errors';

export default function MembersSettingsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'tr';
  const isTr = locale === 'tr';

  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isTr ? 'Davet gönderilemedi' : 'Failed to send invite'));
      }
      setMessage(isTr ? `Davet bağlantısı oluşturuldu! Link: ${data.inviteLink}` : `Invitation sent successfully! Link: ${data.inviteLink}`);
      setEmail('');
    } catch (error) {
      setMessage(`${isTr ? 'Hata' : 'Error'}: ${errorMessage(error)}`);
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
          <div className={`mt-4 p-3 rounded-xl text-xs font-medium ${message.startsWith('Hata') || message.startsWith('Error') ? 'bg-bad/15 text-bad border border-bad/30' : 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'}`}>
            {message}
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xs">
        <h2 className="text-xl font-semibold mb-4 text-ink">
          {isTr ? 'Aktif Ekip Üyeleri' : 'Active Members'}
        </h2>
        <p className="text-muted text-xs italic">
          {isTr ? 'Aktif kullanıcı ve yetkili ekip üyesi listesi bu bölümde görüntülenecektir.' : 'List of members will be displayed here...'}
        </p>
      </div>
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';

/**
 * Members and pending invitations of the tenant, with "Çıkar" / "İptal"
 * (TASK-MUPUHBAE811KP, Y-3). Everything shown comes from `GET /api/team`; a
 * success or an error message appears only after the server has answered, and
 * the list is re-read from the server afterwards instead of being patched
 * locally. The server refuses with a `code`, which is worded here per locale.
 */

interface Member {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
  joinedAt: string;
}
interface PendingInvite {
  id: string;
  email: string;
  role: string;
  sentAt: string;
  expiresAt: string;
}
interface Team {
  me: { userId: string; role: string };
  members: Member[];
  invitations: PendingInvite[];
}
type Target = { kind: 'member' | 'invitation'; id: string; label: string };

const ROLE_LABELS: Record<string, [string, string]> = {
  TENANT_OWNER: ['Kurum Sahibi', 'Owner'],
  TENANT_ADMIN: ['Kurum Yöneticisi', 'Admin'],
  PIPELINE_MANAGER: ['Pipeline Yöneticisi', 'Pipeline Manager'],
  WRITER: ['Teklif Yazarı', 'Writer'],
  MEMBER: ['Üye', 'Member'],
  GUEST_PARTNER: ['Konuk Ortak', 'Guest Partner'],
};

const ERROR_TEXT: Record<string, [string, string]> = {
  FORBIDDEN_ROLE: ['Bu işlem için yetkiniz yok.', 'You do not have permission for this.'],
  CANNOT_REMOVE_SELF: ['Kendinizi ekipten çıkaramazsınız.', 'You cannot remove yourself.'],
  CANNOT_REMOVE_OWNER: [
    'Kurum sahibini yalnızca başka bir kurum sahibi çıkarabilir.',
    'Only another owner can remove an owner.',
  ],
  LAST_OWNER: ['Kurumun son sahibi çıkarılamaz.', 'The last owner cannot be removed.'],
  NOT_FOUND: ['Kayıt bulunamadı; liste yenilendi.', 'Not found; the list was refreshed.'],
};

export default function TeamList({ isTr, refreshKey }: { isTr: boolean; refreshKey: number }) {
  const errorText = useActionErrorText();
  const t = useTranslations('settings.members.teamList');
  const [team, setTeam] = useState<Team | null>(null);
  const [loadError, setLoadError] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const tx = (pair: [string, string]) => (isTr ? pair[0] : pair[1]);
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(isTr ? 'tr-TR' : 'en-GB');
  const roleLabel = (role: string) => (ROLE_LABELS[role] ? tx(ROLE_LABELS[role]) : role);
  const codeText = (code: unknown): string =>
    typeof code === 'string' && ERROR_TEXT[code]
      ? tx(ERROR_TEXT[code])
      : isTr
        ? 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'
        : 'The action could not be completed. Please try again.';

  // Bumped after a change, so the list is re-read from the server.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      let next: { team: Team | null; error: string };
      try {
        const res = await fetch('/api/team', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (res.ok) next = { team: data as Team, error: '' };
        else
          next = {
            team: null,
            error:
              res.status === 401
                ? t('errors.sessionOrMembership')
                : data?.code === 'FORBIDDEN_ROLE'
                  ? t('errors.forbiddenRole')
                  : t('errors.loadFailed'),
          };
      } catch {
        next = { team: null, error: t('errors.loadFailed') };
      }
      if (!live) return;
      setTeam(next.team);
      setLoadError(next.error);
    })();
    return () => {
      live = false;
    };
  }, [t, refreshKey, reloads]);

  const closeDialog = useCallback(() => {
    setTarget(null);
    openerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!target) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) closeDialog();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [target, busy, closeDialog]);

  function ask(e: React.MouseEvent<HTMLElement>, t: Target) {
    openerRef.current = e.currentTarget;
    setNotice(null);
    setTarget(t);
  }

  async function confirm() {
    if (!target) return;
    setBusy(true);
    try {
      const path = target.kind === 'member' ? `/api/team/members/${target.id}` : `/api/team/invitations/${target.id}`;
      const res = await fetch(path, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({
          text: errorText(Object.assign(new Error(data?.error ?? ''), { code: data?.code }), () => codeText(data?.code)),
          error: true,
        });
      } else {
        setNotice({
          text:
            target.kind === 'member'
              ? isTr
                ? 'Üye ekipten çıkarıldı; koltuğu boşaldı.'
                : 'Member removed; the seat is free again.'
              : isTr
                ? 'Davet iptal edildi; koltuğu boşaldı.'
                : 'Invitation cancelled; the seat is free again.',
          error: false,
        });
      }
      setReloads((n) => n + 1);
    } catch {
      setNotice({ text: codeText(null), error: true });
    } finally {
      setBusy(false);
      closeDialog();
    }
  }

  const btn =
    'min-h-11 md:min-h-0 text-xs font-semibold border border-border px-3 py-2 rounded-lg text-bad hover:bg-bad/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition cursor-pointer shrink-0';

  return (
    <>
      {notice && (
        <div
          role={notice.error ? 'alert' : 'status'}
          className={`mb-4 p-3 rounded-xl text-xs font-medium ${notice.error ? 'bg-bad/15 text-bad border border-bad/30' : 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'}`}
        >
          {notice.text}
        </div>
      )}

      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 mb-8 shadow-2xs">
        <h2 className="text-xl font-semibold mb-4 text-ink">{isTr ? 'Aktif Ekip Üyeleri' : 'Active Members'}</h2>
        {loadError ? (
          <p role="alert" className="text-bad text-xs">{loadError}</p>
        ) : !team ? (
          <p className="text-muted text-xs" role="status">{isTr ? 'Yükleniyor…' : 'Loading…'}</p>
        ) : (
          <ul className="divide-y divide-border" aria-label={isTr ? 'Aktif ekip üyeleri' : 'Active members'}>
            {team.members.map((m) => {
              const isMe = m.userId === team.me.userId;
              const canRemove = !isMe && (m.role !== 'TENANT_OWNER' || team.me.role === 'TENANT_OWNER');
              const label = m.name || m.email;
              return (
                <li key={m.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink break-words">
                      {m.name || m.email}
                      {isMe && <span className="ml-2 text-xs font-medium text-muted">({isTr ? 'siz' : 'you'})</span>}
                    </p>
                    {m.name && <p className="text-xs text-muted break-all">{m.email}</p>}
                    <p className="text-xs text-ink-2 mt-1">
                      {roleLabel(m.role)} · {isTr ? 'Katılım' : 'Joined'}: {fmt(m.joinedAt)}
                    </p>
                  </div>
                  {canRemove && (
                    <button
                      type="button"
                      className={btn}
                      onClick={(e) => ask(e, { kind: 'member', id: m.id, label })}
                      aria-label={isTr ? `${label} üyesini çıkar` : `Remove ${label}`}
                    >
                      {isTr ? 'Çıkar' : 'Remove'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {team && (
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-2xs">
          <h2 className="text-xl font-semibold mb-1 text-ink">{isTr ? 'Bekleyen Davetler' : 'Pending Invitations'}</h2>
          <p className="text-xs text-muted mb-4">
            {isTr ? 'Bekleyen her davet bir koltuk tutar.' : 'Each pending invitation holds one seat.'}
          </p>
          {team.invitations.length === 0 ? (
            <p className="text-muted text-xs">{isTr ? 'Bekleyen davet yok.' : 'No pending invitations.'}</p>
          ) : (
            <ul className="divide-y divide-border" aria-label={isTr ? 'Bekleyen davetler' : 'Pending invitations'}>
              {team.invitations.map((i) => (
                <li key={i.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink break-all">{i.email}</p>
                    <p className="text-xs text-ink-2 mt-1">
                      {roleLabel(i.role)} · {isTr ? 'Gönderim' : 'Sent'}: {fmt(i.sentAt)} · {isTr ? 'Son tarih' : 'Expires'}: {fmt(i.expiresAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={btn}
                    onClick={(e) => ask(e, { kind: 'invitation', id: i.id, label: i.email })}
                    aria-label={isTr ? `${i.email} davetini iptal et` : `Cancel invitation for ${i.email}`}
                  >
                    {isTr ? 'İptal' : 'Cancel'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {target && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="presentation">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="team-confirm-title"
            aria-describedby="team-confirm-body"
            className="bg-surface border border-border rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl"
          >
            <h3 id="team-confirm-title" className="text-lg font-bold text-ink">
              {target.kind === 'member'
                ? isTr ? 'Üyeyi ekipten çıkar?' : 'Remove this member?'
                : isTr ? 'Daveti iptal et?' : 'Cancel this invitation?'}
            </h3>
            <p id="team-confirm-body" className="text-sm text-ink-2 break-words">
              {target.kind === 'member'
                ? isTr
                  ? `${target.label} bu kuruma erişimini hemen kaybeder. Koltuğu boşalır.`
                  : `${target.label} loses access to this organisation at once. The seat becomes free.`
                : isTr
                  ? `${target.label} adresine giden davet bağlantısı çalışmaz olur. Koltuğu boşalır.`
                  : `The invitation link sent to ${target.label} stops working. The seat becomes free.`}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                ref={cancelRef}
                type="button"
                onClick={closeDialog}
                disabled={busy}
                className="min-h-11 md:min-h-0 text-xs font-semibold border border-border px-4 py-2 rounded-lg text-ink-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {isTr ? 'Vazgeç' : 'Keep'}
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="min-h-11 md:min-h-0 text-xs font-semibold bg-red-700 text-white px-4 py-2 rounded-lg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                {busy
                  ? isTr ? 'İşleniyor…' : 'Working…'
                  : target.kind === 'member'
                    ? isTr ? 'Evet, çıkar' : 'Yes, remove'
                    : isTr ? 'Evet, iptal et' : 'Yes, cancel it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

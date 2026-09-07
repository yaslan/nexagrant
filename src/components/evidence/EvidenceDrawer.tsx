'use client';

import React, { useState, useEffect } from 'react';
import { getEvidenceItemsAction } from '@/app/[locale]/(app)/[workspace]/evidence/actions';
import { useTranslations } from 'next-intl';
import { Sparkles, Check, Copy, FileText, Search, ShieldCheck } from 'lucide-react';
import type { EvidenceItemData } from '@/app/[locale]/(app)/[workspace]/evidence/evidence-client';

/**
 * This drawer used to ship three hard-coded "evidence" items and render them whenever
 * the tenant had none — a certificate with an invented number, a claimed 15% grid-loss
 * reduction across three EU pilot sites, and a "verified" SME status under EC
 * Recommendation 2003/361/EC. Each carried an "Insert Claim" button that dropped the
 * sentence straight into a concept note. None of it was backed by an Evidence row
 * (CLAUDE.md §7), and the failure path fell back to it as well, so a database error
 * looked like a stocked evidence pack.
 *
 * A tenant with no evidence now sees that it has no evidence.
 */

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (body: string) => void;
};

export function EvidenceDrawer({ isOpen, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItemData[]>([]);
  // One value rather than a loading flag plus an error flag: the empty state has to
  // tell "still loading" and "the load failed" apart from "you have no evidence",
  // and only the last of those may be shown as a fact.
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const t = useTranslations('Evidence');

  useEffect(() => {
    if (!isOpen) return;

    // A drawer reopened while an earlier fetch is still in flight must not be
    // overwritten by that stale answer.
    let cancelled = false;

    getEvidenceItemsAction()
      .then((items) => {
        if (cancelled) return;
        setEvidenceItems(items ?? []);
        setStatus('loaded');
      })
      .catch(() => {
        if (cancelled) return;
        // An empty list, and the user is told it is a failure rather than an
        // accurate "you have no evidence".
        setEvidenceItems([]);
        setStatus('failed');
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = evidenceItems.filter(e => 
    e.title.toLowerCase().includes(search.toLowerCase()) || 
    (e.body && e.body.toLowerCase().includes(search.toLowerCase())) ||
    (e.tags && e.tags.some((tag: string) => tag.toLowerCase().includes(search.toLowerCase())))
  );

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-96 max-w-full bg-surface border-l border-border shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
        
        <div className="p-4 border-b border-border flex justify-between items-center bg-ground/80">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold font-heading text-ink">Evidence Pack Drawer</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-lg font-bold p-1">✕</button>
        </div>

        <div className="p-3.5 border-b border-border bg-surface">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search evidence or claims..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-ground border border-border rounded-xl text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted" />
          </div>
          <p className="text-[10px] text-muted mt-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-accent" />
            <span>Single-click insertion into proposal sections</span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted text-xs">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              {status === 'failed' ? (
                <p>{t('drawer.loadFailed')}</p>
              ) : status === 'loading' ? (
                <p>{t('drawer.loading')}</p>
              ) : evidenceItems.length === 0 ? (
                <p>{t('drawer.empty')}</p>
              ) : (
                <p>{t('drawer.noMatch')}</p>
              )}
            </div>
          ) : filtered.map(e => (
            <div key={e.id} className="border border-border rounded-2xl p-3.5 hover:border-accent transition group relative bg-surface shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono font-bold bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.5 rounded">
                  {e.category || e.kind || 'CAT-03'}
                </span>
                {e.validUntil && (
                  <span className="text-[9px] font-mono text-muted">
                    Exp: {new Date(e.validUntil).toISOString().split('T')[0]}
                  </span>
                )}
              </div>

              <h3 className="font-bold text-ink text-xs leading-snug">{e.title}</h3>
              <p className="text-[11px] text-ink-2 line-clamp-3 bg-ground/50 p-2 rounded-xl border border-border/60">{e.body}</p>
              
              <div className="flex items-center gap-2 pt-1">
                {onSelect && (
                  <button 
                    type="button"
                    onClick={() => onSelect(e.body ?? '')}
                    className="text-xs bg-accent text-white px-3 py-1 rounded-lg font-bold hover:opacity-90 transition cursor-pointer"
                  >
                    Insert Claim
                  </button>
                )}
                <button 
                  type="button"
                  onClick={() => handleCopy(e.id, e.body ?? '')}
                  className="text-xs bg-ground text-ink-2 border border-border px-2.5 py-1 rounded-lg font-medium hover:bg-surface-hover hover:text-ink transition flex items-center gap-1 cursor-pointer"
                >
                  {copiedId === e.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedId === e.id ? 'Copied' : 'Copy Citation'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { getEvidenceItemsAction } from '@/app/[locale]/(app)/[workspace]/evidence/actions';
import { Sparkles, Check, Copy, FileText, Search, ShieldCheck } from 'lucide-react';
import type { EvidenceItemData } from '@/app/[locale]/(app)/[workspace]/evidence/evidence-client';

const FALLBACK_EVIDENCE: EvidenceItemData[] = [
  { id: '1', category: 'CAT-05', kind: 'performance', title: 'H2020 SmartGrid Results', body: 'The organization successfully achieved a 15% reduction in grid loss across 3 European pilot sites [Evidence ID: EV-H2020].', tags: ['energy', 'grid', 'h2020'], validUntil: '2027-12-31' },
  { id: '2', category: 'CAT-03', kind: 'certificate', title: 'ISO 27001 BGYS Sertifikası', body: 'Information Security Management System ISO/IEC 27001:2022 certified by BSI Audit [Sertifika No: ISO-27001-2025-9921].', tags: ['security', 'iso27001', 'bgys'], validUntil: '2028-01-15' },
  { id: '3', category: 'CAT-01', kind: 'corporate', title: 'KOBİ Beyannamesi (SME Declaration)', body: 'Verified SME Status under European Commission Recommendation 2003/361/EC with < 250 FTE staff.', tags: ['sme', 'kobi', 'ec-verified'], validUntil: '2026-12-31' },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (body: string) => void;
};

export function EvidenceDrawer({ isOpen, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItemData[]>(FALLBACK_EVIDENCE);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      getEvidenceItemsAction().then((items) => {
        if (items && items.length > 0) {
          setEvidenceItems(items);
        }
      }).catch(() => {
        setEvidenceItems(FALLBACK_EVIDENCE);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = evidenceItems.filter(e => 
    e.title.toLowerCase().includes(search.toLowerCase()) || 
    (e.body && e.body.toLowerCase().includes(search.toLowerCase())) ||
    (e.tags && e.tags.some((t: string) => t.toLowerCase().includes(search.toLowerCase())))
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
              <p>No matching evidence found.</p>
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

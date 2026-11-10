'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { EvidenceItemData } from './evidence-client';

type EvidenceKind = 'stat' | 'prior_result' | 'trl' | 'letter' | 'reference' | 'publication' | 'certificate';

type Props = {
  onSave: (evidence: EvidenceItemData) => void;
  onCancel: () => void;
};

/**
 * First selected file, or null when nothing is selected.
 *
 * This used to be inline as `e.target.files && setFile(e.target.files[0])`. A
 * FileList is an object, so an EMPTY one is truthy: the guard let an
 * out-of-range read through and pushed `undefined` into state declared
 * `File | null`. An empty list is not hypothetical — clearing a selection
 * delivers `files.length === 0` to this same handler.
 */
export function firstFileOrNull(files: FileList | null): File | null {
  // `files[0]` is `File | undefined`; normalise to the `null` the state expects
  // so no reader ever has to distinguish "no file" from "no file".
  return files?.[0] ?? null;
}

export function EvidenceForm({ onSave, onCancel }: Props) {
  const t = useTranslations('evidence');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<EvidenceKind>('prior_result');
  const [body, setBody] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [tags, setTags] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    // Simulate R2 file upload
    let fileUrl = null;
    if (file) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      fileUrl = `https://mock-r2.example.com/${file.name}`;
    }

    const newEvidence = {
      id: Date.now().toString(),
      title,
      kind,
      body,
      validUntil: validUntil || null,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      fileUrl,
      createdAt: new Date().toISOString(),
    };

    setUploading(false);
    onSave(newEvidence);
  };

  return (
    <div className="bg-surface p-6 rounded-xl shadow-xs border border-border">
      <h2 className="text-lg font-bold font-heading text-ink mb-4">{t('addTitle')}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">

        <div>
          <label className="block text-xs font-semibold text-ink mb-1">{t('titleLabel')}</label>
          <input required value={title} onChange={e => setTitle(e.target.value)} type="text" className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent" placeholder={t('titlePlaceholder')} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">{t('kindLabel')}</label>
            <select value={kind} onChange={e => setKind(e.target.value as EvidenceKind)} className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent">
              <option value="stat">{t('kindStat')}</option>
              <option value="prior_result">{t('kindPriorResult')}</option>
              <option value="trl">{t('kindTrl')}</option>
              <option value="letter">{t('kindLetter')}</option>
              <option value="reference">{t('kindReference')}</option>
              <option value="publication">{t('kindPublication')}</option>
              <option value="certificate">{t('kindCertificate')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">{t('validUntilLabel')}</label>
            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink mb-1">{t('bodyLabel')}</label>
          <textarea required value={body} onChange={e => setBody(e.target.value)} rows={4} className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent" placeholder={t('bodyPlaceholder')} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink mb-1">{t('tagsLabel')}</label>
          <input type="text" value={tags} onChange={e => setTags(e.target.value)} className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent" placeholder={t('tagsPlaceholder')} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink mb-1">{t('uploadLabel')}</label>
          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:bg-surface-hover transition bg-surface">
            <input
              type="file"
              className="hidden"
              id="file-upload"
              onChange={e => setFile(firstFileOrNull(e.target.files))}
            />
            <label htmlFor="file-upload" className="cursor-pointer text-accent text-xs font-semibold hover:underline">
              {file ? file.name : t('uploadHint')}
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-border text-ink-2 rounded-lg text-xs font-semibold hover:bg-surface-hover hover:text-ink transition">
            {t('cancel')}
          </button>
          <button type="submit" disabled={uploading} className="px-5 py-2 bg-accent text-white rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 shadow-2xs transition">
            {uploading ? t('uploading') : t('save')}
          </button>
        </div>
      </form>
    </div>
  );
}

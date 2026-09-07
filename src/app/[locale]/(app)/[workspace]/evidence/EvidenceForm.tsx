'use client';

import React, { useState } from 'react';
import type { EvidenceItemData } from './evidence-client';

type EvidenceKind = 'stat' | 'prior_result' | 'trl' | 'letter' | 'reference' | 'publication' | 'certificate';

type Props = {
  onSave: (evidence: EvidenceItemData) => void;
  onCancel: () => void;
};

export function EvidenceForm({ onSave, onCancel }: Props) {
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
      <h2 className="text-lg font-bold font-heading text-ink mb-4">Add Evidence</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div>
          <label className="block text-xs font-semibold text-ink mb-1">Title</label>
          <input required value={title} onChange={e => setTitle(e.target.value)} type="text" className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent" placeholder="e.g. ISO 9001 Certificate" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Kind</label>
            <select value={kind} onChange={e => setKind(e.target.value as EvidenceKind)} className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent">
              <option value="stat">Statistic</option>
              <option value="prior_result">Prior Result</option>
              <option value="trl">TRL Validation</option>
              <option value="letter">Letter</option>
              <option value="reference">Reference</option>
              <option value="publication">Publication</option>
              <option value="certificate">Certificate</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Valid Until (Optional)</label>
            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink mb-1">Body Text / Summary</label>
          <textarea required value={body} onChange={e => setBody(e.target.value)} rows={4} className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent" placeholder="Main text of the evidence..." />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink mb-1">Tags (comma separated)</label>
          <input type="text" value={tags} onChange={e => setTags(e.target.value)} className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent" placeholder="e.g. ai, healthcare, sme" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink mb-1">Upload File</label>
          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:bg-surface-hover transition bg-surface">
            <input 
              type="file" 
              className="hidden" 
              id="file-upload" 
              onChange={e => e.target.files && setFile(e.target.files[0])} 
            />
            <label htmlFor="file-upload" className="cursor-pointer text-accent text-xs font-semibold hover:underline">
              {file ? file.name : 'Click to select a file or drag and drop'}
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-border text-ink-2 rounded-lg text-xs font-semibold hover:bg-surface-hover hover:text-ink transition">
            Cancel
          </button>
          <button type="submit" disabled={uploading} className="px-5 py-2 bg-accent text-white rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 shadow-2xs transition">
            {uploading ? 'Uploading...' : 'Save Evidence'}
          </button>
        </div>
      </form>
    </div>
  );
}

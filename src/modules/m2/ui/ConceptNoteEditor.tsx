'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { generateConceptNoteDraft, saveConceptNoteDraft, exportToDocx } from '../server/actions';
import { errorMessage } from '@/lib/errors';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';

// We'll use standard HTML elements if UI components are missing for brevity, but let's assume they exist
// from shadcn or base-ui per package.json. If they don't, standard works.
// Using standard ones to avoid import errors if shadcn is partially initialized.

interface SchemaItem {
  key: string;
  labelKey: string;
  maxWords: number;
}

interface ConceptNoteEditorProps {
  opportunityId: string;
  templateId: string;
  schema: SchemaItem[];
  initialContent?: Record<string, string>;
  noteId?: string;
}

export default function ConceptNoteEditor({
  opportunityId,
  templateId,
  schema,
  initialContent = {},
  noteId
}: ConceptNoteEditorProps) {
  const [content, setContent] = useState<Record<string, string>>(initialContent);
  const [currentNoteId, setCurrentNoteId] = useState<string | undefined>(noteId);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // Result of the last generate / save / export, shown as an in-page band
  // instead of `alert()` (FO-11). Same shape as the pipeline detail bands.
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const t = useTranslations('ConceptNote.editor');
  const errorText = useActionErrorText();

  const handleGenerate = async () => {
    setIsGenerating(true);
    setNotice(null);
    try {
      // The action reads the tenant and user from the session.
      const newNoteId = await generateConceptNoteDraft(opportunityId, templateId, {});
      setCurrentNoteId(newNoteId);
      setNotice({ kind: 'ok', text: t('generated') });
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err, () => t('failed', { message: errorMessage(err) })) });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!currentNoteId) return;
    setIsSaving(true);
    setNotice(null);
    try {
      await saveConceptNoteDraft(currentNoteId, content);
      setNotice({ kind: 'ok', text: t('saved') });
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err, () => t('failed', { message: errorMessage(err) })) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    if (!currentNoteId) return;
    setIsExporting(true);
    setNotice(null);
    try {
      const base64 = await exportToDocx(currentNoteId);
      const link = document.createElement('a');
      link.href = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}`;
      link.download = `ConceptNote_${opportunityId}.docx`;
      link.click();
    } catch (err) {
      setNotice({ kind: 'error', text: t('failed', { message: errorMessage(err) }) });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t('title')}</h2>
        <div className="space-x-2">
          {!currentNoteId && (
            <button 
              onClick={handleGenerate} 
              disabled={isGenerating}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isGenerating ? t('generating') : t('generate')}
            </button>
          )}
          {currentNoteId && (
            <>
              <button 
                onClick={handleSave} 
                disabled={isSaving}
                className="border border-border bg-surface text-ink-2 px-4 py-2 rounded-md hover:bg-ground disabled:opacity-50 mx-2"
              >
                {isSaving ? t('saving') : t('save')}
              </button>
              <button 
                onClick={handleExport} 
                disabled={isExporting}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {isExporting ? t('exporting') : t('export')}
              </button>
            </>
          )}
        </div>
      </div>

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          data-testid={`concept-note-${notice.kind === 'error' ? 'error' : 'result'}`}
          className={
            notice.kind === 'error'
              ? 'rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-start gap-2'
              : 'rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-start gap-2'
          }
        >
          {notice.kind === 'error' ? (
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      <div className="space-y-4">
        {schema.map((section) => (
          <div key={section.key} className="space-y-2">
            <label className="block text-sm font-medium text-ink-2">
              {t('sectionLabel', { label: section.labelKey, max: section.maxWords })}
            </label>
            <textarea
              rows={6}
              value={content[section.key] || ''}
              onChange={(e) => setContent({ ...content, [section.key]: e.target.value })}
              placeholder={t('placeholder', { label: section.labelKey })}
              className="w-full rounded-md border-border shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-3"
            />
            <div className="text-xs text-muted text-right">
              {t('words', {
                count: (content[section.key] || '').split(/\\s+/).filter(Boolean).length,
                max: section.maxWords,
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

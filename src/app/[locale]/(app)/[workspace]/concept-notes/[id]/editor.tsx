'use client';

import React, { useState, useTransition } from 'react';
import { saveSectionContent, generateSectionDraft, updateNoteStatus } from '../actions';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import type { Editor } from '@tiptap/react';
import { EvidenceDrawer } from '@/components/evidence/EvidenceDrawer';
import { useTranslations } from 'next-intl';
import { errorMessage } from '@/lib/errors';
import { invalidTemplateSectionKey } from '@/modules/m2/invalid-section';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';

interface Section {
  key: string;
  labelKey: string;
  maxWords: number;
}

interface EditorProps {
  noteId: string;
  opportunityTitle: string;
  sections: Section[];
  initialContent: Record<string, string>;
  status: string;
  version: number;
}

export default function ConceptNoteEditor({
  noteId,
  opportunityTitle,
  sections,
  initialContent,
  status: initialStatus,
  version: initialVersion,
}: EditorProps) {
  const [content, setContent] = useState<Record<string, string>>(initialContent);
  const [status, setStatus] = useState(initialStatus);
  const [activeSection, setActiveSection] = useState(sections[0]?.key || '');
  const [isPending, startTransition] = useTransition();
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [lastAiUsage, setLastAiUsage] = useState<{ creditsUsed: number; inputTokens: number; outputTokens: number } | null>(null);
  const [isEvidenceDrawerOpen, setIsEvidenceDrawerOpen] = useState(false);
  const errorText = useActionErrorText();
  const t = useTranslations('ConceptNote.workspaceEditor');
  const tDraft = useTranslations('ConceptNote.editor');
  const tStatus = useTranslations('ConceptNote.status');

  /** An ended pilot is said as such; any other error goes on to the error boundary, as before. */
  const refuse = (err: unknown) => {
    const text = errorText(err, null);
    if (text === null) throw err;
    alert(text);
  };
  const editorRef = React.useRef<Editor | null>(null);

  const handleSave = (sectionKey: string) => {
    startTransition(async () => {
      try {
        await saveSectionContent(noteId, sectionKey, content[sectionKey] || '');
      } catch (err) {
        refuse(err);
      }
    });
  };

  const handleGenerate = async (section: Section) => {
    setAiLoading(section.key);
    setLastAiUsage(null);
    try {
      const result = await generateSectionDraft(
        noteId,
        section.key,
        section.labelKey,
        section.maxWords,
        opportunityTitle
      );
      setContent(prev => ({ ...prev, [section.key]: result.text }));
      setLastAiUsage({
        creditsUsed: result.creditsUsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    } catch (err) {
      // Production withholds a thrown action's message; the digest carries the section.
      const invalidSection = invalidTemplateSectionKey(err);
      alert(
        invalidSection !== null
          ? tDraft('invalidSection', { section: invalidSection })
          : errorText(err, () => errorMessage(err) || t('aiFailed'))
      );
    } finally {
      setAiLoading(null);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    startTransition(async () => {
      try {
        await updateNoteStatus(noteId, newStatus);
      } catch (err) {
        refuse(err);
        return;
      }
      setStatus(newStatus);
    });
  };

  const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-180px)]">
      {/* Sidebar - Section Navigation */}
      <div className="w-full lg:w-64 flex-shrink-0 bg-surface border border-border rounded-xl p-4 overflow-y-auto shadow-2xs">
        <h3 className="font-bold text-xs text-muted uppercase tracking-wider mb-3">{t('sections')}</h3>
        <div className="space-y-1">
          {sections.map(s => {
            const words = wordCount(content[s.key] || '');
            const overLimit = words > s.maxWords;
            return (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  activeSection === s.key
                    ? 'bg-accent text-white font-semibold shadow-2xs'
                    : 'hover:bg-surface-hover text-ink-2 hover:text-ink'
                }`}
              >
                <div className="font-medium truncate">{s.labelKey}</div>
                <div className={`text-[10px] mt-0.5 ${activeSection === s.key ? 'text-white/80' : overLimit ? 'text-bad font-bold' : 'text-muted'}`}>
                  {t('sectionWords', { words, max: s.maxWords })}
                </div>
              </button>
            );
          })}
        </div>

        <hr className="my-4 border-border" />

        {/* Status Controls */}
        <div className="space-y-1.5">
          <h3 className="font-bold text-xs text-muted uppercase tracking-wider mb-2">{t('status')}</h3>
          {['draft', 'review', 'approved'].map(s => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              disabled={isPending}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs capitalize transition-colors ${
                status === s ? 'bg-ok/15 text-ok border border-ok/30 font-bold' : 'border border-border text-ink-2 hover:bg-surface-hover hover:text-ink'
              }`}
            >
              {tStatus(s)}
            </button>
          ))}
        </div>

        {/* AI Usage Disclosure */}
        {lastAiUsage && (
          <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-ink-2">
            <div className="font-bold text-purple-400 mb-1">{t('aiUsage')}</div>
            <div>{t('creditsUsed', { count: lastAiUsage.creditsUsed })}</div>
            <div>{t('inputTokens', { count: lastAiUsage.inputTokens })}</div>
            <div>{t('outputTokens', { count: lastAiUsage.outputTokens })}</div>
          </div>
        )}
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col bg-surface border border-border rounded-xl overflow-hidden shadow-xs">
        {sections.filter(s => s.key === activeSection).map(section => (
          <div key={section.key} className="flex flex-col flex-1 min-h-0">
            {/* Section Header */}
            <div className="px-6 py-4 border-b border-border bg-ground/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-lg md:text-xl font-bold font-heading text-ink">{section.labelKey}</h2>
                <p className="text-xs text-muted">{t('maxWords', { max: section.maxWords })}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setIsEvidenceDrawerOpen(true)}
                  className="bg-surface text-ink-2 border border-border px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-surface-hover hover:text-ink flex items-center gap-1.5 transition"
                >
                  <span>🔍</span>
                  <span>{t('evidenceHub')}</span>
                </button>
                <button
                  onClick={() => handleGenerate(section)}
                  disabled={aiLoading === section.key}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-2xs transition"
                >
                  {aiLoading === section.key ? (
                    <>{t('generating')}</>
                  ) : (
                    <>{t('aiDraft')}</>
                  )}
                </button>
                <button
                  onClick={() => handleSave(section.key)}
                  disabled={isPending}
                  className="bg-accent text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 shadow-2xs transition"
                >
                  {isPending ? t('saving') : t('save')}
                </button>
              </div>
            </div>

            {/* Rich Text Editor */}
            <div className="flex-1 flex flex-col bg-surface overflow-y-auto p-4">
              <RichTextEditor
                editorRef={editorRef}
                content={content[section.key] || ''}
                onChange={(html) =>
                  setContent((prev) => ({ ...prev, [section.key]: html }))
                }
              />
            </div>

            {/* Word Count Footer */}
            <div className="px-6 py-2.5 border-t border-border bg-ground/50 text-xs text-muted flex justify-between items-center">
              <span>
                {t('words')} <strong className="text-ink">{wordCount(content[section.key] || '')}</strong>/{section.maxWords}
                {wordCount(content[section.key] || '') > section.maxWords && (
                  <span className="text-bad ml-2 font-bold">{t('overLimit')}</span>
                )}
              </span>
              <span className="font-mono text-[11px]">{t('version', { version: initialVersion })}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Evidence Drawer Modal */}
      <EvidenceDrawer
        isOpen={isEvidenceDrawerOpen}
        onClose={() => setIsEvidenceDrawerOpen(false)}
        onSelect={(body) => {
          if (editorRef.current) {
            editorRef.current.commands.insertContent(`<p>${body}</p>`);
          }
        }}
      />
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { generateConceptNoteDraft, saveConceptNoteDraft, exportToDocx } from '../server/actions';

// We'll use standard HTML elements if UI components are missing for brevity, but let's assume they exist
// from shadcn or base-ui per package.json. If they don't, standard works.
// Using standard ones to avoid import errors if shadcn is partially initialized.

interface SchemaItem {
  key: string;
  labelKey: string;
  maxWords: number;
}

interface ConceptNoteEditorProps {
  tenantId: string;
  userId: string;
  opportunityId: string;
  templateId: string;
  schema: SchemaItem[];
  initialContent?: Record<string, string>;
  noteId?: string;
}

export default function ConceptNoteEditor({
  tenantId,
  userId,
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

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const newNoteId = await generateConceptNoteDraft(
        opportunityId,
        tenantId,
        userId,
        templateId,
        {}
      );
      setCurrentNoteId(newNoteId);
      alert('Draft generated successfully! Please refresh to load content if needed, or implement auto-fetch.');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!currentNoteId) return;
    setIsSaving(true);
    try {
      await saveConceptNoteDraft(currentNoteId, content);
      alert('Saved successfully!');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    if (!currentNoteId) return;
    setIsExporting(true);
    try {
      const base64 = await exportToDocx(currentNoteId);
      const link = document.createElement('a');
      link.href = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}`;
      link.download = `ConceptNote_${opportunityId}.docx`;
      link.click();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Concept Note Editor</h2>
        <div className="space-x-2">
          {!currentNoteId && (
            <button 
              onClick={handleGenerate} 
              disabled={isGenerating}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isGenerating ? 'Generating...' : 'AI Generate Draft'}
            </button>
          )}
          {currentNoteId && (
            <>
              <button 
                onClick={handleSave} 
                disabled={isSaving}
                className="border border-border bg-surface text-ink-2 px-4 py-2 rounded-md hover:bg-ground disabled:opacity-50 mx-2"
              >
                {isSaving ? 'Saving...' : 'Save Draft'}
              </button>
              <button 
                onClick={handleExport} 
                disabled={isExporting}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {isExporting ? 'Exporting...' : 'Export DOCX'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {schema.map((section) => (
          <div key={section.key} className="space-y-2">
            <label className="block text-sm font-medium text-ink-2">
              {section.labelKey} (Max {section.maxWords} words)
            </label>
            <textarea
              rows={6}
              value={content[section.key] || ''}
              onChange={(e) => setContent({ ...content, [section.key]: e.target.value })}
              placeholder={`Write the ${section.labelKey.toLowerCase()}...`}
              className="w-full rounded-md border-border shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-3"
            />
            <div className="text-xs text-muted text-right">
              Words: {(content[section.key] || '').split(/\\s+/).filter(Boolean).length} / {section.maxWords}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

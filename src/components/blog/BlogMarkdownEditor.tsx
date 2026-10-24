'use client';

import React, { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  ImagePlus,
  Loader2,
  X,
  UploadCloud,
} from 'lucide-react';
import { renderBlogContent } from '@/components/blog/blog-content';
import {
  toggleBlock,
  toggleBold,
  toggleItalic,
  insertLink,
  insertImage,
  type TextEdit,
} from '@/lib/blog-markdown-edit';

const IMAGE_MAX_MB = 5;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface BlogMarkdownEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minRows?: number;
}

export function BlogMarkdownEditor({
  id,
  value,
  onChange,
  required = false,
  minRows = 14,
}: BlogMarkdownEditorProps) {
  const t = useTranslations('adminBlog.editor');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');

  // Modals state
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkSelection, setLinkSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageTab, setImageTab] = useState<'upload' | 'url'>('upload');
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imageSelection, setImageSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apply = (edit: (val: string, start: number, end: number) => TextEdit) => {
    const el = textareaRef.current;
    if (!el) return;
    const next = edit(el.value, el.selectionStart, el.selectionEnd);
    onChange(next.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  };

  const openLinkModal = () => {
    const el = textareaRef.current;
    const start = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : value.length;
    const selected = el ? el.value.slice(start, end) : '';

    setLinkSelection({ start, end });
    setLinkText(selected);
    setLinkUrl('');
    setIsLinkModalOpen(true);
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl.trim()) return;

    let finalUrl = linkUrl.trim();
    if (!/^https?:\/\//i.test(finalUrl) && !finalUrl.startsWith('/')) {
      finalUrl = `https://${finalUrl}`;
    }

    const { start, end } = linkSelection;
    const next = insertLink(value, start, end, finalUrl, linkText, t('linkFallback'));
    onChange(next.value);
    setIsLinkModalOpen(false);

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(next.selectionStart, next.selectionEnd);
      }
    });
  };

  const openImageModal = () => {
    const el = textareaRef.current;
    const start = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : value.length;

    setImageSelection({ start, end });
    setImageUrl('');
    setImageAlt('');
    setUploadError(null);
    setImageTab('upload');
    setIsImageModalOpen(true);
  };

  const handleImageFilePick = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);

    if (!IMAGE_TYPES.includes(file.type)) {
      setUploadError(t('imageModal.errors.type'));
      return;
    }
    if (file.size > IMAGE_MAX_MB * 1024 * 1024) {
      setUploadError(t('imageModal.errors.size', { maxMb: IMAGE_MAX_MB }));
      return;
    }

    setIsUploading(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const res = await fetch('/api/admin/blog/image', { method: 'POST', body });
      const data: { url?: unknown; error?: unknown } = await res.json().catch(() => ({}));

      if (res.ok && typeof data.url === 'string' && data.url) {
        setImageUrl(data.url);
        return;
      }

      if (res.status === 401 || res.status === 403) {
        setUploadError(t('imageModal.errors.forbidden'));
      } else {
        setUploadError(t('imageModal.errors.upload_failed'));
      }
    } catch (err) {
      console.error(err);
      setUploadError(t('imageModal.errors.upload_failed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl.trim()) return;

    const { start, end } = imageSelection;
    const next = insertImage(value, start, end, imageUrl.trim(), imageAlt.trim());
    onChange(next.value);
    setIsImageModalOpen(false);

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(next.selectionStart, next.selectionEnd);
      }
    });
  };

  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const charCount = value.length;

  const tabClass = (active: boolean) =>
    `px-3 py-1 rounded-md text-xs font-bold transition-colors ${
      active ? 'bg-surface text-ink shadow-2xs' : 'text-ink-2 hover:text-ink'
    }`;

  return (
    <div className="border border-border rounded-xl overflow-hidden focus-within:border-accent bg-surface transition-colors shadow-2xs">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-ground/80 border-b border-border">
        <div
          role="toolbar"
          aria-label={t('toolbar.label')}
          aria-controls={id}
          className="flex flex-wrap items-center gap-0.5"
        >
          {/* Headings */}
          <button
            type="button"
            onClick={() => apply((v, s, e) => toggleBlock(v, s, e, 'h1'))}
            disabled={tab !== 'write'}
            aria-label={t('toolbar.h1')}
            title={t('toolbar.h1')}
            className="p-1.5 rounded-md text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-40 transition-colors"
          >
            <Heading1 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => apply((v, s, e) => toggleBlock(v, s, e, 'h2'))}
            disabled={tab !== 'write'}
            aria-label={t('toolbar.h2')}
            title={t('toolbar.h2')}
            className="p-1.5 rounded-md text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-40 transition-colors"
          >
            <Heading2 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => apply((v, s, e) => toggleBlock(v, s, e, 'h3'))}
            disabled={tab !== 'write'}
            aria-label={t('toolbar.h3')}
            title={t('toolbar.h3')}
            className="p-1.5 rounded-md text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-40 transition-colors"
          >
            <Heading3 size={16} aria-hidden="true" />
          </button>

          <div className="w-px h-4 bg-border mx-1" aria-hidden="true" />

          {/* Bold, Italic, Quote */}
          <button
            type="button"
            onClick={() => apply(toggleBold)}
            disabled={tab !== 'write'}
            aria-label={t('toolbar.bold')}
            title={t('toolbar.bold')}
            className="p-1.5 rounded-md text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-40 transition-colors font-bold"
          >
            <Bold size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => apply(toggleItalic)}
            disabled={tab !== 'write'}
            aria-label={t('toolbar.italic')}
            title={t('toolbar.italic')}
            className="p-1.5 rounded-md text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-40 transition-colors italic"
          >
            <Italic size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => apply((v, s, e) => toggleBlock(v, s, e, 'quote'))}
            disabled={tab !== 'write'}
            aria-label={t('toolbar.quote')}
            title={t('toolbar.quote')}
            className="p-1.5 rounded-md text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-40 transition-colors"
          >
            <Quote size={16} aria-hidden="true" />
          </button>

          <div className="w-px h-4 bg-border mx-1" aria-hidden="true" />

          {/* Lists */}
          <button
            type="button"
            onClick={() => apply((v, s, e) => toggleBlock(v, s, e, 'ul'))}
            disabled={tab !== 'write'}
            aria-label={t('toolbar.bulletList')}
            title={t('toolbar.bulletList')}
            className="p-1.5 rounded-md text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-40 transition-colors"
          >
            <List size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => apply((v, s, e) => toggleBlock(v, s, e, 'ol'))}
            disabled={tab !== 'write'}
            aria-label={t('toolbar.numberedList')}
            title={t('toolbar.numberedList')}
            className="p-1.5 rounded-md text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-40 transition-colors"
          >
            <ListOrdered size={16} aria-hidden="true" />
          </button>

          <div className="w-px h-4 bg-border mx-1" aria-hidden="true" />

          {/* Links and Images */}
          <button
            type="button"
            onClick={openLinkModal}
            disabled={tab !== 'write'}
            aria-label={t('toolbar.link')}
            title={t('toolbar.link')}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-accent hover:bg-accent/10 disabled:opacity-40 transition-colors"
          >
            <Link2 size={15} aria-hidden="true" />
            <span className="hidden sm:inline">{t('toolbar.link')}</span>
          </button>
          <button
            type="button"
            onClick={openImageModal}
            disabled={tab !== 'write'}
            aria-label={t('toolbar.image')}
            title={t('toolbar.image')}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-accent hover:bg-accent/10 disabled:opacity-40 transition-colors"
          >
            <ImagePlus size={15} aria-hidden="true" />
            <span className="hidden sm:inline">{t('toolbar.image')}</span>
          </button>
        </div>

        {/* Write / Preview Tab Switch */}
        <div
          role="tablist"
          aria-label={t('tabs.label')}
          className="flex items-center gap-1 p-0.5 rounded-lg bg-ground border border-border"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'write'}
            onClick={() => setTab('write')}
            className={tabClass(tab === 'write')}
          >
            {t('tabs.write')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'preview'}
            onClick={() => setTab('preview')}
            className={tabClass(tab === 'preview')}
          >
            {t('tabs.preview')}
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <textarea
        ref={textareaRef}
        id={id}
        rows={minRows}
        required={required}
        hidden={tab !== 'write'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            apply(toggleBold);
          } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            apply(toggleItalic);
          } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            openLinkModal();
          }
        }}
        onInvalid={() => setTab('write')}
        placeholder={t('placeholder')}
        className="block w-full p-4 bg-ground text-xs font-mono text-ink leading-relaxed focus:outline-hidden resize-y min-h-[260px]"
      />

      {/* Preview Body */}
      {tab === 'preview' && (
        <div className="prose prose-slate dark:prose-invert max-w-none min-h-[260px] p-6 bg-surface space-y-4 text-sm leading-relaxed">
          {value.trim().length > 0 ? (
            renderBlogContent(value)
          ) : (
            <p className="text-ink-2 italic">{t('previewEmpty')}</p>
          )}
        </div>
      )}

      {/* Footer Info & Counters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 bg-ground/80 border-t border-border text-[11px] text-muted">
        <p className="truncate">{t('hint')}</p>
        <div className="flex items-center gap-3 shrink-0 font-medium">
          <span>{t('stats.words', { count: wordCount })}</span>
          <span>•</span>
          <span>{t('stats.chars', { count: charCount })}</span>
        </div>
      </div>

      {/* LINK MODAL */}
      {isLinkModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="link-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-ground/50">
              <h3 id="link-modal-title" className="font-bold text-sm text-ink flex items-center gap-2">
                <Link2 className="w-4 h-4 text-accent" />
                <span>{t('linkModal.title')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsLinkModalOpen(false)}
                className="p-1 rounded-md text-muted hover:text-ink hover:bg-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleLinkSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  {t('linkModal.textLabel')}
                </label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder={t('linkModal.textPlaceholder')}
                  className="w-full px-3 py-2 bg-ground border border-border rounded-lg text-xs text-ink focus:outline-hidden focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  {t('linkModal.urlLabel')} *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder={t('linkModal.urlPlaceholder')}
                  className="w-full px-3 py-2 bg-ground border border-border rounded-lg text-xs text-ink focus:outline-hidden focus:border-accent"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsLinkModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-2 hover:bg-surface-hover"
                >
                  {t('linkModal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!linkUrl.trim()}
                  className="bg-accent text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 shadow-2xs"
                >
                  {t('linkModal.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMAGE MODAL */}
      {isImageModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="image-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-ground/50">
              <h3 id="image-modal-title" className="font-bold text-sm text-ink flex items-center gap-2">
                <ImagePlus className="w-4 h-4 text-accent" />
                <span>{t('imageModal.title')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsImageModalOpen(false)}
                className="p-1 rounded-md text-muted hover:text-ink hover:bg-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs: Upload or URL */}
            <div className="flex border-b border-border bg-ground px-5 pt-3 gap-2">
              <button
                type="button"
                onClick={() => setImageTab('upload')}
                className={`pb-2 px-3 text-xs font-bold border-b-2 transition-colors ${
                  imageTab === 'upload'
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {t('imageModal.tabUpload')}
              </button>
              <button
                type="button"
                onClick={() => setImageTab('url')}
                className={`pb-2 px-3 text-xs font-bold border-b-2 transition-colors ${
                  imageTab === 'url'
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {t('imageModal.tabUrl')}
              </button>
            </div>

            <form onSubmit={handleImageSubmit} className="p-5 space-y-4">
              {imageTab === 'upload' ? (
                <div>
                  <label className="block text-xs font-bold text-ink mb-1.5">
                    {t('imageModal.uploadLabel')}
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed border-border hover:border-accent/60 rounded-xl p-5 text-center cursor-pointer transition-colors bg-ground/40 ${
                      isUploading ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={IMAGE_TYPES.join(',')}
                      disabled={isUploading}
                      onChange={(e) => void handleImageFilePick(e.target.files?.[0])}
                      className="sr-only"
                    />
                    {isUploading ? (
                      <div className="flex flex-col items-center justify-center py-2 space-y-2">
                        <Loader2 className="w-7 h-7 text-accent animate-spin" />
                        <span className="text-xs font-medium text-ink">
                          {t('imageModal.uploading')}
                        </span>
                      </div>
                    ) : imageUrl ? (
                      <div className="flex flex-col items-center space-y-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
                          alt="Uploaded preview"
                          className="max-h-32 rounded-lg border border-border object-cover"
                        />
                        <span className="text-xs text-accent font-semibold underline">
                          {t('imageModal.uploadLabel')}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center space-y-1.5 py-2">
                        <UploadCloud className="w-8 h-8 text-muted" />
                        <span className="text-xs font-bold text-ink">
                          {t('imageModal.uploadLabel')}
                        </span>
                        <span className="text-[11px] text-muted">
                          {t('imageModal.uploadHint', { maxMb: IMAGE_MAX_MB })}
                        </span>
                      </div>
                    )}
                  </div>

                  {uploadError && (
                    <p className="text-xs font-medium text-bad mt-2">{uploadError}</p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    {t('imageModal.urlLabel')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder={t('imageModal.urlPlaceholder')}
                    className="w-full px-3 py-2 bg-ground border border-border rounded-lg text-xs text-ink focus:outline-hidden focus:border-accent"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  {t('imageModal.altLabel')}
                </label>
                <input
                  type="text"
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  placeholder={t('imageModal.altPlaceholder')}
                  className="w-full px-3 py-2 bg-ground border border-border rounded-lg text-xs text-ink focus:outline-hidden focus:border-accent"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsImageModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-2 hover:bg-surface-hover"
                >
                  {t('imageModal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!imageUrl.trim() || isUploading}
                  className="bg-accent text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 shadow-2xs"
                >
                  {t('imageModal.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
// blog-shared, not blog: this is a client component and @/lib/blog reaches Prisma.
import { formatBlogDate, type BlogPost } from '@/lib/blog-shared';
import { estimateReadMinutes } from '@/lib/blog-read-time';
import { 
  createBlogPostAction, 
  updateBlogPostAction, 
  deleteBlogPostAction, 
  toggleFeaturedBlogPostAction 
} from './actions';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Star,
  BookOpen,
  X,
  Sparkles,
  FileText,
  Eye,
  Tag,
  ImagePlus,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { RichTextEditor } from '@/components/editor/RichTextEditor';

interface AdminBlogClientProps {
  initialPosts: BlogPost[];
  locale: string;
  /**
   * Display name of the signed-in admin, resolved server-side. Seeds the byline
   * of a new post; empty when the session carries no usable name, in which case
   * the field starts empty and the post is published unattributed.
   */
  sessionUserName?: string;
  /** The server could not read the posts; shown instead of an empty table. */
  loadError?: boolean;
}

/** One line of feedback above the table. `error` is only ever a translated message. */
type Notice = { kind: 'ok' | 'error'; text: string } | null;

/**
 * The cover image upload, `POST /api/admin/blog/image` (TASK-MUU20NSV2TETW):
 * multipart `file` → 200 `{ url }` · 400 `{ error: 'type' | 'size' }` ·
 * 401/403 `{ error: 'forbidden' }` · 503 `{ error: 'object_store_unconfigured' }`.
 * The route checks the bytes; the type and size are checked here first only so
 * an obviously wrong file is refused before it is sent.
 */
const IMAGE_MAX_MB = 5;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_ERRORS = ['type', 'size', 'forbidden', 'object_store_unconfigured', 'upload_failed'] as const;
type ImageError = (typeof IMAGE_ERRORS)[number];

export default function AdminBlogClient({
  initialPosts,
  locale,
  sessionUserName = '',
  loadError = false,
}: AdminBlogClientProps) {
  const t = useTranslations('adminBlog');
  const [posts, setPosts] = useState<BlogPost[]>(initialPosts);
  const [notice, setNotice] = useState<Notice>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageError, setImageError] = useState<ImageError | null>(null);
  const [contentMissing, setContentMissing] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    category: 'Horizon Europe',
    excerpt: '',
    content: '',
    // Filled from the content as it is written (see `readTimeAuto`).
    readTime: '',
    // The signed-in admin, or nothing. No stand-in author, no stock portrait.
    authorName: sessionUserName,
    authorRole: '',
    authorAvatar: '',
    // No stock cover: the admin uploads one, and saving without it is refused.
    image: '',
    featured: true,
  });
  // A new post's read time follows its content until the admin edits the field;
  // an existing post keeps the value it was saved with. A ref, not state: the
  // editor's update callback may be the one from an earlier render.
  const readTimeAuto = useRef(true);
  const autoReadTime = (markdown: string) => {
    const minutes = estimateReadMinutes(markdown);
    return minutes ? t('readTime.auto', { min: minutes }) : '';
  };

  const categories = Array.from(new Set(posts.map((p) => p.category)));

  useEffect(() => {
    if (formError && formErrorRef.current) {
      formErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      formErrorRef.current.focus();
    }
  }, [formError]);

  const filteredPosts = posts.filter((p) => {
    const matchesSearch = 
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleOpenCreateModal = () => {
    setEditingSlug(null);
    setFormError(null);
    setImageError(null);
    setContentMissing(false);
    setFormData({
      title: '',
      slug: '',
      category: 'Horizon Europe',
      excerpt: '',
      content: '',
      readTime: '',
      authorName: sessionUserName,
      authorRole: '',
      authorAvatar: '',
      image: '',
      featured: true,
    });
    readTimeAuto.current = true;
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (post: BlogPost) => {
    setEditingSlug(post.slug);
    setFormError(null);
    setImageError(null);
    setContentMissing(false);
    setFormData({
      title: post.title,
      slug: post.slug,
      category: post.category,
      excerpt: post.excerpt,
      content: post.content,
      readTime: post.readTime,
      // A post with no recorded author opens with empty byline fields.
      authorName: post.author?.name ?? '',
      authorRole: post.author?.role ?? '',
      authorAvatar: post.author?.avatar ?? '',
      image: post.image,
      featured: !!post.featured,
    });
    readTimeAuto.current = false;
    setIsModalOpen(true);
  };

  const handleImagePick = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    // The same file can be picked again after an error.
    if (imageInput.current) imageInput.current.value = '';
    if (!IMAGE_TYPES.includes(file.type)) return setImageError('type');
    if (file.size > IMAGE_MAX_MB * 1024 * 1024) return setImageError('size');

    setIsUploading(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const res = await fetch('/api/admin/blog/image', { method: 'POST', body });
      const data: { url?: unknown; error?: unknown } = await res.json().catch(() => ({}));
      if (res.ok && typeof data.url === 'string' && data.url) {
        const url = data.url;
        setFormData((prev) => ({ ...prev, image: url }));
        return;
      }
      const code = IMAGE_ERRORS.find((c) => c === data.error);
      setImageError(code ?? (res.status === 401 || res.status === 403 ? 'forbidden' : 'upload_failed'));
    } catch (err) {
      console.error(err);
      setImageError('upload_failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading) return;
    // The editor is no native `required` field, so an empty post is refused here.
    if (!formData.content.trim()) {
      setContentMissing(true);
      setFormError(t('content.missing'));
      return;
    }
    // BlogPost.image is required; the server refuses a post without one too.
    if (!formData.image) {
      setFormError(t('image.missing'));
      return;
    }
    setIsSubmitting(true);
    setFormError(null);

    // Success is shown only for `ok: true`, i.e. once the row is in the
    // database. A refusal keeps the modal open with the reason; nothing in the
    // list changes (AKTAR-MURBCJ0A-1 — this used to close on any answer).
    try {
      const res = editingSlug
        ? await updateBlogPostAction(editingSlug, formData)
        : await createBlogPostAction(formData);
      if (!res.ok) {
        setFormError(t(`errors.${res.error}`));
        return;
      }
      const saved = res.post;
      setPosts((prev) =>
        editingSlug ? prev.map((p) => (p.slug === editingSlug ? saved : p)) : [saved, ...prev]
      );
      setIsModalOpen(false);
      setNotice({ kind: 'ok', text: t('saved') });
    } catch (err) {
      console.error(err);
      setFormError(t('errors.save_failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (slug: string) => {
    if (!confirm('Bu blog yazısını silmek istediğinize emin misiniz?')) return;
    try {
      const res = await deleteBlogPostAction(slug);
      if (!res.ok) {
        setNotice({ kind: 'error', text: t(`errors.${res.error}`) });
        return;
      }
      setPosts((prev) => prev.filter((p) => p.slug !== slug));
      setNotice({ kind: 'ok', text: t('deleted') });
    } catch (err) {
      console.error(err);
      setNotice({ kind: 'error', text: t('errors.save_failed') });
    }
  };

  const handleToggleFeatured = async (slug: string) => {
    try {
      const res = await toggleFeaturedBlogPostAction(slug);
      if (!res.ok) {
        setNotice({ kind: 'error', text: t(`errors.${res.error}`) });
        return;
      }
      const saved = res.post;
      setPosts((prev) => prev.map((p) => (p.slug === slug ? saved : p)));
      setNotice({ kind: 'ok', text: t('featureToggled') });
    } catch (err) {
      console.error(err);
      setNotice({ kind: 'error', text: t('errors.save_failed') });
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface border border-border p-6 rounded-2xl shadow-xs">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-accent uppercase tracking-wider mb-1">
            <BookOpen className="w-4 h-4" />
            <span>Platform Admin Workbench</span>
          </div>
          <h1 className="text-2xl font-bold font-heading text-ink">Blog İçerik Yönetimi (CRUD)</h1>
          <p className="text-xs text-muted mt-1">
            Site ön yüzündeki rehberler, haberler ve öne çıkan 3&apos;lü blog kartlarını anlık yönetin.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          data-testid="blog-new"
          className="bg-accent hover:opacity-90 text-white font-bold text-xs px-5 py-3 rounded-xl shadow-2xs hover:shadow-md transition flex items-center justify-center space-x-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni Blog Yazısı Ekle</span>
        </button>
      </div>

      {loadError && (
        <div role="alert" data-testid="blog-load-error" className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-xs font-semibold text-bad">
          {t('loadFailed')}
        </div>
      )}

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          data-testid={notice.kind === 'error' ? 'blog-error' : 'blog-success'}
          className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
            notice.kind === 'error' ? 'border-bad/30 bg-bad/10 text-bad' : 'border-good/30 bg-good/10 text-good'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-border p-5 rounded-xl shadow-2xs">
          <div className="text-xs font-semibold text-muted mb-1 flex justify-between items-center">
            <span>Toplam Blog Yazısı</span>
            <FileText className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-extrabold text-ink">{posts.length}</div>
        </div>

        <div className="bg-surface border border-border p-5 rounded-xl shadow-2xs">
          <div className="text-xs font-semibold text-muted mb-1 flex justify-between items-center">
            <span>Ana Sayfada Öne Çıkanlar</span>
            <Star className="w-4 h-4 text-amber" />
          </div>
          <div className="text-3xl font-extrabold text-amber">{posts.filter((p) => p.featured).length}</div>
        </div>

        <div className="bg-surface border border-border p-5 rounded-xl shadow-2xs">
          <div className="text-xs font-semibold text-muted mb-1 flex justify-between items-center">
            <span>Kategoriler</span>
            <Tag className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-3xl font-extrabold text-ink">{categories.length}</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface border border-border p-4 rounded-xl shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Başlık, içerik veya yazar ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-ground border border-border rounded-lg text-xs text-ink focus:outline-hidden focus:border-accent"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedCategory === 'ALL'
                ? 'bg-accent text-white'
                : 'bg-ground border border-border text-ink-2 hover:bg-surface-hover'
            }`}
          >
            Tüm Kategoriler
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-accent text-white'
                  : 'bg-ground border border-border text-ink-2 hover:bg-surface-hover'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-ground/70 border-b border-border text-muted uppercase font-mono tracking-wider">
                <th className="p-4">Kapak</th>
                <th className="p-4">Başlık & Slug</th>
                <th className="p-4">Kategori</th>
                <th className="p-4">Yazar</th>
                <th className="p-4">Yayın Tarihi</th>
                <th className="p-4 text-center">Öne Çıkan (Ana Sayfa)</th>
                <th className="p-4 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredPosts.map((post) => (
                <tr key={post.slug} className="hover:bg-surface-hover/50 transition">
                  <td className="p-4">
                    <Image
                      src={post.image}
                      alt={post.title}
                      width={56}
                      height={40}
                      className="object-cover rounded-lg border border-border"
                    />
                  </td>
                  <td className="p-4 max-w-xs">
                    <div className="font-bold text-ink truncate" title={post.title}>
                      {post.title}
                    </div>
                    <div className="text-[10px] text-muted font-mono truncate">/{post.slug}</div>
                  </td>
                  <td className="p-4">
                    <span className="bg-accent/15 text-accent-ink border border-accent/20 font-semibold px-2 py-0.5 rounded text-[11px]">
                      {post.category}
                    </span>
                  </td>
                  <td className="p-4">
                    {/* A post with no recorded author is listed without one. */}
                    {post.author ? (
                      <>
                        <div className="font-semibold text-ink">{post.author.name}</div>
                        <div className="text-[10px] text-muted">{post.author.role}</div>
                      </>
                    ) : (
                      <div className="text-muted" aria-hidden="true">—</div>
                    )}
                  </td>
                  <td className="p-4 text-muted">
                    <time dateTime={new Date(post.publishedAt).toISOString()}>
                      {formatBlogDate(new Date(post.publishedAt), locale)}
                    </time>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => handleToggleFeatured(post.slug)}
                      data-testid={`blog-feature-${post.slug}`}
                      className={`p-1.5 rounded-lg border transition ${
                        post.featured
                          ? 'bg-amber/15 text-amber border-amber/30'
                          : 'bg-ground text-muted border-border hover:bg-surface-hover'
                      }`}
                      title={post.featured ? 'Ana sayfada gösteriliyor (Öne çıkan)' : 'Ana sayfaya ekle'}
                    >
                      <Star className={`w-4 h-4 ${post.featured ? 'fill-amber' : ''}`} />
                    </button>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end space-x-1">
                      <Link
                        href={`/${locale}/blog/${post.slug}`}
                        target="_blank"
                        className="p-1.5 rounded-lg border border-border text-muted hover:text-ink hover:bg-surface-hover transition"
                        title="Ön izle"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleOpenEditModal(post)}
                        className="p-1.5 rounded-lg border border-border text-blue-600 hover:bg-blue-50 transition"
                        title="Düzenle"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(post.slug)}
                        data-testid={`blog-delete-${post.slug}`}
                        className="p-1.5 rounded-lg border border-border text-bad hover:bg-bad/10 transition"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredPosts.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted">
                    Herhangi bir blog yazısı bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-ground/50">
              <h2 className="font-bold text-base text-ink flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <span>{editingSlug ? 'Blog Yazısını Düzenle' : 'Yeni Blog Yazısı Oluştur'}</span>
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-hover transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div
                  ref={formErrorRef}
                  role="alert"
                  data-testid="blog-form-error"
                  className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs font-semibold text-bad"
                  tabIndex={-1}
                >
                  {formError}
                </div>
              )}
              <div>
                <label htmlFor="blog-title" className="block text-xs font-bold text-ink mb-1">Makale Başlığı *</label>
                <input
                  id="blog-title"
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="örn: Horizon Europe Konsorsiyum Kurma Rehberi"
                  className="w-full px-3 py-2 bg-ground border border-border rounded-lg text-xs text-ink focus:outline-hidden focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="blog-category" className="block text-xs font-bold text-ink mb-1">Kategori *</label>
                  <input
                  id="blog-category"
                    type="text"
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="örn: Horizon Europe"
                    className="w-full px-3 py-2 bg-ground border border-border rounded-lg text-xs text-ink focus:outline-hidden focus:border-accent"
                  />
                </div>

                <div>
                  <label htmlFor="blog-read-time" className="block text-xs font-bold text-ink mb-1">{t('readTime.label')}</label>
                  <input
                    id="blog-read-time"
                    type="text"
                    value={formData.readTime}
                    onChange={(e) => {
                      readTimeAuto.current = false;
                      setFormData({ ...formData, readTime: e.target.value });
                    }}
                    placeholder={t('readTime.placeholder')}
                    aria-describedby="blog-read-time-hint"
                    data-testid="blog-read-time"
                    className="w-full px-3 py-2 bg-ground border border-border rounded-lg text-xs text-ink focus:outline-hidden focus:border-accent"
                  />
                  <p id="blog-read-time-hint" className="mt-1 text-[11px] text-muted">{t('readTime.hint')}</p>
                </div>
              </div>

              <div>
                <label htmlFor="blog-excerpt" className="block text-xs font-bold text-ink mb-1">Özet (Excerpt) *</label>
                <textarea
                  id="blog-excerpt"
                  rows={2}
                  required
                  value={formData.excerpt}
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                  placeholder="Kartta görünecek kısa açıklama metni..."
                  className="w-full px-3 py-2 bg-ground border border-border rounded-lg text-xs text-ink focus:outline-hidden focus:border-accent"
                />
              </div>

              <div data-testid="blog-content-field">
                {/* The editor is a contenteditable, not a form control: it is named by
                    aria-labelledby, and its required check is done in handleSubmit. */}
                <span id="blog-content-label" className="block text-xs font-bold text-ink mb-1">{t('content.label')} *</span>
                <RichTextEditor
                  format="markdown"
                  labelledBy="blog-content-label"
                  required
                  invalid={contentMissing}
                  content={formData.content}
                  onChange={(md) => {
                    setContentMissing(false);
                    setFormData((prev) => ({
                      ...prev,
                      content: md,
                      readTime: readTimeAuto.current ? autoReadTime(md) : prev.readTime,
                    }));
                  }}
                />
                <p className="mt-1 text-[11px] text-muted">{t('content.hint')}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Yazar Adı</label>
                  <input
                    type="text"
                    value={formData.authorName}
                    onChange={(e) => setFormData({ ...formData, authorName: e.target.value })}
                    className="w-full px-3 py-2 bg-ground border border-border rounded-lg text-xs text-ink focus:outline-hidden focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Yazar Unvanı</label>
                  <input
                    type="text"
                    value={formData.authorRole}
                    onChange={(e) => setFormData({ ...formData, authorRole: e.target.value })}
                    className="w-full px-3 py-2 bg-ground border border-border rounded-lg text-xs text-ink focus:outline-hidden focus:border-accent"
                  />
                </div>
              </div>

              <div aria-busy={isUploading}>
                <span id="blog-image-label" className="block text-xs font-bold text-ink mb-1">{t('image.label')} *</span>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {formData.image && (
                    // unoptimized: the preview shows the stored file itself, so an
                    // uploaded image appears whatever host the store serves it from.
                    <Image
                      src={formData.image}
                      alt={t('image.previewAlt')}
                      width={160}
                      height={96}
                      unoptimized
                      data-testid="blog-image-preview"
                      className={`w-40 h-24 object-cover rounded-lg border border-border shrink-0 ${isUploading ? 'opacity-50' : ''}`}
                    />
                  )}
                  <div className="min-w-0 space-y-1">
                    <label
                      htmlFor="blog-image-file"
                      className={`inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg border border-border bg-ground text-xs font-bold text-ink hover:bg-surface-hover transition cursor-pointer has-focus-visible:ring-2 has-focus-visible:ring-accent ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
                    >
                      {isUploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <ImagePlus className="w-4 h-4" aria-hidden="true" />
                      )}
                      <span>{formData.image ? t('image.change') : t('image.choose')}</span>
                      <input
                        ref={imageInput}
                        id="blog-image-file"
                        type="file"
                        accept={IMAGE_TYPES.join(',')}
                        disabled={isUploading}
                        aria-describedby="blog-image-hint"
                        data-testid="blog-image-input"
                        onChange={(e) => void handleImagePick(e.target.files?.[0])}
                        className="sr-only"
                      />
                    </label>
                    <p id="blog-image-hint" className="text-[11px] text-muted">
                      {t('image.hint', { maxMb: IMAGE_MAX_MB })}
                    </p>
                    {isUploading && (
                      <p role="status" data-testid="blog-image-uploading" className="text-[11px] font-semibold text-ink-2">
                        {t('image.uploading')}
                      </p>
                    )}
                    {imageError && (
                      <p role="alert" data-testid="blog-image-error" className="text-[11px] font-semibold text-bad break-words">
                        {t(`image.errors.${imageError}`, { maxMb: IMAGE_MAX_MB })}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="featured"
                  checked={formData.featured}
                  onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                  className="w-4 h-4 accent-accent rounded"
                />
                <label htmlFor="featured" className="text-xs font-semibold text-ink cursor-pointer">
                  Ana sayfadaki 3&apos;lü Öne Çıkan Blog Alanında Göster (Featured)
                </label>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-border flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-ink-2 hover:bg-surface-hover transition"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  data-testid="blog-submit"
                  disabled={isSubmitting || isUploading}
                  className="bg-accent hover:opacity-90 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-2xs transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Kaydediliyor...' : editingSlug ? 'Değişiklikleri Kaydet' : 'Yayınla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

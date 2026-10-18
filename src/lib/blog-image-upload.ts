/**
 * The blog image upload as the browser calls it, `POST /api/admin/blog/image`
 * (TASK-MUU20NSV2TETW): multipart `file` → 200 `{ url }` · 400
 * `{ error: 'type' | 'size' }` · 401/403 `{ error: 'forbidden' }` · 503
 * `{ error: 'object_store_unconfigured' }`. The route checks the bytes; the
 * type and size are checked here first only so an obviously wrong file is
 * refused before it is sent. One helper for the cover image and for images in
 * the post body (TASK-MVDPHZQCTVJ2R), so both say the same thing about a file.
 */
export const BLOG_IMAGE_UPLOAD_MAX_MB = 5;
export const BLOG_IMAGE_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const BLOG_IMAGE_UPLOAD_ERRORS = ['type', 'size', 'forbidden', 'object_store_unconfigured', 'upload_failed'] as const;
export type BlogImageUploadError = (typeof BLOG_IMAGE_UPLOAD_ERRORS)[number];

export async function uploadBlogImage(
  file: File
): Promise<{ ok: true; url: string } | { ok: false; error: BlogImageUploadError }> {
  if (!BLOG_IMAGE_UPLOAD_TYPES.includes(file.type)) return { ok: false, error: 'type' };
  if (file.size > BLOG_IMAGE_UPLOAD_MAX_MB * 1024 * 1024) return { ok: false, error: 'size' };
  try {
    const body = new FormData();
    body.set('file', file);
    const res = await fetch('/api/admin/blog/image', { method: 'POST', body });
    const data: { url?: unknown; error?: unknown } = await res.json().catch(() => ({}));
    if (res.ok && typeof data.url === 'string' && data.url) return { ok: true, url: data.url };
    const code = BLOG_IMAGE_UPLOAD_ERRORS.find((c) => c === data.error);
    return { ok: false, error: code ?? (res.status === 401 || res.status === 403 ? 'forbidden' : 'upload_failed') };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'upload_failed' };
  }
}

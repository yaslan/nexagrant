import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { BLOG_IMAGE_MAX_BYTES, blogImageKey, sniffBlogImage } from '@/lib/blog-image';
import { publicAssetStore, putPublicAsset } from '@/lib/storage';
import { requirePlatformAdminApi } from '@/lib/tenant';

type BlogImageRefusal = 'forbidden' | 'type' | 'size' | 'bad_form';

function refuse(error: BlogImageRefusal, status: 400 | 401 | 403) {
  return NextResponse.json({ error }, { status });
}

const unconfigured = () => internalError({ error: 'object_store_unconfigured' }, { status: 503 });
const uploadFailed = () => internalError({ error: 'upload_failed' });

/**
 * Blog cover image upload (TASK-MUU20NSV2TETW). multipart/form-data, field
 * `file`: a JPEG, PNG or WebP (by its bytes) of at most 5 MB.
 *
 * 200 `{ url }` — the absolute public URL, for `BlogPost.image`
 * 400 `{ error: 'type' | 'size' }` (also `type` for a missing or empty file)
 * 401/403 `{ error: 'forbidden' }` — platform admins only, the admin/documents gate
 * 503 `{ error: 'object_store_unconfigured' }` — no public bucket to write to
 *
 * The object goes to the public bucket (`putPublicAsset`), never the private
 * evidence bucket, and never to this server's disk: a cPanel deploy replaces
 * the app directory.
 */
export async function POST(req: NextRequest) {
  // Before the body is read: a refused request must not buffer 5 MB.
  const gate = await requirePlatformAdminApi();
  if (!gate.ok) return refuse('forbidden', gate.response.status === 401 ? 401 : 403);

  if (!publicAssetStore()) return unconfigured();

  // A declared body far over the limit is refused unread; the multipart
  // framing around the file is allowed for.
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > BLOG_IMAGE_MAX_BYTES + 64 * 1024) return refuse('size', 400);

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get('file');
  } catch {
    return refuse('bad_form', 400);
  }
  if (!(file instanceof File) || file.size === 0) return refuse('type', 400);
  if (file.size > BLOG_IMAGE_MAX_BYTES) return refuse('size', 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffBlogImage(bytes);
  if (!type) return refuse('type', 400);

  try {
    const url = await putPublicAsset(blogImageKey(type.ext), bytes, type.contentType);
    if (!url) return uploadFailed();
    return NextResponse.json({ url });
  } catch (err) {
    if ((err as { code?: string } | null)?.code === 'object_store_unconfigured') {
      return unconfigured();
    }
    console.error('[blog image] upload error:', err);
    return uploadFailed();
  }
}

import { randomBytes } from 'node:crypto';

/**
 * Blog cover images (TASK-MUU20NSV2TETW): what may be uploaded and where it is
 * stored. The bytes decide the type — the file name and the declared type are
 * the client's to set — and SVG is not on the list: it is a document that can
 * carry script, served from a public bucket.
 */
export const BLOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type BlogImageType = { ext: 'jpg' | 'png' | 'webp'; contentType: string };

/** The image type `bytes` start with, or null for anything but JPEG, PNG and WebP. */
export function sniffBlogImage(bytes: Buffer): BlogImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return null;
}

/**
 * A collision-resistant id in the cuid shape (`c` + 24 lowercase base-36
 * characters): a millisecond timestamp and 16 random bytes. No dependency for
 * it — Prisma's `cuid()` is generated in the client, not exported.
 */
export function blogImageId(now: number = Date.now()): string {
  const time = now.toString(36).padStart(9, '0').slice(-9);
  const rand = BigInt(`0x${randomBytes(16).toString('hex')}`).toString(36).padStart(15, '0').slice(-15);
  return `c${time}${rand}`;
}

/** `blog/<yyyy>/<cuid>.<ext>` — built here, never from the client's file name. */
export function blogImageKey(ext: BlogImageType['ext'], now: Date = new Date()): string {
  return `blog/${now.getUTCFullYear()}/${blogImageId(now.getTime())}.${ext}`;
}

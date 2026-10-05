/**
 * AKTAR-MURBCJ0A-1 — put the four launch posts into the `BlogPost` table
 * without re-running the whole seed (which also resets demo data).
 *
 * `prisma/seed.ts` calls the same function. Insert-only and idempotent: a post
 * whose slug is already in the table is left exactly as it is, so a second run
 * changes nothing and an admin's edit is never overwritten. Run it once per
 * environment, after prisma/migrations/add-blog-post.sql: a launch post an
 * admin has since DELETED would come back on a later run.
 *
 * Rollback (the four launch slugs only; admin-written posts are untouched):
 *   DELETE FROM "BlogPost" WHERE slug IN (
 *     'horizon-europe-basarili-konsorsiyum-rehberi',
 *     'tubitak-esik-ustu-ab-hakem-kriterleri',
 *     'ar-ge-projelerinde-yapay-zeka-destegi-part-b',
 *     'tto-ve-danismanlar-icin-multi-tenant-proje-yonetimi');
 *
 * Usage: pnpm db:seed-blog
 */
import 'dotenv/config';
import { prisma } from '@/lib/db';
import { seedBlogPosts } from '@/lib/blog-seed';

async function main() {
  const before = await prisma.blogPost.count();
  const { inserted, kept } = await seedBlogPosts(prisma);
  const after = await prisma.blogPost.count();
  console.log(JSON.stringify({ before, inserted, kept, after }));
  if (after !== before + inserted) {
    throw new Error(`BlogPost count ${before} + ${inserted} inserted != ${after}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

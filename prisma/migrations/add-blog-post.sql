-- ─────────────────────────────────────────────────────────────────────────────
-- add-blog-post.sql — AKTAR-MURBCJ0A-1 (yönetici blog yazıları kalıcı)
--
-- Purpose: the public blog (/tr/blog, /tr/blog/<slug>, the landing BlogSection)
-- read its posts from a module-level array in src/lib/blog.ts, and the
-- /admin/blog editor wrote into that array. A post an admin published was gone
-- after the next restart (404), and two server instances served two different
-- blogs. The posts now live in this table.
--
-- RLS: none, on purpose. A blog post is platform content shown to anonymous
-- visitors; it belongs to no tenant, so there is no tenantId to isolate on —
-- the same standing as "PublicLead", "Plan" and "SystemAlert". The table is
-- listed in SYSTEM_WIDE in scripts/rls-models.ts with that reason. Writes go
-- only through the /admin/blog actions behind requirePlatformAdmin().
--
-- No CHECK constraints: a CHECK inside CREATE TABLE IF NOT EXISTS is lost on a
-- database whose table `prisma db push` built first. Slug format and length
-- limits are enforced in src/lib/blog.ts (validateBlogInput).
--
-- RLS is DISABLEd explicitly right after CREATE TABLE (TASK-MUWDA86A7U4LK):
-- Supabase's `ensure_rls` event trigger ENABLEs it on every new table in
-- public, and RLS on with no policy is deny-all for fabrika_app. A no-op where
-- it is already off. scripts/rls-migrations.ts CHECK 4c enforces the line.
--
-- Idempotent: IF NOT EXISTS throughout, so a database built by `prisma db push`
-- first, or a second run, is a no-op. Index names are Prisma's own, so a pushed
-- database does not end up with a second copy of each index.
--
-- Content: the four launch posts are inserted by `pnpm db:seed-blog`
-- (scripts/seed-blog-posts.ts, also called from prisma/seed.ts), not here.
--
-- Rollback: prisma/migrations/add-blog-post.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "BlogPost" (
    "id"           TEXT NOT NULL,
    "slug"         TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "excerpt"      TEXT NOT NULL,
    "content"      TEXT NOT NULL,
    "category"     TEXT NOT NULL,
    "readTime"     TEXT NOT NULL,
    "publishedAt"  TIMESTAMP(3) NOT NULL,
    "authorName"   TEXT,
    "authorRole"   TEXT,
    "authorAvatar" TEXT,
    "image"        TEXT NOT NULL,
    "featured"     BOOLEAN NOT NULL DEFAULT false,
    "createdById"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "BlogPost" DISABLE ROW LEVEL SECURITY;  -- Supabase ensure_rls turns it on; this table is policy-less by design (rls-models.ts SYSTEM_WIDE)

CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE INDEX IF NOT EXISTS "BlogPost_publishedAt_idx" ON "BlogPost"("publishedAt");

-- The application role needs DML here like on every other table; default
-- privileges only cover roles that existed when prisma/rls-app-role.sql last
-- ran (same reasoning as add-public-lead.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "BlogPost" TO fabrika_app;
  END IF;
END $$;

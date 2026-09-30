/**
 * Lift `rejected:` marks off K1 embedding rows (TASK-MUO4GPRO92N97, İNCELEME-85 Y-1).
 *
 * Before the probe (src/lib/scoring/embeddings.ts), a 400 that was the request's
 * fault (model, `dimensions`, gateway) marked every row it touched as refused, up
 * to five a night, profiles first. A marked row is never sent again until its
 * text changes. This clears the marks so the next `k1-embeddings` run judges each
 * row again; a row the provider really refuses is marked again by that run, after
 * its probe. Clearing costs at most one embedding call per row (< 0.001 USD each).
 *
 *   pnpm tsx scripts/k1-embeddings-unlock-rejected.ts                       # dry run: lists what would be cleared
 *   pnpm tsx scripts/k1-embeddings-unlock-rejected.ts -- --apply            # clears them, writes a backup file first
 *   pnpm tsx scripts/k1-embeddings-unlock-rejected.ts -- --restore=<file>   # puts the backed-up marks back
 *
 * Idempotent: only rows whose hash still starts with `rejected:` are touched, so a
 * second --apply finds nothing. `Topic` has no tenant and no RLS; each
 * `TenantProfile` is written under its own tenant scope (`withTenant`), as the job
 * does. Prints ids and counts only, never profile text.
 */

import 'dotenv/config';

import fs from 'fs';
import { prisma, withTenant } from '../src/lib/db';
import { REJECTED_HASH_PREFIX } from '../src/lib/scoring/embeddings';

interface Backup {
  createdAt: string;
  topics: Array<{ id: string; embeddingHash: string }>;
  profiles: Array<{ tenantId: string; embeddingHash: string }>;
}

const LIKE = `${REJECTED_HASH_PREFIX}%`;

async function markedTopics(): Promise<Backup['topics']> {
  return prisma.$queryRaw<Backup['topics']>`
    SELECT id, "embeddingHash" FROM "Topic" WHERE "embeddingHash" LIKE ${LIKE} ORDER BY id`;
}

async function markedProfiles(): Promise<Backup['profiles']> {
  const tenants = await prisma.tenant.findMany({ where: { deletedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Backup['profiles'] = [];
  for (const { id } of tenants) {
    const rows = await withTenant(id, (tx) =>
      tx.$queryRaw<Backup['profiles']>`
        SELECT "tenantId", "embeddingHash" FROM "TenantProfile" WHERE "tenantId" = ${id} AND "embeddingHash" LIKE ${LIKE}`
    );
    out.push(...rows);
  }
  return out;
}

async function restore(file: string): Promise<void> {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8')) as Backup;
  let topics = 0;
  let profiles = 0;
  // Only rows still unmarked with no newer hash: a row re-embedded or re-marked since is left as it is.
  for (const t of backup.topics) {
    topics += await prisma.$executeRaw`
      UPDATE "Topic" SET "embeddingHash" = ${t.embeddingHash} WHERE id = ${t.id} AND "embeddingHash" IS NULL`;
  }
  for (const p of backup.profiles) {
    profiles += await withTenant(p.tenantId, (tx) =>
      tx.$executeRaw`
        UPDATE "TenantProfile" SET "embeddingHash" = ${p.embeddingHash} WHERE "tenantId" = ${p.tenantId} AND "embeddingHash" IS NULL`
    );
  }
  console.log(`RESTORE from ${file}: topics ${topics}/${backup.topics.length}, profiles ${profiles}/${backup.profiles.length} marks put back`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const restoreArg = args.find((a) => a.startsWith('--restore='));
  if (restoreArg) return restore(restoreArg.slice('--restore='.length));
  const apply = args.includes('--apply');

  const topics = await markedTopics();
  const profiles = await markedProfiles();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — marked rows: topics ${topics.length}, tenant profiles ${profiles.length}`);
  for (const t of topics) console.log(`  topic   ${t.id}`);
  for (const p of profiles) console.log(`  profile ${p.tenantId}`);

  if (!apply) {
    console.log('\nNothing changed (dry run). Re-run with -- --apply to clear the marks listed above.');
    return;
  }
  if (topics.length + profiles.length === 0) {
    console.log('\nNothing to clear.');
    return;
  }

  const file = `k1-unlock-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), topics, profiles } satisfies Backup, null, 1));
  console.log(`\nBackup written: ${file} (undo: -- --restore=${file})`);

  // Only the rows listed (and backed up) above: a mark written since is left for the next pass.
  const topicIds = topics.map((t) => t.id);
  const clearedTopics = await prisma.$executeRaw`
    UPDATE "Topic" SET "embeddingHash" = NULL WHERE id = ANY(${topicIds}::text[]) AND "embeddingHash" LIKE ${LIKE}`;
  let clearedProfiles = 0;
  for (const p of profiles) {
    clearedProfiles += await withTenant(p.tenantId, (tx) =>
      tx.$executeRaw`
        UPDATE "TenantProfile" SET "embeddingHash" = NULL WHERE "tenantId" = ${p.tenantId} AND "embeddingHash" LIKE ${LIKE}`
    );
  }
  console.log(`Cleared: topics ${clearedTopics}, tenant profiles ${clearedProfiles}. The next k1-embeddings run judges them again.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect?.();
  });

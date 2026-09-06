#!/usr/bin/env tsx
/**
 * seed-beta-feedback.ts — E11.2 demo/verification data for the triage board.
 *
 * Puts ten representative beta reports through the real submission path
 * (src/lib/feedback/submit.ts), so the priorities on the board are produced by
 * the live rule engine rather than hand-written. That is the point: it also
 * doubles as a smoke test of triage + persistence + the Sentry forward.
 *
 * Safety:
 *   - Dry run by default. Nothing is written without --apply.
 *   - Idempotent: a report is keyed by (tenantId, title). A second --apply run
 *     skips what already exists instead of duplicating it.
 *   - Reversible: --rollback deletes exactly the rows this script created,
 *     matched on the same keys. Nothing a partner filed is touched.
 *
 * Usage:
 *   pnpm tsx scripts/seed-beta-feedback.ts                 # dry run
 *   pnpm tsx scripts/seed-beta-feedback.ts --apply
 *   pnpm tsx scripts/seed-beta-feedback.ts --rollback --apply
 *   pnpm tsx scripts/seed-beta-feedback.ts --apply --tenant demo-tenant
 */

import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { submitFeedback } from '../src/lib/feedback/submit';
import { triageFeedback } from '../src/lib/feedback/triage';
import type { FeedbackCategoryValue, FeedbackImpactValue } from '../src/lib/feedback/triage';

interface Sample {
  category: FeedbackCategoryValue;
  impact: FeedbackImpactValue;
  title: string;
  body: string;
  locale: 'tr' | 'en';
  pageUrl: string;
}

/**
 * Ten reports spread across the ladder on purpose: two that the rules must
 * escalate past what the reporter chose, one that the category ceiling must
 * hold down, and the rest straightforward.
 */
const SAMPLES: Sample[] = [
  {
    category: 'BUG',
    impact: 'MINOR',
    title: '[BETA-ÖRNEK] Kaydettiğim teklif listede yok',
    body: 'Dün akşam girdiğim teklifi bugün bulamıyorum. Veri kaybı yaşandı sanırım, taslak da yok.',
    locale: 'tr',
    pageUrl: '/tr/main/pipeline',
  },
  {
    category: 'DATA_QUALITY',
    impact: 'IDEA',
    title: '[BETA-ÖRNEK] Listede tanımadığım bir kurum çıkıyor',
    body: 'Ortaklar ekranında bizim olmayan kayıtlar var. Another tenant verisi gibi duruyor, emin değilim.',
    locale: 'tr',
    pageUrl: '/tr/main/partners',
  },
  {
    category: 'BUG',
    impact: 'BLOCKER',
    title: '[BETA-ÖRNEK] Sabahtan beri giriş yapamıyorum',
    body: 'E-postamı ve şifremi giriyorum, sayfa kendine dönüyor. Ekipteki iki kişi de aynı sorunu yaşıyor.',
    locale: 'tr',
    pageUrl: '/tr/giris',
  },
  {
    category: 'BUG',
    impact: 'MAJOR',
    title: '[BETA-ÖRNEK] Konsept not dışa aktarma DOCX bozuk çıkıyor',
    body: 'İndirdiğim dosyayı Word açamıyor. PDF çalışıyor, DOCX her seferinde bozuk. Geçici çözüm yok.',
    locale: 'tr',
    pageUrl: '/tr/main/concept-notes',
  },
  {
    category: 'PERFORMANCE',
    impact: 'BLOCKER',
    title: '[BETA-ÖRNEK] Çağrı listesi çok yavaş açılıyor',
    body: 'Filtre uyguladığımda liste otuz saniyeden uzun sürüyor. Günde onlarca kez yaptığım bir işlem.',
    locale: 'tr',
    pageUrl: '/tr/main/calls',
  },
  {
    category: 'DATA_QUALITY',
    impact: 'MAJOR',
    title: '[BETA-ÖRNEK] Bütçe rakamı çağrı sayfasıyla tutmuyor',
    body: 'Fırsat kartındaki toplam bütçe ile çağrının kendi sayfasındaki rakam farklı. Hangisi doğru bilmiyoruz.',
    locale: 'tr',
    pageUrl: '/tr/main/opportunities',
  },
  {
    category: 'UX',
    impact: 'BLOCKER',
    title: '[BETA-ÖRNEK] Ayarlara nereden girileceğini bulamıyorum',
    body: 'Her seferinde menüde arıyorum. Kullanıcı menüsünde olduğunu üçüncü haftada fark ettim.',
    locale: 'tr',
    pageUrl: '/tr/main/dashboard',
  },
  {
    category: 'UX',
    impact: 'MINOR',
    title: '[BETA-SAMPLE] Date column is hard to scan',
    body: 'The deadline column shows the raw timestamp. A relative "in 12 days" would be much faster to read.',
    locale: 'en',
    pageUrl: '/en/main/calls',
  },
  {
    category: 'FEATURE_REQUEST',
    impact: 'BLOCKER',
    title: '[BETA-SAMPLE] Bulk CSV export for the whole pipeline',
    body: 'Without an export I cannot work in my own spreadsheet. Nothing works for our monthly board report.',
    locale: 'en',
    pageUrl: '/en/main/pipeline',
  },
  {
    category: 'OTHER',
    impact: 'IDEA',
    title: '[BETA-SAMPLE] A short walkthrough video would help onboarding',
    body: 'New colleagues would get going faster with a five-minute tour of the pipeline screen.',
    locale: 'en',
    pageUrl: '/en/main/dashboard',
  },
];

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const rollback = argv.includes('--rollback');
  const tenantArg = argv.find((a) => a.startsWith('--tenant='));
  const tenantFlagIndex = argv.indexOf('--tenant');
  const tenant =
    tenantArg?.split('=')[1] ??
    (tenantFlagIndex >= 0 ? argv[tenantFlagIndex + 1] : undefined) ??
    'demo-tenant';
  return { apply, rollback, tenant };
}

async function main() {
  const { apply, rollback, tenant } = parseArgs(process.argv.slice(2));
  const titles = SAMPLES.map((s) => s.title);

  const tenantRow = await prisma.tenant.findUnique({
    where: { id: tenant },
    select: { id: true, name: true },
  });
  if (!tenantRow) {
    console.error(`✗ Tenant "${tenant}" not found. Run pnpm db:seed first, or pass --tenant <id>.`);
    process.exit(1);
  }

  const existing: Array<{ id: string; title: string; priority: string }> =
    await prisma.feedback.findMany({
      where: { tenantId: tenant, title: { in: titles } },
      select: { id: true, title: true, priority: true },
    });
  const existingTitles = new Set(existing.map((r) => r.title));

  console.log(`Tenant : ${tenantRow.name} (${tenantRow.id})`);
  console.log(`Mode   : ${rollback ? 'ROLLBACK' : 'SEED'}${apply ? '' : '  [DRY RUN — nothing will be written]'}`);
  console.log('');

  if (rollback) {
    console.log(`${existing.length} seeded report(s) match and would be deleted:`);
    for (const row of existing) console.log(`  - [${row.priority}] ${row.title}`);
    if (!apply) {
      console.log('\nDry run. Re-run with --apply to delete.');
      return;
    }
    const result = await prisma.feedback.deleteMany({
      where: { tenantId: tenant, title: { in: titles } },
    });
    console.log(`\n✓ Deleted ${result.count} row(s).`);
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const sample of SAMPLES) {
    if (existingTitles.has(sample.title)) {
      skipped += 1;
      console.log(`  skip   ${sample.title}  (already seeded)`);
      continue;
    }

    if (!apply) {
      // Show what the live rules would decide, without writing anything.
      const verdict = triageFeedback({
        category: sample.category,
        impact: sample.impact,
        title: sample.title,
        body: sample.body,
      });
      console.log(`  would  [${verdict.priority}] ${sample.title}  (${verdict.reason})`);
      continue;
    }

    const result = await submitFeedback({
      tenantId: tenant,
      userId: null,
      userEmail: null,
      workspaceSlug: 'main',
      category: sample.category,
      impact: sample.impact,
      title: sample.title,
      body: sample.body,
      pageUrl: sample.pageUrl,
      userAgent: 'seed-beta-feedback.ts',
      locale: sample.locale,
    });
    created += 1;
    console.log(
      `  create [${result.priority}] ${sample.title}  (${result.triageReason}, sentry:${result.sentryStatus})`
    );
  }

  console.log('');
  if (!apply) {
    console.log('Dry run. Re-run with --apply to write these rows.');
    return;
  }
  console.log(`✓ Created ${created}, skipped ${skipped} (already present).`);
  console.log('  Rollback: pnpm tsx scripts/seed-beta-feedback.ts --rollback --apply');
}

main()
  .catch((error) => {
    console.error('✗ seed-beta-feedback failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

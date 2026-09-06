#!/usr/bin/env tsx
/**
 * run-feedback-digest.ts — run the E11.2 weekly digest on demand.
 *
 * Same code path as the Monday 06:00 UTC Inngest job, callable by hand so the
 * report can be checked before a real send and re-sent after an outage.
 *
 * Safe by default: it renders and prints the summary but does NOT send.
 * Sending requires --send, a RESEND_API_KEY and a recipient.
 *
 * Usage:
 *   pnpm tsx scripts/run-feedback-digest.ts                        # render only
 *   pnpm tsx scripts/run-feedback-digest.ts --out digest.html      # render to a file
 *   pnpm tsx scripts/run-feedback-digest.ts --send --to a@b.com    # really send
 *   pnpm tsx scripts/run-feedback-digest.ts --since 2026-08-01T00:00:00Z
 */

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { prisma } from '../src/lib/db';
import { runFeedbackDigest } from '../src/lib/feedback/digest-run';

function flag(argv: string[], name: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.split('=').slice(1).join('=');
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const send = argv.includes('--send');
  const to = flag(argv, 'to');
  const since = flag(argv, 'since');
  const out = flag(argv, 'out');

  const result = await runFeedbackDigest({
    send,
    ...(to ? { to } : {}),
    ...(since ? { sinceIso: since } : {}),
  });

  const { summary } = result;
  console.log(`Window     : ${summary.windowStart.toISOString()} → ${summary.windowEnd.toISOString()}`);
  console.log(`New        : ${summary.newCount}`);
  console.log(`Open       : ${summary.openCount}`);
  console.log(`Past SLA   : ${summary.overdueCount}`);
  console.log(
    `By priority: P0=${summary.byPriority.P0} P1=${summary.byPriority.P1} P2=${summary.byPriority.P2} P3=${summary.byPriority.P3}`
  );
  console.log(`Subject    : ${result.subject}`);
  console.log(`Recipient  : ${result.recipient ?? '(none configured)'}`);
  console.log(`Email      : ${result.emailStatus}${result.emailReason ? ` (${result.emailReason})` : ''}`);

  if (summary.overdue.length > 0) {
    console.log('\nPast SLA:');
    for (const row of summary.overdue) {
      console.log(`  [${row.priority}] ${row.title}  — ${row.tenantName}`);
    }
  }

  if (out) {
    writeFileSync(out, result.html, 'utf-8');
    console.log(`\nRendered HTML written to ${out} (${result.html.length} bytes)`);
  }

  if (!send) {
    console.log('\nRender only. Add --send (with RESEND_API_KEY and a recipient) to deliver it.');
  }
}

main()
  .catch((error) => {
    console.error('✗ run-feedback-digest failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

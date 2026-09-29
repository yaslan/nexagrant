#!/usr/bin/env tsx
/**
 * E11.1 — Beta design-partner onboarding (TASK-MTPZEESJPKGCY).
 *
 * Idempotent by construction: every write is an upsert keyed on a natural unique
 * key, so re-running the script converges on the same state instead of duplicating
 * tenants or invalidating an invitation link that was already emailed out.
 *
 * Safety model
 *   • `--dry-run` is the DEFAULT. Nothing is written and nothing is sent unless you
 *     pass `--apply` (database) and/or `--send` (email) explicitly.
 *   • `--send` refuses to run while any roster address sits on a reserved,
 *     undeliverable domain — placeholders must be replaced with real partners first.
 *   • `--rollback --apply` removes exactly what this script created. See ROLLBACK below.
 *
 * ROLLBACK
 *   pnpm tsx scripts/beta-onboarding.ts --rollback --apply
 *   Deletes the beta tenants listed in the roster (cascading their memberships,
 *   module states, invitations, workspaces and subscription) and then the roster
 *   users that no longer belong to any tenant. Emails already sent cannot be recalled.
 *
 * Usage
 *   pnpm tsx scripts/beta-onboarding.ts                       # dry run, prints the plan
 *   pnpm tsx scripts/beta-onboarding.ts --apply               # write DB, render mail to disk
 *   pnpm tsx scripts/beta-onboarding.ts --apply --send        # …and deliver via SMTP
 *   pnpm tsx scripts/beta-onboarding.ts --rollback --apply    # undo
 *
 * Flags
 *   --roster=<path>   default docs/BETA_DATA/beta-partners.csv
 *   --out=<dir>       default docs/BETA_DATA/generated
 *   --start=<date>    first check-in week, YYYY-MM-DD; snapped forward to --day
 *   --modules=<set>   `all` (E11 brief, default) or `mvp` (docs/BETA_GUIDE.md scope)
 *   --day=<1-7>       ISO weekday of the check-in, 1=Monday (default) … 7=Sunday
 *   --time=<HH:MM>    wall-clock start of the check-in, default 15:00
 *   --tz=<IANA>       zone the wall-clock time is in, default Europe/Brussels
 *
 * The programme design is not settled: the E11 brief says "every module in pilot,
 * Mondays 15:00 Brussels", while docs/BETA_GUIDE.md says "MVP modules, Thursdays
 * 14:00 Istanbul". Rather than pick for the team, both are flags:
 *   --modules=mvp --day=4 --time=14:00 --tz=Europe/Istanbul   # guide's design
 */

import 'dotenv/config';

import path from 'path';
import fs from 'fs';
import { issueSecretToken } from '../src/lib/secret-token';

import { prisma } from '../src/lib/db';
import { parseBetaRoster, isPlaceholderEmail, type BetaPartner } from '../src/lib/beta/roster';
import { renderBetaInviteEmail } from '../src/lib/beta/invite-email';
import {
  buildCheckinIcs,
  buildCheckinSchedule,
  firstWeekdayOnOrAfter,
  DEFAULT_CHECKIN_SLOT,
  type CheckinOccurrence,
  type CheckinSlot,
} from '../src/lib/beta/checkin-schedule';
import {
  BETA_APP_URL,
  BETA_CHECKIN_WEEKS,
  BETA_MODULE_SETS,
  BETA_PLAN_ID,
  BETA_SUPPORT_EMAIL,
  type BetaModuleSet,
} from '../src/lib/beta/constants';
import { getManifest } from '../src/lib/modules/registry';
import type { ModuleId } from '../src/lib/modules/types';

const ACTOR = 'beta-onboarding-cli';
const REPO_ROOT = path.resolve(__dirname, '..');

interface Options {
  roster: string;
  out: string;
  start: string;
  apply: boolean;
  send: boolean;
  rollback: boolean;
  moduleSet: BetaModuleSet;
  slot: CheckinSlot;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    roster: path.join(REPO_ROOT, 'docs/BETA_DATA/beta-partners.csv'),
    out: path.join(REPO_ROOT, 'docs/BETA_DATA/generated'),
    start: new Date().toISOString().slice(0, 10),
    apply: false,
    send: false,
    rollback: false,
    moduleSet: 'all',
    slot: { ...DEFAULT_CHECKIN_SLOT },
  };

  for (const arg of argv) {
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--send') opts.send = true;
    else if (arg === '--rollback') opts.rollback = true;
    else if (arg === '--dry-run') opts.apply = false;
    else if (arg.startsWith('--roster=')) opts.roster = path.resolve(arg.slice('--roster='.length));
    else if (arg.startsWith('--out=')) opts.out = path.resolve(arg.slice('--out='.length));
    else if (arg.startsWith('--start=')) opts.start = arg.slice('--start='.length);
    else if (arg.startsWith('--modules=')) {
      const value = arg.slice('--modules='.length);
      if (!(value in BETA_MODULE_SETS)) {
        throw new Error(`--modules must be one of ${Object.keys(BETA_MODULE_SETS).join(', ')}`);
      }
      opts.moduleSet = value as BetaModuleSet;
    } else if (arg.startsWith('--day=')) {
      const day = Number(arg.slice('--day='.length));
      if (!Number.isInteger(day) || day < 1 || day > 7) {
        throw new Error('--day must be an ISO weekday, 1 (Monday) … 7 (Sunday)');
      }
      opts.slot.weekday = day;
    } else if (arg.startsWith('--time=')) {
      const match = /^(\d{1,2}):(\d{2})$/.exec(arg.slice('--time='.length));
      if (!match?.[1] || !match[2]) throw new Error('--time must look like HH:MM');
      opts.slot.hour = Number(match[1]);
      opts.slot.minute = Number(match[2]);
      if (opts.slot.hour > 23 || opts.slot.minute > 59) throw new Error('--time is out of range');
    } else if (arg.startsWith('--tz=')) {
      const tz = arg.slice('--tz='.length);
      // Throws RangeError on an unknown zone — fail here, not eight weeks later.
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      opts.slot.timezone = tz;
    } else throw new Error(`Unknown flag "${arg}". Run with no flags for a dry run.`);
  }
  return opts;
}

const log = (step: string, message: string) => console.log(`[beta-onboarding] ${step.padEnd(18)} ${message}`);

/** Check-in date rendered for the recipient, e.g. "7 Eylül 2026 Pazartesi, 15:00". */
function formatCheckinLabel(occ: CheckinOccurrence, locale: 'tr' | 'en', timezone: string): string {
  const formatted = new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(occ.start);
  return formatted;
}

/**
 * Beta grants every module in `pilot`. Order matters: `requires[]` must already be
 * pilot/on before a dependent module flips, mirroring `updateTenantModuleStatus`.
 */
function assertDependencyOrder(moduleIds: readonly ModuleId[]): void {
  const granted: ModuleId[] = [];
  for (const id of moduleIds) {
    const manifest = getManifest(id);
    const missing = manifest.requires.filter((req) => !granted.includes(req));
    if (missing.length > 0) {
      throw new Error(
        `Module set is not dependency-safe: ${id} needs ${missing.join(', ')} granted first`
      );
    }
    granted.push(id);
  }
}

async function applyPartner(
  partner: BetaPartner,
  betaEndsAt: Date,
  moduleIds: readonly ModuleId[]
): Promise<{ tenantId: string; userId: string; inviteToken: string | null; modulesPilot: number }> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: partner.slug },
    update: {
      name: partner.orgName,
      country: partner.country,
      orgType: partner.orgType,
      locale: partner.locale,
      timezone: partner.timezone,
    },
    create: {
      name: partner.orgName,
      slug: partner.slug,
      country: partner.country,
      orgType: partner.orgType,
      locale: partner.locale,
      timezone: partner.timezone,
      settings: { betaCohort: 'E11', segment: partner.segment },
    },
  });

  const user = await prisma.user.upsert({
    where: { email: partner.contactEmail },
    update: { name: partner.contactName, locale: partner.locale },
    create: { email: partner.contactEmail, name: partner.contactName, locale: partner.locale },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { role: 'TENANT_OWNER' },
    create: { tenantId: tenant.id, userId: user.id, role: 'TENANT_OWNER', workspaceIds: [] },
  });

  await prisma.workspace.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'default' } },
    update: { name: partner.orgName },
    create: { tenantId: tenant.id, slug: 'default', name: partner.orgName },
  });

  // Enterprise tier so no module is blocked by a plan boundary during the beta.
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: { planId: BETA_PLAN_ID, status: 'TRIALING', trialEndsAt: betaEndsAt },
    create: {
      tenantId: tenant.id,
      planId: BETA_PLAN_ID,
      status: 'TRIALING',
      billingInterval: 'month',
      provider: 'stripe',
      trialEndsAt: betaEndsAt,
    },
  });

  // Keep an already-issued token: re-running must not break a link we mailed out.
  // Only its hash is stored (TASK-MULQLL2T8ZJX4), so a re-run cannot print that
  // link again: `inviteToken` is null for a partner who already has one, and the
  // caller skips rendering and sending their mail.
  const existingInvite = await prisma.invitation.findUnique({
    where: { email_tenantId: { email: partner.contactEmail, tenantId: tenant.id } },
    select: { id: true },
  });
  let inviteToken: string | null = null;
  if (existingInvite) {
    await prisma.invitation.update({
      where: { id: existingInvite.id },
      data: { role: 'TENANT_OWNER', expires: betaEndsAt },
    });
  } else {
    const issued = issueSecretToken();
    await prisma.invitation.create({
      data: {
        email: partner.contactEmail,
        tenantId: tenant.id,
        role: 'TENANT_OWNER',
        tokenHash: issued.hash,
        expires: betaEndsAt,
      },
    });
    inviteToken = issued.raw;
  }

  let modulesPilot = 0;
  for (const moduleId of moduleIds) {
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: tenant.id, moduleId } },
      update: { status: 'PILOT', changedBy: ACTOR, changedAt: new Date() },
      create: { tenantId: tenant.id, moduleId, status: 'PILOT', changedBy: ACTOR },
    });
    modulesPilot += 1;
  }

  await prisma.auditEvent.create({
    data: {
      tenantId: tenant.id,
      actorId: ACTOR,
      type: 'beta.onboarding.applied',
      target: partner.slug,
      data: { cohort: 'E11', modulesPilot, plan: BETA_PLAN_ID, locale: partner.locale },
    },
  });

  return { tenantId: tenant.id, userId: user.id, inviteToken, modulesPilot };
}

async function rollback(partners: BetaPartner[], apply: boolean): Promise<void> {
  for (const partner of partners) {
    const tenant = await prisma.tenant.findUnique({ where: { slug: partner.slug } });
    if (!tenant) {
      log('rollback', `${partner.slug}: no tenant, nothing to remove`);
      continue;
    }
    if (!apply) {
      log('rollback', `${partner.slug}: WOULD delete tenant ${tenant.id} (cascade) — dry run`);
      continue;
    }
    // Tenant relations cascade on delete (membership, moduleState, invitation, workspace…).
    await prisma.tenant.delete({ where: { id: tenant.id } });
    const user = await prisma.user.findUnique({
      where: { email: partner.contactEmail },
      include: { memberships: true },
    });
    if (user && user.memberships.length === 0) {
      await prisma.user.delete({ where: { id: user.id } });
      log('rollback', `${partner.slug}: tenant + orphaned user removed`);
    } else {
      log('rollback', `${partner.slug}: tenant removed, user kept (still a member elsewhere)`);
    }
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const mode = opts.rollback ? 'ROLLBACK' : 'ONBOARD';
  log('mode', `${mode} · db=${opts.apply ? 'APPLY' : 'DRY-RUN'} · email=${opts.send ? 'SEND' : 'RENDER-ONLY'}`);

  const moduleIds: readonly ModuleId[] = BETA_MODULE_SETS[opts.moduleSet];
  assertDependencyOrder(moduleIds);
  log('modules', `set "${opts.moduleSet}" → ${moduleIds.length} modules PILOT (${moduleIds.join(', ')})`);
  const csv = fs.readFileSync(opts.roster, 'utf8');
  const partners = parseBetaRoster(csv);
  log('roster', `${partners.length} design partners from ${path.relative(REPO_ROOT, opts.roster)}`);

  if (opts.rollback) {
    await rollback(partners, opts.apply);
    log('done', opts.apply ? 'rollback applied' : 'rollback dry run — pass --apply to execute');
    return;
  }

  const placeholders = partners.filter((p) => isPlaceholderEmail(p.contactEmail));
  if (opts.send && placeholders.length > 0) {
    throw new Error(
      `Refusing --send: ${placeholders.length} roster address(es) are on reserved, undeliverable domains ` +
        `(${placeholders.map((p) => p.contactEmail).join(', ')}). Replace them with the real design partners first.`
    );
  }

  const startDate = firstWeekdayOnOrAfter(opts.start, opts.slot.weekday);
  const schedule = buildCheckinSchedule(startDate, BETA_CHECKIN_WEEKS, opts.slot);
  const firstCheckin = schedule[0];
  const lastCheckin = schedule[schedule.length - 1];
  if (!firstCheckin || !lastCheckin) throw new Error('Check-in schedule is empty');
  const betaEndsAt = new Date(lastCheckin.end.getTime() + 7 * 24 * 3600_000);
  const weekdayName = new Intl.DateTimeFormat('en-GB', {
    timeZone: opts.slot.timezone,
    weekday: 'long',
  }).format(firstCheckin.start);
  log(
    'schedule',
    `${schedule.length} check-ins, ${firstCheckin.localDate} → ${lastCheckin.localDate}, ` +
      `${weekdayName}s ${firstCheckin.localTime} ${opts.slot.timezone}`
  );
  for (const occ of schedule) {
    log('  check-in', `W${occ.week} ${occ.localDate} ${occ.localTime} (UTC${occ.utcOffset}) → ${occ.start.toISOString()}`);
  }

  fs.mkdirSync(path.join(opts.out, 'invites'), { recursive: true });
  fs.mkdirSync(path.join(opts.out, 'calendar'), { recursive: true });

  // One calendar for the whole cohort, plus a per-partner file for individual sends.
  const cohortIcs = buildCheckinIcs(schedule, {
    organizerEmail: BETA_SUPPORT_EMAIL,
    attendees: partners.map((p) => p.contactEmail),
    timezone: opts.slot.timezone,
  });
  fs.writeFileSync(path.join(opts.out, 'calendar', 'beta-checkins-all.ics'), cohortIcs, 'utf8');

  const summary: Array<Record<string, string | number>> = [];

  for (const partner of partners) {
    let tenantId = '(dry-run)';
    let inviteToken: string | null = 'DRY-RUN-TOKEN';
    let modulesPilot: number = moduleIds.length;

    if (opts.apply) {
      const result = await applyPartner(partner, betaEndsAt, moduleIds);
      tenantId = result.tenantId;
      inviteToken = result.inviteToken;
      modulesPilot = result.modulesPilot;
      log('db', `${partner.slug}: tenant ${tenantId}, owner ${partner.contactEmail}, ${modulesPilot} modules PILOT`);
      if (inviteToken === null) {
        // The link already went out and only its hash is kept; there is nothing
        // to render. To issue a new link, delete the invitation and re-run.
        log('email', `${partner.contactEmail}: invitation already issued — mail not re-rendered or re-sent`);
        summary.push({
          slug: partner.slug,
          org: partner.orgName,
          email: partner.contactEmail,
          locale: partner.locale,
          tenantId,
          modulesPilot,
          delivery: 'already-invited',
        });
        continue;
      }
    } else {
      log('db', `${partner.slug}: WOULD upsert tenant + owner + ${modulesPilot} PILOT module states — dry run`);
    }

    const email = renderBetaInviteEmail({
      locale: partner.locale,
      contactName: partner.contactName,
      orgName: partner.orgName,
      inviteUrl: `${BETA_APP_URL}/${partner.locale}/invite/${inviteToken}`,
      firstCheckinLabel: formatCheckinLabel(firstCheckin, partner.locale, opts.slot.timezone),
      guideUrl: `${BETA_APP_URL}/${partner.locale}/beta/guide`,
      feedbackFormUrl: `${BETA_APP_URL}/beta/feedback`,
    });

    fs.writeFileSync(path.join(opts.out, 'invites', `${partner.slug}.html`), email.html, 'utf8');
    fs.writeFileSync(
      path.join(opts.out, 'invites', `${partner.slug}.txt`),
      `Subject: ${email.subject}\nTo: ${partner.contactName} <${partner.contactEmail}>\n\n${email.text}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(opts.out, 'calendar', `${partner.slug}.ics`),
      buildCheckinIcs(schedule, {
        organizerEmail: BETA_SUPPORT_EMAIL,
        attendees: [partner.contactEmail],
        timezone: opts.slot.timezone,
      }),
      'utf8'
    );

    let delivery = 'rendered-only';
    if (opts.send) {
      const { smtpConfigFromEnv, createSmtpTransport, sendMail } = await import('../src/lib/email/mailer');
      const smtp = smtpConfigFromEnv();
      if (!smtp) throw new Error('--send requires SMTP_HOST in the environment');
      await sendMail(createSmtpTransport(smtp), smtp, {
        from: process.env.SMTP_FROM || `Fabrika Beta <${BETA_SUPPORT_EMAIL}>`,
        to: partner.contactEmail,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: [
          {
            filename: 'fabrika-beta-checkins.ics',
            content: Buffer.from(
              buildCheckinIcs(schedule, {
                organizerEmail: BETA_SUPPORT_EMAIL,
                attendees: [partner.contactEmail],
                timezone: opts.slot.timezone,
              })
            ),
            contentType: 'text/calendar',
          },
        ],
      }).catch((error: unknown) => {
        throw new Error(`SMTP rejected ${partner.contactEmail}: ${error instanceof Error ? error.message : error}`);
      });
      delivery = 'sent';
      log('email', `${partner.contactEmail}: sent (${partner.locale})`);
    } else {
      log('email', `${partner.contactEmail}: rendered to invites/${partner.slug}.html (${partner.locale}) — not sent`);
    }

    summary.push({
      slug: partner.slug,
      org: partner.orgName,
      email: partner.contactEmail,
      locale: partner.locale,
      tenantId,
      modulesPilot,
      delivery,
    });
  }

  fs.writeFileSync(
    path.join(opts.out, 'onboarding-summary.json'),
    JSON.stringify(
      {
        cohort: 'E11',
        generatedAt: new Date().toISOString(),
        mode: opts.apply ? 'apply' : 'dry-run',
        emailMode: opts.send ? 'send' : 'render-only',
        moduleSet: opts.moduleSet,
        modules: moduleIds,
        checkinTimezone: opts.slot.timezone,
        checkinLocalTime: `${String(opts.slot.hour).padStart(2, '0')}:${String(opts.slot.minute).padStart(2, '0')}`,
        betaEndsAt: betaEndsAt.toISOString(),
        schedule: schedule.map((o) => ({
          week: o.week,
          localDate: o.localDate,
          localTime: o.localTime,
          utcOffset: o.utcOffset,
          startUtc: o.start.toISOString(),
          uid: o.uid,
        })),
        partners: summary,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  log('artifacts', `written to ${path.relative(REPO_ROOT, opts.out)}/`);
  log('done', opts.apply ? 'onboarding applied' : 'dry run complete — pass --apply to write to the database');
}

main()
  .catch((error: unknown) => {
    console.error('[beta-onboarding] FAILED:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

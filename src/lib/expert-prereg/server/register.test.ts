import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { Mailer, MailMessage } from '@/lib/email/mailer';
import { MailSendError } from '@/lib/email/mailer';
import {
  ATTEMPT_RETENTION_MS,
  EXPERT_PREREG_CONSENT_VERSION,
  EXPERT_PREREG_DAILY_MAIL_LIMIT,
  IP_WINDOW_MS,
  MAIL_DAY_MS,
  REGISTRATION_IP_LIMIT,
  RESEND_COOLDOWN_MS,
  VERIFY_TOKEN_TTL_MS,
} from './constants';
import { expertPreRegIpSalt, hashExpertIp, registerExpertPreRegistration } from './register';

const NOW = new Date('2026-10-17T10:00:00.000Z');
const SALT = 'unit-test-salt-0123456789abcdef0123';
const IP = '203.0.113.7';
const BASE = 'http://localhost:3000';

const valid = {
  fullName: 'Ayşe Yılmaz',
  email: 'Ayse@Example.org',
  province: '34',
  title: 'Proje Yöneticisi',
  organization: 'Ankara Kalkınma Ajansı',
  isFreelancer: true,
  expertiseAreas: ['digital-ict'],
  roles: ['project-manager'],
  programmes: ['erasmus-plus'],
  languages: ['tr', 'en'],
  kvkkAccepted: true,
  visibilityConsent: true,
  locale: 'tr',
};

type Row = Record<string, unknown> & { id: string; email: string; ipHash: string | null; createdAt: Date };
type Attempt = { id: string; ipHash: string | null; createdAt: Date };

/** An in-memory stand-in for the calls the register path makes, inside a transaction. */
function fakeDb(seed: Row[] = [], attemptSeed: Attempt[] = []) {
  const rows: Row[] = [...seed];
  const attempts: Attempt[] = [...attemptSeed];
  let nextId = 1;
  const attemptDelegate = {
    count: vi.fn(async ({ where }: { where: { ipHash?: string; createdAt?: { gte?: Date; lt?: Date } } }) =>
      attempts.filter(
        (a) =>
          (where.ipHash === undefined || a.ipHash === where.ipHash) &&
          (where.createdAt?.gte === undefined || a.createdAt >= where.createdAt.gte)
      ).length
    ),
    create: vi.fn(async ({ data }: { data: { ipHash: string; createdAt?: Date } }) => {
      attempts.push({ id: `attempt-${attempts.length + 1}`, ipHash: data.ipHash, createdAt: data.createdAt ?? NOW });
      return {};
    }),
    deleteMany: vi.fn(async ({ where }: { where: { createdAt: { lt: Date } } }) => {
      const kept = attempts.filter((a) => a.createdAt >= where.createdAt.lt);
      const count = attempts.length - kept.length;
      attempts.splice(0, attempts.length, ...kept);
      return { count };
    }),
  };
  const delegate = {
    count: vi.fn(async ({ where }: { where: { ipHash?: string; createdAt?: { gte: Date } } }) =>
      rows.filter(
        (r) =>
          (where.ipHash === undefined || r.ipHash === where.ipHash) &&
          (where.createdAt === undefined || r.createdAt >= where.createdAt.gte)
      ).length
    ),
    // A copy, as Prisma returns: the caller must not see later writes through it.
    findUnique: vi.fn(async ({ where }: { where: { email: string } }) => {
      const row = rows.find((r) => r.email === where.email);
      return row ? { ...row } : null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `row-${nextId++}`, ...data } as Row;
      rows.push(row);
      return { id: row.id };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return { id: row.id };
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const index = rows.findIndex((r) => r.id === where.id);
      if (index === -1) throw new Error('not found');
      rows.splice(index, 1);
      return {};
    }),
  };
  const tx = { $executeRaw: vi.fn(async () => 0), expertPreRegistration: delegate, expertPreRegAttempt: attemptDelegate };
  const db = {
    $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
    expertPreRegistration: delegate,
    expertPreRegAttempt: attemptDelegate,
  } as unknown as PrismaClient;
  return { db, rows, delegate, attempts, attemptDelegate };
}

/** The attempt rows held for one IP, as the window counts them. */
async function attemptCount(db: PrismaClient, ip: string): Promise<number> {
  return db.expertPreRegAttempt.count({ where: { ipHash: hashExpertIp(ip, SALT) ?? '', createdAt: { gte: new Date(NOW.getTime() - IP_WINDOW_MS) } } });
}

function recordingMailer() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = vi.fn(async (message: MailMessage) => {
    sent.push(message);
  });
  return { mailer, sent };
}

/** The raw token is the only place it exists: read it back out of the mail. */
function tokenFromMail(message: MailMessage): string {
  const match = message.text?.match(/token=([0-9a-f]{64})/);
  if (!match) throw new Error('no token in mail');
  return match[1]!;
}

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

describe('registerExpertPreRegistration', () => {
  it('drops a honeypot submission with the same 201 and writes nothing', async () => {
    const { db, rows } = fakeDb();
    const { mailer, sent } = recordingMailer();
    const result = await registerExpertPreRegistration({ ...valid, website: 'http://spam.example' }, {
      db,
      mailer,
      baseUrl: BASE,
      now: NOW,
      ip: IP,
      salt: SALT,
    });
    expect(result).toEqual({ kind: 'created' });
    expect(rows).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('refuses an invalid submission with field codes and writes nothing', async () => {
    const { db, rows } = fakeDb();
    const { mailer } = recordingMailer();
    const result = await registerExpertPreRegistration({ ...valid, email: 'nope', kvkkAccepted: false }, {
      db,
      mailer,
      baseUrl: BASE,
      now: NOW,
    });
    expect(result).toEqual({ kind: 'invalid', errors: { email: 'invalid_email', kvkkAccepted: 'consent_required' } });
    expect(rows).toHaveLength(0);
    expect(mailer).not.toHaveBeenCalled();
  });

  it('answers 503 and writes nothing when no mail can go out', async () => {
    const { db, rows } = fakeDb();
    const result = await registerExpertPreRegistration(valid, { db, mailer: null, baseUrl: BASE, now: NOW });
    expect(result).toEqual({ kind: 'unavailable', error: 'mail_unavailable' });
    expect(rows).toHaveLength(0);
  });

  it('writes one pending row with a hashed token, a hashed IP and server-stamped consent', async () => {
    const { db, rows } = fakeDb();
    const { mailer, sent } = recordingMailer();
    const result = await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: IP, salt: SALT });

    expect(result).toEqual({ kind: 'created' });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.email).toBe('ayse@example.org');
    expect(row.status).toBe('pending');
    expect(row.consentTextVersion).toBe(EXPERT_PREREG_CONSENT_VERSION);
    expect(row.kvkkAcceptedAt).toEqual(NOW);
    expect(row.visibilityConsentAt).toEqual(NOW);
    expect(row.marketingConsentAt).toBeNull();
    expect(row.locale).toBe('tr');

    // The raw token is in the mail; the database holds only its hash.
    const token = tokenFromMail(sent[0]!);
    expect(row.verifyTokenHash).toBe(sha256(token));
    expect(JSON.stringify(row)).not.toContain(token);

    // The raw IP is nowhere in the row; only the keyed hash is.
    expect(row.ipHash).toBe(hashExpertIp(IP, SALT));
    expect(JSON.stringify(row)).not.toContain(IP);
  });

  it('refuses a registration of a verified e-mail with 409 and sends no mail', async () => {
    const verified = {
      id: 'done',
      email: 'ayse@example.org',
      ipHash: null,
      createdAt: NOW,
      status: 'verified',
      emailVerifiedAt: NOW,
      founderNumber: 1,
      verifyTokenHash: null,
      verifyTokenExpiresAt: null,
    } as Row;
    const { db, rows } = fakeDb([verified]);
    const { mailer, sent } = recordingMailer();
    const result = await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: null, salt: null });
    expect(result).toEqual({ kind: 'duplicate' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'verified', founderNumber: 1 });
    expect(sent).toHaveLength(0);
  });

  it('answers 429 to a second registration of a pending e-mail inside the cooldown, and sends no mail', async () => {
    const { db, rows } = fakeDb();
    const { mailer, sent } = recordingMailer();
    await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: null, salt: null });
    const again = await registerExpertPreRegistration(
      { ...valid, email: 'AYSE@example.org' },
      { db, mailer, baseUrl: BASE, now: new Date(NOW.getTime() + RESEND_COOLDOWN_MS - 1_000), ip: null, salt: null }
    );
    expect(again).toEqual({ kind: 'rate_limited' });
    expect(rows).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('re-issues the link for a pending e-mail after the cooldown: 201, one row, the old link stops working', async () => {
    const { db, rows } = fakeDb();
    const { mailer, sent } = recordingMailer();
    await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: null, salt: null });
    const firstToken = tokenFromMail(sent[0]!);
    const later = new Date(NOW.getTime() + RESEND_COOLDOWN_MS + 1_000);

    const again = await registerExpertPreRegistration(
      { ...valid, email: 'AYSE@example.org', title: 'Yeni Unvan' },
      { db, mailer, baseUrl: BASE, now: later, ip: null, salt: null }
    );

    expect(again).toEqual({ kind: 'created' });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    // F6: the profile is the one first entered. The first registration time stays; the last submission is what the cooldown reads.
    expect(row).toMatchObject({ status: 'pending', title: valid.title, createdAt: NOW, lastSubmittedAt: later });
    expect(row.verifyTokenExpiresAt).toEqual(new Date(later.getTime() + VERIFY_TOKEN_TTL_MS));
    const secondToken = tokenFromMail(sent[1]!);
    expect(secondToken).not.toBe(firstToken);
    expect(row.verifyTokenHash).toBe(sha256(secondToken));
    expect(row.verifyTokenHash).not.toBe(sha256(firstToken));
  });

  it('counts a re-issued registration toward the IP window through its attempt row, not createdAt', async () => {
    const stale = {
      id: 'pending-1',
      email: 'ayse@example.org',
      ipHash: hashExpertIp('198.51.100.9', SALT),
      createdAt: new Date(NOW.getTime() - IP_WINDOW_MS - 1_000),
      status: 'pending',
      emailVerifiedAt: null,
      fullName: valid.fullName,
      locale: 'tr',
      verifyMailCount: 1,
      verifyMailWindowStart: null,
      verifyTokenHash: sha256('old'),
      verifyTokenExpiresAt: new Date(NOW.getTime() - IP_WINDOW_MS - 1_000 + VERIFY_TOKEN_TTL_MS),
    } as Row;
    const { db, rows } = fakeDb([stale]);
    const { mailer } = recordingMailer();
    const result = await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: IP, salt: SALT });
    expect(result).toEqual({ kind: 'created' });
    expect(rows[0]).toMatchObject({ createdAt: new Date(NOW.getTime() - IP_WINDOW_MS - 1_000), ipHash: hashExpertIp(IP, SALT), lastSubmittedAt: NOW });
    expect(await attemptCount(db, IP)).toBe(1);
  });

  it('writes the first registration with createdAt and lastSubmittedAt both at this attempt', async () => {
    const { db, rows } = fakeDb();
    const { mailer } = recordingMailer();
    await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: IP, salt: SALT });
    expect(rows[0]).toMatchObject({ createdAt: NOW, lastSubmittedAt: NOW });
    // The row itself is the count for this submission: no attempt row is written for a new registration.
    expect(await attemptCount(db, IP)).toBe(0);
  });

  it('writes an attempt row for a 409 on a verified address and sends no mail', async () => {
    const verified = {
      id: 'done',
      email: 'ayse@example.org',
      ipHash: null,
      createdAt: NOW,
      status: 'verified',
      founderNumber: 1,
      verifyTokenHash: null,
      verifyTokenExpiresAt: null,
      lastSubmittedAt: null,
    } as Row;
    const { db, attempts } = fakeDb([verified]);
    const { mailer, sent } = recordingMailer();
    const result = await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: IP, salt: SALT });
    expect(result).toEqual({ kind: 'duplicate' });
    expect(sent).toHaveLength(0);
    expect(attempts).toEqual([expect.objectContaining({ ipHash: hashExpertIp(IP, SALT), createdAt: NOW })]);
  });

  it('answers 429 from the sixth submission of one IP to a verified address, though none of them creates a row', async () => {
    const verified = {
      id: 'done',
      email: 'ayse@example.org',
      ipHash: null,
      createdAt: NOW,
      status: 'verified',
      founderNumber: 1,
      verifyTokenHash: null,
      verifyTokenExpiresAt: null,
      lastSubmittedAt: null,
    } as Row;
    const { db, attempts } = fakeDb([verified]);
    const { mailer } = recordingMailer();
    const attempt = () => registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: IP, salt: SALT });
    for (let i = 0; i < REGISTRATION_IP_LIMIT; i++) expect(await attempt()).toEqual({ kind: 'duplicate' });
    expect(attempts).toHaveLength(REGISTRATION_IP_LIMIT);
    expect(await attempt()).toEqual({ kind: 'rate_limited' });
    expect(attempts).toHaveLength(REGISTRATION_IP_LIMIT);
  });

  it('keeps no attempt row older than 24 hours: each submission deletes the expired ones', async () => {
    const old = { id: 'attempt-old', ipHash: hashExpertIp('198.51.100.9', SALT), createdAt: new Date(NOW.getTime() - ATTEMPT_RETENTION_MS - 1_000) };
    const recentAt = new Date(NOW.getTime() - 60_000);
    const recent = { id: 'attempt-recent', ipHash: hashExpertIp('198.51.100.9', SALT), createdAt: recentAt };
    const { db, attempts } = fakeDb([], [old, recent]);
    const { mailer } = recordingMailer();
    await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: IP, salt: SALT });
    expect(attempts.map((a) => a.id)).toEqual(['attempt-recent']);
  });

  it('lets the cooldown read lastSubmittedAt, not the link issue time, when the two differ', async () => {
    // The link was issued 2 hours ago (verifyTokenExpiresAt − TTL is far outside the
    // cooldown), but the last submission was 1 minute ago. Only lastSubmittedAt gates.
    const linkIssuedAt = NOW.getTime() - 2 * 60 * 60_000;
    const lastSubmittedAt = new Date(NOW.getTime() - 60_000);
    const pendingRow = {
      id: 'pending-cooldown',
      email: 'ayse@example.org',
      ipHash: null,
      createdAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60_000),
      lastSubmittedAt,
      status: 'pending',
      emailVerifiedAt: null,
      fullName: valid.fullName,
      locale: 'tr',
      verifyTokenHash: sha256('old-token'),
      verifyTokenExpiresAt: new Date(linkIssuedAt + VERIFY_TOKEN_TTL_MS),
      verifyMailCount: 1,
      verifyMailWindowStart: new Date(linkIssuedAt),
    } as Row;
    expect(NOW.getTime() - linkIssuedAt).toBeGreaterThan(RESEND_COOLDOWN_MS);
    const { db, rows } = fakeDb([pendingRow]);
    const { mailer, sent } = recordingMailer();
    const tooSoon = await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: null, salt: null });
    expect(tooSoon).toEqual({ kind: 'rate_limited' });
    expect(sent).toHaveLength(0);
    expect(rows[0]).toMatchObject({ lastSubmittedAt, verifyTokenHash: sha256('old-token') });
  });

  it('puts the previous link back when the re-issued mail cannot be sent', async () => {
    const oldHash = sha256('old-token');
    // Issued just outside the cooldown, so the re-issue is allowed and then fails at the mail.
    const issuedAt = NOW.getTime() - RESEND_COOLDOWN_MS - 1_000;
    const oldExpires = new Date(issuedAt + VERIFY_TOKEN_TTL_MS);
    const pendingRow = {
      id: 'pending-2',
      email: 'ayse@example.org',
      ipHash: null,
      createdAt: new Date(issuedAt),
      status: 'pending',
      emailVerifiedAt: null,
      verifyTokenHash: oldHash,
      verifyTokenExpiresAt: oldExpires,
    } as Row;
    const { db, rows } = fakeDb([pendingRow]);
    const failing: Mailer = vi.fn(async () => {
      throw new MailSendError('ECONNECTION', null);
    });
    const result = await registerExpertPreRegistration(valid, { db, mailer: failing, baseUrl: BASE, now: NOW, ip: null, salt: null });
    expect(result).toEqual({ kind: 'unavailable', error: 'mail_failed' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ verifyTokenHash: oldHash, verifyTokenExpiresAt: oldExpires });
  });

  it('keeps the first registration row when a re-issue mail fails: the expert keeps the old link', async () => {
    const { db, rows } = fakeDb();
    const { mailer, sent } = recordingMailer();
    await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: null, salt: null });
    const firstToken = tokenFromMail(sent[0]!);
    const failing: Mailer = vi.fn(async () => {
      throw new MailSendError('ECONNECTION', null);
    });
    const later = new Date(NOW.getTime() + RESEND_COOLDOWN_MS + 1_000);
    const result = await registerExpertPreRegistration(valid, { db, mailer: failing, baseUrl: BASE, now: later, ip: null, salt: null });
    expect(result).toEqual({ kind: 'unavailable', error: 'mail_failed' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.verifyTokenHash).toBe(sha256(firstToken));
  });

  it('answers 429 from the sixth registration of one IP inside the window', async () => {
    const seeded: Row[] = Array.from({ length: REGISTRATION_IP_LIMIT }, (_, i) => ({
      id: `seed-${i}`,
      email: `seed${i}@example.org`,
      ipHash: hashExpertIp(IP, SALT),
      createdAt: new Date(NOW.getTime() - 60_000),
    })) as Row[];
    const { db, rows } = fakeDb(seeded);
    const { mailer } = recordingMailer();
    const result = await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: IP, salt: SALT });
    expect(result).toEqual({ kind: 'rate_limited' });
    expect(rows).toHaveLength(REGISTRATION_IP_LIMIT);
  });

  it('lets the same IP register again once its window has passed', async () => {
    const seeded: Row[] = Array.from({ length: REGISTRATION_IP_LIMIT }, (_, i) => ({
      id: `seed-${i}`,
      email: `seed${i}@example.org`,
      ipHash: hashExpertIp(IP, SALT),
      createdAt: new Date(NOW.getTime() - IP_WINDOW_MS - 1_000),
    })) as Row[];
    const { db } = fakeDb(seeded);
    const { mailer } = recordingMailer();
    const result = await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: IP, salt: SALT });
    expect(result).toEqual({ kind: 'created' });
  });

  it('removes the row again when the mail cannot be sent, so the expert can register again', async () => {
    const { db, rows } = fakeDb();
    const failing: Mailer = vi.fn(async () => {
      throw new MailSendError('ECONNECTION', null);
    });
    const result = await registerExpertPreRegistration(valid, { db, mailer: failing, baseUrl: BASE, now: NOW });
    expect(result).toEqual({ kind: 'unavailable', error: 'mail_failed' });
    expect(rows).toHaveLength(0);
  });
});

describe('FO-45 · pending re-issue, daily mail quota, AUTH_SECRET key', () => {
  it('keeps the profile and the consents of a pending row when it registers again (F6 / crw2 MINOR-A)', async () => {
    const { db, rows } = fakeDb();
    const { mailer, sent } = recordingMailer();
    await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: null, salt: null });
    const later = new Date(NOW.getTime() + RESEND_COOLDOWN_MS + 1_000);

    const again = await registerExpertPreRegistration(
      { ...valid, fullName: 'Başka İsim', title: 'Yeni Unvan', marketingConsent: true, locale: 'en' },
      { db, mailer, baseUrl: BASE, now: later, ip: null, salt: null }
    );

    expect(again).toEqual({ kind: 'created' });
    expect(rows[0]).toMatchObject({
      fullName: valid.fullName,
      title: valid.title,
      locale: 'tr',
      kvkkAcceptedAt: NOW,
      visibilityConsentAt: NOW,
      marketingConsentAt: null,
    });
    // The new link works: the mail went out and carries the stored name and language.
    expect(sent).toHaveLength(2);
    expect(sent[1]!.subject).toBe(sent[0]!.subject);
    expect(sha256(tokenFromMail(sent[1]!))).toBe(rows[0]!.verifyTokenHash);
  });

  it('answers 429 to the fourth mail to one address in a day, and opens a new window the next day (F5)', async () => {
    const { db, rows } = fakeDb();
    const { mailer, sent } = recordingMailer();
    const gap = RESEND_COOLDOWN_MS + 1_000;
    const attempt = (offset: number) =>
      registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: new Date(NOW.getTime() + offset), ip: null, salt: null });

    expect(await attempt(0)).toEqual({ kind: 'created' });
    expect(await attempt(gap)).toEqual({ kind: 'created' });
    expect(await attempt(2 * gap)).toEqual({ kind: 'created' });
    expect(await attempt(3 * gap)).toEqual({ kind: 'rate_limited' });
    expect(sent).toHaveLength(3);
    expect(rows[0]).toMatchObject({ verifyMailCount: EXPERT_PREREG_DAILY_MAIL_LIMIT });

    expect(await attempt(MAIL_DAY_MS + 60_000)).toEqual({ kind: 'created' });
    expect(rows[0]).toMatchObject({ verifyMailCount: 1, verifyMailWindowStart: new Date(NOW.getTime() + MAIL_DAY_MS + 60_000) });
    expect(sent).toHaveLength(4);
  });

  it('gives back the day quota of a re-issue whose mail cannot be sent', async () => {
    const { db, rows } = fakeDb();
    const { mailer } = recordingMailer();
    await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: null, salt: null });
    const before = { ...rows[0]! };
    const failing: Mailer = vi.fn(async () => {
      throw new MailSendError('smtp-down', 421);
    });
    const later = new Date(NOW.getTime() + RESEND_COOLDOWN_MS + 1_000);

    const result = await registerExpertPreRegistration(valid, { db, mailer: failing, baseUrl: BASE, now: later, ip: null, salt: null });

    expect(result).toEqual({ kind: 'unavailable', error: 'mail_failed' });
    expect(rows[0]).toMatchObject({ verifyMailCount: before.verifyMailCount, verifyMailWindowStart: before.verifyMailWindowStart });
  });

  it('keys the IP hash with AUTH_SECRET when neither the salt option nor EXPERT_PREREG_IP_SALT is given (crw2 MINOR-B)', async () => {
    const previous = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'test-auth-secret-for-fo45-0123456789';
    try {
      const { db, rows } = fakeDb();
      const { mailer } = recordingMailer();
      const result = await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: IP });
      expect(result).toEqual({ kind: 'created' });
      const configured = process.env.EXPERT_PREREG_IP_SALT;
      const key = expertPreRegIpSalt(configured, process.env.AUTH_SECRET);
      expect(key).not.toBeNull();
      expect(rows[0]!.ipHash).toBe(hashExpertIp(IP, key));
    } finally {
      if (previous === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = previous;
    }
  });
});

describe('expertPreRegIpSalt', () => {
  it('uses EXPERT_PREREG_IP_SALT when it is set', () => {
    expect(expertPreRegIpSalt(SALT, 'auth-secret-value-0123456789abcdef')).toBe(SALT);
  });

  it('derives a key from AUTH_SECRET when the salt is unset, so the per-IP limit never switches off', () => {
    const derived = expertPreRegIpSalt(undefined, 'auth-secret-value-0123456789abcdef');
    expect(derived).toMatch(/^[0-9a-f]{64}$/);
    expect(derived).toBe(expertPreRegIpSalt(undefined, 'auth-secret-value-0123456789abcdef'));
    expect(derived).not.toBe(expertPreRegIpSalt(undefined, 'another-secret-value-0123456789abcdef'));
    expect(derived).not.toBe(sha256('auth-secret-value-0123456789abcdef'));
  });

  it('is null only when neither the salt nor AUTH_SECRET is set', () => {
    expect(expertPreRegIpSalt(undefined, undefined)).toBeNull();
    expect(expertPreRegIpSalt('', '')).toBeNull();
  });
});

describe('hashExpertIp', () => {
  it('is null without an IP or without a salt, and keyed (not the bare address hash)', () => {
    expect(hashExpertIp(null, SALT)).toBeNull();
    expect(hashExpertIp(IP, null)).toBeNull();
    expect(hashExpertIp(IP, SALT)).not.toBe(sha256(IP));
    expect(hashExpertIp(IP, SALT)).toBe(hashExpertIp(IP, SALT));
  });
});

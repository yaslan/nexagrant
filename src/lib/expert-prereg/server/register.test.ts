import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { Mailer, MailMessage } from '@/lib/email/mailer';
import { MailSendError } from '@/lib/email/mailer';
import { EXPERT_PREREG_CONSENT_VERSION, IP_WINDOW_MS, REGISTRATION_IP_LIMIT } from './constants';
import { hashExpertIp, registerExpertPreRegistration } from './register';

const NOW = new Date('2026-10-17T10:00:00.000Z');
const SALT = 'unit-test-salt-0123456789abcdef0123';
const IP = '203.0.113.7';
const BASE = 'http://localhost:3000';

const valid = {
  fullName: 'Ayşe Yılmaz',
  email: 'Ayse@Example.org',
  province: '34',
  title: 'Proje Yöneticisi',
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

/** An in-memory stand-in for the three calls the register path makes, inside a transaction. */
function fakeDb(seed: Row[] = []) {
  const rows: Row[] = [...seed];
  let nextId = 1;
  const delegate = {
    count: vi.fn(async ({ where }: { where: { ipHash?: string; createdAt?: { gte: Date } } }) =>
      rows.filter(
        (r) =>
          (where.ipHash === undefined || r.ipHash === where.ipHash) &&
          (where.createdAt === undefined || r.createdAt >= where.createdAt.gte)
      ).length
    ),
    findUnique: vi.fn(async ({ where }: { where: { email: string } }) => rows.find((r) => r.email === where.email) ?? null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `row-${nextId++}`, ...data } as Row;
      rows.push(row);
      return { id: row.id };
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const index = rows.findIndex((r) => r.id === where.id);
      if (index === -1) throw new Error('not found');
      rows.splice(index, 1);
      return {};
    }),
  };
  const tx = { $executeRaw: vi.fn(async () => 0), expertPreRegistration: delegate };
  const db = {
    $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
    expertPreRegistration: delegate,
  } as unknown as PrismaClient;
  return { db, rows, delegate };
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

  it('refuses a second registration of the same e-mail with 409 and sends no second mail', async () => {
    const { db, rows } = fakeDb();
    const { mailer, sent } = recordingMailer();
    await registerExpertPreRegistration(valid, { db, mailer, baseUrl: BASE, now: NOW, ip: null, salt: null });
    const second = await registerExpertPreRegistration(
      { ...valid, email: 'AYSE@example.org' },
      { db, mailer, baseUrl: BASE, now: NOW, ip: null, salt: null }
    );
    expect(second).toEqual({ kind: 'duplicate' });
    expect(rows).toHaveLength(1);
    expect(sent).toHaveLength(1);
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

describe('hashExpertIp', () => {
  it('is null without an IP or without a salt, and keyed (not the bare address hash)', () => {
    expect(hashExpertIp(null, SALT)).toBeNull();
    expect(hashExpertIp(IP, null)).toBeNull();
    expect(hashExpertIp(IP, SALT)).not.toBe(sha256(IP));
    expect(hashExpertIp(IP, SALT)).toBe(hashExpertIp(IP, SALT));
  });
});

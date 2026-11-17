import { suiteHasDatabase } from './helpers/database-availability';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, withTenant } from '@/lib/db';
import {
  encryptCalendarToken,
  decryptCalendarToken,
  saveCalendarConnectionTokens,
} from '@/lib/calendar/sync';
import { PlaintextCalendarTokenError } from '@/lib/calendar/token-envelope';
import { assertAppOwnerRole } from './helpers/live-db-role';

const PROBE_TENANT = 'probe-encryption-tenant';
const PROBE_USER = 'probe-user-token-test';
const SAMPLE_PLAINTEXT_TOKEN = 'ya29.super-secret-google-oauth-token-live-probe-2026';
const SAMPLE_REFRESH_TOKEN = '1//0gRefreshTokenSecretLiveProbe2026';
const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const HAS_DB = await suiteHasDatabase('calendar-token-db.live');

describe.skipIf(!HAS_DB)('Calendar token live database encryption verification', () => {
  let createdConnectionId: string | null = null;

  beforeAll(async () => {
    process.env.CALENDAR_ENCRYPTION_KEY = TEST_KEY;
    // The raw read-back below goes through the singleton unscoped, which only
    // sees the row on the app's own BYPASSRLS role.
    await assertAppOwnerRole(prisma, 'calendar token live test');
  });

  afterAll(async () => {
    // Cleanup any probe rows
    try {
      await prisma.calendarConnection.deleteMany({
        where: { tenantId: PROBE_TENANT },
      });
    } catch {
      // ignore
    }
  });

  it('proves that a written token in the DB is encrypted and NOT cleartext', async () => {
    // 1. Create a calendar connection with encrypted tokens via withTenant
    await withTenant(PROBE_TENANT, async (tx) => {
      // Initial create with null or encrypted tokens
      const encryptedAccess = encryptCalendarToken(SAMPLE_PLAINTEXT_TOKEN);
      const encryptedRefresh = encryptCalendarToken(SAMPLE_REFRESH_TOKEN);

      const conn = await tx.calendarConnection.create({
        data: {
          tenantId: PROBE_TENANT,
          userId: PROBE_USER,
          provider: 'google',
          isConnected: true,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
        },
      });
      createdConnectionId = conn.id;

      // Also test saveCalendarConnectionTokens write path
      await saveCalendarConnectionTokens(tx, conn.id, {
        accessToken: SAMPLE_PLAINTEXT_TOKEN,
        refreshToken: SAMPLE_REFRESH_TOKEN,
      });
    });

    expect(createdConnectionId).not.toBeNull();

    // 2. Perform a RAW database query directly using $queryRaw to inspect the raw storage
    const rawRows = await prisma.$queryRaw<
      Array<{ accessToken: string | null; refreshToken: string | null; provider: string }>
    >`SELECT "accessToken", "refreshToken", "provider" FROM "CalendarConnection" WHERE id = ${createdConnectionId}`;

    expect(rawRows.length).toBe(1);
    const rawRow = rawRows[0]!;

    // 3. Concrete proof: Raw DB values must NOT be cleartext
    expect(rawRow.accessToken).not.toBeNull();
    expect(rawRow.refreshToken).not.toBeNull();

    // MUST NOT contain the cleartext token string anywhere
    expect(rawRow.accessToken).not.toBe(SAMPLE_PLAINTEXT_TOKEN);
    expect(rawRow.accessToken).not.toContain(SAMPLE_PLAINTEXT_TOKEN);
    expect(rawRow.accessToken).not.toContain('super-secret');
    expect(rawRow.accessToken).not.toContain('ya29.');

    expect(rawRow.refreshToken).not.toBe(SAMPLE_REFRESH_TOKEN);
    expect(rawRow.refreshToken).not.toContain(SAMPLE_REFRESH_TOKEN);
    expect(rawRow.refreshToken).not.toContain('RefreshTokenSecret');

    // MUST be formatted with the fkenc1: envelope
    expect(rawRow.accessToken).toMatch(/^fkenc1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+/);
    expect(rawRow.refreshToken).toMatch(/^fkenc1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+/);

    // 4. Verify read path: decryptCalendarToken decrypts back to exact cleartext
    const decryptedAccess = decryptCalendarToken(rawRow.accessToken!);
    const decryptedRefresh = decryptCalendarToken(rawRow.refreshToken!);

    expect(decryptedAccess).toBe(SAMPLE_PLAINTEXT_TOKEN);
    expect(decryptedRefresh).toBe(SAMPLE_REFRESH_TOKEN);
  });

  it('proves that raw plaintext token writes are blocked by the machine gate', async () => {
    // Attempting to write a raw plaintext token without envelope must throw PlaintextCalendarTokenError
    await expect(
      prisma.calendarConnection.create({
        data: {
          tenantId: PROBE_TENANT,
          userId: PROBE_USER,
          provider: 'google',
          isConnected: true,
          accessToken: 'unencrypted-plaintext-token',
        },
      })
    ).rejects.toThrow(PlaintextCalendarTokenError);
  });
});

import 'dotenv/config';
import { prisma, withTenant } from '../src/lib/db';
import {
  encryptCalendarToken,
  decryptCalendarToken,
  saveCalendarConnectionTokens,
} from '../src/lib/calendar/sync';

async function main() {
  const tenantId = 'verify-encryption-tenant';
  const userId = 'verify-user-1';
  const secretAccessToken = 'ya29.live-oauth-access-token-CONFIDENTIAL-12345';
  const secretRefreshToken = '1//0gLiveRefreshTokenSecret-CONFIDENTIAL-67890';

  console.log('--- 1. Writing encrypted tokens to CalendarConnection ---');
  let connectionId = '';

  await withTenant(tenantId, async (tx) => {
    // Clean old probe data
    await tx.calendarConnection.deleteMany({ where: { tenantId } });

    const conn = await tx.calendarConnection.create({
      data: {
        tenantId,
        userId,
        provider: 'google',
        isConnected: true,
        accessToken: encryptCalendarToken(secretAccessToken),
        refreshToken: encryptCalendarToken(secretRefreshToken),
      },
    });
    connectionId = conn.id;

    // Also test saveCalendarConnectionTokens write path
    await saveCalendarConnectionTokens(tx, conn.id, {
      accessToken: secretAccessToken,
      refreshToken: secretRefreshToken,
    });
  });

  console.log(`Connection created: ${connectionId}`);

  console.log('--- 2. Inspecting RAW values from PostgreSQL (SELECT raw columns) ---');
  const rawRows = await prisma.$queryRaw<
    Array<{ accessToken: string | null; refreshToken: string | null }>
  >`SELECT "accessToken", "refreshToken" FROM "CalendarConnection" WHERE id = ${connectionId}`;

  const row = rawRows[0]!;
  console.log('Raw DB accessToken: ', row.accessToken);
  console.log('Raw DB refreshToken:', row.refreshToken);

  const isAccessCleartext = row.accessToken?.includes('CONFIDENTIAL') || row.accessToken?.includes('ya29');
  const isRefreshCleartext = row.refreshToken?.includes('CONFIDENTIAL') || row.refreshToken?.includes('RefreshToken');

  console.log('Is accessToken cleartext in DB? ', isAccessCleartext ? '❌ YES (FAIL)' : '✅ NO (ENCRYPTED)');
  console.log('Is refreshToken cleartext in DB?', isRefreshCleartext ? '❌ YES (FAIL)' : '✅ NO (ENCRYPTED)');

  console.log('--- 3. Testing Decryption Read Path ---');
  const decryptedAccess = decryptCalendarToken(row.accessToken!);
  const decryptedRefresh = decryptCalendarToken(row.refreshToken!);

  console.log('Decrypted accessToken matches original? ', decryptedAccess === secretAccessToken ? '✅ YES' : '❌ NO');
  console.log('Decrypted refreshToken matches original?', decryptedRefresh === secretRefreshToken ? '✅ YES' : '❌ NO');

  console.log('--- 4. Cleanup ---');
  await prisma.calendarConnection.deleteMany({ where: { tenantId } });
  console.log('Cleaned up probe row.');
}

main()
  .catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

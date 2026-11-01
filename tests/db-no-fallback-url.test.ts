import { afterEach, describe, expect, it, vi } from 'vitest';

/** FO-141: src/lib/db.ts has no built-in fallback database URL. */
const globals = globalThis as unknown as { prisma?: unknown; lockPool?: unknown };

describe('db without DATABASE_URL', () => {
  afterEach(() => {
    delete globals.prisma;
    delete globals.lockPool;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('imports fine, but the first query fails with a message that names DATABASE_URL', async () => {
    delete globals.prisma;
    vi.stubEnv('DATABASE_URL', '');
    vi.resetModules();
    const { prisma, MissingDatabaseUrlError, withTenantLockPool } = await import('@/lib/db');
    expect(() => prisma.user).toThrow(MissingDatabaseUrlError);
    expect(() => prisma.user).toThrow(/DATABASE_URL/);
    await expect(withTenantLockPool('t1', async () => 1)).rejects.toThrow(MissingDatabaseUrlError);
  });

  it('with the variable set the client is a real one, not the refusing stand-in', async () => {
    delete globals.prisma;
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@127.0.0.1:1/none');
    vi.resetModules();
    const { prisma } = await import('@/lib/db');
    expect(typeof prisma.$disconnect).toBe('function');
    await prisma.$disconnect();
  });
});

import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { isDatabaseUnavailable } from '@/lib/db-unavailable';

/**
 * TASK-MUO64UQJUWEBI (İNCELEME-83 Y-1). The shapes below are the ones measured against
 * Prisma 7 + `@prisma/adapter-pg` on a live Postgres (docs/agent-results/TASK-MUO64UQJUWEBI-crw-fb.md).
 */
const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test', meta });

describe('isDatabaseUnavailable', () => {
  it.each([
    ['port closed', known('ECONNREFUSED', { modelName: 'Workspace' })],
    ['port closed inside $transaction', Object.assign(new AggregateError([], ''), { code: 'ECONNREFUSED' })],
    ['host unreachable', known('P1001')],
    ['bad credentials', known('P1000')],
    ['pool exhausted', known('P2024')],
    ['pool connect timeout', new Error('Connection terminated due to connection timeout')],
    ['server went away (08006 via adapter)', known('P2010', { driverAdapterError: { cause: { code: '08006' } } })],
    ['admin shutdown', Object.assign(new Error('terminating connection'), { code: '57P01' })],
    ['nested cause', new Error('wrapped', { cause: Object.assign(new Error(''), { code: 'ECONNRESET' }) })],
    ['initialisation', new Prisma.PrismaClientInitializationError('cannot start', 'test')],
  ])('outage: %s', (_label, err) => {
    expect(isDatabaseUnavailable(err)).toBe(true);
  });

  it.each([
    ['NUL in a text parameter (22021)', known('P2039', { driverAdapterError: { cause: { code: '22021' } } })],
    ['wrong argument type', new Prisma.PrismaClientValidationError('Argument `slug`: Invalid value', { clientVersion: 'test' })],
    ['unique violation', known('P2002')],
    ['record not found', known('P2025')],
    ['plain bug', new TypeError('x is not a function')],
    ['string', 'boom'],
    ['null', null],
  ])('not an outage: %s', (_label, err) => {
    expect(isDatabaseUnavailable(err)).toBe(false);
  });
});

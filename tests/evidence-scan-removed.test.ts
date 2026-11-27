import { describe, expect, test } from 'vitest';
import { scanRemovedIds } from '../src/app/[locale]/(app)/[workspace]/evidence/data';

/**
 * NG-264 (a): "Zararlı bulundu, kaldırıldı" may be shown only when the infected object was really
 * removed. The removal is the AuditEvent `evidence.scan.object_removed` with data.objectDeleted (NG-263).
 */

const TENANT = 'tenant-a';

function fakeAuditClient(events: Array<{ target: string | null; data: unknown }>) {
  const calls: Array<{ where: unknown }> = [];
  const client = {
    auditEvent: {
      findMany: async (args: { where: unknown }) => {
        calls.push({ where: args.where });
        return events;
      },
    },
  };
  return { client: client as unknown as Parameters<typeof scanRemovedIds>[0], calls };
}

describe('scanRemovedIds (NG-264 a)', () => {
  test('an object that was deleted counts as removed', async () => {
    const { client } = fakeAuditClient([{ target: 'ev-1', data: { objectDeleted: true } }]);
    expect([...(await scanRemovedIds(client, TENANT, ['ev-1']))]).toEqual(['ev-1']);
  });

  test('an object that could NOT be deleted is not removed', async () => {
    const { client } = fakeAuditClient([{ target: 'ev-1', data: { objectDeleted: false } }]);
    expect((await scanRemovedIds(client, TENANT, ['ev-1'])).has('ev-1')).toBe(false);
  });

  test('a row with no removal event is not removed (the verdict alone is not a removal)', async () => {
    const { client } = fakeAuditClient([]);
    expect((await scanRemovedIds(client, TENANT, ['ev-1'])).size).toBe(0);
  });

  test('a malformed event payload is not taken as a removal', async () => {
    const { client } = fakeAuditClient([
      { target: 'ev-1', data: null },
      { target: 'ev-2', data: { objectDeleted: 'true' } },
      { target: null, data: { objectDeleted: true } },
    ]);
    expect((await scanRemovedIds(client, TENANT, ['ev-1', 'ev-2'])).size).toBe(0);
  });

  test('the query is tenant-scoped and names only the removal event type', async () => {
    const { client, calls } = fakeAuditClient([]);
    await scanRemovedIds(client, TENANT, ['ev-1', 'ev-2']);
    expect(calls[0]?.where).toEqual({
      tenantId: TENANT,
      type: 'evidence.scan.object_removed',
      target: { in: ['ev-1', 'ev-2'] },
    });
  });

  test('no ids means no query at all', async () => {
    const { client, calls } = fakeAuditClient([]);
    expect((await scanRemovedIds(client, TENANT, [])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

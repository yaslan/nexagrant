import { beforeEach, describe, expect, test, vi } from 'vitest';
import { crc32, deflateSync } from 'node:zlib';

/**
 * FB KAMU B4 (TASK-MULRRNIHVZM1Z): the server action, not the form, decides
 * who may change the co-brand. A member whose page hides the form can still
 * post the action; it must refuse before anything is stored.
 */
const scope = { tenantId: 'agency-a', userId: 'u1', role: 'TENANT_OWNER' };
const isAgency = vi.fn(async () => true);
const save = vi.fn(async (_id: string, input: { name: string }) => ({
  logoKey: 'agency-a/agency/cobrand/0f8fad5b-d9cb-469f-a165-70867728950e.png',
  name: input.name,
  updatedAt: '2026-09-29T00:00:00.000Z',
}));

vi.mock('@/lib/tenant', () => ({ requireTenantAction: async () => scope }));
vi.mock('@/lib/agency/funnel', () => ({ isAgencyTenant: (id: string) => isAgency(id) }));
vi.mock('@/lib/agency/cobrand-store', () => ({
  CoBrandStorageError: class extends Error {},
  saveAgencyCoBrand: (id: string, input: { name: string }) => save(id, input),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(Buffer.alloc(18))),
  chunk('IEND', Buffer.alloc(0)),
]);

function form(file: Buffer, name = 'logo.png', type = 'image/png'): FormData {
  const f = new FormData();
  f.set('name', 'OKA');
  f.set('logo', new File([new Uint8Array(file)], name, { type }));
  return f;
}

beforeEach(() => {
  scope.role = 'TENANT_OWNER';
  isAgency.mockResolvedValue(true);
  save.mockClear();
});

describe('saveCoBrand', () => {
  test.each(['MEMBER', 'WRITER', 'PIPELINE_MANAGER', 'GUEST_PARTNER'])('%s is refused, nothing stored', async (role) => {
    scope.role = role;
    const { saveCoBrand } = await import('./cobrand-actions');
    expect(await saveCoBrand(form(PNG))).toEqual({ ok: false, error: 'forbidden' });
    expect(save).not.toHaveBeenCalled();
  });

  test('an owner of a tenant that is not an agency is refused', async () => {
    isAgency.mockResolvedValue(false);
    const { saveCoBrand } = await import('./cobrand-actions');
    expect(await saveCoBrand(form(PNG))).toEqual({ ok: false, error: 'notAgency' });
    expect(save).not.toHaveBeenCalled();
  });

  test.each(['TENANT_OWNER', 'TENANT_ADMIN'])('%s of the agency saves a PNG', async (role) => {
    scope.role = role;
    const { saveCoBrand } = await import('./cobrand-actions');
    expect(await saveCoBrand(form(PNG))).toMatchObject({ ok: true, name: 'OKA', hasLogo: true });
    expect(save).toHaveBeenCalledWith('agency-a', expect.objectContaining({ name: 'OKA' }));
  });

  test('an SVG sent as image/png with a .png name is refused from its bytes', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    const { saveCoBrand } = await import('./cobrand-actions');
    expect(await saveCoBrand(form(svg, 'logo.png', 'image/png'))).toEqual({ ok: false, error: 'notPng' });
    expect(save).not.toHaveBeenCalled();
  });
});

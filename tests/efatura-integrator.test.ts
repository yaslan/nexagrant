import { describe, expect, it, vi } from 'vitest';
import {
  EFATURA_INTEGRATOR_VARIABLES,
  fileInvoice,
  fileThrough,
  isFiled,
  readIntegratorConfig,
  type EfaturaIntegrator,
  type FilingOutcome,
} from '@/lib/efatura-integrator';
import type { EfaturaDocument } from '@/lib/efatura';

/**
 * The GİB integrator seam (TASK-MTRJSOWFH6B45).
 *
 * Fabrika has no integrator contract, so nothing here files anything. What is
 * pinned is that the unconfigured state is *stated* — named variables, no
 * exception, no invented envelope id — because an envelope id is what makes
 * `isFiledWithGib` drop the "carries no fiscal value" stamp off a printed
 * document.
 */

const DOCUMENT = {
  id: 'FB-2026-000001',
  uuid: 'b8e3d0a2-0000-4000-8000-000000000001',
  issueDate: '2026-09-01',
  issueTime: '09:00:00',
  profileId: 'TICARIFATURA',
  invoiceType: 'SATIS',
  currency: 'TRY',
  supplier: {
    name: 'Satıcı', vknTckn: '1234567890', taxOffice: 'V.D.',
    address: 'Adres', city: 'Ankara', country: 'Türkiye',
  },
  customer: {
    name: 'Alıcı', vknTckn: '1234567890', taxOffice: 'V.D.',
    address: 'Adres', city: 'İstanbul', country: 'Türkiye',
  },
  lines: [{ id: '1', name: 'Pro', quantity: 1, unitCode: 'MON', unitPriceMinor: 895_000, vatRate: 20 }],
} satisfies EfaturaDocument;

const CREDENTIALS = {
  provider: 'acme-entegrator',
  baseUrl: 'https://test.example.invalid',
  username: 'user',
  password: 'secret',
};

describe('readIntegratorConfig', () => {
  it('names every missing variable instead of throwing', () => {
    const state = readIntegratorConfig({});
    expect(state.configured).toBe(false);
    if (state.configured) throw new Error('unreachable');
    expect(state.missing).toEqual([
      'EFATURA_INTEGRATOR_PROVIDER',
      'EFATURA_INTEGRATOR_BASE_URL',
      'EFATURA_INTEGRATOR_USERNAME',
      'EFATURA_INTEGRATOR_PASSWORD',
    ]);
  });

  it('treats a blank value as unset — half a .env is not half a configuration', () => {
    const state = readIntegratorConfig({ ...CREDENTIALS, password: '   ' });
    expect(state.configured).toBe(false);
    if (state.configured) throw new Error('unreachable');
    expect(state.missing).toEqual(['EFATURA_INTEGRATOR_PASSWORD']);
  });

  it('stays on the vendor test environment unless production is stated outright', () => {
    expect(readIntegratorConfig(CREDENTIALS)).toMatchObject({ config: { testMode: true } });
    expect(readIntegratorConfig({ ...CREDENTIALS, testMode: '' })).toMatchObject({
      config: { testMode: true },
    });
    expect(readIntegratorConfig({ ...CREDENTIALS, testMode: 'False' })).toMatchObject({
      config: { testMode: false },
    });
  });
});

describe('fileInvoice', () => {
  it('reports the unconfigured state, and files nothing', async () => {
    const outcome = await fileInvoice(DOCUMENT, {});
    expect(outcome.status).toBe('not_configured');
    expect(isFiled(outcome)).toBe(false);
    if (outcome.status !== 'not_configured') throw new Error('unreachable');
    expect(outcome.missing).toContain('EFATURA_INTEGRATOR_PROVIDER');
  });

  it('refuses a vendor it has no adapter for rather than pretending to send', async () => {
    const outcome = await fileInvoice(DOCUMENT, CREDENTIALS);
    expect(outcome).toEqual({ status: 'provider_unsupported', provider: 'acme-entegrator' });
    expect(isFiled(outcome)).toBe(false);
  });
});

describe('fileThrough', () => {
  const integrator = (file: EfaturaIntegrator['file']): EfaturaIntegrator => ({
    provider: 'acme-entegrator',
    file,
  });

  it('turns a thrown transport error into an outcome, not a crash', async () => {
    const outcome = await fileThrough(
      integrator(() => Promise.reject(new Error('ECONNREFUSED'))),
      DOCUMENT
    );
    expect(outcome).toEqual({ status: 'unreachable', detail: 'ECONNREFUSED' });
    expect(isFiled(outcome)).toBe(false);
  });

  it('passes a real acceptance through with the envelope id GİB returned', async () => {
    const filed: FilingOutcome = {
      status: 'filed',
      envelopeId: 'ENV-2026-77',
      filedAt: '2026-09-01T09:00:05.000Z',
    };
    const outcome = await fileThrough(integrator(() => Promise.resolve(filed)), DOCUMENT);
    expect(isFiled(outcome)).toBe(true);
  });

  it('does not count a blank envelope id as a filing', async () => {
    const outcome = await fileThrough(
      integrator(() =>
        Promise.resolve({ status: 'filed', envelopeId: '  ', filedAt: 'x' } as FilingOutcome)
      ),
      DOCUMENT
    );
    expect(isFiled(outcome)).toBe(false);
  });
});

describe('environment', () => {
  it('parses with the whole e-invoice setup unset — an unconfigured app still boots', async () => {
    vi.resetModules();
    for (const variable of EFATURA_INTEGRATOR_VARIABLES) {
      delete process.env[variable];
    }
    const mod = await import('@/lib/env');
    expect(mod.env.EFATURA_INTEGRATOR_PROVIDER).toBeUndefined();
    expect(mod.env.EFATURA_INTEGRATOR_BASE_URL).toBeUndefined();
  });
});

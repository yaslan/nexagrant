import { UNFILED_NOTICE, type EfaturaDocument } from '@/lib/efatura';

/**
 * The seam between Fabrika and a GİB e-invoice integrator.
 *
 * Turkey does not let an application file an invoice with GİB directly: filing
 * goes through a licensed integrator (özel entegratör), which issues the
 * credentials and returns the envelope id that makes a document fiscally real.
 * Fabrika has no such contract yet, so **no invoice is filed anywhere today**.
 *
 * What this module is for is making that state unmistakable instead of
 * invisible:
 *   - the credentials are named, so an operator knows what to obtain,
 *   - every failure is a value with a reason on it, never an exception that a
 *     caller can mistake for success,
 *   - `file()` cannot return `filed` without an envelope id an integrator
 *     actually returned. There is no adapter registered, so today it returns
 *     `provider_unsupported` — the one outcome this file must never fake, since
 *     `isFiledWithGib` in src/lib/efatura.ts uses the envelope id to decide
 *     whether the printed document may drop its "no fiscal value" stamp.
 *
 * Related: the *seller's* fiscal identity (INVOICE_SUPPLIER_*) is a separate
 * set of settings, resolved in
 * `src/app/api/billing/invoices/[id]/export/invoice-document.ts`. An invoice can
 * be rendered from the supplier settings alone; it can only be *filed* with
 * these.
 */

/** Credentials an integrator contract yields, and where each one comes from. */
export interface EfaturaIntegratorConfig {
  /** The integrator's own name, e.g. the vendor on the contract. */
  provider: string;
  /** The vendor's API endpoint. Test and live hosts differ; both are real hosts. */
  baseUrl: string;
  username: string;
  password: string;
  /** True while pointing at the vendor's test environment. */
  testMode: boolean;
}

export interface EfaturaIntegratorSettings {
  provider?: string;
  baseUrl?: string;
  username?: string;
  password?: string;
  testMode?: string;
}

/** Settings without which nothing can be filed, in the order reported. */
const REQUIRED_SETTINGS = [
  ['provider', 'EFATURA_INTEGRATOR_PROVIDER'],
  ['baseUrl', 'EFATURA_INTEGRATOR_BASE_URL'],
  ['username', 'EFATURA_INTEGRATOR_USERNAME'],
  ['password', 'EFATURA_INTEGRATOR_PASSWORD'],
] as const;

/** Every variable this module reads — what `docs/EFATURA_SETUP.md` lists. */
export const EFATURA_INTEGRATOR_VARIABLES = [
  ...REQUIRED_SETTINGS.map(([, variable]) => variable),
  'EFATURA_INTEGRATOR_TEST_MODE',
] as const;

export type EfaturaConfigState =
  | { configured: false; missing: string[] }
  | { configured: true; config: EfaturaIntegratorConfig };

/**
 * Reads the integrator credentials, or reports exactly which are missing.
 *
 * Never throws: an unconfigured e-invoice integration must leave the rest of
 * billing working. A blank string counts as unset, so a half-filled `.env`
 * cannot half-configure a filing.
 */
export function readIntegratorConfig(
  settings: EfaturaIntegratorSettings
): EfaturaConfigState {
  const missing = REQUIRED_SETTINGS.filter(([key]) => !settings[key]?.trim()).map(
    ([, variable]) => variable
  );

  if (missing.length > 0) return { configured: false, missing };

  return {
    configured: true,
    config: {
      provider: settings.provider!.trim(),
      baseUrl: settings.baseUrl!.trim(),
      username: settings.username!.trim(),
      password: settings.password!.trim(),
      // Anything but an explicit "false" keeps the safer answer: a filing aimed
      // at the test environment is recoverable, one aimed at production is not.
      testMode: (settings.testMode ?? '').trim().toLowerCase() !== 'false',
    },
  };
}

/**
 * What a filing attempt produced. Only `filed` carries an envelope id, and it
 * is the only outcome a caller may treat as a filing.
 */
export type FilingOutcome =
  /** GİB accepted the document; `envelopeId` is what it returned. */
  | { status: 'filed'; envelopeId: string; filedAt: string }
  /** The credentials are not set. Name them; do not guess them. */
  | { status: 'not_configured'; missing: string[] }
  /** Credentials are set but no adapter exists for that vendor's API. */
  | { status: 'provider_unsupported'; provider: string }
  /** The integrator answered, and refused the document. */
  | { status: 'rejected'; code: string; message: string }
  /** The integrator could not be reached, or answered unintelligibly. */
  | { status: 'unreachable'; detail: string };

export interface EfaturaIntegrator {
  readonly provider: string;
  file(document: EfaturaDocument): Promise<FilingOutcome>;
}

/**
 * Sandbox adapter for testing e-invoice flow without sending to GİB.
 *
 * Runs the send path end-to-end BUT never marks the document as sent to GİB:
 * the document retains the "ÖRNEK BELGE — mali değeri yoktur" watermark and
 * `isFiledWithGib()` returns false.
 *
 * ONLY selectable when EFATURA_INTEGRATOR_TEST_MODE is true (test mode); selecting
 * this adapter in live/production mode throws an error.
 */
export function createSandboxAdapter(config: EfaturaIntegratorConfig): EfaturaIntegrator {
  if (!config.testMode) {
    throw new Error(
      'Sandbox integrator adapter can ONLY be used when EFATURA_INTEGRATOR_TEST_MODE is enabled (test mode)'
    );
  }

  return {
    provider: 'sandbox',
    async file(_document: EfaturaDocument): Promise<FilingOutcome> {
      return {
        status: 'rejected',
        code: 'SANDBOX_SAMPLE',
        message: UNFILED_NOTICE,
      };
    },
  };
}

/**
 * Vendor adapters, by the value of `EFATURA_INTEGRATOR_PROVIDER`.
 */
const ADAPTERS: Record<string, (config: EfaturaIntegratorConfig) => EfaturaIntegrator> = {
  sandbox: createSandboxAdapter,
};

/** The adapter for the configured vendor, or null when there is none. */
export function resolveIntegrator(config: EfaturaIntegratorConfig): EfaturaIntegrator | null {
  const factory = ADAPTERS[config.provider.toLowerCase()];
  return factory ? factory(config) : null;
}

/**
 * Files one document, or explains why it was not filed.
 *
 * Returns rather than throws, so a caller that forgets a try/catch still cannot
 * end up believing the invoice went out.
 */
export async function fileInvoice(
  document: EfaturaDocument,
  settings: EfaturaIntegratorSettings
): Promise<FilingOutcome> {
  const state = readIntegratorConfig(settings);
  if (!state.configured) {
    return { status: 'not_configured', missing: state.missing };
  }

  let integrator: EfaturaIntegrator | null;
  try {
    integrator = resolveIntegrator(state.config);
  } catch (error) {
    return {
      status: 'unreachable',
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  if (!integrator) {
    return { status: 'provider_unsupported', provider: state.config.provider };
  }

  return fileThrough(integrator, document);
}

/**
 * Runs one adapter and turns anything it throws into an outcome.
 *
 * Separate from `fileInvoice` so a caller holding its own adapter instance goes
 * through the same guarantee: a network error, a timeout or a vendor SDK
 * blowing up all come back as `unreachable`, and none of them can be confused
 * with a filing.
 */
export async function fileThrough(
  integrator: EfaturaIntegrator,
  document: EfaturaDocument
): Promise<FilingOutcome> {
  try {
    return await integrator.file(document);
  } catch (error) {
    return {
      status: 'unreachable',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** True only for the one outcome that means the document is now fiscally real. */
export function isFiled(
  outcome: FilingOutcome
): outcome is Extract<FilingOutcome, { status: 'filed' }> {
  return outcome.status === 'filed' && outcome.envelopeId.trim().length > 0;
}

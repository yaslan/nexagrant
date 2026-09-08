import { resolveVatRate, retiredVatRateSetting } from '../src/lib/billing/vat-rate';
import { chargeableVatCountries } from '../src/lib/billing/vat-rates';
import { env } from '../src/lib/env';

export interface PreflightVariableResult {
  variable: string;
  block: 'Satıcı Kimliği' | 'Vergi (KDV)' | 'Entegratör';
  required: boolean;
  status: 'dolu' | 'EKSİK' | 'GEÇERSİZ';
  valueMasked: string;
}

export interface PreflightReport {
  supplierConfigured: boolean;
  vatConfigured: boolean;
  integratorConfigured: boolean;
  missingSupplierVars: string[];
  missingVatVars: string[];
  missingIntegratorVars: string[];
  allMissingVars: string[];
  invoiceRecordVerdict: string;
  documentGenVerdict: string;
  gibSendVerdict: string;
  summarySentence: string;
  variableResults: PreflightVariableResult[];
}

const REQUIRED_SUPPLIER_VARS = [
  'INVOICE_SUPPLIER_NAME',
  'INVOICE_SUPPLIER_VKN',
  'INVOICE_SUPPLIER_TAX_OFFICE',
  'INVOICE_SUPPLIER_ADDRESS',
  'INVOICE_SUPPLIER_CITY',
] as const;

const OPTIONAL_SUPPLIER_VARS = [
  'INVOICE_SUPPLIER_COUNTRY',
  'INVOICE_SUPPLIER_EMAIL',
] as const;

/**
 * The tax block. Its own block and not a sixth supplier field, because the two
 * fail in different places and the operator has to be told which: without the
 * supplier identity an `Invoice` row is still written and only its exported
 * document fails; without a usable VAT rate `createInvoiceForPayment` stops
 * before writing anything, so there is no row to export in the first place.
 *
 * What this block checks changed on 2026-09-08. It used to check one variable,
 * `INVOICE_VAT_RATE`. The boss decided the rate follows the **buyer's country**
 * (Türkiye 20%, Kuveyt 0%), so a server-wide percentage cannot be the answer and
 * the variable no longer decides anything.
 *
 * The gate therefore asks the question the writer will actually ask, through the
 * very same resolver: can `src/lib/billing/vat-rates.ts` price a sale to the
 * supplier's own country? If it cannot, no domestic customer can be invoiced,
 * and that is worth failing go-live over. `INVOICE_VAT_RATE` is still listed —
 * as *ignored* — because a deployment that still sets it would otherwise keep
 * believing it works (TASK-MTT1WUUS7MN7R).
 */
const RETIRED_VAT_VARS = ['INVOICE_VAT_RATE'] as const;

/** Where the supplier is established; the country every domestic sale is taxed in. */
const DEFAULT_SUPPLIER_COUNTRY = 'Türkiye';

const REQUIRED_INTEGRATOR_VARS = [
  'EFATURA_INTEGRATOR_PROVIDER',
  'EFATURA_INTEGRATOR_BASE_URL',
  'EFATURA_INTEGRATOR_USERNAME',
  'EFATURA_INTEGRATOR_PASSWORD',
] as const;

const OPTIONAL_INTEGRATOR_VARS = [
  'EFATURA_INTEGRATOR_TEST_MODE',
] as const;

function maskValue(key: string, val: string | undefined): string {
  if (!val || val.trim() === '') return '(EKSİK)';
  if (key.includes('PASSWORD') || key.includes('SECRET') || key.includes('KEY')) {
    return '••••••••';
  }
  if (key.includes('VKN')) {
    return val.length >= 4 ? `${val.slice(0, 3)}***${val.slice(-2)}` : '***';
  }
  return val;
}

export function evaluatePreflight(envSource: Partial<Record<string, string | undefined>> = env): PreflightReport {
  const results: PreflightVariableResult[] = [];

  const missingSupplierVars: string[] = [];
  for (const v of REQUIRED_SUPPLIER_VARS) {
    const val = envSource[v as keyof typeof envSource];
    const isSet = Boolean(val && val.trim().length > 0);
    if (!isSet) missingSupplierVars.push(v);
    results.push({
      variable: v,
      block: 'Satıcı Kimliği',
      required: true,
      status: isSet ? 'dolu' : 'EKSİK',
      valueMasked: maskValue(v, val),
    });
  }

  for (const v of OPTIONAL_SUPPLIER_VARS) {
    const val = envSource[v as keyof typeof envSource];
    const isSet = Boolean(val && val.trim().length > 0);
    results.push({
      variable: v,
      block: 'Satıcı Kimliği',
      required: false,
      status: isSet ? 'dolu' : 'EKSİK',
      valueMasked: maskValue(v, val),
    });
  }

  // Not "is a variable filled in" but the writer's own rule, through the writer's
  // own resolver: a rate this gate calls good is a rate `createInvoiceForPayment`
  // will also accept, because both call `resolveVatRate`. Two copies of the rule
  // is how a preflight goes green on something the writer then refuses.
  const supplierCountry =
    envSource.INVOICE_SUPPLIER_COUNTRY?.trim() || DEFAULT_SUPPLIER_COUNTRY;
  const supplierVat = resolveVatRate(supplierCountry);

  const missingVatVars: string[] = [];
  if (supplierVat.status !== 'resolved') {
    // Named as a *table row*, not a variable, because that is what has to be
    // added to fix it. An operator told to "set INVOICE_VAT_RATE" here would
    // set it and stay broken.
    missingVatVars.push(`vat-rates.ts:${supplierCountry}`);
  }
  results.push({
    variable: `KDV oranı (${supplierCountry})`,
    block: 'Vergi (KDV)',
    required: true,
    status: supplierVat.status === 'resolved' ? 'dolu' : 'EKSİK',
    valueMasked:
      supplierVat.status === 'resolved'
        ? `%${supplierVat.ratePercent} (${supplierVat.country})`
        : '(kaynaklı satır yok)',
  });

  // Reported, never required. A set value is a false belief worth naming.
  for (const v of RETIRED_VAT_VARS) {
    const val = envSource[v as keyof typeof envSource];
    const stillSet = retiredVatRateSetting(val) !== null || Boolean(val && val.trim().length > 0);
    results.push({
      variable: v,
      block: 'Vergi (KDV)',
      required: false,
      status: stillSet ? 'GEÇERSİZ' : 'EKSİK',
      valueMasked: stillSet ? `${val} (YOK SAYILIR)` : '(kullanılmıyor)',
    });
  }

  const missingIntegratorVars: string[] = [];
  for (const v of REQUIRED_INTEGRATOR_VARS) {
    const val = envSource[v as keyof typeof envSource];
    const isSet = Boolean(val && val.trim().length > 0);
    if (!isSet) missingIntegratorVars.push(v);
    results.push({
      variable: v,
      block: 'Entegratör',
      required: true,
      status: isSet ? 'dolu' : 'EKSİK',
      valueMasked: maskValue(v, val),
    });
  }

  for (const v of OPTIONAL_INTEGRATOR_VARS) {
    const val = envSource[v as keyof typeof envSource];
    const isSet = Boolean(val && val.trim().length > 0);
    results.push({
      variable: v,
      block: 'Entegratör',
      required: false,
      status: isSet ? 'dolu' : 'EKSİK',
      valueMasked: maskValue(v, val),
    });
  }

  const supplierConfigured = missingSupplierVars.length === 0;
  const vatConfigured = missingVatVars.length === 0;
  const integratorConfigured = missingIntegratorVars.length === 0;
  const allMissingVars = [...missingSupplierVars, ...missingVatVars, ...missingIntegratorVars];

  // Three verdicts and not one, because the blocks fail at three different
  // points in the pipeline and each stop tells the operator something else.
  // The green sentence stays exactly what it was. Where the rate comes from is
  // an explanation, not a verdict, and it is printed on its own line below —
  // widening the verdict would make every caller re-read a string that is meant
  // to be stable.
  const invoiceRecordVerdict = vatConfigured
    ? 'Fatura kaydı oluşturulur'
    : `Fatura kaydı hiç oluşturulmaz: ${supplierCountry} için src/lib/billing/vat-rates.ts içinde kaynaklı bir KDV oranı yok. ` +
      'SystemAlert (invoice_vat_country_unknown) yazılır, ödeme etkilenmez';

  const documentGenVerdict = !vatConfigured
    ? 'Fatura belgesi de üretilmez, çünkü üretilecek kayıt yoktur'
    : supplierConfigured
      ? 'Fatura belgesi üretilir'
      : `Fatura belgesi üretilmez, sebep: satıcı kimliği eksik (${missingSupplierVars.join(', ')})`;

  const gibSendVerdict =
    supplierConfigured && vatConfigured && integratorConfigured
      ? "GİB'e gönderilir"
      : `GİB'e gönderilmez, sebep: ${allMissingVars.join(', ')} eksik`;

  const summarySentence = `${invoiceRecordVerdict}. ${documentGenVerdict}. ${gibSendVerdict}.`;

  return {
    supplierConfigured,
    vatConfigured,
    integratorConfigured,
    missingSupplierVars,
    missingVatVars,
    missingIntegratorVars,
    allMissingVars,
    invoiceRecordVerdict,
    documentGenVerdict,
    gibSendVerdict,
    summarySentence,
    variableResults: results,
  };
}

export function printPreflightReport(report: PreflightReport): void {
  console.log('\n========================================================================');
  console.log('                 E-FATURA YAPILANDIRMA PREFLIGHT KONTROLÜ               ');
  console.log('========================================================================\n');

  console.log('┌──────────────────────────────┬─────────────────┬───────────┬───────────┬──────────────────────┐');
  console.log('│ Ortam Değişkeni              │ Blok / Kategori │ Zorunlu   │ Durum     │ Değer (Maskeli)      │');
  console.log('├──────────────────────────────┼─────────────────┼───────────┼───────────┼──────────────────────┤');

  for (const r of report.variableResults) {
    const vName = r.variable.padEnd(28);
    const block = r.block.padEnd(15);
    const req = (r.required ? 'evet' : 'hayır').padEnd(9);
    const status = r.status.padEnd(9);
    const val = r.valueMasked.padEnd(20);
    console.log(`│ ${vName} │ ${block} │ ${req} │ ${status} │ ${val} │`);
  }
  console.log('└──────────────────────────────┴─────────────────┴───────────┴───────────┴──────────────────────┘\n');

  console.log('--- BLOK DEĞERLENDİRMESİ ---');
  console.log(`1. Satıcı Kimliği Bloğu : ${report.supplierConfigured ? '✅ TANIMLI (Fatura belgesi üretilebilir)' : `❌ EKSİK (${report.missingSupplierVars.join(', ')})`}`);
  console.log(`2. Vergi (KDV) Bloğu    : ${report.vatConfigured ? '✅ TANIMLI (Fatura kaydı yazılabilir)' : `❌ EKSİK (${report.missingVatVars.join(', ')})`}`);
  console.log(`   ↳ KDV oranı artık ALICININ ÜLKESİNDEN gelir (kaynaklı ülkeler: ${chargeableVatCountries().join(', ')}).`);
  console.log('     INVOICE_VAT_RATE yok sayılır; kaynaklı satırı olmayan ülkeye fatura KESİLMEZ.');
  console.log(`3. Entegratör Bloğu     : ${report.integratorConfigured ? '✅ TANIMLI (Entegratör bağlantısı kurulabilir)' : `❌ EKSİK (${report.missingIntegratorVars.join(', ')})`}`);

  console.log('\n--- SONUÇ HÜKMÜ ---');
  console.log(`📌 ${report.summarySentence}\n`);
}

// Executed directly via CLI
if (require.main === module) {
  const report = evaluatePreflight(env);
  printPreflightReport(report);
  if (report.allMissingVars.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

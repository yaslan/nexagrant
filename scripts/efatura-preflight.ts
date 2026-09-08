import { env } from '../src/lib/env';

export interface PreflightVariableResult {
  variable: string;
  block: 'Satıcı Kimliği' | 'Entegratör';
  required: boolean;
  status: 'dolu' | 'EKSİK';
  valueMasked: string;
}

export interface PreflightReport {
  supplierConfigured: boolean;
  integratorConfigured: boolean;
  missingSupplierVars: string[];
  missingIntegratorVars: string[];
  allMissingVars: string[];
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
  const integratorConfigured = missingIntegratorVars.length === 0;
  const allMissingVars = [...missingSupplierVars, ...missingIntegratorVars];

  const documentGenVerdict = supplierConfigured
    ? 'Fatura belgesi üretilir'
    : 'Fatura belgesi üretilmez';

  let gibSendVerdict = '';
  if (supplierConfigured && integratorConfigured) {
    gibSendVerdict = 'GİB\'e gönderilir';
  } else {
    gibSendVerdict = `GİB'e gönderilmez, sebep: ${allMissingVars.join(', ')} eksik`;
  }

  const summarySentence = `${documentGenVerdict}. ${gibSendVerdict}.`;

  return {
    supplierConfigured,
    integratorConfigured,
    missingSupplierVars,
    missingIntegratorVars,
    allMissingVars,
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

  console.log('┌──────────────────────────────┬─────────────────┬───────────┬─────────┬──────────────────────┐');
  console.log('│ Ortam Değişkeni              │ Blok / Kategori │ Zorunlu   │ Durum   │ Değer (Maskeli)      │');
  console.log('├──────────────────────────────┼─────────────────┼───────────┼─────────┼──────────────────────┤');

  for (const r of report.variableResults) {
    const vName = r.variable.padEnd(28);
    const block = r.block.padEnd(15);
    const req = (r.required ? 'evet' : 'hayır').padEnd(9);
    const status = (r.status === 'dolu' ? 'dolu  ' : 'EKSİK ').padEnd(7);
    const val = r.valueMasked.padEnd(20);
    console.log(`│ ${vName} │ ${block} │ ${req} │ ${status} │ ${val} │`);
  }
  console.log('└──────────────────────────────┴─────────────────┴───────────┴─────────┴──────────────────────┘\n');

  console.log('--- BLOK DEĞERLENDİRMESİ ---');
  console.log(`1. Satıcı Kimliği Bloğu : ${report.supplierConfigured ? '✅ TANIMLI (Fatura belgesi üretilebilir)' : `❌ EKSİK (${report.missingSupplierVars.join(', ')})`}`);
  console.log(`2. Entegratör Bloğu     : ${report.integratorConfigured ? '✅ TANIMLI (Entegratör bağlantısı kurulabilir)' : `❌ EKSİK (${report.missingIntegratorVars.join(', ')})`}`);

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

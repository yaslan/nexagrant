import fs from 'fs';
import path from 'path';
import { getTranslations } from 'next-intl/server';

/** A parsed messages file: nested objects down to string leaves. */
type MessageTree = { [key: string]: MessageTree | string | string[] };

function getDeepKeys(obj: MessageTree, prefix = ''): string[] {
  let keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(getDeepKeys(obj[key], nextPrefix));
    } else {
      keys.push(nextPrefix);
    }
  }
  return keys;
}

export default async function I18nCheckPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'i18nCheck' });
  const trPath = path.join(process.cwd(), 'messages/tr.json');
  const enPath = path.join(process.cwd(), 'messages/en.json');

  const trData = JSON.parse(fs.readFileSync(trPath, 'utf-8'));
  const enData = JSON.parse(fs.readFileSync(enPath, 'utf-8'));

  const trKeys = new Set(getDeepKeys(trData));
  const enKeys = new Set(getDeepKeys(enData));

  const missingInEn = Array.from(trKeys).filter(k => !enKeys.has(k));
  const missingInTr = Array.from(enKeys).filter(k => !trKeys.has(k));

  const totalKeys = new Set([...trKeys, ...enKeys]).size;
  const parityMatch = missingInEn.length === 0 && missingInTr.length === 0;

  return (
    <main id="main" className="flex-1 w-full max-w-4xl mx-auto py-8 px-edge sm:px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold font-heading text-ink">{t('title')}</h1>
        <p className="text-muted mt-1">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-surface border border-border rounded-xl p-5 shadow-2xs">
          <div className="text-xs text-muted uppercase font-semibold">{t('total_unique_keys')}</div>
          <div className="text-3xl font-bold mt-1 text-ink">{totalKeys}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5 shadow-2xs">
          <div className="text-xs text-muted uppercase font-semibold">{t('tr_coverage')}</div>
          <div className="text-3xl font-bold mt-1 text-ok">{t('keys_count', { n: trKeys.size })}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5 shadow-2xs">
          <div className="text-xs text-muted uppercase font-semibold">{t('en_coverage')}</div>
          <div className="text-3xl font-bold mt-1 text-accent">{t('keys_count', { n: enKeys.size })}</div>
        </div>
      </div>

      <div className={`p-4 rounded-xl border mb-6 flex items-center gap-3 ${parityMatch ? 'bg-ok/10 border-ok/30 text-ok' : 'bg-bad/10 border-bad/30 text-bad'}`}>
        <span className="text-2xl">{parityMatch ? '✅' : '⚠️'}</span>
        <div>
          <div className="font-bold">{parityMatch ? t('parity_ok_title') : t('parity_bad_title')}</div>
          <div className="text-sm">{parityMatch ? t('parity_ok_desc') : t('parity_bad_desc')}</div>
        </div>
      </div>

      {missingInEn.length > 0 && (
        <div className="mb-6 bg-surface border border-bad/30 rounded-xl p-5 shadow-2xs">
          <h2 className="text-bad font-bold mb-2">{t('missing_en')}</h2>
          <ul className="list-disc pl-5 text-sm space-y-1 text-ink-2 font-mono">
            {missingInEn.map(k => <li key={k}>{k}</li>)}
          </ul>
        </div>
      )}

      {missingInTr.length > 0 && (
        <div className="mb-6 bg-surface border border-bad/30 rounded-xl p-5 shadow-2xs">
          <h2 className="text-bad font-bold mb-2">{t('missing_tr')}</h2>
          <ul className="list-disc pl-5 text-sm space-y-1 text-ink-2 font-mono">
            {missingInTr.map(k => <li key={k}>{k}</li>)}
          </ul>
        </div>
      )}
    </main>
  );
}

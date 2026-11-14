/**
 * Elle tetikleme: TR ajans çağrı toplayıcıları (`pnpm jobs:tr-agency`).
 *
 *   pnpm jobs:tr-agency                   çek + DB'ye yaz
 *   pnpm jobs:tr-agency -- --dry-run     çek + plan, DB'ye dokunma
 *   pnpm jobs:tr-agency -- --from-json F Python çıktısını (--with-body) dosyadan oku, ağ yok
 *
 * Yalnız workers/agencies'te `status="open"` olan kaynaklar çekilir (Python tarafı zorlar).
 * Çekim Python'da yapılır; bu script yalnız sonucu DB'ye yazar.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { collectAgencySource, persistAgencyRun, planAgencyWrites, type AgencyRunSummary } from '../src/lib/jobs/tasks/tr-agency-calls';

const OPEN_SOURCES = ['istka', 'ua'];
const WORKDIR = path.resolve(__dirname, '..', 'workers', 'agencies');

function flagValue(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const fromJson = flagValue('from-json');

  const runs: AgencyRunSummary[] = fromJson
    ? [JSON.parse(readFileSync(fromJson, 'utf-8')) as AgencyRunSummary]
    : [];
  if (!fromJson) {
    for (const key of OPEN_SOURCES) {
      runs.push(await collectAgencySource(key, { workdir: WORKDIR }));
    }
  }

  for (const run of runs) {
    const plan = planAgencyWrites(run);
    console.log(
      `[jobs:tr-agency] ${run.source}: calls=${run.calls.length} rawFetch=${plan.rawFetch ? 'yes' : 'no'} alerts=${plan.alerts.length}${run.fetchError ? ` fetchError=${run.fetchError}` : ''}`,
    );
    if (dryRun) continue;
    const res = await persistAgencyRun(run);
    console.log(`[jobs:tr-agency] ${run.source}: ${JSON.stringify(res)}`);
  }

  if (!dryRun) {
    const { prisma } = await import('../src/lib/db');
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// crw2-fb TASK-MUODXN8FCT2PW: one M4 digest pass of the release checked out in
// cwd, narrowed to the given tenants, recording mailer. argv: [nowISO|-] tenant...
import { sendStaleRelationshipReminders } from './src/lib/relationships/stale-reminder';
async function main() {
  const [nowArg, ...tenantIds] = process.argv.slice(2);
  const sent: string[] = [];
  const opts: Record<string, unknown> = {
    mailer: async (m: { to: string }) => { sent.push(m.to); },
    appUrl: 'https://app.example.test',
    tenantIds,
  };
  if (nowArg && nowArg !== '-') opts.now = new Date(nowArg);
  const r = await (sendStaleRelationshipReminders as (o: unknown) => Promise<{ digestsSent: number; tenantsFailed: number; errors: unknown[] }>)(opts);
  console.log(JSON.stringify({ now: nowArg, digestsSent: r.digestsSent, sent, tenantsFailed: r.tenantsFailed, errors: r.errors }));
  process.exit(0);
}
void main();

// Runs one M4 digest pass of the release checked out in cwd, narrowed to the
// given tenants, with a recording mailer. Prints the recipients.
import { sendStaleRelationshipReminders } from './src/lib/relationships/stale-reminder';
async function main() {
  const tenantIds = process.argv.slice(2);
  const sent: string[] = [];
  const r = await sendStaleRelationshipReminders({
    mailer: async (m: { to: string }) => { sent.push(m.to); },
    appUrl: 'https://app.example.test',
    tenantIds,
  });
  console.log(JSON.stringify({ digestsSent: r.digestsSent, sent, tenantsFailed: r.tenantsFailed, errors: r.errors }));
  process.exit(0);
}
void main();

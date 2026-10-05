import { sendStaleRelationshipReminders } from '@/lib/relationships/stale-reminder';
async function main() {
  const r = await sendStaleRelationshipReminders({ mailer: null, appUrl: 'x', now: new Date('2026-09-30T07:23:00Z'), tenantIds: ['i69-s3-a', 'i69-s3-b'] });
  console.log(JSON.stringify(r));
}
main().then(() => process.exit(0));

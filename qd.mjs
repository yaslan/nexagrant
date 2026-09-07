import pg from 'pg';
const url = process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';
const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
try {
  await c.connect();
  for (const q of [
    `select id, slug, name from "Tenant" limit 5`,
    `select id, "tenantId", left(title,50) title from "Opportunity" limit 5`,
    `select id, "tenantId", "interactionId", "partnerName", "meetingScheduledAt" from "MeetingBrief" order by "createdAt" desc limit 10`,
    `select count(*)::int from "CalendarConnection"`,
  ]) {
    try { const r = await c.query(q); console.log('>>', q, '\n', JSON.stringify(r.rows, null, 1)); }
    catch (e) { console.log('>>', q, '\n ERR', e.message); }
  }
} catch (e) { console.log('CONNECT ERR', e.message); }
await c.end().catch(()=>{});

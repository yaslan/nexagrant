const pg = require(require.resolve('pg', { paths: [process.cwd()] }));
(async () => {
  const c = new pg.Client({ connectionString: process.env.PROBE_URL, connectionTimeoutMillis: 8000 });
  try { await c.connect();
    const r = await c.query("select current_user u, (select ssl from pg_stat_ssl where pid=pg_backend_pid()) ssl");
    console.log('OK', JSON.stringify(r.rows[0])); }
  catch (e) { console.log('FAIL', e.code || '', e.message.split('\n')[0]); }
  finally { await c.end().catch(()=>{}); }
})();

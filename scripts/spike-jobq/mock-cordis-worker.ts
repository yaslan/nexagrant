/**
 * SPIKE (TASK-MUMLFDTNQ53VJ) — stand-in for the Python CORDIS worker.
 * Counts every POST /jobs/cordis so a duplicate run is visible from outside
 * the queue. Each answer carries `hit` + `ranAt`, so the job's RawFetch row
 * hash differs per call and RawFetch gets exactly one row per real run.
 *   MOCK_FAIL_FIRST=N  answer 503 to the first N calls (retry proof)
 *   MOCK_DELAY_MS      how long a "pipeline run" takes (default 3000)
 */
import http from 'node:http';

const port = Number(process.env.MOCK_PORT ?? 18077);
const failFirst = Number(process.env.MOCK_FAIL_FIRST ?? 0);
const delayMs = Number(process.env.MOCK_DELAY_MS ?? 3000);
let hits = 0;

http
  .createServer((req, res) => {
    hits += 1;
    const hit = hits;
    const started = new Date().toISOString();
    console.log(`[mock] hit=${hit} ${req.method} ${req.url} at=${started}`);
    setTimeout(() => {
      if (hit <= failFirst) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'mock outage', hit }));
        console.log(`[mock] hit=${hit} -> 503`);
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'mock pipeline done', hit, ranAt: started }));
      console.log(`[mock] hit=${hit} -> 200`);
    }, delayMs);
  })
  .listen(port, () => console.log(`[mock] listening :${port} failFirst=${failFirst} delayMs=${delayMs}`));

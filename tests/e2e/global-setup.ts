import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function globalSetup() {
  const { stdout } = await execAsync('ps aux | grep -E "node.*next dev" | grep -v grep | head -1 || echo ""');
  const match = stdout.match(/\S+\s+(\d+)/);
  const pid = match ? match[1] : 'none';

  // Log server info at the start of e2e tests so gate output shows what server is running
  console.log(`[e2e-gate] Dev server info: PID=${pid}`);

  try {
    const { stdout: env } = await execAsync(`ps eww ${pid} 2>/dev/null | grep -o 'INVOICE_SUPPLIER_NAME=\\S*' || echo 'env-not-loaded'`);
    console.log(`[e2e-gate] Test data: ${env.trim() ? 'INVOICE_SUPPLIER_NAME loaded' : 'env-not-loaded (stale server)'}`);
  } catch {
    console.log(`[e2e-gate] Test data: unable to check (new server)`);
  }
}

export default globalSetup;

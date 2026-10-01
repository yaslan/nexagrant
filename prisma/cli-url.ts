import { existsSync } from 'fs';
import path from 'path';

/**
 * TASK-MUOG51GJ3PUOG Y-1 (R-S7) — the Prisma CLI (schema engine: `db push`,
 * `migrate diff --from-config-datasource`, `db pull`) does not speak libpq's
 * TLS parameters. It reads an unknown `sslmode` such as `verify-full` as
 * `prefer` and ignores `sslrootcert`, so the owner role's DDL session would
 * go over TLS without checking the certificate or the host name (measured:
 * a wrong CA still connected, crw2-fb golive review §2.2).
 *
 * The operator keeps one URL (`?sslmode=verify-full&sslrootcert=<CA>`, the
 * form node-pg, psql and pg_dump verify with). Only `prisma.config.ts` hands
 * the CLI its own spelling of the same check:
 *   sslmode=require&sslaccept=strict&sslcert=<absolute CA path>
 * (`sslaccept=strict` checks the chain and the host name; Prisma's `sslcert`
 * is the server CA, not a client certificate).
 *
 * Never give the converted URL to node-pg (src/lib/db.ts, the worker, the
 * scripts): pg-connection-string reads `sslcert` as a client certificate.
 * This function returns a new string and never touches process.env.
 */
export function toPrismaCliUrl(url: string | undefined, cwd: string = process.cwd()): string | undefined {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL Prisma could use either; let the CLI report it.
    return url;
  }
  const params = parsed.searchParams;
  const mode = params.get('sslmode');
  if (mode !== 'verify-full' && mode !== 'verify-ca') return url;

  if (params.has('sslcert') || params.has('sslaccept')) {
    throw new Error(
      `DATABASE_URL has sslmode=${mode} together with sslcert/sslaccept; ` +
        'give only sslmode=verify-full&sslrootcert=<CA> (prisma.config.ts converts it for the Prisma CLI).'
    );
  }

  const rootcert = params.get('sslrootcert');
  params.delete('sslrootcert');
  params.set('sslmode', 'require');
  // verify-ca has no Prisma equivalent; strict is the stricter of the two.
  params.set('sslaccept', 'strict');
  if (rootcert) {
    if (rootcert === 'system') {
      // libpq: use the system store. Prisma with strict and no sslcert checks
      // against its built-in roots (measured: a private CA is refused).
    } else {
      const ca = path.resolve(cwd, rootcert);
      if (!existsSync(ca)) {
        throw new Error(`DATABASE_URL sslrootcert not found: ${ca}`);
      }
      params.set('sslcert', ca);
    }
  }
  return parsed.toString();
}

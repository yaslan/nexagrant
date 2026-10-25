/**
 * FO-147 — argument parsing for `jobs:seat-rescore`, kept pure so the guards can be tested.
 *
 * A run has to name its scope: `--tenant <id>`, or `--all-tenants` for every tenant. A bare
 * `--tenant` with no value is an error; it must never fall through to "all tenants". `--apply`
 * against a non-local database also needs `--confirm-remote-db`.
 */

export interface SeatRescoreOptions {
  apply: boolean;
  tenantId: string | null;
  allTenants: boolean;
  verbose: boolean;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Same fallback as `src/lib/db.ts`: an unset DATABASE_URL means the local dev database.
 * A URL that does not parse counts as remote, so the guard fails closed.
 */
export function isLocalDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return true;
  try {
    return LOCAL_HOSTS.has(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

export function parseSeatRescoreArgs(
  argv: string[],
  databaseUrl: string | undefined,
): SeatRescoreOptions {
  const opts: SeatRescoreOptions = { apply: false, tenantId: null, allTenants: false, verbose: false };
  let confirmRemoteDb = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    // `pnpm jobs:seat-rescore -- --apply` forwards the bare separator; skip it rather than reject it.
    if (arg === '--') continue;
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--dry-run') opts.apply = false;
    else if (arg === '--verbose') opts.verbose = true;
    else if (arg === '--all-tenants') opts.allTenants = true;
    else if (arg === '--confirm-remote-db') confirmRemoteDb = true;
    else if (arg === '--tenant' || arg.startsWith('--tenant=')) {
      // A value that is missing, empty, or another flag is an error — never "all tenants".
      const value = (arg === '--tenant' ? argv[++i] : arg.slice('--tenant='.length))?.trim();
      if (!value || value.startsWith('--')) {
        throw new Error('--tenant needs a tenant id, e.g. --tenant demo-tenant');
      }
      opts.tenantId = value;
    } else if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
  }

  if (opts.tenantId && opts.allTenants) {
    throw new Error('Use either --tenant <id> or --all-tenants, not both.');
  }
  if (!opts.tenantId && !opts.allTenants) {
    throw new Error('Name the scope: --tenant <id>, or --all-tenants for every tenant.');
  }
  if (opts.apply && !confirmRemoteDb && !isLocalDatabaseUrl(databaseUrl)) {
    throw new Error(
      'DATABASE_URL points to a non-local host. --apply there also needs --confirm-remote-db.',
    );
  }
  return opts;
}

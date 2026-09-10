/**
 * Writing the registration disclosure record — the server half of
 * TASK-MTSWLANXSU0IG (A3).
 *
 * There are TWO places an account comes into existence, and a record
 * written in only one of them would leave the gap open for half of all
 * registrations:
 *
 *   1. `authorize` in src/lib/auth.ts — the e-mail/credentials form. The
 *      acknowledgement travels with the credentials, so it is verified BEFORE
 *      the account exists and the account is refused without it.
 *   2. `events.createUser` in src/lib/auth.ts — Google/Microsoft OAuth, where
 *      the adapter has already created the user by the time anything of ours
 *      runs. Nothing there can refuse, so that path records what it can and
 *      raises a SystemAlert when it cannot (CLAUDE.md rule 6: raise the alert,
 *      do not break the job).
 *
 * Both call `writeRegistrationConsent` so the row shape, and the decision about
 * what a row means, exist once.
 */
import type { Prisma } from '@prisma/client';

import { registrationConsentRows } from './consent-documents';

/**
 * Binds the transaction to a tenant so RLS admits the writes that follow.
 *
 * Registration is the one flow that cannot use `withTenant`: the tenant does
 * not exist until partway through the very transaction that needs it, so there
 * is nothing to scope the transaction to when it opens. This is the same
 * mechanism `withTenantOn` uses (src/lib/db.ts) — `set_config(..., is_local =>
 * true)`, bound not interpolated — applied at the first moment there is a
 * tenant id to apply.
 *
 * Until this was called, `Membership` and `Workspace` were being written in
 * that transaction with no `app.tenant_id` set at all. Under the local
 * SUPERUSER role that works, which is why nobody saw it; under the NOBYPASSRLS
 * role a deployment actually uses, `tenant_isolation` refuses every one of
 * them. So this call is not only what lets the consent row land — it is what
 * lets the bootstrap work at all off a superuser connection.
 */
export async function bindTransactionToTenant(
  tx: Prisma.TransactionClient,
  tenantId: string
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
}

/**
 * Writes the registration disclosure/terms rows inside the caller's
 * transaction.
 *
 * It takes `tx` and never the singleton on purpose. The proof that a person was
 * shown the notice has to be created or destroyed together with the account it
 * is about: an account with no record is an unprovable disclosure, and a record
 * with no account is a claim about nobody. Handing this function its own
 * connection would make both possible, so it cannot have one.
 *
 * `createMany` here writes one row per document (privacy notice, terms) rather
 * than one row for the pair, because the two carry different `kind`s and will
 * version independently.
 */
export async function writeRegistrationConsent(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; userId: string; locale: string }
): Promise<number> {
  const rows = registrationConsentRows(input);
  const { count } = await tx.consent.createMany({ data: rows });
  return count;
}

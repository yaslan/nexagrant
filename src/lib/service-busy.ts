/**
 * A write refused because the database had no connection to give, as the
 * browser sees it (TASK-MUOF85BU7BV3X, İNCELEME-103 G-1).
 *
 * Every server action checks the pilot first (`requireTenantAction` →
 * `assertTenantActionWritable`, src/lib/tenant.ts), and that check is a query
 * on the application pool. When the pool had no free connection within
 * `connectionTimeoutMillis`, the action used to reject with pg-pool's own
 * "timeout exceeded when trying to connect": the browser showed the driver's
 * text in development and a bare "try again" in production. The check now
 * throws `ServiceBusyError` instead, stamped the same way a pilot refusal is
 * (src/lib/pilot-expired.ts): `digest = SERVICE_BUSY_DIGEST`, which Next.js
 * keeps and which is all the browser receives in production. The driver's text
 * goes to the server log only.
 *
 * The client reads it with `useActionErrorText`
 * (src/lib/hooks/use-action-error-text.ts). No server-only import here: client
 * components import it too.
 */

/** The digest (and `code`) a busy refusal carries across the action boundary. */
export const SERVICE_BUSY_DIGEST = 'SERVICE_BUSY';

/** The error code a value-returning action answers for a busy refusal. */
export const SERVICE_BUSY_CODE = 'serviceBusy';
export type ServiceBusyCode = typeof SERVICE_BUSY_CODE;

/**
 * True for a busy refusal in any shape it reaches us: the server-side error
 * (`code`), the error a rejected action gives the browser (`digest`), or the
 * code a value-returning action answered.
 */
export function isServiceBusy(error: unknown): boolean {
  if (error === SERVICE_BUSY_CODE) return true;
  if (typeof error !== 'object' || error === null) return false;
  const { code, digest } = error as { code?: unknown; digest?: unknown };
  return code === SERVICE_BUSY_DIGEST || digest === SERVICE_BUSY_DIGEST;
}

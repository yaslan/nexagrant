import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import {
  getIyzicoConfig,
  handleIyzicoWebhook,
  verifyIyzicoSignature,
  type IyzicoNotification,
} from '@/lib/iyzico';

/**
 * iyzico notification endpoint.
 *
 * Fail-closed by construction: the body is not parsed into anything that
 * touches the database until the `x-iyz-signature-v3` header has been verified
 * against the account secret. An unconfigured integration rejects every
 * delivery rather than accepting unverifiable ones.
 */

/** iyzico sends the signature in this header (v3 notification scheme). */
const SIGNATURE_HEADER = 'x-iyz-signature-v3';

export async function POST(request: Request) {
  const config = getIyzicoConfig();
  if (!config) {
    // 503, not 400: the delivery may well be genuine, we simply cannot check
    // it. iyzico retries on 5xx, so a later configuration fix recovers it.
    console.error('[iyzico webhook] rejected: integration is not configured');
    return internalError({ success: false, error: 'service_unavailable' }, { status: 503 });
  }

  const raw = await request.text();

  let notification: IyzicoNotification;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('body is not a JSON object');
    }
    notification = parsed as IyzicoNotification;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Malformed notification body' },
      { status: 400 }
    );
  }

  const signature = request.headers.get(SIGNATURE_HEADER);
  if (!verifyIyzicoSignature(notification, signature, config.secretKey)) {
    // No detail in the response and no body in the log: a signature oracle
    // helps only an attacker.
    console.warn('[iyzico webhook] rejected: signature verification failed');
    return NextResponse.json(
      { success: false, error: 'Signature verification failed' },
      { status: 401 }
    );
  }

  try {
    const result = await handleIyzicoWebhook(notification);

    if (!result.success) {
      // A refused-but-authentic notification is a permanent condition
      // (unattributable, unknown tenant, failed payment). 200 stops iyzico
      // from retrying something that will never succeed; the outcome says why.
      console.warn(`[iyzico webhook] not synced: ${result.outcome}`);
      return NextResponse.json({ received: true, ...result });
    }

    console.log(
      `[iyzico webhook] ${result.outcome}: tenant=${result.tenantId} plan=${result.planId} credits=${result.creditsGranted ?? 0}`
    );
    return NextResponse.json({ received: true, ...result });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    // 500 so the provider retries; the idempotency guard makes the retry safe.
    console.error(`[iyzico webhook] processing failed: ${err.message}`);
    return internalError({ success: false, error: 'Notification could not be processed' });
  }
}

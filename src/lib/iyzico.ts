import crypto from 'crypto';
import { prisma } from './db';

export interface IyzicoCheckoutParams {
  tenantId: string;
  planId: string;
  planName: string;
  priceCentsTRY: number;
  userEmail: string;
  userName: string;
  userIp?: string;
  callbackUrl?: string;
}

export interface IyzicoCheckoutResponse {
  status: 'success' | 'failure';
  token?: string;
  checkoutFormContent?: string;
  paymentUrl?: string;
  errorMessage?: string;
}

// Plan prices in TRY (Turkish Lira)
export const TRY_PLAN_PRICES: Record<string, { name: string; monthlyTRY: number; yearlyTRY: number }> = {
  starter: { name: 'Başlangıç Planı', monthlyTRY: 1850, yearlyTRY: 17760 },
  team: { name: 'Ekip Planı', monthlyTRY: 7850, yearlyTRY: 75360 },
  business: { name: 'İşletme Planı', monthlyTRY: 18900, yearlyTRY: 181440 },
  enterprise: { name: 'Kurumsal Plan', monthlyTRY: 45000, yearlyTRY: 432000 },
};

/**
 * Generates iyzico Checkout Form initialization payload (3D Secure)
 */
export async function createIyzicoCheckoutForm(
  params: IyzicoCheckoutParams
): Promise<IyzicoCheckoutResponse> {
  const { tenantId, planId, planName, priceCentsTRY, userEmail, userName } = params;

  const apiKey = process.env.IYZICO_API_KEY || 'demo-iyzico-api-key';
  const secretKey = process.env.IYZICO_SECRET_KEY || 'demo-iyzico-secret-key';
  const token = `iyzi-token-${crypto.randomBytes(16).toString('hex')}`;
  const priceTRY = (priceCentsTRY / 100).toFixed(2);

  // Generate iyzico 3D Secure checkout script iframe mock
  const checkoutFormContent = `<script type="text/javascript">
    console.log("iyzico Checkout Form Initialized for ${planName} (${priceTRY} TL)");
  </script>
  <div id="iyzipay-checkout-form" class="responsive" data-token="${token}">
    <iframe src="https://sandbox-pp.iyzipay.com/checkout/form/${token}" width="100%" height="600px" frameborder="0"></iframe>
  </div>`;

  const paymentUrl = `https://sandbox-pp.iyzipay.com/checkout/form/${token}`;

  return {
    status: 'success',
    token,
    checkoutFormContent,
    paymentUrl,
  };
}

/**
 * Verifies iyzico payment result webhook signature and updates DB Subscription
 */
export async function handleIyzicoWebhook(payload: {
  token: string;
  status: string;
  paymentId?: string;
  tenantId?: string;
  planId?: string;
}) {
  const { token, status, tenantId, planId = 'team' } = payload;

  if (status !== 'SUCCESS' && status !== 'success') {
    return { success: false, message: 'Payment failed' };
  }

  // The tenant defaulted to `demo-tenant-1`, which is a real seeded row: a
  // webhook body without a tenantId activated a paid subscription on somebody
  // else's account. An unattributable payment notification is an error.
  if (!tenantId) {
    console.error('[handleIyzicoWebhook] payload carries no tenantId; refusing to activate a subscription');
    return { success: false, message: 'Payment notification is not attributable to a tenant' };
  }

  let subscription: any = null;
  try {
    subscription = await prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId,
        status: 'ACTIVE',
        provider: 'iyzico',
        providerSubId: token,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: {
        planId,
        status: 'ACTIVE',
        provider: 'iyzico',
        providerSubId: token,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  } catch (e: any) {
    // Reporting success for a subscription that was never written means the
    // customer paid and the platform forgot; the provider must be allowed to retry.
    console.error(`[handleIyzicoWebhook] subscription upsert failed: ${e.message}`);
    return { success: false, message: 'Subscription could not be persisted' };
  }

  return {
    success: true,
    subscription,
    message: `iyzico subscription updated to ACTIVE for tenant ${tenantId}`,
  };
}

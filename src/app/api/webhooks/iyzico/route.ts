import { NextResponse } from 'next/server';
import { handleIyzicoWebhook } from '@/lib/iyzico';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await handleIyzicoWebhook(body);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[iyzico Webhook Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Webhook processing failed' },
      { status: 400 }
    );
  }
}

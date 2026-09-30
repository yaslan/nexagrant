/**
 * POST /api/feedback — in-product beta report intake.
 *
 * Accepts multipart/form-data (so a screenshot can ride along) and plain JSON.
 * Auth is required: an unauthenticated report has no tenant and cannot be
 * triaged or answered.
 */

import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { submitFeedback, type FeedbackScreenshot } from '@/lib/feedback/submit';

export const runtime = 'nodejs';

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const BodySchema = z.object({
  category: z.enum(['BUG', 'FEATURE_REQUEST', 'UX', 'PERFORMANCE', 'DATA_QUALITY', 'OTHER']),
  impact: z.enum(['BLOCKER', 'MAJOR', 'MINOR', 'IDEA']),
  title: z.string().trim().min(4).max(160),
  body: z.string().trim().min(10).max(4000),
  pageUrl: z.string().trim().max(500).optional(),
  workspaceSlug: z.string().trim().max(120).optional(),
  locale: z.enum(['tr', 'en']).default('tr'),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  // auth.ts widens the session with tenantId/role in its session callback;
  // next-auth's own Session type does not declare them.
  const tenantId = (session as unknown as { tenantId?: string } | null)?.tenantId;

  if (!session?.user || !tenantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let raw: Record<string, unknown>;
  let screenshot: FeedbackScreenshot | null = null;

  const contentType = req.headers.get('content-type') || '';

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      raw = Object.fromEntries(
        Array.from(form.entries())
          .filter(([, value]) => typeof value === 'string')
          .map(([key, value]) => [key, value as string])
      );

      const file = form.get('screenshot');
      if (file && typeof file !== 'string') {
        if (!ALLOWED_SCREENSHOT_TYPES.has(file.type)) {
          return NextResponse.json(
            { error: 'screenshot_type_not_allowed', allowed: [...ALLOWED_SCREENSHOT_TYPES] },
            { status: 415 }
          );
        }
        if (file.size > MAX_SCREENSHOT_BYTES) {
          return NextResponse.json(
            { error: 'screenshot_too_large', maxBytes: MAX_SCREENSHOT_BYTES },
            { status: 413 }
          );
        }
        screenshot = {
          filename: file.name || 'screenshot.png',
          contentType: file.type,
          data: Buffer.from(await file.arrayBuffer()),
        };
      }
    } else {
      raw = (await req.json()) as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ error: 'malformed_request' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 422 }
    );
  }

  try {
    const result = await submitFeedback({
      tenantId,
      userId: session.user.id ?? null,
      userEmail: session.user.email ?? null,
      workspaceSlug: parsed.data.workspaceSlug ?? null,
      category: parsed.data.category,
      impact: parsed.data.impact,
      title: parsed.data.title,
      body: parsed.data.body,
      pageUrl: parsed.data.pageUrl ?? null,
      // Truncated: the full UA string is long and adds nothing past the browser.
      userAgent: (req.headers.get('user-agent') || '').slice(0, 300) || null,
      locale: parsed.data.locale,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION || null,
      screenshot,
    });

    logger.info('beta feedback received', {
      feedbackId: result.id,
      priority: result.priority,
      alertStatus: result.alertStatus,
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    logger.error('beta feedback submission failed', error, { tenantId });
    return internalError({ error: 'submission_failed' });
  }
}

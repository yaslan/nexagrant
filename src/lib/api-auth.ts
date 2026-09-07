import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/errors';

export interface AuthenticatedApiRequest {
  tenantId: string;
  apiKeyId: string;
  name: string;
}

/**
 * Validates API key from `x-api-key` or `Authorization: Bearer <key>` header
 */
export async function authenticateApiKey(req: Request): Promise<
  | { authenticated: true; data: AuthenticatedApiRequest }
  | { authenticated: false; errorResponse: NextResponse }
> {
  const apiKeyHeader =
    req.headers.get('x-api-key') ||
    req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');

  if (!apiKeyHeader) {
    return {
      authenticated: false,
      errorResponse: NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Missing API key. Provide `x-api-key` or `Authorization: Bearer <key>` header.',
          code: 'AUTH_MISSING_API_KEY',
        },
        { status: 401 }
      ),
    };
  }

  // Hash key with SHA-256
  const keyHash = crypto.createHash('sha256').update(apiKeyHeader).digest('hex');

  try {
    const keyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!keyRecord) {
      // An unknown key is rejected, full stop. There used to be a prefix
      // escape hatch here (`fp_live_demo...`) that authenticated the caller as
      // a fixed tenant — that is an unauthenticated cross-tenant read for
      // anyone who can guess a prefix, so it is gone. Integration testing uses
      // a real ApiKey row created by the seed.
      return {
        authenticated: false,
        errorResponse: NextResponse.json(
          {
            error: 'Unauthorized',
            message: 'Invalid or revoked API key.',
            code: 'AUTH_INVALID_API_KEY',
          },
          { status: 401 }
        ),
      };
    }

    // Update lastUsedAt asynchronously
    prisma.apiKey
      .update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return {
      authenticated: true,
      data: {
        tenantId: keyRecord.tenantId,
        apiKeyId: keyRecord.id,
        name: keyRecord.name,
      },
    };
  } catch (e) {
    // A database outage must fail closed. The previous behaviour authenticated
    // any `fp_live_` prefixed string as a fixed tenant whenever the key lookup
    // threw, which turned an outage into an open door.
    console.error(`[authenticateApiKey] key lookup failed: ${errorMessage(e)}`);

    return {
      authenticated: false,
      errorResponse: NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'API key authentication failed.',
          code: 'AUTH_INTERNAL_ERROR',
        },
        { status: 500 }
      ),
    };
  }
}

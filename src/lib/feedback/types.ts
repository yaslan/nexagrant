/**
 * Shape of a Feedback row as it comes back from Prisma.
 *
 * Declared by hand because src/types/prisma-override.d.ts shadows
 * @prisma/client and types PrismaClient as `any` in this repo — without this,
 * every read of a feedback row would be untyped, and `any` is banned by
 * CLAUDE.md. Keep it in step with the Feedback model in prisma/schema.prisma.
 */
export interface FeedbackRecord {
  id: string;
  tenantId: string;
  userId: string | null;
  workspaceSlug: string | null;
  category: string;
  impact: string;
  priority: string;
  autoPriority: string;
  status: string;
  title: string;
  body: string;
  triageReason: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  appVersion: string | null;
  locale: string;
  screenshotKey: string | null;
  sentryEventId: string | null;
  sentryStatus: string | null;
  triageNote: string | null;
  triagedById: string | null;
  triagedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The `select`ed shape used when only tenant naming is needed. */
export interface TenantNameRow {
  id: string;
  name: string;
}

export interface UserContactRow {
  id: string;
  email: string | null;
  name: string | null;
}

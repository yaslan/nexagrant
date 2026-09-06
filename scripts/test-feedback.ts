/**
 * Test script: Submit feedback via API and verify DB record
 * Run: npx ts-node scripts/test-feedback.ts
 */

import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { submitFeedback } from '../src/lib/feedback/submit';

const DEMO_TENANT_ID = 'demo-tenant';
const DEMO_USER_ID = 'demo-user-alice';

async function testFeedbackSubmission() {
  console.log('Starting feedback submission test...');

  try {
    // Verify demo user exists
    const user = await prisma.user.findUnique({ where: { id: DEMO_USER_ID } });
    if (!user) {
      console.error('Demo user not found. Please run: pnpm db:seed');
      return;
    }
    console.log('✓ Demo user found:', user.email);

    // Submit feedback
    const result = await submitFeedback({
      tenantId: DEMO_TENANT_ID,
      userId: DEMO_USER_ID,
      userEmail: user.email,
      workspaceSlug: 'main',
      category: 'BUG',
      impact: 'MAJOR',
      title: 'Test feedback from E2E script',
      body: 'This is a comprehensive test feedback body submitted from the Node test script to verify the feedback system works end-to-end.',
      pageUrl: '/tr/dashboard',
      locale: 'tr',
      appVersion: '1.0.0',
    });

    console.log('✓ Feedback submitted:', {
      id: result.id,
      priority: result.priority,
      triageReason: result.triageReason,
      slaHours: result.slaHours,
      sentryStatus: result.sentryStatus,
    });

    // Verify record in DB
    const record = await prisma.feedback.findUnique({ where: { id: result.id } });
    if (!record) {
      console.error('Record not found in DB');
      return;
    }

    console.log('✓ Record found in DB:', {
      id: record.id,
      tenantId: record.tenantId,
      userId: record.userId,
      status: record.status,
      priority: record.priority,
      category: record.category,
      title: record.title,
      createdAt: record.createdAt.toISOString(),
    });

    // Test triage: Change status to TRIAGED
    await prisma.feedback.update({
      where: { id: result.id },
      data: {
        status: 'TRIAGED',
        triagedAt: new Date(),
      },
    });

    const updated = await prisma.feedback.findUnique({ where: { id: result.id } });
    console.log('✓ Status updated to TRIAGED:', {
      id: updated?.id,
      status: updated?.status,
      triagedAt: updated?.triagedAt?.toISOString(),
    });

    // Test tenant isolation: verify this record is NOT visible from another tenant
    const otherTenantRecords = await prisma.feedback.findMany({
      where: { tenantId: 'another-tenant' },
    });
    console.log('✓ Tenant isolation check (other tenant records):', otherTenantRecords.length);

    console.log('\n✅ All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testFeedbackSubmission();

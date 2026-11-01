import { prisma } from '../src/lib/db';

/**
 * E11.2 — minimal seed: 5 feedback reports from Fabrika Beta tenant to show triage dashboard.
 * Covers all categories, realistic issues beta team would see.
 */
export default async function seedE11Feedback() {
  // Find Fabrika Beta tenant (created by seedTenantWorkspace).
  const tenant = await prisma.tenant.findFirst({
    where: { name: 'Fabrika Beta' },
  });
  if (!tenant) {
    console.log('⊘ Fabrika Beta tenant not found; skipping feedback seed');
    return;
  }

  // Use a user from the demo tenant if available.
  const membership = await prisma.membership.findFirst({
    where: { tenantId: tenant.id },
    include: { user: true },
  });
  const user = membership?.user ?? null;

  const feedbacks = [
    {
      category: 'BUG' as const,
      impact: 'MAJOR' as const,
      title: 'Dashboard chart missing on tab switch',
      body: 'When I switch tabs in Concept Note, the chart disappears and does not reload. Happens every time. I have to refresh the page.',
      workspaceSlug: 'research-hub',
    },
    {
      category: 'FEATURE_REQUEST' as const,
      impact: 'MINOR' as const,
      title: 'Bulk edit calls deadline',
      body: 'It would be really useful if I could select multiple calls and update their deadlines at once. Right now I have to do each one individually.',
      workspaceSlug: 'research-hub',
    },
    {
      category: 'UX' as const,
      impact: 'MINOR' as const,
      title: 'Save button jumps when error appears',
      body: 'The Save button moves down when a validation error shows. On mobile this is confusing. Button position should be fixed.',
      workspaceSlug: null,
    },
    {
      category: 'PERFORMANCE' as const,
      impact: 'MAJOR' as const,
      title: 'Evidence Pack search is slow',
      body: 'Searching in Evidence Pack takes 5–10 seconds. I have maybe 200 items. This is a bottleneck for our team.',
      workspaceSlug: 'research-hub',
    },
    {
      category: 'DATA_QUALITY' as const,
      impact: 'MINOR' as const,
      title: 'Partner name mismatch across modules',
      body: 'Partners list shows "Acme Research Ltd" but in Consortium Matching I see "Acme Research". Which is the authoritative version?',
      workspaceSlug: null,
    },
  ];

  for (const fb of feedbacks) {
    const existing = await prisma.feedback.findFirst({
      where: { title: fb.title, tenantId: tenant.id },
    });

    if (!existing) {
      await prisma.feedback.create({
        data: {
          tenantId: tenant.id,
          userId: user?.id ?? null,
          category: fb.category,
          impact: fb.impact,
          title: fb.title,
          body: fb.body,
          workspaceSlug: fb.workspaceSlug,
          pageUrl: '/dashboard',
          locale: 'tr',
        },
      });
    }
  }

  console.log('✓ E11.2 feedback seed complete');
}

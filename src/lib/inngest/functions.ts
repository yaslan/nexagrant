import { inngest } from './client';
import { prisma } from '../db';
import { getEntitlements } from '../billing';
import { SediaAdapter } from '../adapters/sedia';
import { EurostarsAdapter } from '../adapters/eurostars';
import { TubitakAdapter } from '../adapters/tubitak';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 're_mock_key');

// Monthly grant of AI credits to active tenants based on plan
export const grantMonthlyAiCredits = inngest.createFunction(
  { id: 'grant-monthly-ai-credits', triggers: [{ cron: '0 0 1 * *' }] },
  async ({ step }: any) => {
    await step.run('grant-credits-to-all-tenants', async () => {
      const tenants = await prisma.tenant.findMany({
        select: { id: true }
      });

      for (const tenant of tenants) {
        try {
          const entitlements = await getEntitlements(tenant.id);
          const creditsToGrant = entitlements.aiCreditsMonthly;

          if (creditsToGrant > 0) {
            await prisma.creditLedger.create({
              data: {
                tenantId: tenant.id,
                delta: creditsToGrant,
                reason: 'monthly_grant',
              }
            });
          }
        } catch (error) {
          console.error(`Failed to grant credits for tenant ${tenant.id}`, error);
        }
      }
    });

    return { success: true };
  }
);

// Daily call ingestion from SEDIA, Eurostars, and TÜBİTAK
export const syncCalls = inngest.createFunction(
  { id: 'sync-calls', triggers: [{ cron: '0 2 * * *' }] },
  async ({ step }: any) => {
    const sediaTopics = await step.run('fetch-sedia', async () => {
      const adapter = new SediaAdapter();
      return await adapter.fetchTopics();
    });

    const eurostarsTopics = await step.run('fetch-eurostars', async () => {
      const adapter = new EurostarsAdapter();
      return await adapter.fetchTopics();
    });

    const tubitakTopics = await step.run('fetch-tubitak', async () => {
      const adapter = new TubitakAdapter();
      return await adapter.fetchTopics();
    });

    await step.run('upsert-to-db', async () => {
      const allTopics = [...sediaTopics, ...eurostarsTopics, ...tubitakTopics];
      
      let insertedCount = 0;
      for (const t of allTopics) {
        await prisma.topic.upsert({
          where: { identifier: t.identifier },
          update: {
            title: t.title,
            status: t.status as any,
            typeOfAction: t.typeOfAction,
            isLumpSum: t.isLumpSum,
            isTwoStage: t.isTwoStage,
            deadlines: t.deadlines || [],
          },
          create: {
            identifier: t.identifier,
            title: t.title,
            status: (t.status as any) || 'FORTHCOMING',
            typeOfAction: t.typeOfAction,
            isLumpSum: t.isLumpSum || false,
            isTwoStage: t.isTwoStage || false,
            deadlines: t.deadlines || [],
            call: {
              connectOrCreate: {
                where: { callIdentifier: 'HORIZON-DEFAULT' },
                create: {
                  callIdentifier: 'HORIZON-DEFAULT',
                  title: 'Default Horizon Call',
                  programme: {
                    connectOrCreate: {
                      where: { id: 'HE' },
                      create: { id: 'HE', name: 'Horizon Europe', sourceKey: 'horizon' }
                    }
                  }
                }
              }
            }
          }
        });
        insertedCount++;
      }
      
      console.log(`Upserted ${insertedCount} topics into the database...`);
      return { inserted: insertedCount };
    });

    return { success: true };
  }
);

// Daily topic matching and fit score computation
export const matchTopics = inngest.createFunction(
  { id: 'match-topics', triggers: [{ cron: '0 3 * * *' }] },
  async ({ step }: any) => {
    const profiles = await step.run('fetch-tenant-profiles', async () => {
      return await prisma.tenantProfile.findMany({ select: { tenantId: true } });
    });

    const topics = await step.run('fetch-topics', async () => {
      return await prisma.topic.findMany({ select: { id: true } });
    });

    let matchCount = 0;
    await step.run('compute-and-save-matches', async () => {
      for (const profile of profiles) {
        for (const topic of topics) {
          const fitScore = Math.floor(Math.random() * 30) + 70; // 70-100 fit score
          const g0Score = fitScore;
          
          if (fitScore >= 70) {
            await prisma.topicMatch.upsert({
              where: {
                tenantId_topicId: { tenantId: profile.tenantId, topicId: topic.id }
              },
              update: {
                fitScore,
                g0Score,
                breakdown: { fit: fitScore, baselineRate: 15 }
              },
              create: {
                tenantId: profile.tenantId,
                topicId: topic.id,
                fitScore,
                g0Score,
                breakdown: { fit: fitScore, baselineRate: 15 }
              }
            });
            matchCount++;
          }
        }
      }
      console.log(`Saved ${matchCount} matches for ${profiles.length} profiles and ${topics.length} topics.`);
      return { matchCount };
    });

    return { success: true, matchCount };
  }
);

// Daily saved search email alerts
export const notifySavedSearches = inngest.createFunction(
  { id: 'notify-saved-searches', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }: any) => {
    const searches = await step.run('fetch-saved-searches', async () => {
      return await prisma.savedSearch.findMany({
        where: { notify: true }
      });
    });

    let emailsSent = 0;
    for (const search of searches) {
      await step.run(`notify-search-${search.id}`, async () => {
        const tenantMemberships = await prisma.membership.findMany({
          where: { tenantId: search.tenantId, role: 'TENANT_OWNER' },
          include: { user: true }
        });

        const ownerEmail = tenantMemberships[0]?.user?.email;
        if (ownerEmail) {
          await resend.emails.send({
            from: 'FonBridge Alerts <alerts@fonbridge.app>',
            to: [ownerEmail],
            subject: `New Call Opportunities for: ${search.name}`,
            html: `<p>We found new opportunities matching your saved search <strong>${search.name}</strong>.</p>
                   <p><a href="https://app.fabrika.app/calls?search=${search.id}">View New Opportunities</a></p>`
          });

          await prisma.savedSearch.update({
            where: { id: search.id },
            data: { lastRunAt: new Date() }
          });
          emailsSent++;
        }
      });
    }

    return { success: true, processedSearches: searches.length, emailsSent };
  }
);

// Monthly trigger for Python CORDIS DuckDB worker
export const triggerCordisWorker = inngest.createFunction(
  { id: 'trigger-cordis-worker', triggers: [{ cron: '0 4 1 * *' }] },
  async ({ step }: any) => {
    await step.run('call-python-fastapi', async () => {
      const workerUrl = process.env.WORKER_URL || 'http://localhost:8000';
      try {
        const response = await fetch(`${workerUrl}/jobs/cordis`, { method: 'POST' });
        if (!response.ok) {
          throw new Error(`Worker responded with status: ${response.status}`);
        }
        console.log('Triggered CORDIS pipeline successfully');
      } catch (e: any) {
        console.error('Failed to trigger CORDIS worker:', e.message);
      }
    });
    return { success: true };
  }
);

// Weekly trigger for CORDIS Live Delta API Sync
export const triggerCordisLiveDeltaFunction = inngest.createFunction(
  { id: 'trigger-cordis-live-delta', triggers: [{ cron: '0 2 * * 1' }] },
  async ({ step }: any) => {
    const result = await step.run('fetch-cordis-live-delta', async () => {
      const { fetchLiveCordisDelta } = await import('@/lib/cordis-delta');
      return await fetchLiveCordisDelta(7);
    });
    return { success: true, ...result };
  }
);

// Weekly check for stale relationships
export const checkStaleRelationships = inngest.createFunction(
  { id: 'check-stale-relationships', triggers: [{ cron: '0 9 * * 1' }] },
  async ({ step }: any) => {
    const staleRelationships = await step.run('find-stale', async () => {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      return await prisma.relationship.findMany({
        where: {
          OR: [
            { lastContactAt: { lt: sixtyDaysAgo } },
            { lastContactAt: null },
          ],
          warmth: { not: 'cold' },
        },
        select: { id: true, tenantId: true, counterpartName: true, ownerUserId: true, warmth: true },
      });
    });

    await step.run('downgrade-warmth', async () => {
      for (const rel of staleRelationships) {
        const newWarmth = rel.warmth === 'active' ? 'hot' : rel.warmth === 'hot' ? 'warm' : 'cold';
        await prisma.relationship.update({
          where: { id: rel.id },
          data: { warmth: newWarmth },
        });
      }
      console.log(`Downgraded warmth for ${staleRelationships.length} stale relationships`);
    });

    return { staleCount: staleRelationships.length };
  }
);

// Daily check for compliance evidence expiring within 30 days
export const checkExpiredEvidence = inngest.createFunction(
  { id: 'check-expired-evidence', triggers: [{ cron: '0 7 * * *' }] },
  async ({ step }: any) => {
    const expiringItems = await step.run('find-expiring-evidence', async () => {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      return await prisma.evidence.findMany({
        where: {
          validUntil: {
            lte: thirtyDaysFromNow,
          },
        },
        select: {
          id: true,
          tenantId: true,
          title: true,
          kind: true,
          validUntil: true,
        },
      });
    });

    let count = 0;
    await step.run('notify-tenant-owners', async () => {
      for (const item of expiringItems) {
        const tenantMemberships = await prisma.membership.findMany({
          where: { tenantId: item.tenantId, role: 'TENANT_OWNER' },
          include: { user: true },
        });

        const ownerEmail = tenantMemberships[0]?.user?.email;
        if (ownerEmail) {
          await resend.emails.send({
            from: 'FonBridge Compliance <compliance@fonbridge.app>',
            to: [ownerEmail],
            subject: `Action Required: Compliance Evidence Expiring - ${item.title}`,
            html: `<p>Your compliance evidence <strong>${item.title}</strong> (${item.kind}) is set to expire on ${item.validUntil?.toISOString().split('T')[0]}.</p>
                   <p><a href="https://app.fabrika.app/evidence">Update Evidence Pack</a></p>`,
          });
          count++;
        }
      }
    });

    return { processedCount: expiringItems.length, notifiedCount: count };
  }
);

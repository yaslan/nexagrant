import 'dotenv/config';
import { prisma, withTenant } from '../src/lib/db';
import { grantsFor } from '../src/lib/billing/catalog';
import { LIFETIME_SKU } from '../src/lib/billing/lifetime-licence';

const TARGET_EMAIL = process.argv[2] || 'admin@yasinaslan.com.tr';

async function assignUltraLifetime() {
  console.log(`[Ultra Lifetime] Paket tanımlanıyor: ${TARGET_EMAIL}...`);

  const user = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    include: {
      memberships: {
        include: {
          tenant: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error(`Kullanıcı bulunamadı: ${TARGET_EMAIL}`);
  }

  // Kullanıcının bağlı olduğu tenantId (üyelik yoksa 'demo-tenant' varsayılan)
  const tenantId = user.memberships[0]?.tenantId || 'demo-tenant';
  console.log(`[Ultra Lifetime] Kullanıcı ID: ${user.id}, Tenant ID: ${tenantId}`);

  // 1. Ultra için yayımlanmış PlanVersion kontrolü
  const ultraVersion = await prisma.planVersion.findFirst({
    where: { planId: 'ultra', status: 'published' },
    orderBy: { version: 'desc' },
  });

  if (!ultraVersion) {
    throw new Error('Veritabanında "ultra" planına ait yayımlanmış bir PlanVersion bulunamadı.');
  }

  console.log(`[Ultra Lifetime] Yayımlanmış Ultra PlanVersion: ${ultraVersion.id} (v${ultraVersion.version})`);

  // 2. LifetimeLicence (Ömür boyu lisans) kaydı kontrolü / oluşturulması
  let licenceSeq: number;
  const existingLicence = await prisma.lifetimeLicence.findFirst({
    where: { tenantId },
  });

  if (existingLicence) {
    licenceSeq = existingLicence.seq;
    console.log(`[Ultra Lifetime] Mevcut LifetimeLicence #${existingLicence.seq} bulundu.`);
  } else {
    const highest = await prisma.lifetimeLicence.findFirst({
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    licenceSeq = (highest?.seq ?? 0) + 1;

    await withTenant(tenantId, (tx) =>
      tx.lifetimeLicence.create({
        data: {
          tenantId,
          seq: licenceSeq,
          sku: LIFETIME_SKU,
          amountMinor: 128800, // $1,288.00 (%50 indirimli liste tutarı)
          currency: 'USD',
          provider: 'manual',
          providerEventId: `manual_grant_${Date.now()}`,
          providerSessionId: `manual_session_${Date.now()}`,
          purchasedAt: new Date(),
        },
      })
    );
    console.log(`[Ultra Lifetime] LifetimeLicence #${licenceSeq} oluşturuldu (Tenant: ${tenantId}).`);
  }

  // 3. Subscription kaydını Ultra ve OMURBOYU20 kilitli fiyat ile güncelleme/oluşturma
  await withTenant(tenantId, (tx) =>
    tx.subscription.upsert({
      where: { tenantId },
      update: {
        planId: 'ultra',
        planVersionId: ultraVersion.id,
        status: 'ACTIVE',
        billingInterval: 'year',
        lockedTierCode: 'OMURBOYU20',
        lockedPercentOff: 50,
        lockedAmountMinor: 128800,
        lockedCurrency: 'USD',
        priceLockedAt: new Date(),
        trialEndsAt: null,
        currentPeriodEnd: null,
      },
      create: {
        tenantId,
        planId: 'ultra',
        planVersionId: ultraVersion.id,
        status: 'ACTIVE',
        billingInterval: 'year',
        lockedTierCode: 'OMURBOYU20',
        lockedPercentOff: 50,
        lockedAmountMinor: 128800,
        lockedCurrency: 'USD',
        priceLockedAt: new Date(),
        trialEndsAt: null,
        currentPeriodEnd: null,
      },
    })
  );
  console.log(`[Ultra Lifetime] Abonelik Ultra (ACTIVE, OMURBOYU20) olarak güncellendi.`);

  // 4. Tüm modülleri (M1–M11) etkinleştirme (ON)
  const ultraGrants = grantsFor('ultra');
  const allModules = ultraGrants?.moduleIds ?? [
    'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11'
  ];

  for (const moduleId of allModules) {
    await withTenant(tenantId, (tx) =>
      tx.moduleState.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId } },
        update: { status: 'ON', changedAt: new Date(), changedBy: user.id },
        create: { tenantId, moduleId, status: 'ON' },
      })
    );
  }
  console.log(`[Ultra Lifetime] Tüm modüller açıldı (${allModules.join(', ')} -> ON).`);

  // 5. Aylık 2.000 YZ Kredisi (bu ay için verilmemişse)
  const period = new Date().toISOString().slice(0, 7);
  const existingGrant = await withTenant(tenantId, (tx) =>
    tx.creditLedger.findFirst({
      where: { tenantId, grantPeriod: period },
    })
  );

  if (!existingGrant) {
    await withTenant(tenantId, (tx) =>
      tx.creditLedger.create({
        data: {
          tenantId,
          delta: ultraVersion.aiCreditsMonthly || 2000,
          reason: 'monthly_grant',
          refId: `monthly_grant:${period}`,
          grantPeriod: period,
        },
      })
    );
    console.log(`[Ultra Lifetime] ${period} dönemi için ${ultraVersion.aiCreditsMonthly || 2000} YZ kredisi tanımlandı.`);
  } else {
    console.log(`[Ultra Lifetime] ${period} dönemi için YZ kredisi zaten tanımlı.`);
  }

  // 6. Denetim günlüğü (AuditEvent)
  await withTenant(tenantId, (tx) =>
    tx.auditEvent.create({
      data: {
        type: 'subscription.ultra_lifetime_assigned',
        actorId: user.id,
        tenantId,
        target: 'ultra',
        data: {
          assignedTo: TARGET_EMAIL,
          licenceSeq,
          planId: 'ultra',
          planVersionId: ultraVersion.id,
          modules: allModules,
        },
      },
    })
  );

  console.log(`\n✓ ${TARGET_EMAIL} kullanıcısına Ultra Lifetime paketi başarıyla tanımlandı!`);
  console.log(`  - Plan: Ultra (${ultraVersion.id})`);
  console.log(`  - Lisans: #${licenceSeq} (lifetime-ultra)`);
  console.log(`  - Kilitli Kampanya: OMURBOYU20 (%50 indirim, $1.288)`);
  console.log(`  - Koltuk / Çalışma Alanı: 15 koltuk, 5 çalışma alanı`);
  console.log(`  - Modüller: ${allModules.join(', ')} (Tümü aktif)`);
  console.log(`  - Aylık YZ Kredisi: 2.000 kredi`);
}

assignUltraLifetime()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('[Ultra Lifetime] Hata:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

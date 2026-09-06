import * as fs from 'fs';
import * as path from 'path';

function checkRlsCoverage() {
  const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
  const rlsSqlPath = path.join(__dirname, '../prisma/rls.sql');

  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  const rlsSqlContent = fs.readFileSync(rlsSqlPath, 'utf-8');

  // Models that are system-wide (no tenantId needed, no RLS policy)
  const systemWideModels = new Set([
    'Tenant', 'User', 'Account', 'Session', 'VerificationToken',
    'ModuleCatalog', 'Plan', 'AddOnCatalog',
    'Call', 'Topic', 'TopicStat', 'RawFetch',
    'CordisProject', 'CordisOrganization', 'CordisParticipation',
    'CordisProjectTopic', 'CordisProjectSciVoc', 'CordisImportRun',
    'CordisPartnerProfile', 'CordisCoParticipation',
    'SystemAlert', 'ClaimEvidenceLink', 'EvidenceReminder'
  ]);

  // Tables with nullable tenantId (use shared policy)
  const nullableTenantModels = new Set(['Document', 'Chunk', 'ConceptTemplate']);

  // Find all models in schema.prisma that contain `tenantId` field
  const modelRegex = /model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)^}/gm;
  const tenantModels: string[] = [];

  let match;
  while ((match = modelRegex.exec(schemaContent)) !== null) {
    const modelName = match[1];
    const modelBody = match[2];

    // Check for tenantId field (not in comments)
    const tenantIdMatch = modelBody.match(/^\s*tenantId\s+String/m);
    if (tenantIdMatch && !systemWideModels.has(modelName) && !nullableTenantModels.has(modelName)) {
      tenantModels.push(modelName);
    }
  }

  console.log(`Found ${tenantModels.length} tenant-scoped models requiring RLS policies:`);
  console.log(tenantModels.sort().join(', '));

  const missingFromRls: string[] = [];

  for (const model of tenantModels) {
    // Check if model appears in RLS FOREACH arrays
    if (!rlsSqlContent.includes(`'${model}'`)) {
      missingFromRls.push(model);
    }
  }

  if (missingFromRls.length > 0) {
    console.error(`\n❌ ERROR: The following tenant-scoped models are missing from prisma/rls.sql:`);
    console.error(missingFromRls.join(', '));
    console.error(`\nAdd these to the FOREACH array in prisma/rls.sql (line ~7)`);
    process.exit(1);
  } else {
    console.log(`\n✅ SUCCESS: All ${tenantModels.length} tenant-scoped models have RLS policies registered.`);
    process.exit(0);
  }
}

checkRlsCoverage();

import re

with open('prisma/schema.prisma', 'r') as f:
    content = f.read()

# Add new relations to Opportunity
content = content.replace(
    '  evaluations Evaluation[]',
    '  evaluations Evaluation[]\n  followupDocs FollowupDoc[]\n  applicationParts ApplicationPart[]'
)

# Add models at the end
models = """
model FollowupDoc {
  id             String      @id @default(cuid())
  tenantId       String
  opportunityId  String
  opportunity    Opportunity @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  kind           String      // NDA, LOI, COMMITMENT, ESR_DEBRIEF, AWARD_PACK
  version        Int         @default(1)
  contentUrl     String?
  signedAt       DateTime?
  createdAt      DateTime    @default(now())
}

model ApplicationPart {
  id             String      @id @default(cuid())
  tenantId       String
  opportunityId  String
  opportunity    Opportunity @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  part           String      // PART_A, PART_B
  content        Json?       // Section tree, budget tables, etc.
  magicToken     String?     @unique // For external partner access
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
}
"""

content = content.replace('// model FollowupDoc { ... }         // M10: kind nda|loi|commitment|esr_debrief|award_pack, version, signedAt', '')
content = content.replace('// model ApplicationPart { ... }     // M11: proposalId, part A|B, sectionTree, budgetTables, aiDisclosure', models)

with open('prisma/schema.prisma', 'w') as f:
    f.write(content)

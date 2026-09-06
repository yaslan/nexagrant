import re

with open('prisma/schema.prisma', 'r') as f:
    content = f.read()

# Add evaluations to Opportunity
content = re.sub(
    r'(model Opportunity \{[^}]*)(\n\})',
    r'\1\  evaluations Evaluation[]\2',
    content
)

# Add evaluations to User
content = re.sub(
    r'(model User \{[^}]*)(\n\})',
    r'\1\  evaluations Evaluation[]\2',
    content
)

# Add MeetingBrief model and Evaluation model at the end
models = """
model Evaluation {
  id             String      @id @default(cuid())
  tenantId       String
  opportunityId  String
  opportunity    Opportunity @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  userId         String?
  user           User?       @relation(fields: [userId], references: [id], onDelete: SetNull)
  readerType     String      // "HUMAN" | "AI"
  excellence     Float
  impact         Float
  implementation Float
  weaknesses     Json?
  calibration    Float?
  createdAt      DateTime    @default(now())
}

model MeetingBrief {
  id             String      @id @default(cuid())
  tenantId       String
  interactionId  String      @unique
  content        String
  createdAt      DateTime    @default(now())
}
"""

content = content.replace('// model MockEvaluation { ... }      // M6: scores per criterion, weaknesses[], readerType human|ai, calibration', '')
content = content.replace('// model MeetingBrief { ... }        // M9', models)

with open('prisma/schema.prisma', 'w') as f:
    f.write(content)

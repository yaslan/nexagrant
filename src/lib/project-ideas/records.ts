/**
 * NG-38 — project ideas (spec §4 project_idea): title, short summary, keywords, TRL 1-9, target
 * programmes, status. One tenant's ideas; "kurum" is the tenant. The input form is NG-14.
 *
 * Status is not set through the input: OPEN on create; APPLIED comes with the "başvur" decision
 * (NG-15) and is not written here yet. Not linked to an opportunity yet (spec project.idea_id).
 *
 * Every read and write runs in `withTenant`. Another tenant's id answers `null`, as an id that
 * does not exist does. The audit row names the idea, not its text.
 */
import type { ProjectIdeaStatus } from '@prisma/client';
import { z } from 'zod';

import { withTenant } from '@/lib/db';

type Scope = { tenantId: string; userId: string };

const Tag = z.string().trim().min(1).max(100);
const TagList = (max: number) =>
  z
    .array(Tag)
    .max(max)
    .transform((list) => [...new Set(list)]);

export const ProjectIdeaInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().max(2000).nullable().default(null),
    keywords: TagList(30),
    trl: z.number().int().min(1).max(9),
    targetPrograms: TagList(20),
  })
  .strict();
export type ProjectIdeaInput = z.input<typeof ProjectIdeaInputSchema>;

export type ProjectIdeaView = {
  id: string;
  title: string;
  summary: string | null;
  keywords: string[];
  trl: number;
  targetPrograms: string[];
  status: ProjectIdeaStatus;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const IDEA_SELECT = {
  id: true,
  title: true,
  summary: true,
  keywords: true,
  trl: true,
  targetPrograms: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Throws a ZodError on invalid input: the route answers 400 before anything is written. */
export async function createProjectIdea(scope: Scope, input: ProjectIdeaInput): Promise<ProjectIdeaView> {
  const data = ProjectIdeaInputSchema.parse(input);
  return withTenant(scope.tenantId, async (tx) => {
    const idea = await tx.projectIdea.create({
      data: { ...data, tenantId: scope.tenantId, createdById: scope.userId },
      select: IDEA_SELECT,
    });
    await tx.auditEvent.create({
      data: { tenantId: scope.tenantId, actorId: scope.userId, type: 'project_idea.created', target: idea.id },
    });
    return idea;
  });
}

export function getProjectIdea(scope: Pick<Scope, 'tenantId'>, id: string): Promise<ProjectIdeaView | null> {
  return withTenant(scope.tenantId, (tx) =>
    tx.projectIdea.findFirst({ where: { id, tenantId: scope.tenantId }, select: IDEA_SELECT }),
  );
}

export function listProjectIdeas(scope: Pick<Scope, 'tenantId'>): Promise<ProjectIdeaView[]> {
  return withTenant(scope.tenantId, (tx) =>
    tx.projectIdea.findMany({
      where: { tenantId: scope.tenantId },
      select: IDEA_SELECT,
      orderBy: { createdAt: 'desc' },
    }),
  );
}

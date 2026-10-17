import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { EXPERTISE_AREAS, PROVINCES } from '../options';
import { toCsv } from './csv';

/**
 * FO-19 (TASK-MVBIXPP33UK1B) — the platform-admin read of the pre-registrations:
 * the list and the CSV export. The caller must already have checked
 * requirePlatformAdminApi(); nothing here is reachable by a tenant.
 */

export const expertPreRegFilterSchema = z.object({
  province: z
    .enum(PROVINCES.map((p) => p.value) as [string, ...string[]])
    .optional(),
  area: z.enum(EXPERTISE_AREAS).optional(),
  status: z.enum(['pending', 'verified', 'disabled']).optional(),
  q: z.string().trim().max(120).optional(),
});

export type ExpertPreRegFilters = z.infer<typeof expertPreRegFilterSchema>;

export interface ExpertPreRegRow {
  id: string;
  fullName: string;
  email: string;
  organization: string | null;
  province: string;
  expertiseAreas: string[];
  roles: string[];
  programmes: string[];
  status: string;
  founderNumber: number | null;
  createdAt: Date;
}

function whereFrom(filters: ExpertPreRegFilters): Prisma.ExpertPreRegistrationWhereInput {
  const where: Prisma.ExpertPreRegistrationWhereInput = {};
  if (filters.province) where.province = filters.province;
  if (filters.area) where.expertiseAreas = { has: filters.area };
  if (filters.status) where.status = filters.status;
  if (filters.q) {
    where.OR = [
      { fullName: { contains: filters.q, mode: 'insensitive' } },
      { email: { contains: filters.q.toLowerCase(), mode: 'insensitive' } },
    ];
  }
  return where;
}

const ROW_SELECT = {
  id: true,
  fullName: true,
  email: true,
  organization: true,
  province: true,
  expertiseAreas: true,
  roles: true,
  programmes: true,
  status: true,
  founderNumber: true,
  createdAt: true,
} as const;

/** Newest first. `take` caps the page; the CSV export asks for every match. */
export async function listExpertPreRegistrations(
  filters: ExpertPreRegFilters = {},
  options: { take?: number; db?: PrismaClient } = {}
): Promise<ExpertPreRegRow[]> {
  const db = options.db ?? prisma;
  return db.expertPreRegistration.findMany({
    where: whereFrom(filters),
    orderBy: { createdAt: 'desc' },
    ...(options.take ? { take: options.take } : {}),
    select: ROW_SELECT,
  });
}

const PROVINCE_NAME = new Map<string, string>(PROVINCES.map((p) => [p.value, p.name]));

export const EXPERT_PREREG_CSV_HEADER = [
  'ad',
  'e-posta',
  'kurum',
  'il',
  'alanlar',
  'roller',
  'programlar',
  'durum',
  'founderNumber',
  'createdAt',
] as const;

/** The export: the matching rows as CSV. Lists are joined with ";" inside one cell. */
export async function exportExpertPreRegistrationsCsv(
  filters: ExpertPreRegFilters = {},
  options: { db?: PrismaClient } = {}
): Promise<string> {
  const rows = await listExpertPreRegistrations(filters, options);
  return toCsv(
    EXPERT_PREREG_CSV_HEADER,
    rows.map((row) => [
      row.fullName,
      row.email,
      row.organization,
      PROVINCE_NAME.get(row.province) ?? row.province,
      row.expertiseAreas.join(';'),
      row.roles.join(';'),
      row.programmes.join(';'),
      row.status,
      row.founderNumber,
      row.createdAt.toISOString(),
    ])
  );
}

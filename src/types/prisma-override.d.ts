/**
 * Hand-written stand-in for the generated Prisma client.
 *
 * `prisma generate` is not part of install or CI, so `.prisma/client` does not
 * exist and `@prisma/client` resolves to a re-export of nothing. This file
 * declares the pieces the application actually imports, kept in step with
 * prisma/schema.prisma by hand.
 *
 * Enums the code only ever uses as *types* are declared as string unions, so a
 * literal like `'G0'` is assignable without importing a runtime value that is
 * not there. `Role` stays an `enum` because src/lib/rbac.ts reads
 * `Role.TENANT_ADMIN` as a value.
 */
declare module '@prisma/client' {
  export enum Role {
    TENANT_OWNER = 'TENANT_OWNER',
    TENANT_ADMIN = 'TENANT_ADMIN',
    PIPELINE_MANAGER = 'PIPELINE_MANAGER',
    WRITER = 'WRITER',
    MEMBER = 'MEMBER',
    GUEST_PARTNER = 'GUEST_PARTNER'
  }

  /** prisma/schema.prisma `enum OrgType`. */
  export type OrgType =
    | 'SME'
    | 'LARGE'
    | 'UNIVERSITY'
    | 'RESEARCH'
    | 'PUBLIC'
    | 'NGO'
    | 'CONSULTANCY'
    | 'CLUSTER';

  /** prisma/schema.prisma `enum Gate` — the G0..G4 pipeline stages. */
  export type Gate = 'G0' | 'G1' | 'G2' | 'G3' | 'G4';

  /** prisma/schema.prisma `enum OppStatus`. */
  export type OppStatus =
    | 'ACTIVE'
    | 'WITHDRAWN'
    | 'SUBMITTED'
    | 'FUNDED'
    | 'REJECTED'
    | 'ABOVE_THRESHOLD';

  /** prisma/schema.prisma `model Opportunity` — scalar columns only. */
  export interface Opportunity {
    id: string;
    tenantId: string;
    workspaceId: string;
    topicId: string | null;
    title: string;
    stage: Gate;
    status: OppStatus;
    intendedRole: string | null;
    ownerId: string | null;
    g0Score: number | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    deletionReason: string | null;
  }

  export class PrismaClient {
    /**
     * The driver-adapter form src/lib/db.ts uses. Declared so the call does not
     * need a cast; the option bag is deliberately loose because the adapter's
     * own type lives in @prisma/adapter-pg.
     */
    constructor(options?: { adapter?: unknown; log?: unknown });
    /**
     * The model delegates (`prisma.opportunity`, `tx.evidence`, …).
     *
     * This is the one `any` the codebase cannot type away today, and it is
     * deliberate rather than an oversight. Narrowing it to `unknown` makes
     * every `prisma.<model>.<method>()` call a "not callable" error, and
     * declaring a delegate interface instead does not work either: a string
     * index signature has to cover every member of the class, which
     * `$transaction<T>` and `$executeRaw` do not conform to.
     *
     * The real fix is to stop hand-writing this file: `pnpm exec prisma
     * generate` succeeds without a database and produces the true model types.
     * Deleting this override with the client generated leaves 158 type errors
     * across 36 files — mostly the four tables the code queries that the schema
     * does not define (Organization, Participation, Collab, OrgTopicStat).
     * That is a data-model task, not a lint fix; see the
     * TASK-MTQ60SGW45T0X result report.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    [key: string]: any;
    $transaction<T>(arg: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T>;
    /** Batch form: an array of prepared operations, committed together. */
    $transaction<T>(operations: Promise<T>[]): Promise<T[]>;
    /** Tagged-template raw execute; resolves to the number of rows affected. */
    $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  }
}

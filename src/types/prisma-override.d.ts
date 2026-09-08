/**
 * Hand-written stand-in for the generated Prisma client.
 *
 * `prisma generate` writes only into node_modules, so a fresh clone — and any
 * `pnpm typecheck` run before `pnpm gate` has generated — resolves
 * `@prisma/client` to a re-export of nothing. This file declares the pieces the
 * application actually imports, kept in step with prisma/schema.prisma by hand,
 * so the compiler has something either way.
 *
 * `pnpm gate` now runs `pnpm db:generate` first (TASK-MTSI7YQWUZOFH), and that
 * matters for one measured reason: without the generated client,
 * `withTenant(id, (tx) => tx.planAssignment.findMany(…))` infers `unknown` —
 * TypeScript cannot decompose the delegate's `any` return into `Promise<T>` —
 * which is why callers still hand `withTenant` an explicit type argument. With
 * it generated the same call infers `{ planId: string }[]` on its own.
 *
 * What generating does *not* do is close the hole this file exists to close.
 * Measured under the same task: with the client generated and the old
 * `[key: string]: any` still on `PrismaClient`, a call to a model the schema
 * does not declare compiled with zero errors — the index signature merges in and
 * accepts every name. Enumerating the delegates is what rejects it.
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

  /**
   * One model delegate — `prisma.opportunity`, `tx.evidence`, ….
   *
   * The *methods* stay loose on purpose. Typing `findMany`'s argument properly
   * means reproducing the whole generated `Prisma.<Model>WhereInput` tree by
   * hand, and the moment a hand-written arg type drifts from the schema it
   * reports errors that are not real. What is *not* loose any more is the set of
   * delegates that exists at all — see `ModelName` below.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  type ModelDelegate = { [method: string]: any };

  /**
   * Every model delegate `PrismaClient` actually has, i.e. `lowerFirst(name)`
   * for each `model` in prisma/schema.prisma.
   *
   * This list is the point of this file. It used to be `[key: string]: any`,
   * which made `prisma.organization.findMany()` — a model the schema does not
   * declare — compile cleanly while the delegate was `undefined` at runtime and
   * the call threw. That exact shape shipped at least five P0s in one sprint
   * (M8 Find Candidates, `/api/v1/partners`, M2 concept notes, CORDIS K1/K2).
   * With the names enumerated, `pnpm typecheck` rejects the call instead.
   *
   * It is kept honest by a test, not by discipline:
   * src/types/prisma-override.test.ts re-derives this union from
   * prisma/schema.prisma and fails on any drift in either direction.
   */
  type ModelName =
    | 'account'
    | 'addOn'
    | 'addOnCatalog'
    | 'aiUsageLog'
    | 'apiKey'
    | 'applicationPart'
    | 'approvalRequest'
    | 'auditEvent'
    | 'calendarConnection'
    | 'call'
    | 'chunk'
    | 'claim'
    | 'claimEvidenceLink'
    | 'conceptNote'
    | 'conceptTemplate'
    | 'consortiumSeat'
    | 'cordisCoParticipation'
    | 'cordisImportRun'
    | 'cordisOrganization'
    | 'cordisParticipation'
    | 'cordisPartnerProfile'
    | 'cordisProject'
    | 'cordisProjectSciVoc'
    | 'cordisProjectTopic'
    | 'creditLedger'
    | 'criterion'
    | 'document'
    | 'dualApprovalStep'
    | 'effort'
    | 'evaluation'
    | 'evidence'
    | 'evidenceReminder'
    | 'feedback'
    | 'followupDoc'
    | 'gateDecision'
    | 'interaction'
    | 'invitation'
    | 'invoice'
    | 'lifetimeLicence'
    | 'marketplaceListing'
    | 'meetingBrief'
    | 'membership'
    | 'moduleCatalog'
    | 'moduleState'
    | 'opportunity'
    | 'partnerOrg'
    | 'plan'
    | 'planAssignment'
    | 'planFeature'
    | 'planVersion'
    | 'programme'
    | 'proposal'
    | 'proposalUsage'
    | 'rawFetch'
    | 'relationship'
    | 'reviewer'
    | 'savedSearch'
    | 'score'
    | 'seatCandidate'
    | 'session'
    | 'subscription'
    | 'systemAlert'
    | 'tenant'
    | 'tenantProfile'
    | 'topic'
    | 'topicMatch'
    | 'topicStat'
    | 'ttoPortfolioItem'
    | 'user'
    | 'verificationToken'
    | 'workspace'
    ;

  /**
   * The client, as an interface over the delegate map plus the handful of `$`
   * methods the app calls.
   *
   * It is an interface rather than a `class` on purpose. `extends
   * Record<ModelName, ModelDelegate>` is the only way to give the client a
   * *mapped* set of members — a class body cannot hold one — and doing it by
   * merging a class with a same-named interface is what
   * `@typescript-eslint/no-unsafe-declaration-merging` exists to stop. The
   * constructor comes back below as a `const` with a construct signature, which
   * is what `new PrismaClient({ adapter })` in src/lib/db.ts needs and all it
   * needs; nothing in the repo subclasses it or uses `instanceof`.
   */
  export interface PrismaClient extends Record<ModelName, ModelDelegate> {
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    $transaction<T>(arg: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T>;
    /** Batch form: an array of prepared operations, committed together. */
    $transaction<T>(operations: Promise<T>[]): Promise<T[]>;
    /** Tagged-template raw execute; resolves to the number of rows affected. */
    $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
    /** Interpolated raw execute; resolves to the number of rows affected. */
    $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
    /**
     * Raw query. The row type is the caller's to state — there is no schema
     * information in a SQL string, so the default stays `any` rather than
     * `unknown`: making it `unknown` would only push an `as` cast onto all ten
     * call sites without checking anything.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    $queryRaw<T = any>(query: TemplateStringsArray | string, ...values: unknown[]): Promise<T>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see $queryRaw
    $queryRawUnsafe<T = any>(query: string, ...values: unknown[]): Promise<T>;
  }

  /**
   * The constructor. The option bag is deliberately loose because the adapter's
   * own type lives in @prisma/adapter-pg.
   */
  export const PrismaClient: new (options?: { adapter?: unknown; log?: unknown }) => PrismaClient;
}

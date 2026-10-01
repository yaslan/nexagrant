import http from "node:http";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { isCi } from "./helpers/live-db-role";

/**
 * TASK-MUPL2D9B8QWAB (U-6) — erasing a person against a real S3-compatible
 * store, with more objects under the tenant than one ListObjectsV2 page holds.
 *
 * Every object the application writes is a tenant's:
 *   - evidence, final and staging: `<tenant>/<org>/…`, `<tenant>/incoming/…`
 *     (`generateR2ObjectKey`, `getPresignedUploadUrl` in src/lib/storage.ts);
 *   - the agency co-brand logo: `<tenant>/agency/cobrand/<uuid>.png`
 *     (src/lib/agency/cobrand-store.ts);
 *   - a feedback screenshot: `feedback/<tenant>/<year>/<id>.<ext>`
 *     (`screenshotObjectKey`, src/lib/feedback/submit.ts) — the Feedback row is
 *     kept on erasure with its `userId` cleared, so its screenshot stays too.
 * None is keyed by a person. The purge used to list `users/<id>/`, a prefix no
 * code has ever written, so it deleted nothing while the processing register
 * promised the person's files were removed. A purge "fixed" to delete under
 * the person's tenants would destroy the tenant's documents instead; this file
 * pins that it does neither: no request reaches the store, every object stays.
 *
 * The database is replaced (as in tests/users-scheduled-deletion.test.ts); the
 * store is the MinIO of tests/evidence-upload-s3.live.test.ts, reached through
 * an in-process proxy that records every request. Without
 * EVIDENCE_S3_TEST_* the file skips, in CI too: the CI job has no S3 service.
 */

const SUITE = "user-erasure-object-store";
const S3 = {
  endpoint: process.env.EVIDENCE_S3_TEST_ENDPOINT,
  accessKey: process.env.EVIDENCE_S3_TEST_ACCESS_KEY,
  secretKey: process.env.EVIDENCE_S3_TEST_SECRET_KEY,
  bucket: process.env.EVIDENCE_S3_TEST_BUCKET,
};
const RUN = `u6-${Date.now().toString(36)}`;
const TENANT = `${RUN}-tenant`;
const USER = `${RUN}-user`;
/** More than the 1000 keys one ListObjectsV2 page returns. */
const EVIDENCE_COUNT = 1001;

const state = vi.hoisted(() => {
  // storage.ts builds its client when imported: point it at the proxy first.
  const e = process.env;
  const proxyPort = 46000 + (process.pid % 10000);
  if (e.EVIDENCE_S3_TEST_ENDPOINT) {
    e.R2_ACCOUNT_ID = "minio-test";
    e.R2_ENDPOINT = `http://127.0.0.1:${proxyPort}`;
    e.R2_ACCESS_KEY_ID = e.EVIDENCE_S3_TEST_ACCESS_KEY;
    e.R2_SECRET_ACCESS_KEY = e.EVIDENCE_S3_TEST_SECRET_KEY;
    e.R2_BUCKET = e.EVIDENCE_S3_TEST_BUCKET;
  }
  return { proxyPort, requests: [] as string[], dueUser: "" };
});

/** The purge's database, reduced to what it calls: one due subject, every write a no-op. */
vi.mock("@/lib/db", () => {
  const ok = async () => ({ count: 0 });
  const client = {
    user: {
      findMany: async () => [
        {
          id: state.dueUser,
          deletionRequestedAt: new Date(Date.now() - 40 * 86_400_000),
          deletionReason: "subject_request",
          memberships: [{ tenantId: TENANT }],
        },
      ],
      delete: async () => ({}),
    },
    aiUsageLog: { updateMany: ok },
    effort: { deleteMany: ok },
    calendarConnection: { deleteMany: ok },
    savedSearch: { deleteMany: ok },
    auditEvent: { updateMany: ok, create: async () => ({}) },
    opportunity: { updateMany: ok },
    feedback: { updateMany: ok },
    proposalUsage: { updateMany: ok },
    relationship: { updateMany: ok },
    systemAlert: {
      create: async () => ({ id: "a" }),
      findMany: async () => [],
      update: async () => ({}),
    },
  };
  return {
    prisma: client,
    withTenant: async <T>(_t: string, cb: (tx: never) => Promise<T> | T) =>
      cb(client as never),
  };
});
vi.mock("@/lib/system-scope", async () => {
  const { prisma } = await import("@/lib/db");
  return {
    withSystemScope: async <T>(
      _p: string,
      _c: string,
      cb: (tx: never) => Promise<T> | T,
    ) => cb(prisma as never),
  };
});

const storage = await import("@/lib/storage");
const { screenshotObjectKey } = await import("@/lib/feedback/submit");
const { purgeDueUsers } =
  await import("@/lib/jobs/tasks/users-scheduled-deletion");

let direct: S3Client | undefined;
let proxy: http.Server | undefined;
let ready = false;
let skipReason = "";
const seeded: string[] = [];

/** Every key under `prefix`, following ContinuationToken past the first page. */
async function keysUnder(prefix: string): Promise<string[]> {
  const out: string[] = [];
  let token: string | undefined;
  do {
    const page = await direct!.send(
      new ListObjectsV2Command({
        Bucket: S3.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const o of page.Contents ?? []) if (o.Key) out.push(o.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

beforeAll(async () => {
  if (!S3.endpoint || !S3.accessKey || !S3.secretKey || !S3.bucket) {
    skipReason =
      "EVIDENCE_S3_TEST_* not set (no S3-compatible store to test against).";
    if (!isCi()) console.warn(`[${SUITE}] skipped: ${skipReason}`);
    return;
  }
  state.dueUser = USER;
  expect(
    storage.hasObjectStore,
    "storage.ts must be talking to the test store",
  ).toBe(true);
  expect(storage.EVIDENCE_BUCKET).toBe(S3.bucket);

  direct = new S3Client({
    region: "auto",
    endpoint: S3.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: S3.accessKey, secretAccessKey: S3.secretKey },
  });
  await direct
    .send(new CreateBucketCommand({ Bucket: S3.bucket }))
    .catch((e: { name?: string }) => {
      if (
        e?.name !== "BucketAlreadyOwnedByYou" &&
        e?.name !== "BucketAlreadyExists"
      )
        throw e;
    });

  const upstream = new URL(S3.endpoint);
  proxy = http.createServer((req, res) => {
    state.requests.push(`${req.method} ${req.url ?? ""}`);
    const up = http.request(
      {
        host: upstream.hostname,
        port: upstream.port,
        method: req.method,
        path: req.url,
        headers: req.headers,
      },
      (ur) => {
        res.writeHead(ur.statusCode ?? 502, ur.headers);
        ur.pipe(res);
      },
    );
    up.on("error", () => res.destroy());
    req.pipe(up);
  });
  await new Promise<void>((resolve, reject) => {
    proxy!.once("error", reject);
    proxy!.listen(state.proxyPort, "127.0.0.1", () => resolve());
  });

  // The tenant's objects, each under the key its own writer builds, stored
  // through the application's client.
  const pdf = Buffer.from("%PDF-1.4 u6\n");
  for (let i = 0; i < EVIDENCE_COUNT; i++) {
    seeded.push(
      storage.generateR2ObjectKey(
        TENANT,
        "org-default",
        "certificate",
        `f${i}.pdf`,
      ),
    );
  }
  const staging = storage.generateR2ObjectKey(
    TENANT,
    "org-default",
    "certificate",
    "staged.pdf",
  );
  seeded.push(`${TENANT}/incoming/${staging.slice(TENANT.length + 1)}`);
  seeded.push(`${TENANT}/agency/cobrand/${randomUUID()}.png`);
  seeded.push(screenshotObjectKey(TENANT, `${RUN}-feedback`, "image/png"));
  for (let i = 0; i < seeded.length; i += 50) {
    const stored = await Promise.all(
      seeded
        .slice(i, i + 50)
        .map((k) => storage.putObjectBytes(k, pdf, "application/pdf")),
    );
    expect(stored.every(Boolean), "every seed object was stored").toBe(true);
  }
  ready = true;
}, 120_000);

beforeEach(({ skip }) => {
  if (!ready) skip(skipReason);
  state.requests.length = 0;
});

afterAll(async () => {
  if (direct) {
    const left = [
      ...(await keysUnder(`${TENANT}/`)),
      ...(await keysUnder(`feedback/${TENANT}/`)),
    ];
    for (let i = 0; i < left.length; i += 1000) {
      await direct.send(
        new DeleteObjectsCommand({
          Bucket: S3.bucket,
          Delete: { Objects: left.slice(i, i + 1000).map((Key) => ({ Key })) },
        }),
      );
    }
  }
  await new Promise<void>((resolve) =>
    proxy ? proxy.close(() => resolve()) : resolve(),
  );
  direct?.destroy();
}, 120_000);

describe("erasing a person leaves the tenant’s stored files alone", () => {
  test("more objects than one listing page are in the store before the purge", async () => {
    const before = [
      ...(await keysUnder(`${TENANT}/`)),
      ...(await keysUnder(`feedback/${TENANT}/`)),
    ];
    expect(before.length).toBeGreaterThan(1000);
    expect(before.sort()).toEqual([...seeded].sort());
  });

  test("the purge erases the subject, sends no request to the store, and every object survives", async () => {
    const result = await purgeDueUsers(30);

    expect(result).toMatchObject({
      dueCount: 1,
      purgedCount: 1,
      failedCount: 0,
    });
    expect(
      state.requests,
      "requests the purge sent to the object store",
    ).toEqual([]);

    const after = [
      ...(await keysUnder(`${TENANT}/`)),
      ...(await keysUnder(`feedback/${TENANT}/`)),
    ];
    expect(after.length).toBe(seeded.length);
    expect(after.sort()).toEqual([...seeded].sort());
  });
});

// Creates the two local buckets the upload code expects, against the MinIO
// container from `docker compose --profile storage up -d` (TASK-MVDKCZ6POWERJ).
//
// - R2_BUCKET (private): evidence and other uploads. Stays private.
// - R2_PUBLIC_BUCKET (anonymous read): blog cover images, same as the public
//   bucket a deployment serves them from. The two names must differ; the app
//   refuses to publish a bucket that also holds private objects.
//
// Idempotent: re-running it leaves existing buckets and policy as they are.
// Connection values come from the environment, with the compose defaults.
//
//   pnpm storage:setup

import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';

const endpoint = process.env.R2_ENDPOINT?.trim() || 'http://localhost:9000';
const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() || 'minioadmin';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() || 'minioadmin';
const privateBucket = process.env.R2_BUCKET?.trim() || 'fabrika';
const publicBucket = process.env.R2_PUBLIC_BUCKET?.trim() || 'fabrika-public';

if (privateBucket === publicBucket) {
  console.error(`R2_BUCKET and R2_PUBLIC_BUCKET must differ (both are "${privateBucket}").`);
  process.exit(1);
}

const s3 = new S3Client({
  region: process.env.R2_REGION?.trim() || 'us-east-1',
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

async function waitForStore(attempts = 30): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(`${endpoint}/minio/health/live`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`MinIO did not answer at ${endpoint} after ${attempts}s. Is "docker compose --profile storage up -d" running?`);
}

async function ensureBucket(bucket: string): Promise<'created' | 'exists'> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return 'exists';
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    return 'created';
  }
}

function anonymousReadPolicy(bucket: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

async function main(): Promise<void> {
  await waitForStore();

  const priv = await ensureBucket(privateBucket);
  console.log(`bucket ${privateBucket}: ${priv} (private)`);

  const pub = await ensureBucket(publicBucket);
  console.log(`bucket ${publicBucket}: ${pub}`);
  await s3.send(new PutBucketPolicyCommand({ Bucket: publicBucket, Policy: anonymousReadPolicy(publicBucket) }));
  console.log(`bucket ${publicBucket}: anonymous GetObject policy applied`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

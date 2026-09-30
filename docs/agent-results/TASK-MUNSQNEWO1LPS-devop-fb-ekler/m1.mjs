import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
const s3 = new S3Client({ region: 'auto', endpoint: process.env.EVIDENCE_S3_TEST_ENDPOINT, forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED', credentials: { accessKeyId: process.env.EVIDENCE_S3_TEST_ACCESS_KEY, secretAccessKey: process.env.EVIDENCE_S3_TEST_SECRET_KEY } });
for (const sh of [['content-type','content-length'], ['content-type'], []]) {
  const u = await getSignedUrl(s3, new PutObjectCommand({ Bucket: process.env.EVIDENCE_S3_TEST_BUCKET, Key: 'm1/x.pdf', ContentType: 'application/pdf', ContentLength: 10 }), { expiresIn: 60, signableHeaders: new Set(sh) });
  const body = Buffer.alloc(11, 0x41);
  const r = await fetch(u, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body });
  console.log(JSON.stringify(sh), '->', new URL(u).searchParams.get('X-Amz-SignedHeaders'), '| 11-byte PUT on 10-byte signature:', r.status);
}

import { describe, expect, test } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import {
  ZIP_MAX_DEPTH,
  ZIP_MEMBER_MAX_BYTES,
  ZIP_TOTAL_MAX_BYTES,
  checkZipMembers,
  looksLikeZip,
} from '@/lib/zip-member-check';
import { scanEvidence } from '@/lib/evidence-scan';
import type { TenantTx } from '@/lib/db';
import { cleanDocx, eicarDocx, eicarText, nestedDocx, zipOne } from './helpers/eicar';
import { MIB, bombDocxB, buildZip, deflatedMember, smallDeflated, storedMember } from './helpers/zip-fixtures';

/**
 * NG-269 (K-584606 = C) — the ZIP member check that runs before clamd.
 *
 * The file shapes are the ones sec-gnd measured against clamd 1.5.4 in NG-265
 * (every one answered `stream: OK`), plus the ones measured for NG-269 (a hidden
 * local entry, a ZIP stored / deflated / embedded inside a member: `OK` too).
 * Built at run time from `A` padding and EICAR only (tests/helpers/zip-fixtures.ts).
 */

const xml = (n: number) => Buffer.from('<w:t>' + 'x'.repeat(n) + '</w:t>');
const refused = (failure: string) => ({ ok: false, failure });

describe('NG-269: the caps match clamd defaults', () => {
  test('member 100 MiB (MaxFileSize, the size clamd trims to: 104857600), total 400 MiB (MaxScanSize)', () => {
    expect(ZIP_MEMBER_MAX_BYTES).toBe(104_857_600);
    expect(ZIP_TOTAL_MAX_BYTES).toBe(400 * MIB);
    expect(ZIP_MAX_DEPTH, 'deeper than clamd MaxRecursion 17, so no level goes unread').toBeGreaterThan(17);
  });
});

describe('NG-269: refused (the file is ERROR / limits_exceeded and does not download)', () => {
  test('(b) one member unpacks to 150 MiB, EICAR at 140 MiB', async () => {
    const b = bombDocxB();
    expect(b.length, 'a small upload').toBeLessThan(200 * 1024);
    expect(await checkZipMembers(b)).toEqual(refused('member_too_large'));
  });

  test('(x) the same as an .xlsx sheet', async () => {
    const x = buildZip([smallDeflated('[Content_Types].xml', xml(50)), deflatedMember('xl/worksheets/sheet1.xml', 150 * MIB, 140 * MIB)]);
    expect(await checkZipMembers(x)).toEqual(refused('member_too_large'));
  });

  test('(i) the headers say 1 MiB, the member really unpacks to 150 MiB', async () => {
    const i = buildZip([{ ...deflatedMember('word/document.xml', 150 * MIB, 140 * MIB), declaredSize: MIB }]);
    expect(await checkZipMembers(i)).toEqual(refused('member_too_large'));
  });

  test('(m) a small member written as ZIP64 (clamd does not unpack it)', async () => {
    const m = buildZip([{ ...deflatedMember('word/document.xml', 3 * MIB, 2 * MIB), zip64: true }]);
    expect(await checkZipMembers(m)).toEqual(refused('zip64'));
  });

  // crw-gnd B-1: a local entry left out of the central directory whose name is empty or holds a
  // control byte is not "plausible", and the ZIP64 refusal used to be asked only of plausible ones.
  // clamd reads such an entry, does not unpack it as ZIP64 and answered OK: EICAR came out CLEAN.
  test.each([
    ['an empty name', ''],
    ['a name with a control byte', 'a\x01b'],
  ])('(m) a hidden ZIP64 entry with %s', async (_n, name) => {
    const file = buildZip([{ ...smallDeflated(name, eicarText()), zip64: true, hidden: true }, smallDeflated('word/document.xml', xml(10))]);
    expect(await checkZipMembers(file)).toEqual(refused('zip64'));
  });

  // The same question for encryption and other methods, measured against the real clamd
  // (NG-269-evidence/probe-before-fix.log): a hidden LZMA entry with an empty name came out OK.
  test.each([
    ['encrypted, deflate', { ...smallDeflated('', eicarText()), flags: 0x1 }, 'encrypted'],
    ['encrypted, stored', { ...storedMember('', eicarText()), flags: 0x1 }, 'encrypted'],
    ['LZMA (14)', { ...smallDeflated('', eicarText()), method: 14 }, 'unsupported_method'],
    ['bzip2 (12)', { ...smallDeflated('', eicarText()), method: 12 }, 'unsupported_method'],
    ['deflate64 (9)', { ...smallDeflated('', eicarText()), method: 9 }, 'unsupported_method'],
    ['AES (99)', { ...smallDeflated('', eicarText()), method: 99 }, 'unsupported_method'],
  ])('a hidden entry with an empty name, %s', async (_n, member, failure) => {
    const file = buildZip([{ ...member, hidden: true }, smallDeflated('word/document.xml', xml(10))]);
    expect(await checkZipMembers(file)).toEqual(refused(failure));
  });

  // crw-gnd O-1: only the local header is ZIP64, the central directory entry is a plain one, so the
  // directory check alone does not see it (the M2a mutant stayed green without this).
  test('(m) ZIP64 in the local header only, the central directory entry is plain', async () => {
    const file = buildZip([{ ...deflatedMember('word/document.xml', 3 * MIB, 2 * MIB), zip64: 'local' }]);
    expect(await checkZipMembers(file)).toEqual(refused('zip64'));
  });

  test.each([
    ['k', 3990 * MIB, 3980 * MIB],
    ['l', 4095 * MIB, 4090 * MIB],
  ])('(%s) a member past the ~2 GiB clamd ceiling, a few MB on disk', async (_n, size, at) => {
    const file = buildZip([deflatedMember('word/document.xml', size, at, { crc: false })]);
    expect(file.length).toBeLessThan(25 * MIB);
    expect(await checkZipMembers(file)).toEqual(refused('member_too_large'));
  });

  test('one byte past the member cap', async () => {
    expect(await checkZipMembers(buildZip([deflatedMember('a.xml', ZIP_MEMBER_MAX_BYTES + 1)]))).toEqual(refused('member_too_large'));
  });

  test('five 99 MiB members: each fits, together past 400 MiB', async () => {
    const file = buildZip(Array.from({ length: 5 }, (_, n) => deflatedMember(`xl/worksheets/sheet${n}.xml`, 99 * MIB, undefined, { crc: false })));
    expect(await checkZipMembers(file)).toEqual(refused('total_too_large'));
  });

  test('a local entry left out of the central directory (clamd still reads it, and cuts it)', async () => {
    const file = buildZip([{ ...deflatedMember('word/x.xml', 150 * MIB, 140 * MIB), hidden: true }, smallDeflated('word/document.xml', xml(10))]);
    expect(await checkZipMembers(file)).toEqual(refused('member_too_large'));
  });

  test.each([
    ['stored inside a member', () => storedMember('word/embeddings/a.docx', bombDocxB())],
    ['deflated inside a member', () => smallDeflated('word/embeddings/a.docx', bombDocxB())],
    ['after other bytes in a member', () => smallDeflated('word/media/x.bin', Buffer.concat([Buffer.alloc(1000, 0x20), bombDocxB()]))],
  ])('(b) as a ZIP %s', async (_n, inner) => {
    const file = buildZip([inner(), smallDeflated('word/document.xml', xml(10))]);
    expect(await checkZipMembers(file)).toEqual(refused('member_too_large'));
  });

  test('ZIPs deflated inside each other deeper than the check goes', async () => {
    let data = zipOne('note.txt', Buffer.from('deep'));
    for (let i = 0; i <= ZIP_MAX_DEPTH; i++) data = buildZip([smallDeflated(`level-${i}.zip`, data)]);
    expect(await checkZipMembers(data)).toEqual(refused('too_deep'));
  });

  test.each([
    ['deflate64 (9)', 9],
    ['bzip2 (12)', 12],
    ['lzma (14)', 14],
  ])('a member compressed with %s', async (_n, method) => {
    const file = buildZip([{ ...smallDeflated('word/document.xml', xml(100)), method }]);
    expect(await checkZipMembers(file)).toEqual(refused('unsupported_method'));
  });

  test('an encrypted member', async () => {
    const file = buildZip([{ ...smallDeflated('word/document.xml', xml(100)), flags: 0x1 }]);
    expect(await checkZipMembers(file)).toEqual(refused('encrypted'));
  });

  test('a member that does not unpack', async () => {
    const bad = { ...smallDeflated('word/document.xml', xml(100)), data: Buffer.from([0xff, 0xff, 0xff, 0xff, 0x00, 0x13]) };
    expect(await checkZipMembers(buildZip([bad]))).toEqual(refused('corrupt'));
  });

  test('a central directory that points outside the file', async () => {
    const file = buildZip([smallDeflated('word/document.xml', xml(100))]);
    file.writeUInt32LE(0x7fffffff, file.length - 22 + 16);
    expect(await checkZipMembers(file)).toEqual(refused('corrupt'));
  });
});

describe('NG-269: passes on to clamd', () => {
  test('a 99 MiB member (a large but legitimate sheet)', async () => {
    const res = await checkZipMembers(buildZip([deflatedMember('xl/worksheets/sheet1.xml', 99 * MIB, 98 * MIB)]));
    expect(res).toEqual({ ok: true, entries: 1, unpackedBytes: 99 * MIB });
  });

  test('a member of exactly 100 MiB (what clamd still reads to the end)', async () => {
    expect(await checkZipMembers(buildZip([deflatedMember('a.xml', ZIP_MEMBER_MAX_BYTES)]))).toMatchObject({ ok: true });
  });

  test('the small test files: clean, EICAR (clamd finds it), nested 20 deep (clamd alerts MaxRecursion)', async () => {
    for (const f of [cleanDocx(), eicarDocx(), nestedDocx()]) expect(await checkZipMembers(f)).toMatchObject({ ok: true });
  });

  test('a real .docx written by the `docx` package (the app\'s own export)', async () => {
    const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun('Kanıt belgesi')] })] }] });
    const file = await Packer.toBuffer(doc);
    expect(looksLikeZip(file)).toBe(true);
    expect(await checkZipMembers(file)).toMatchObject({ ok: true });
  });

  test('members written with data descriptors (sizes after the data, zeros in the local header)', async () => {
    const file = buildZip([
      { ...smallDeflated('word/document.xml', xml(5000)), flags: 0x8 },
      { ...storedMember('word/media/a.png', randomBytes(4096)), flags: 0x8 },
    ]);
    expect(await checkZipMembers(file)).toEqual({ ok: true, entries: 2, unpackedBytes: 5011 + 4096 });
  });

  test('an image whose bytes happen to read `PK\\3\\4` (not a real header)', async () => {
    const img = Buffer.concat([randomBytes(64 * 1024), Buffer.from([0x50, 0x4b, 0x03, 0x04]), randomBytes(64 * 1024)]);
    // Random bytes after the signature, except a method number no ZIP tool writes (0x4242 is
    // what random bytes give 65512 times in 65536) and no extra field, so the run is deterministic.
    img.writeUInt16LE(0x4242, 64 * 1024 + 8);
    img.writeUInt16LE(0, 64 * 1024 + 28);
    const file = buildZip([storedMember('word/media/a.png', img), smallDeflated('word/document.xml', xml(100))]);
    expect(await checkZipMembers(file)).toMatchObject({ ok: true });
  });

  test('a small ZIP embedded in a member (clamd reads it whole)', async () => {
    const file = buildZip([smallDeflated('word/media/x.bin', Buffer.concat([Buffer.alloc(1000, 0x20), zipOne('eicar.com', eicarText())]))]);
    expect(await checkZipMembers(file)).toMatchObject({ ok: true });
  });

  test('only ZIP-headed bytes are checked', () => {
    expect(looksLikeZip(Buffer.from('%PDF-1.7'))).toBe(false);
    expect(looksLikeZip(cleanDocx())).toBe(true);
  });
});

describe('NG-269: scanEvidence refuses before clamd', () => {
  function fakeTenant(row: { r2ObjectKey: string; scanStatus: string; scanAttempts: number }) {
    const writes: unknown[] = [];
    const tx = {
      evidence: {
        findFirst: async () => row,
        updateMany: async (args: unknown) => {
          writes.push(args);
          return { count: 1 };
        },
      },
    } as unknown as TenantTx;
    return { writes, runTenant: <T>(_id: string, cb: (tx: TenantTx) => Promise<T>) => cb(tx) };
  }

  test('(b): ERROR limits_exceeded, clamd never asked, a retry queued', async () => {
    const { writes, runTenant } = fakeTenant({ r2ObjectKey: 'ten-1/org/cat/2026/abcd1234_b.docx', scanStatus: 'PENDING', scanAttempts: 0 });
    let asked = 0;
    const out = await scanEvidence(
      { tenantId: 'ten-1', evidenceId: 'ev-1', attempt: 0 },
      {
        runTenant,
        readObject: async () => bombDocxB(),
        scan: async () => (asked++, { verdict: 'clean' }),
        enqueue: async () => true,
      }
    );
    expect(out).toEqual({ status: 'ERROR', reason: 'limits_exceeded: zip_member_check: member_too_large', retryQueued: true });
    expect(asked, 'clamd is not asked about a file it would cut').toBe(0);
    expect(writes).toHaveLength(1);
    expect(JSON.stringify(writes[0])).toContain('"scanStatus":"ERROR"');
  });

  test('a clean .docx still goes to clamd and becomes CLEAN', async () => {
    const { runTenant } = fakeTenant({ r2ObjectKey: 'ten-1/org/cat/2026/abcd1234_c.docx', scanStatus: 'PENDING', scanAttempts: 0 });
    let asked = 0;
    const out = await scanEvidence(
      { tenantId: 'ten-1', evidenceId: 'ev-2', attempt: 0 },
      { runTenant, readObject: async () => cleanDocx(), scan: async () => (asked++, { verdict: 'clean' }) }
    );
    expect(out).toEqual({ status: 'CLEAN' });
    expect(asked).toBe(1);
  });
});

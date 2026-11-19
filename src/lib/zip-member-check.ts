import { createInflateRaw } from 'node:zlib';

/**
 * NG-269 (K-584606 = C) — what clamd does not tell us about a ZIP, checked
 * before the file goes to clamd.
 *
 * Measured in NG-265 (ClamAV 1.5.4, `AlertExceedsMax yes`): clamd cuts one ZIP
 * member at MaxFileSize, scans only that much and answers `OK`; a member written
 * as ZIP64 is not unpacked at all and is `OK` too. The same happens to a member
 * that is a local entry missing from the central directory, to a ZIP stored or
 * deflated inside a member, and to a ZIP embedded after other bytes in a member
 * (NG-269 measurements). Such a file is not fully scanned, so it must not become
 * CLEAN (NG-239 kilit kural).
 *
 * The check unpacks each member as a stream and counts the bytes it really
 * gives, stopping at the cap; nothing the headers declare is trusted, and the
 * whole member is never held in memory (only a member that holds a ZIP is kept,
 * within {@link ZIP_NESTED_HOLD_MAX_BYTES}, to look inside it).
 *
 *   1. The central directory, strictly: every entry must be stored or deflate,
 *      not encrypted, not ZIP64, and unpack cleanly within the caps.
 *   2. Every other local header in the bytes (a hidden entry, or the entries of
 *      a ZIP stored inside a member). One that looks like a real header gets the
 *      same rules. One that does not (four bytes that happen to read `PK\3\4` in
 *      an image, or an entry with an empty name) is still refused for ZIP64, and
 *      for encryption or a method other than stored/deflate when its method is
 *      one the ZIP specification names; otherwise only if it really unpacks past
 *      the cap.
 *   3. A deflated member whose output holds a ZIP signature is checked again,
 *      one level down, to {@link ZIP_MAX_DEPTH}.
 *
 * Every byte unpacked anywhere counts toward {@link ZIP_TOTAL_MAX_BYTES}.
 * Pure: no I/O, no tenant data; the failure codes carry no file names.
 */

/**
 * The caps. Each one is clamd's own default (docker-compose.yml sets none of
 * them, only `AlertExceedsMax`; the VPS clamd of NG-261 must keep them too).
 * Raising one in clamd.conf without raising it here only makes this check
 * stricter; lowering one in clamd.conf needs the same change here.
 */
/** clamd `MaxFileSize` 100M (= 104857600: the size it trims a member to, NG-265 §1 debug log). */
export const ZIP_MEMBER_MAX_BYTES = 100 * 1024 * 1024;
/** clamd `MaxScanSize` 400M: all the bytes unpacked from one file. */
export const ZIP_TOTAL_MAX_BYTES = 400 * 1024 * 1024;
/** clamd `MaxFiles` 10000: entries looked at in one file. */
export const ZIP_MAX_ENTRIES = 10_000;
/**
 * clamd `MaxRecursion` is 17. This check goes deeper than that (and refuses
 * past it), so no level is left that clamd reads without an alert and this
 * check does not read at all.
 */
export const ZIP_MAX_DEPTH = 32;
/** Memory held at once for nested ZIPs that were deflated inside a member. Not a clamd setting. */
export const ZIP_NESTED_HOLD_MAX_BYTES = 32 * 1024 * 1024;

export type ZipCheckFailure =
  | 'member_too_large'
  | 'total_too_large'
  | 'too_many_entries'
  | 'too_deep'
  | 'nested_too_large'
  | 'zip64'
  | 'unsupported_method'
  | 'encrypted'
  | 'corrupt';

export type ZipCheckResult =
  | { ok: true; entries: number; unpackedBytes: number }
  | { ok: false; failure: ZipCheckFailure };

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const LOCAL_SIG_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const STORED = 0;
const DEFLATE = 8;
const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;
const ZIP64_EXTRA_ID = 0x0001;
/** Every compression method the ZIP specification (APPNOTE 4.4.5) names, AES (99) included. */
const ZIP_METHODS: ReadonlySet<number> = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 19, 20, 93, 94, 95, 96, 97, 98, 99]);

/** A file in a ZIP-based format (docx, xlsx): the leading bytes `storage.ts` checks for them. */
export function looksLikeZip(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes.readUInt32LE(0) === SIG_LOCAL;
}

class Refused extends Error {
  constructor(readonly failure: ZipCheckFailure) {
    super(failure);
  }
}

interface Ctx {
  unpacked: number;
  entries: number;
  held: number;
}

/** Checks a ZIP; never throws. Anything it cannot read through is refused (fail closed). */
export async function checkZipMembers(bytes: Buffer): Promise<ZipCheckResult> {
  const ctx: Ctx = { unpacked: 0, entries: 0, held: 0 };
  try {
    await checkArchive(bytes, ctx, 0);
    return { ok: true, entries: ctx.entries, unpackedBytes: ctx.unpacked };
  } catch (e) {
    return { ok: false, failure: e instanceof Refused ? e.failure : 'corrupt' };
  }
}

async function checkArchive(buf: Buffer, ctx: Ctx, depth: number): Promise<void> {
  if (depth > ZIP_MAX_DEPTH) throw new Refused('too_deep');
  const done = new Set<number>();

  // 1. The central directory, if there is one.
  const eocd = findEocd(buf);
  if (eocd >= 0) {
    if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === SIG_ZIP64_LOCATOR) throw new Refused('zip64');
    const count = buf.readUInt16LE(eocd + 10);
    const cdSize = buf.readUInt32LE(eocd + 12);
    const cdOffset = buf.readUInt32LE(eocd + 16);
    if (count === U16_MAX || cdSize === U32_MAX || cdOffset === U32_MAX) throw new Refused('zip64');
    // A ZIP after other bytes (embedded, self-extracting) keeps offsets from its own start;
    // readers shift them by the bytes in front, and so does this.
    const shift = eocd - cdSize - cdOffset;
    if (shift < 0) throw new Refused('corrupt');
    let p = cdOffset + shift;
    for (let i = 0; i < count; i++) {
      if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) throw new Refused('corrupt');
      const flags = buf.readUInt16LE(p + 8);
      const method = buf.readUInt16LE(p + 10);
      const csize = buf.readUInt32LE(p + 20);
      const usize = buf.readUInt32LE(p + 24);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const local = buf.readUInt32LE(p + 42);
      const extra = sliceOrRefuse(buf, p + 46 + nameLen, extraLen);
      if (csize === U32_MAX || usize === U32_MAX || local === U32_MAX || hasZip64Extra(extra)) throw new Refused('zip64');
      const header = readLocal(buf, local + shift);
      if (!header || header.method !== method) throw new Refused('corrupt');
      await checkEntry(buf, header, { flags, method, storedSize: csize }, ctx, depth, true);
      done.add(local + shift);
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  // 2. Every other local header in these bytes.
  for (let at = buf.indexOf(LOCAL_SIG_BYTES); at >= 0; at = buf.indexOf(LOCAL_SIG_BYTES, at + 1)) {
    if (done.has(at)) continue;
    const header = readLocal(buf, at);
    if (!header) continue;
    await checkEntry(buf, header, { flags: header.flags, method: header.method, storedSize: header.csize }, ctx, depth, header.plausible);
  }
}

interface LocalHeader {
  flags: number;
  method: number;
  csize: number;
  dataStart: number;
  zip64: boolean;
  /** Looks written by a ZIP tool rather than four random bytes that read `PK\3\4`. */
  plausible: boolean;
}

function readLocal(buf: Buffer, at: number): LocalHeader | null {
  if (at < 0 || at + 30 > buf.length || buf.readUInt32LE(at) !== SIG_LOCAL) return null;
  const version = buf.readUInt16LE(at + 4);
  const flags = buf.readUInt16LE(at + 6);
  const method = buf.readUInt16LE(at + 8);
  const csize = buf.readUInt32LE(at + 18);
  const usize = buf.readUInt32LE(at + 22);
  const nameLen = buf.readUInt16LE(at + 26);
  const extraLen = buf.readUInt16LE(at + 28);
  const dataStart = at + 30 + nameLen + extraLen;
  if (dataStart > buf.length) return null;
  const name = buf.subarray(at + 30, at + 30 + nameLen);
  const extra = buf.subarray(at + 30 + nameLen, dataStart);
  const plausible = (version & 0xff) <= 63 && nameLen >= 1 && nameLen <= 1024 && name.every((c) => c >= 0x20 && c !== 0x7f) && extraWellFormed(extra);
  const zip64 = csize === U32_MAX || usize === U32_MAX || hasZip64Extra(extra);
  return { flags, method, csize, dataStart, zip64, plausible };
}

async function checkEntry(
  buf: Buffer,
  header: LocalHeader,
  e: { flags: number; method: number; storedSize: number },
  ctx: Ctx,
  depth: number,
  strict: boolean
): Promise<void> {
  if (++ctx.entries > ZIP_MAX_ENTRIES) throw new Refused('too_many_entries');
  // ZIP64 on every header, plausible or not: an entry with an empty or control-byte name is still
  // read by clamd, which does not unpack it as ZIP64 and answers OK (NG-269 review B-1). Random
  // bytes reach this only with a size of 0xFFFFFFFF or a 0x0001 extra record, which is rare enough.
  if (header.zip64) throw new Refused('zip64');
  // The same for a header that names a real ZIP method: clamd reads it whatever its name. Encrypted,
  // or a method other than stored/deflate, is a member clamd does not unpack (LZMA: OK, measured)
  // or this check does not count (bzip2, deflate64: clamd cuts them at MaxFileSize unseen here).
  // An unknown method number is what four random bytes give; nothing unpacks that, so it is left.
  if (strict || ZIP_METHODS.has(e.method)) {
    if (e.flags & 0x1) throw new Refused('encrypted');
    if (e.method !== STORED && e.method !== DEFLATE) throw new Refused('unsupported_method');
  }
  if (e.method === STORED) {
    // Its bytes are part of `buf`, and step 2 already looks at every header inside them.
    if (!strict) return;
    if (header.dataStart + e.storedSize > buf.length) throw new Refused('corrupt');
    count(ctx, e.storedSize);
    return;
  }
  if (e.method !== DEFLATE) return;
  // Unpack from the data start to the stream's own end; the stored size is not trusted either.
  const out = await inflateCounted(buf.subarray(header.dataStart), ctx);
  if (out.failed) {
    if (strict) throw new Refused('corrupt');
    return;
  }
  if (out.zipInside) {
    if (!out.kept) throw new Refused('nested_too_large');
    try {
      await checkArchive(out.kept, ctx, depth + 1);
    } finally {
      ctx.held -= out.kept.length;
    }
  }
}

function count(ctx: Ctx, n: number): void {
  ctx.unpacked += n;
  if (ctx.unpacked > ZIP_TOTAL_MAX_BYTES) throw new Refused('total_too_large');
}

interface Inflated {
  failed: boolean;
  /** The output held a local-header signature somewhere. */
  zipInside: boolean;
  /** The whole output, when it fit in the hold budget (`ctx.held` includes it until the caller releases it). */
  kept: Buffer | null;
}

/**
 * Raw inflate as a stream, counting the real output. Refuses past the member
 * cap or the total cap and stops there. Keeps the output only while it fits in
 * the nested-hold budget, and watches it for a ZIP signature across chunk edges.
 */
function inflateCounted(input: Buffer, ctx: Ctx): Promise<Inflated> {
  return new Promise<Inflated>((resolve, reject) => {
    const inflate = createInflateRaw({ chunkSize: 256 * 1024 });
    let size = 0;
    let settled = false;
    let zipInside = false;
    let tail = Buffer.alloc(0);
    let chunks: Buffer[] | null = [];
    let keptBytes = 0;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      inflate.removeAllListeners('data');
      inflate.destroy();
      fn();
    };
    const release = () => {
      ctx.held -= keptBytes;
      keptBytes = 0;
      chunks = null;
    };
    inflate.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      ctx.unpacked += chunk.length;
      if (size > ZIP_MEMBER_MAX_BYTES) return finish(() => (release(), reject(new Refused('member_too_large'))));
      if (ctx.unpacked > ZIP_TOTAL_MAX_BYTES) return finish(() => (release(), reject(new Refused('total_too_large'))));
      if (!zipInside) {
        const edge = Buffer.concat([tail, chunk.subarray(0, 3)]);
        zipInside = edge.indexOf(LOCAL_SIG_BYTES) >= 0 || chunk.indexOf(LOCAL_SIG_BYTES) >= 0;
        tail = Buffer.from(chunk.subarray(Math.max(0, chunk.length - 3)));
      }
      if (chunks) {
        if (ctx.held + chunk.length <= ZIP_NESTED_HOLD_MAX_BYTES) {
          chunks.push(chunk);
          ctx.held += chunk.length;
          keptBytes += chunk.length;
        } else {
          release();
        }
      }
    });
    inflate.on('end', () =>
      finish(() => {
        if (!zipInside || !chunks) {
          release();
          return resolve({ failed: false, zipInside, kept: null });
        }
        resolve({ failed: false, zipInside, kept: Buffer.concat(chunks) });
      })
    );
    inflate.on('error', () => finish(() => (release(), resolve({ failed: true, zipInside: false, kept: null }))));
    inflate.end(input);
  });
}

function findEocd(buf: Buffer): number {
  const stop = Math.max(0, buf.length - 22 - U16_MAX);
  for (let i = buf.length - 22; i >= stop; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

function sliceOrRefuse(buf: Buffer, start: number, len: number): Buffer {
  if (start + len > buf.length) throw new Refused('corrupt');
  return buf.subarray(start, start + len);
}

/** Extra fields are (id u16, size u16, data) records that fill the block exactly. */
function extraWellFormed(extra: Buffer): boolean {
  let p = 0;
  while (p + 4 <= extra.length) p += 4 + extra.readUInt16LE(p + 2);
  return p === extra.length;
}

function hasZip64Extra(extra: Buffer): boolean {
  for (let p = 0; p + 4 <= extra.length; p += 4 + extra.readUInt16LE(p + 2)) {
    if (extra.readUInt16LE(p) === ZIP64_EXTRA_ID) return true;
  }
  return false;
}

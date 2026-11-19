import { constants, crc32, deflateRawSync } from 'node:zlib';
import { eicarText } from './eicar';

/**
 * NG-269 — ZIP files for the member check (src/lib/zip-member-check.ts), built
 * at run time from `A` padding and the EICAR test string only. Nothing large is
 * kept in the repository: a member that unpacks to gigabytes is a few MB here.
 *
 * The trick: a deflate stream FULL_FLUSHed after every MiB of `A` restarts with
 * an empty window, so each MiB compresses to the same bytes. The stream is that
 * block repeated, then EICAR (if any) and the final block. The sizes are the
 * shapes sec-gnd measured against clamd in NG-265 §3.
 */

const MIB = 1024 * 1024;
const PAD = 0x41; // 'A'

let padBlock: Buffer | undefined;
/** One MiB of `A`, deflated and FULL_FLUSHed: byte-aligned, independent of what came before. */
function deflatedPadMiB(): Buffer {
  padBlock ??= deflateRawSync(Buffer.alloc(MIB, PAD), { finishFlush: constants.Z_FULL_FLUSH });
  return padBlock;
}

export interface Member {
  name: string;
  /** 0 = stored, 8 = deflate; anything else is written as given (the data then means nothing). */
  method: number;
  /** The bytes as stored in the archive. */
  data: Buffer;
  crc: number;
  /** The real unpacked size. */
  size: number;
  /** What the headers say the unpacked size is (default: the real one). */
  declaredSize?: number;
  /** Write the member the way Python's `force_zip64=True` does: sizes 0xFFFFFFFF + a 0x0001 extra field. */
  zip64?: boolean;
  /** General purpose flags (bit 0 = encrypted). */
  flags?: number;
  /** Leave the member out of the central directory (a local entry only). */
  hidden?: boolean;
}

/**
 * A deflate member that unpacks to `size` bytes of `A`, with EICAR at `eicarAt`
 * (it replaces padding, the size stays `size`). Each MiB is its own FULL_FLUSHed
 * piece, so a MiB of plain padding is the cached block and only the MiB that
 * holds EICAR, and the last one, are compressed here.
 * `crc: false` skips the CRC (gigabyte members; nothing here checks it).
 */
export function deflatedMember(name: string, size: number, eicarAt?: number, opts: { crc?: boolean } = {}): Member {
  const eicar = eicarText();
  const pieces: Buffer[] = [];
  const chunks = Math.max(1, Math.ceil(size / MIB));
  const plain = Buffer.alloc(MIB, PAD);
  let crc = 0;
  for (let i = 0; i < chunks; i++) {
    const from = i * MIB;
    const len = Math.min(MIB, size - from);
    const last = i === chunks - 1;
    const hasEicar = eicarAt !== undefined && eicarAt < from + len && eicarAt + eicar.length > from;
    let bytes = plain;
    if (len !== MIB || hasEicar) {
      bytes = Buffer.alloc(len, PAD);
      if (hasEicar) eicar.copy(bytes, Math.max(0, eicarAt! - from), Math.max(0, from - eicarAt!));
    }
    if (opts.crc !== false) crc = crc32(bytes, crc);
    if (!last && !hasEicar) pieces.push(deflatedPadMiB());
    else pieces.push(deflateRawSync(bytes, last ? {} : { finishFlush: constants.Z_FULL_FLUSH }));
  }
  return { name, method: 8, data: Buffer.concat(pieces), crc: crc >>> 0, size };
}

/** A member stored as is. */
export function storedMember(name: string, data: Buffer): Member {
  return { name, method: 0, data, crc: crc32(data) >>> 0, size: data.length };
}

/** A small deflated member of the given bytes. */
export function smallDeflated(name: string, data: Buffer): Member {
  return { name, method: 8, data: deflateRawSync(data), crc: crc32(data) >>> 0, size: data.length };
}

/** Builds the archive. Offsets and the directory are computed; the sizes are what each member declares. */
export function buildZip(members: Member[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  let listed = 0;
  for (const m of members) {
    const name = Buffer.from(m.name, 'utf8');
    const declared = m.declaredSize ?? m.size;
    const z64 = m.zip64 === true;
    const version = z64 ? 45 : m.method === 8 ? 20 : 10;
    const extra = z64 ? zip64Extra(declared, m.data.length) : Buffer.alloc(0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(version, 4);
    local.writeUInt16LE(m.flags ?? 0, 6);
    local.writeUInt16LE(m.method, 8);
    // Bit 3: sizes and CRC follow the data in a descriptor (what streaming writers do); the local header has zeros.
    const described = ((m.flags ?? 0) & 0x8) !== 0;
    local.writeUInt32LE(described ? 0 : m.crc, 14);
    local.writeUInt32LE(described ? 0 : z64 ? 0xffffffff : m.data.length, 18);
    local.writeUInt32LE(described ? 0 : z64 ? 0xffffffff : declared >>> 0, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extra.length, 28);
    const descriptor = Buffer.alloc(described ? 16 : 0);
    if (described) {
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(m.crc, 4);
      descriptor.writeUInt32LE(m.data.length, 8);
      descriptor.writeUInt32LE(declared >>> 0, 12);
    }
    parts.push(local, name, extra, m.data, descriptor);
    if (!m.hidden) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(version, 4);
      c.writeUInt16LE(version, 6);
      c.writeUInt16LE(m.flags ?? 0, 8);
      c.writeUInt16LE(m.method, 10);
      c.writeUInt32LE(m.crc, 16);
      c.writeUInt32LE(z64 ? 0xffffffff : m.data.length, 20);
      c.writeUInt32LE(z64 ? 0xffffffff : declared >>> 0, 24);
      c.writeUInt16LE(name.length, 28);
      c.writeUInt16LE(extra.length, 30);
      c.writeUInt32LE(offset, 42);
      central.push(c, name, extra);
      listed++;
    }
    offset += local.length + name.length + extra.length + m.data.length + descriptor.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(listed, 8);
  end.writeUInt16LE(listed, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

function zip64Extra(usize: number, csize: number): Buffer {
  const e = Buffer.alloc(20);
  e.writeUInt16LE(0x0001, 0);
  e.writeUInt16LE(16, 2);
  e.writeBigUInt64LE(BigInt(usize), 4);
  e.writeBigUInt64LE(BigInt(csize), 12);
  return e;
}

/** NG-265 (b): one 150 MiB member, EICAR at 140 MiB. clamd scans the first 100 MiB and answers OK. */
export function bombDocxB(): Buffer {
  return buildZip([deflatedMember('word/document.xml', 150 * MIB, 140 * MIB)]);
}

export { MIB };

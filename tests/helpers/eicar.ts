import { crc32 } from 'node:zlib';

/**
 * NG-239 — the EICAR anti-virus test file, built at run time.
 *
 * EICAR is not malware: it is the 68-byte string every scanner agrees to report
 * as a virus, so a scan path can be tested without a real one. It is kept out of
 * the repository as one piece (two halves joined here), so a scanner on a
 * developer's machine does not flag this source file.
 *
 * An evidence upload must be an allowed type whose leading bytes match it
 * (storage.ts `EVIDENCE_TYPES`), and plain EICAR text is none of them. A `.docx`
 * is a ZIP, and clamd unpacks a ZIP and finds EICAR inside it (checked against
 * clamav/clamav-debian:stable: `stream: Eicar-Test-Signature FOUND`), so the
 * infected upload is a one-entry ZIP named `.docx`.
 */
export function eicarText(): Buffer {
  return Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''), 'latin1');
}

/** A stored (uncompressed) one-entry ZIP. */
export function zipOne(name: string, data: Buffer): Buffer {
  const n = Buffer.from(name, 'latin1');
  const crc = crc32(data) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(10, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(10, 4);
  central.writeUInt16LE(10, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(n.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + n.length, 12);
  end.writeUInt32LE(local.length + n.length + data.length, 16);
  return Buffer.concat([local, n, data, central, n, end]);
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** EICAR inside a `.docx`-shaped ZIP: passes the upload type check, and clamd reports it. */
export function eicarDocx(): Buffer {
  return zipOne('eicar.com', eicarText());
}

/** A harmless `.docx`-shaped ZIP of the same shape. */
export function cleanDocx(text = 'clean evidence'): Buffer {
  return zipOne('note.txt', Buffer.from(text, 'utf8'));
}

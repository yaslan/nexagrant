/**
 * Parse Turkish/English date strings like "28 Ağustos 2026" or "August 28, 2026"
 * into a Date object.
 */
export function parsePublishedDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const trMonths: Record<string, number> = {
    ocak: 0, şubat: 1, mart: 2, nisan: 3, mayıs: 4, haziran: 5,
    temmuz: 6, ağustos: 7, eylül: 8, ekim: 9, kasım: 10, aralık: 11,
  };

  const enMonths: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };

  // Try parsing Turkish format: "28 Ağustos 2026"
  // Using [^ ]+ to capture non-whitespace (includes Turkish chars)
  const trMatch = dateStr.match(/^(\d{1,2})\s+([^ ]+)\s+(\d{4})$/);
  if (trMatch && trMatch[2]) {
    const day = trMatch[1]!;
    const month = trMatch[2];
    const year = trMatch[3]!;
    const monthIdx = trMonths[month.toLowerCase()];
    if (monthIdx !== undefined) {
      return new Date(Date.UTC(parseInt(year), monthIdx, parseInt(day)));
    }
  }

  // Try parsing English format: "August 28, 2026" or "28 August 2026"
  const enMatch1 = dateStr.match(/^([^ ]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (enMatch1 && enMatch1[1]) {
    const month = enMatch1[1];
    const day = enMatch1[2]!;
    const year = enMatch1[3]!;
    const monthIdx = enMonths[month.toLowerCase()];
    if (monthIdx !== undefined) {
      return new Date(Date.UTC(parseInt(year), monthIdx, parseInt(day)));
    }
  }

  const enMatch2 = dateStr.match(/^(\d{1,2})\s+([^ ]+)\s+(\d{4})$/);
  if (enMatch2 && enMatch2[2]) {
    const day = enMatch2[1]!;
    const month = enMatch2[2];
    const year = enMatch2[3]!;
    const monthIdx = enMonths[month.toLowerCase()];
    if (monthIdx !== undefined) {
      return new Date(Date.UTC(parseInt(year), monthIdx, parseInt(day)));
    }
  }

  return null;
}

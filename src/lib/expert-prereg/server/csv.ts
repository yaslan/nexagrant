/**
 * CSV for the platform-admin export (FO-19, TASK-MVBIXPP33UK1B). CRLF line
 * ends; each cell is written by {@link csvCell}, which quotes and neutralises
 * formulas for both a comma and a semicolon reader (FO-101).
 */
import { csvCell } from '@/lib/csv-cell';

/** A UTF-8 byte-order mark first, so spreadsheets read the Turkish letters right. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | null>>): string {
  const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/**
 * CSV for the platform-admin export (FO-19, TASK-MVBIXPP33UK1B). RFC 4180: CRLF
 * line ends, quotes around any cell that holds a comma, semicolon, quote or line
 * break. The semicolon is quoted too: a Turkish-locale spreadsheet splits on it,
 * which would let a formula cell escape its quotes.
 *
 * A cell that starts with = + - @ or a tab or carriage return is read as a
 * formula by a spreadsheet, so it gets a leading apostrophe, and so does any
 * piece of it after a `;` or a line break (see FORMULA_AFTER_BREAK). Numbers are
 * never text here and are written as they are.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Quotes count only at the start of a field. A reader that splits this
 * comma-separated file on `;` (a Turkish-locale spreadsheet) sees a quoted cell
 * from its opening quote only when the cell comes first on the line; inside any
 * other cell a `;`, or a line break, starts a new field of its own. That piece
 * gets the apostrophe too, so `Kurum;=cmd|…` cannot open a formula there.
 */
const FORMULA_AFTER_BREAK = /([;\r\n])(?=[" \t]*[=+\-@\t\r])/g;

export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const text = (FORMULA_START.test(value) ? `'${value}` : value).replace(FORMULA_AFTER_BREAK, "$1'");
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A UTF-8 byte-order mark first, so spreadsheets read the Turkish letters right. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | null>>): string {
  const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

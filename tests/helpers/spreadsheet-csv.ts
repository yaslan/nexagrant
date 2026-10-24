/**
 * Reads CSV the way a spreadsheet does, for the CSV injection tests (FO-101,
 * FO-124): a field is quoted only when its first character is a quote, text
 * after the closing quote is kept, and anything else runs to the next
 * delimiter or line break. A Turkish-locale spreadsheet reads with `;`.
 */
export function readLikeASpreadsheet(text: string, delimiter: ',' | ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < text.length) {
    let cell = '';
    if (text[i] === '"') {
      i++;
      while (i < text.length && !(text[i] === '"' && text[i + 1] !== '"')) {
        cell += text[i];
        i += text[i] === '"' ? 2 : 1;
      }
      i++;
    }
    while (i < text.length && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') cell += text[i++];
    row.push(cell);
    if (text[i] === delimiter) {
      i++;
      continue;
    }
    if (text[i] === '\r') i++;
    if (text[i] === '\n') i++;
    rows.push(row);
    row = [];
  }
  return rows;
}

/** What a spreadsheet runs as a formula. */
export const FORMULA_CELL = /^[=+\-@\t\r]/;

/** Every cell of `text` that a spreadsheet would run, read with each delimiter. */
export function formulaCells(text: string): { ',': string[]; ';': string[] } {
  const pick = (d: ',' | ';') => readLikeASpreadsheet(text, d).flat().filter((cell) => FORMULA_CELL.test(cell));
  return { ',': pick(','), ';': pick(';') };
}

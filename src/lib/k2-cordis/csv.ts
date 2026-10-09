/**
 * CSV reader for the CORDIS bulk dumps.
 *
 * The dumps are `;`-separated with every field wrapped in `"`, but the export is
 * not RFC 4180 clean. When a text value itself starts with a quote, CORDIS writes
 * it without the extra outer quote, and whether the quotes inside are doubled
 * varies by file:
 *
 *   project.csv  …;"HORIZON-RIA";"";""Non-CO2 greenhouse … the ""Fit for 55"" plan … impact."";"2026-04-20 …
 *   topics.csv   "HORIZON-CL5-2024-D5-01-12";""Combining … the "Fit for 55" package … Partnership)"";"101192661"
 *
 * csv-parse reads the second `"` of `""Non` as a closing quote followed by
 * garbage and rejects the record. With `skip_records_with_error` it then dropped
 * the record *and everything up to the next line it could resync on* — 831 of
 * 23,613 projects on the real HORIZON dump, silently (TASK-MUMH7CVD8P2J0).
 *
 * Values also carry `""word"";-to` and `""a""; ""b""` inside them, so "a quote
 * before `;` closes the field" is not enough either. Every field in these dumps
 * is quoted, so the rule here is: a quoted field ends at the first `"` followed
 * by `;"` (the next field opening), by a line break and the next record's
 * opening `"`, or by the end of the file (see `closesField`). Everything between
 * the opening quote and that one is the value, with `""` read as `"`. That reads
 * well-formed fields exactly like RFC 4180 does (`"""Quoted"""` → `"Quoted"`,
 * `""` → empty) and reads the malformed shapes above as the text they carry.
 * A value that still contains `";"` would be mis-split; such a record comes out
 * with the wrong number of fields and is reported in `malformed`, never guessed
 * at or dropped silently.
 */

export interface CordisCsvMalformed {
  /** 1-based line where the record starts. */
  line: number;
  reason: string;
}

export interface CordisCsvResult {
  rows: Record<string, string>[];
  /** Records that could not be read with the header's field count. Never silently dropped. */
  malformed: CordisCsvMalformed[];
}

/**
 * Whether the `"` at `q` closes the quoted field it is in. It does when what
 * follows is where a next field or record would start: the delimiter and then an
 * opening quote (or another delimiter / the end of the line), or a line break
 * and then the next record's opening quote (or nothing but trailing blank lines).
 */
function closesField(text: string, q: number, delimiter: string): boolean {
  const next = text[q + 1];
  if (next === undefined) return true;
  if (next === delimiter) {
    const after = text[q + 2];
    return (
      after === undefined || after === '"' || after === delimiter || after === '\n' || after === '\r'
    );
  }
  if (next === '\n' || next === '\r') {
    let i = q + 1;
    if (text[i] === '\r') i++;
    if (text[i] === '\n') i++;
    const after = text[i];
    return after === undefined || after === '"' || text.slice(i).trim() === '';
  }
  return false;
}

export function parseCordisCsv(input: string, delimiter = ';'): CordisCsvResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const len = text.length;
  const records: { line: number; fields: string[] }[] = [];
  const malformed: CordisCsvMalformed[] = [];

  let pos = 0;
  let line = 1;

  while (pos < len) {
    const recordLine = line;
    const fields: string[] = [];
    let broken: string | null = null;

    // One record.
    for (;;) {
      let value: string;
      if (text[pos] === '"') {
        let close = -1;
        let search = pos + 1;
        for (;;) {
          const q = text.indexOf('"', search);
          if (q === -1) break;
          if (closesField(text, q, delimiter)) {
            close = q;
            break;
          }
          search = q + 1;
        }
        if (close === -1) {
          broken = 'unterminated quoted field';
          value = text.slice(pos + 1);
          pos = len;
        } else {
          value = text.slice(pos + 1, close).replaceAll('""', '"');
          pos = close + 1;
        }
      } else {
        let end = pos;
        while (end < len && text[end] !== delimiter && text[end] !== '\n' && text[end] !== '\r') end++;
        value = text.slice(pos, end);
        pos = end;
      }

      for (let i = value.indexOf('\n'); i !== -1; i = value.indexOf('\n', i + 1)) line++;
      fields.push(value.trim());

      if (pos < len && text[pos] === delimiter) {
        pos++;
        continue;
      }
      // End of record: a line break or end of input.
      if (text[pos] === '\r') pos++;
      if (text[pos] === '\n') pos++;
      line++;
      break;
    }

    // Blank line between records.
    if (fields.length === 1 && fields[0] === '' && !broken) continue;
    if (broken) malformed.push({ line: recordLine, reason: broken });
    else records.push({ line: recordLine, fields });
  }

  const header = records.shift();
  if (!header) return { rows: [], malformed };

  const columns = header.fields;
  const rows: Record<string, string>[] = [];
  for (const rec of records) {
    if (rec.fields.length !== columns.length) {
      malformed.push({
        line: rec.line,
        reason: `expected ${columns.length} fields, got ${rec.fields.length}`,
      });
      continue;
    }
    const row: Record<string, string> = {};
    columns.forEach((name, i) => {
      row[name] = rec.fields[i]!;
    });
    rows.push(row);
  }
  return { rows, malformed };
}

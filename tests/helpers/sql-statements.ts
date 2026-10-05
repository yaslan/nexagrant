/**
 * TASK-MUOFZJTDQBYF5 (R-2) — splits a migration file into its top-level
 * statements, so a live test can apply it the way production does.
 *
 * scripts/apply-migrations.sh hands each file to `psql -f`, which sends one
 * statement at a time in autocommit. `pg`'s `client.query(file)` sends the
 * whole file as one simple query, which Postgres runs as ONE implicit
 * transaction: every lock the file takes is held until its last statement.
 * m4-stale-digest-user-claim.sql then holds ACCESS EXCLUSIVE on "User" (its
 * ADD COLUMN IF NOT EXISTS) while it asks for ACCESS EXCLUSIVE on "Membership",
 * and a request in another file that already read "Membership" and now reads
 * "User" (POST /api/invitations' membership lookup) deadlocks with it. The
 * request is the one Postgres cancels, so an unrelated live test gets a 500.
 *
 * Splits on `;` outside quotes, identifiers, comments and dollar-quoted bodies
 * (`DO $$ … $$`). Comment-only and empty pieces are dropped.
 */
export function sqlStatements(sql: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i]!;
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      const eol = sql.indexOf('\n', i);
      i = eol === -1 ? n : eol + 1;
    } else if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
    } else if (c === "'" || c === '"') {
      // A doubled quote inside is an escaped one: the scan closes and reopens.
      const end = sql.indexOf(c, i + 1);
      i = end === -1 ? n : end + 1;
    } else if (c === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        i = end === -1 ? n : end + tag.length;
      } else {
        i++;
      }
    } else if (c === ';') {
      out.push(sql.slice(start, i + 1));
      start = i + 1;
      i++;
    } else {
      i++;
    }
  }
  out.push(sql.slice(start));
  return out.map((s) => s.trim()).filter(hasCode);
}

/** Whether a piece holds anything but whitespace, `--` and block comments. */
function hasCode(piece: string): boolean {
  return piece.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/[;\s]/g, '') !== '';
}

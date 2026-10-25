import ts from 'typescript';

/**
 * FO-137 / FO-151 — the scanner behind tests/partner-search-read.test.ts.
 *
 * It looks at one production file and says (a) whether the file reaches stored
 * `PartnerSearchAnnouncement` rows at all, (b) whether it CALLS the masking
 * function, (c) where it lets the raw `description` out of a masking call.
 * It reads the code, not the comments: a `// TODO: toPublicSummary` proves nothing.
 *
 * What it cannot do: follow a value across functions or files. A reader that
 * calls `toPublicSummary` and never touches `description` outside it passes; a
 * reader that hides the raw text behind another helper's name is a review job.
 */

const MASK_CALLS = new Set(['maskContact', 'toPublicSummary']);

/** The file's code with every comment removed (JSDoc included); strings and templates stay. */
export function codeOnly(source: string, fileName = 'file.ts'): string {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const parts: string[] = [];
  const walk = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.JSDoc) return;
    const kids = node.getChildren(sf);
    if (kids.length === 0) {
      if (node.kind !== ts.SyntaxKind.EndOfFileToken) parts.push(node.getText(sf));
      return;
    }
    kids.forEach(walk);
  };
  walk(sf);
  return parts.join(' ');
}

/**
 * Does the file read stored announcements? Three ways in:
 *  - the Prisma delegate: `partnerSearchAnnouncement.findMany(…)` and its siblings;
 *  - the relation: `include/select: { partnerAnnouncements: … }` off `Topic`;
 *  - raw SQL: the quoted table name `"PartnerSearchAnnouncement"`.
 */
export function readsAnnouncements(source: string, fileName = 'file.ts'): boolean {
  const code = codeOnly(source, fileName);
  return (
    /\bpartnerSearchAnnouncement\s*\.\s*(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow)\b/.test(code) ||
    /\bpartnerAnnouncements\b/.test(code) ||
    /\\?"PartnerSearchAnnouncement\\?"/.test(code)
  );
}

function calleeName(call: ts.CallExpression): string {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return '';
}

/** Is `node` somewhere inside the arguments of a `maskContact(…)` / `toPublicSummary(…)` call? */
function insideMaskCall(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isCallExpression(n) && MASK_CALLS.has(calleeName(n))) return true;
  }
  return false;
}

/** Does the file call the masking function (not merely name it)? */
export function callsMask(source: string, fileName = 'file.ts'): boolean {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && MASK_CALLS.has(calleeName(node))) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Could `...expr` carry a whole row? An object literal, `cond ? { a } : {}` and `flag && { a }` cannot. */
function spreadCarriesRow(expr: ts.Expression): boolean {
  let e = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isObjectLiteralExpression(e)) return false;
  if (ts.isConditionalExpression(e)) return spreadCarriesRow(e.whenTrue) || spreadCarriesRow(e.whenFalse);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return spreadCarriesRow(e.right);
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    return spreadCarriesRow(e.left) || spreadCarriesRow(e.right);
  }
  if (e.kind === ts.SyntaxKind.NullKeyword || e.kind === ts.SyntaxKind.FalseKeyword) return false;
  return !(ts.isIdentifier(e) && e.text === 'undefined');
}

/**
 * Is `name` bound, around `at`, to a value typed as a DTO (a parameter whose annotation
 * ends in `Dto`, or the loop variable over such a list)? A DTO has gone through the
 * mapper already; the mapper itself is held to the rules below.
 */
function isDtoTyped(name: string, at: ts.Node): boolean {
  const dtoParam = (id: string): boolean => {
    for (let n: ts.Node | undefined = at; n; n = n.parent) {
      if (!ts.isFunctionLike(n)) continue;
      for (const p of n.parameters) {
        if (ts.isIdentifier(p.name) && p.name.text === id && p.type && /Dto\b/.test(p.type.getText())) return true;
      }
    }
    return false;
  };
  if (dtoParam(name)) return true;
  for (let n: ts.Node | undefined = at; n; n = n.parent) {
    if (
      ts.isForOfStatement(n) &&
      ts.isVariableDeclarationList(n.initializer) &&
      n.initializer.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name) &&
      ts.isIdentifier(n.expression) &&
      dtoParam(n.expression.text)
    ) {
      return true;
    }
  }
  return false;
}

function isMaskCall(e: ts.Expression): boolean {
  return ts.isCallExpression(e) && MASK_CALLS.has(calleeName(e));
}

/**
 * Where the file lets `description` out unmasked, as `line text`:
 *  - `x.description` / `x['description']` outside a masking call's arguments (a value
 *    typed `…Dto` is already the mapper's output and may be read);
 *  - `{ description }` and `const { description } = x`;
 *  - `description: <expr>` unless `<expr>` is a masking call, a boolean (`select`),
 *    a string (`orderBy`) or an object (a `where` filter);
 *  - `{ ...row }` unless the same literal sets `description:` to a masking call
 *    after the spread (a spread carries the raw column along). Spreading an object
 *    literal or `cond ? { a } : {}` is not a row and is not reported.
 */
export function rawDescriptionLeaks(source: string, fileName = 'file.ts'): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const report = (node: ts.Node, what: string) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    out.push(`${line} ${what}: ${node.getText(sf).replace(/\s+/g, ' ').slice(0, 100)}`);
  };
  const isDescription = (name: ts.PropertyName | ts.BindingName | undefined) =>
    !!name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === 'description';

  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'description' &&
      !insideMaskCall(node) &&
      !(ts.isIdentifier(node.expression) && isDtoTyped(node.expression.text, node))
    ) {
      report(node, 'raw description read');
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === 'description' &&
      !insideMaskCall(node)
    ) {
      report(node, 'raw description read');
    } else if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'description') {
      report(node, 'description shorthand ships the raw value');
    } else if (ts.isBindingElement(node) && isDescription(node.propertyName ?? node.name)) {
      report(node, 'description destructured out of a row');
    } else if (ts.isPropertyAssignment(node) && isDescription(node.name)) {
      const v = node.initializer;
      const fine =
        v.kind === ts.SyntaxKind.TrueKeyword ||
        v.kind === ts.SyntaxKind.FalseKeyword ||
        ts.isStringLiteralLike(v) ||
        ts.isObjectLiteralExpression(v) ||
        isMaskCall(v);
      if (!fine) report(node, 'description set to something that is not masked');
    } else if (ts.isObjectLiteralExpression(node)) {
      const props = node.properties;
      props.forEach((p, i) => {
        if (!ts.isSpreadAssignment(p) || !spreadCarriesRow(p.expression)) return;
        const masked = props
          .slice(i + 1)
          .some((q) => ts.isPropertyAssignment(q) && isDescription(q.name) && isMaskCall(q.initializer));
        if (!masked) report(p, 'spread carries the raw description');
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

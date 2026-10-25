import ts from 'typescript';

/**
 * FO-137 / FO-151 — the scanner behind tests/partner-search-read.test.ts.
 *
 * It looks at one production file and says (a) whether the file reaches stored
 * `PartnerSearchAnnouncement` rows at all, (b) whether it CALLS the masking
 * function, (c) where it lets the raw `description` out of a masking call.
 * It reads the AST, not the comments: a `// TODO: toPublicSummary` proves nothing.
 *
 * What it cannot do: follow a value across functions or files. A reader that
 * calls `toPublicSummary` and never touches `description` outside it passes; a
 * reader that hides the raw text behind another helper's name is a review job.
 */

const MASK_CALLS = new Set(['maskContact', 'toPublicSummary']);

const DELEGATE = 'partnerSearchAnnouncement';
const RELATION = 'partnerAnnouncements';
const TABLE = /\\?"PartnerSearchAnnouncement\\?"/;
/** Delegate methods that hand back no row: a count of changed rows cannot carry the text. */
const NO_ROW_METHODS = new Set(['updateMany', 'deleteMany', 'createMany', 'count']);

/** Does the object literal name `description` / the relation anywhere (or hide keys behind a spread / computed key)? */
function selectCanReachText(select: ts.ObjectLiteralExpression): boolean {
  let reaches = false;
  const visit = (n: ts.Node) => {
    if (ts.isSpreadAssignment(n) || ts.isComputedPropertyName(n)) reaches = true;
    if (
      (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) &&
      (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) &&
      (n.name.text === 'description' || n.name.text === RELATION)
    ) {
      reaches = true;
    }
    if (!reaches) ts.forEachChild(n, visit);
  };
  visit(select);
  return reaches;
}

/**
 * Can this delegate call hand the text back? Only a `select` object literal that never names
 * `description` (or the relation) rules it out; no `select` (a whole row), `include`, a
 * `select` held in a variable, or a spread (inside `select` or beside it) all keep it a reader.
 */
function delegateCallReachesText(call: ts.CallExpression, method: string): boolean {
  if (NO_ROW_METHODS.has(method)) return false;
  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return true;
  // `{ select: { id: true }, ...args }`: a spread on either side of `select` can replace it.
  if (arg.properties.some(ts.isSpreadAssignment)) return true;
  const select = arg.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === 'select'
  );
  if (!select || !ts.isObjectLiteralExpression(select.initializer)) return true;
  return selectCanReachText(select.initializer);
}

/**
 * Does the file read the TEXT of stored announcements? Three ways in:
 *  - the Prisma delegate, any method (`find*`, `groupBy`, `update`, `create`, `delete`, `['x']`,
 *    a delegate held in a variable) unless it provably cannot return the text: a `select`
 *    literal without `description`, or a method that returns no row (`updateMany`, `count`);
 *  - the relation: `partnerAnnouncements` as an include/select key off `Topic`;
 *  - raw SQL: the quoted table name `"PartnerSearchAnnouncement"` in any string or template,
 *    whatever the query selects. The text of the query is not read: `${cols}`, a `Prisma.sql`
 *    fragment, `to_jsonb(a)` or `Prisma.raw(...)` all hide the column, and no file has a reason
 *    to write raw SQL against this table (use the delegate with a `select`).
 * A file that only touches ids and counts through the delegate is not a reader and owes the
 * mask nothing.
 */
export function readsAnnouncements(source: string, fileName = 'file.ts'): boolean {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    let use: ts.Node | undefined;
    if (ts.isIdentifier(node) && node.text === DELEGATE) {
      const p = node.parent;
      if (p && ts.isPropertyAccessExpression(p) && p.name === node) use = p;
      else if (p && ts.isPropertyAccessExpression(p) && p.expression === node) use = node;
      else if (p && (ts.isBindingElement(p) || ts.isShorthandPropertyAssignment(p))) found = true;
    } else if (ts.isStringLiteralLike(node) && node.text === DELEGATE && node.parent && ts.isElementAccessExpression(node.parent)) {
      use = node.parent;
    } else if (ts.isIdentifier(node) && node.text === RELATION) {
      found = true;
    } else if (ts.isStringLiteralLike(node) && node.text === RELATION) {
      found = true;
    } else if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) &&
      TABLE.test(node.getText(sf))
    ) {
      found = true;
    }
    if (use && !found) {
      const access = use.parent;
      const call = access && ts.isPropertyAccessExpression(access) && access.expression === use ? access.parent : undefined;
      if (access && call && ts.isCallExpression(call) && call.expression === access && ts.isPropertyAccessExpression(access)) {
        if (delegateCallReachesText(call, access.name.text)) found = true;
      } else {
        found = true;
      }
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
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

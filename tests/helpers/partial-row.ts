/**
 * Fixture rows for mocked Prisma delegates.
 *
 * A unit test that mocks `prisma.<model>.<query>` has to hand
 * `mockResolvedValue` something the generated delegate's return type accepts —
 * a whole row, every column. Writing those out means the test spends its bulk
 * restating the schema, and the restatement is what the assertions then read.
 *
 * `partialRow` narrows the lie to one documented place: the argument is checked
 * against `Partial<T>`, so a column the model does not have, or a column given
 * the wrong type, still fails `pnpm typecheck` — only *absence* is waived.
 * That is exactly the part a fixture is entitled to omit, because the code
 * under test reads a handful of columns and the rest never leave the mock.
 *
 * Usage — always name the model explicitly, so the check has something to check
 * against:
 *
 *   vi.mocked(prisma.tenant.findUnique).mockResolvedValue(
 *     partialRow<Tenant>({ id: tenantId, name: 'Test Tenant' })
 *   );
 */
export function partialRow<T>(row: Partial<T>): T {
  return row as T;
}

/**
 * Same waiver for a list: `partialRow<T[]>([…])` would only check the array, not
 * its members.
 */
export function partialRows<T>(rows: Partial<T>[]): T[] {
  return rows as T[];
}

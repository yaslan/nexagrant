/**
 * Errors the agency server actions throw. They live here and not in
 * ./actions.ts because a 'use server' module may export only async functions:
 * a class exported from one fails every route that imports it at build
 * (TASK-MULVJV5TCHICH). tests/use-server-exports.test.ts keeps it that way.
 */
export class AgencyPermissionError extends Error {
  constructor() {
    super('Managing invite codes needs the manage_users permission');
    this.name = 'AgencyPermissionError';
  }
}

/**
 * Requests one API key may make per minute (TASK-MUN66T2HM4A4E O-4).
 *
 * Enforced in src/lib/api-auth.ts and shown on the API keys screen
 * (settings/api-keys/client.tsx). No server import here, so the client
 * component reads the same constant and the promise cannot drift from the limit.
 */
export const API_KEY_RATE_LIMIT_PER_MINUTE = 1000;

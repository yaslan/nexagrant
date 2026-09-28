import { CredentialsSignin } from 'next-auth';

/**
 * The one refusal every unusable invite code gets (TASK-MULRQJQYM0NAM):
 * unknown, malformed, expired, spent, revoked, or its agency gone. NextAuth
 * carries `code` through to `signIn`'s error, where the sign-in action turns it
 * into a single message. Kept apart from ./codes so that module stays free of
 * next-auth and can be imported by tests and jobs.
 */
export class InvalidInviteCodeSignin extends CredentialsSignin {
  override code = 'invite_invalid';
}

export const INVALID_INVITE_CODE = 'invite_invalid';

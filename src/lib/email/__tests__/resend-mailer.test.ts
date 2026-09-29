import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TASK-MUMH6NZ128QZ1 — `resend` v6 RESOLVES `{ data: null, error }` on a
 * refused send; it does not throw. These tests stand in for the SDK with that
 * exact contract and check the wrapper turns it into a throw, so a caller
 * that counts "sent" after `await` cannot count a refusal.
 */
const send = vi.fn();
const env: { RESEND_API_KEY?: string; EMAIL_FROM?: string } = {};

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));
vi.mock('@/lib/env', () => ({ env }));

const { resendMailer, MailSendError } = await import('../resend-mailer');

const message = { to: 'owner@example.invalid', subject: 's', html: '<p>h</p>' };

describe('resendMailer', () => {
  beforeEach(() => {
    send.mockReset();
    delete env.RESEND_API_KEY;
  });

  it('is null without an API key — "cannot send", never a silent no-op', () => {
    expect(resendMailer()).toBeNull();
  });

  it('resolves when Resend accepts the message', async () => {
    env.RESEND_API_KEY = 're_test';
    send.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    await expect(resendMailer()!(message)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: [message.to], subject: 's' }));
  });

  it('throws when Resend resolves with an error instead of throwing', async () => {
    env.RESEND_API_KEY = 're_test';
    send.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', statusCode: 422, message: `Invalid to: ${message.to}` },
    });

    const failure = await resendMailer()!(message).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(MailSendError);
    expect((failure as Error).message).toBe('resend:validation_error:422');
    // The provider's message can echo the address; it must not reach SystemAlert.
    expect((failure as Error).message).not.toContain(message.to);
  });
});

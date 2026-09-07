// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';

/**
 * M9 briefs form — the two silent-failure surfaces from the dogfood pass.
 *
 * P2-9: a date entered without a time was dropped without a word — no preview,
 *       no meetingScheduledAt on the request, no explanation.
 * P3-14: the only error the screen could raise came out of `window.alert()` —
 *       outside the design system, untranslatable, and unreachable because the
 *       control that raises it used to be hidden in exactly that case.
 * TASK-MTQURC2H4E0WF: brief generation failed in silence — a thrown action went
 *       to `console.error` and an empty `res.brief` went nowhere, so the user
 *       pressed the button, watched the spinner, and was told nothing.
 *
 * The server action is mocked: what is under test is what the client does with
 * the user's input before and after the call, not the action itself.
 */
const generateMeetingBrief = vi.fn();
const savePostMeetingNotes = vi.fn();

vi.mock('@/modules/m9/server/actions', () => ({
  generateMeetingBrief: (...args: unknown[]) => generateMeetingBrief(...args),
  savePostMeetingNotes: (...args: unknown[]) => savePostMeetingNotes(...args),
}));

import { MeetingBriefsClient, type BriefItem } from '@/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/client';

const DATED_BRIEF: BriefItem = {
  id: 'brief-1',
  interactionId: 'int-1',
  partnerName: 'Fraunhofer Institute',
  content: '### 1. Partner Background\n- Test brief body.',
  meetingScheduledAt: '2026-10-24T12:00:00.000Z',
  meetingScheduledTz: 'Europe/Brussels',
  createdAt: '2026-09-07T08:00:00.000Z',
};

const UNDATED_BRIEF: BriefItem = { ...DATED_BRIEF, id: 'brief-2', meetingScheduledAt: null };

/**
 * The real Turkish catalogue, not a stub: an assertion below reads the message
 * out of it, so a key that goes missing fails here instead of shipping as a
 * blank error band.
 */
function renderClient(briefs: BriefItem[] = []) {
  return render(
    <NextIntlClientProvider locale="tr" messages={trMessages} timeZone="Europe/Istanbul">
      <MeetingBriefsClient
        opportunityId="demo-opp-1"
        locale="tr"
        workspace="fabrika-beta"
        opportunityTitle="District renovation pilot — İzmir"
        briefs={briefs}
      />
    </NextIntlClientProvider>,
  );
}

const m9 = trMessages.m9;

const dateInput = () => screen.getByTestId('m9-meeting-date') as HTMLInputElement;
const timeInput = () => screen.getByTestId('m9-meeting-time') as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /Yapay Zeka Brief Oluştur/ });

/**
 * The partner name is required before the form will do anything at all, so
 * every schedule case fills it first — the schedule rule is what is under test.
 */
const nameInput = () => screen.getByPlaceholderText(/Ortak \/ Kurum Adı/) as HTMLInputElement;
const fillName = (value = 'Fraunhofer Institute') =>
  fireEvent.change(nameInput(), { target: { value } });

let alertSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  generateMeetingBrief.mockReset();
  savePostMeetingNotes.mockReset();
  // Any call to alert() is a regression of P3-14, wherever it comes from.
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  expect(alertSpy).not.toHaveBeenCalled();
  alertSpy.mockRestore();
  cleanup();
});

describe('P2-9 — a half-filled meeting date is reported, not dropped', () => {
  it('blocks submit and explains that the time is missing', () => {
    renderClient();
    fillName();
    fireEvent.change(dateInput(), { target: { value: '2026-10-24' } });
    fireEvent.click(submit());

    const error = screen.getByTestId('m9-schedule-error');
    expect(error).toHaveProperty('role', 'alert');
    expect(error.textContent).toContain('Toplantı saatini de girin');

    // The request never left: the old code would have sent the brief with the
    // date quietly discarded.
    expect(generateMeetingBrief).not.toHaveBeenCalled();
    // And the date the user typed is still on screen.
    expect(dateInput().value).toBe('2026-10-24');
  });

  it('wires the error to both controls for assistive technology and focuses the empty one', () => {
    renderClient();
    fillName();
    fireEvent.change(dateInput(), { target: { value: '2026-10-24' } });
    fireEvent.click(submit());

    expect(dateInput().getAttribute('aria-invalid')).toBe('true');
    expect(timeInput().getAttribute('aria-invalid')).toBe('true');
    expect(dateInput().getAttribute('aria-describedby')).toBe('m9-schedule-error');
    expect(timeInput().getAttribute('aria-describedby')).toBe('m9-schedule-error');
    expect(screen.getByTestId('m9-schedule-error').id).toBe('m9-schedule-error');
    expect(document.activeElement).toBe(timeInput());
  });

  it('explains the mirror case: a time with no date', () => {
    renderClient();
    fillName();
    fireEvent.change(timeInput(), { target: { value: '14:00' } });
    fireEvent.click(submit());

    expect(screen.getByTestId('m9-schedule-error').textContent).toContain(
      'Toplantı tarihini de girin',
    );
    expect(document.activeElement).toBe(dateInput());
  });

  it('clears the error and shows the Brussels preview once the pair is complete', () => {
    renderClient();
    fillName();
    fireEvent.change(dateInput(), { target: { value: '2026-10-24' } });
    fireEvent.click(submit());
    expect(screen.queryByTestId('m9-schedule-error')).not.toBeNull();

    fireEvent.change(timeInput(), { target: { value: '14:00' } });
    expect(screen.queryByTestId('m9-schedule-error')).toBeNull();
    expect(dateInput().getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByText(/Brüksel Saati/)).toBeTruthy();
  });

  it('leaves an empty pair alone — scheduling a meeting stays optional', async () => {
    generateMeetingBrief.mockResolvedValue({ success: true, brief: null });
    renderClient();
    fillName();
    fireEvent.click(submit());

    expect(screen.queryByTestId('m9-schedule-error')).toBeNull();
    expect(generateMeetingBrief).toHaveBeenCalledTimes(1);
    expect(generateMeetingBrief.mock.calls[0]![0]).toMatchObject({
      partnerName: 'Fraunhofer Institute',
      meetingScheduledAt: undefined,
    });
  });
});

describe('P3-14 — the calendar failure is an inline alert, not window.alert', () => {
  it('renders a dismissible alert region when the brief has no meeting time', () => {
    renderClient([UNDATED_BRIEF]);

    // The control is reachable now; it used to disappear in exactly this case.
    fireEvent.click(screen.getByTestId('m9-ics-download'));

    const error = screen.getByTestId('m9-ics-error');
    expect(error).toHaveProperty('role', 'alert');
    expect(error.textContent).toContain('toplantı tarihi yok');

    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByTestId('m9-ics-error')).toBeNull();
  });

  it('produces the file and no error when the brief is dated', () => {
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderClient([DATED_BRIEF]);
    fireEvent.click(screen.getByTestId('m9-ics-download'));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('m9-ics-error')).toBeNull();
    click.mockRestore();
  });
});

describe('TASK-MTQURC2H4E0WF — brief generation never fails in silence', () => {
  it('reports a thrown action in the band instead of only the console', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    generateMeetingBrief.mockRejectedValue(new Error('PrismaClientKnownRequestError: P2002'));

    renderClient();
    fillName();
    fireEvent.change(dateInput(), { target: { value: '2026-10-24' } });
    fireEvent.change(timeInput(), { target: { value: '14:00' } });
    fireEvent.click(submit());

    const band = await screen.findByTestId('m9-generate-error');
    expect(band).toHaveProperty('role', 'alert');
    expect(band.textContent).toContain(m9.generate.failed);

    // The raw reason stays in the console; none of it reaches the screen.
    expect(band.textContent).not.toContain('Prisma');
    expect(band.textContent).not.toContain('P2002');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('reports a "successful" call that came back with no brief', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    // What the action actually returns when the DB write fails.
    generateMeetingBrief.mockResolvedValue({
      success: false,
      brief: null,
      error: 'BRIEF_NOT_PERSISTED',
    });

    renderClient();
    fillName();
    fireEvent.click(submit());

    const band = await screen.findByTestId('m9-generate-error');
    expect(band.textContent).toContain(m9.generate.notSaved);
    // The internal code is not a user-facing message.
    expect(band.textContent).not.toContain('BRIEF_NOT_PERSISTED');
    consoleError.mockRestore();
  });

  it('keeps what the user typed and lets them retry from the band', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    generateMeetingBrief.mockRejectedValueOnce(new Error('network down'));

    renderClient();
    fillName();
    fireEvent.change(dateInput(), { target: { value: '2026-10-24' } });
    fireEvent.change(timeInput(), { target: { value: '14:00' } });
    fireEvent.click(submit());

    await screen.findByTestId('m9-generate-error');

    // Nothing the user typed was thrown away by the failure.
    expect(nameInput().value).toBe('Fraunhofer Institute');
    expect(dateInput().value).toBe('2026-10-24');
    expect(timeInput().value).toBe('14:00');
    // The band points at the button that just failed, for a keyboard user who
    // tabs back to it.
    expect(submit().getAttribute('aria-describedby')).toBe('m9-generate-error');

    // Retrying sends the same payload again — the user does not retype it.
    generateMeetingBrief.mockResolvedValueOnce({
      success: true,
      brief: {
        id: 'brief-new',
        interactionId: 'int-new',
        partnerName: 'Fraunhofer Institute',
        content: '### 1. Partner Background\n- Retried body.',
        meetingScheduledAt: '2026-10-24T12:00:00.000Z',
        meetingScheduledTz: 'Europe/Brussels',
        createdAt: '2026-09-07T09:00:00.000Z',
      },
    });
    fireEvent.click(screen.getByTestId('m9-generate-retry'));

    await waitFor(() => expect(screen.queryByTestId('m9-generate-error')).toBeNull());
    expect(generateMeetingBrief).toHaveBeenCalledTimes(2);
    expect(generateMeetingBrief.mock.calls[1]![0]).toMatchObject({
      partnerName: 'Fraunhofer Institute',
    });
    // Only a brief that actually came back clears the form.
    expect(nameInput().value).toBe('');
    expect(screen.getAllByText(/Retried body/).length).toBeGreaterThan(0);
    consoleError.mockRestore();
  });

  it('closes the last silent branch: retry with an emptied name says why', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    generateMeetingBrief.mockRejectedValueOnce(new Error('network down'));

    renderClient();
    fillName();
    fireEvent.click(submit());
    await screen.findByTestId('m9-generate-error');

    fireEvent.change(nameInput(), { target: { value: '  ' } });
    fireEvent.click(screen.getByTestId('m9-generate-retry'));

    await waitFor(() =>
      expect(screen.getByTestId('m9-generate-error').textContent).toContain(
        m9.generate.partnerRequired,
      ),
    );
    // No second request went out for an input that cannot produce a brief.
    expect(generateMeetingBrief).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('is dismissible, like the calendar band — one error surface, one behaviour', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    generateMeetingBrief.mockRejectedValue(new Error('boom'));

    renderClient();
    fillName();
    fireEvent.click(submit());
    await screen.findByTestId('m9-generate-error');

    fireEvent.click(
      screen.getByTestId('m9-generate-error').querySelector('button:last-of-type')!,
    );
    expect(screen.queryByTestId('m9-generate-error')).toBeNull();
    consoleError.mockRestore();
  });
});

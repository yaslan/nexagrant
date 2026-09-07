// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/**
 * M9 briefs form — the two silent-failure surfaces from the dogfood pass.
 *
 * P2-9: a date entered without a time was dropped without a word — no preview,
 *       no meetingScheduledAt on the request, no explanation.
 * P3-14: the only error the screen could raise came out of `window.alert()` —
 *       outside the design system, untranslatable, and unreachable because the
 *       control that raises it used to be hidden in exactly that case.
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

function renderClient(briefs: BriefItem[] = []) {
  return render(
    <MeetingBriefsClient
      opportunityId="demo-opp-1"
      locale="tr"
      workspace="fabrika-beta"
      opportunityTitle="District renovation pilot — İzmir"
      briefs={briefs}
    />,
  );
}

const dateInput = () => screen.getByTestId('m9-meeting-date') as HTMLInputElement;
const timeInput = () => screen.getByTestId('m9-meeting-time') as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /Yapay Zeka Brief Oluştur/ });

/**
 * The partner name is required before the form will do anything at all, so
 * every schedule case fills it first — the schedule rule is what is under test.
 */
const fillName = (value = 'Fraunhofer Institute') =>
  fireEvent.change(screen.getByPlaceholderText(/Ortak \/ Kurum Adı/), { target: { value } });

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

import { mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';

import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import {
  M9_BRIEFS_URL,
  M9_TENANT,
  setupM9Tenant,
  signInAsM9User,
  teardownM9Tenant,
} from './fixtures/m9-tenant';

/**
 * TASK-MTQUTBH8Q9VMK — the .ics the user actually receives, checked as bytes.
 *
 * The card's RFC 5545 claim had only ever been measured against
 * `generateIcsContent` in a unit test. This spec measures the file that leaves
 * the browser: a real click on the brief screen's download button, the
 * downloaded bytes read back off disk, and the stream checked for the two
 * things a hand-written generator gets wrong — CRLF termination and octet-based
 * folding — plus the identity the file carries.
 *
 * The saved file is the evidence for the report; an independent parser
 * (python `icalendar`) is run over it there, outside this process, so the
 * verdict does not come from the same code that produced the file.
 */

const EVIDENCE = 'docs/agent-results/TASK-MTQUTBH8Q9VMK-screenshots';
const DOWNLOADED = `${EVIDENCE}/brief-download.ics`;

// Deliberately hostile TEXT (RFC 5545 §3.3.11) and multi-byte characters that
// must not be split across a 75-octet fold.
const PARTNER = 'Fraunhofer Institut, e.V.; Şube\\Merkez';
const CONTENT =
  'Görüşme notları — bütçe, iş paketleri; risk maddeleri.\n' +
  'Türkçe karakterlerle çok uzun bir satır: çğıöşü çğıöşü çğıöşü çğıöşü çğıöşü çğıöşü.';
// The meeting instant is stored UTC (CLAUDE.md §10); Europe/Brussels is the
// display zone and must not leak into DTSTART as a local wall time.
const MEETING_AT = new Date('2026-10-24T11:00:00.000Z');

let briefId = '';

test.describe('M9 .ics download', () => {
  test.beforeAll(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    await setupM9Tenant();
    const brief = await prisma.meetingBrief.create({
      data: {
        tenantId: M9_TENANT,
        interactionId: 'm9-ics-download-interaction',
        partnerName: PARTNER,
        content: CONTENT,
        meetingScheduledAt: MEETING_AT,
        meetingScheduledTz: 'Europe/Brussels',
      },
    });
    briefId = brief.id;
  });

  test.afterAll(async () => {
    await teardownM9Tenant();
  });

  test('the downloaded file is RFC 5545 conformant and keeps one identity per brief', async ({
    page,
  }) => {
    await signInAsM9User(page, M9_BRIEFS_URL);

    const button = page.getByTestId('m9-ics-download');
    await expect(button).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/brief-download-button.png`, fullPage: true });

    const download = async () => {
      const waitFor = page.waitForEvent('download');
      await button.click();
      const file = await waitFor;
      const path = await file.path();
      return readFile(path);
    };

    const first = await download();
    const raw = first.toString('utf8');
    await writeFile(DOWNLOADED, first);

    // §3.1 — every content line is *terminated* by CRLF, the last one included.
    expect(raw.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(/(?<!\r)\n/.test(raw)).toBe(false);
    expect(/\r(?!\n)/.test(raw)).toBe(false);

    // §3.1 — folding is octet-based, 75 octets excluding the CRLF.
    for (const line of raw.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }

    const unfolded = raw.split('\r\n').reduce<string[]>((lines, line) => {
      if (line.startsWith(' ') && lines.length) lines[lines.length - 1] += line.slice(1);
      else lines.push(line);
      return lines;
    }, []);

    // §3.3.5 — the UTC instant, not a Brussels wall time.
    expect(unfolded).toContain('DTSTART:20261024T110000Z');
    expect(unfolded).toContain('DTEND:20261024T120000Z');
    // §3.3.11 — the partner's comma, semicolon and backslash survive escaped.
    expect(unfolded).toContain(
      'SUMMARY:Görüşme: Fraunhofer Institut\\, e.V.\\; Şube\\\\Merkez',
    );
    // §3.8.4.7 — the brief row's id, not a fresh UUID per click.
    expect(unfolded).toContain(`UID:brief-${briefId}@fabrika.app`);

    // Downloading the same brief again must carry the same UID, or the second
    // import adds a duplicate event instead of updating the first.
    const second = (await download()).toString('utf8');
    const uidOf = (ics: string) => /UID:(.+)\r\n/.exec(ics)?.[1];
    expect(uidOf(second)).toBe(uidOf(raw));
  });
});

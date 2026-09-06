import { describe, test, expect } from 'vitest';
import {
  k1DailyCalls,
  k2MonthlyCordis,
  alertsDaily,
  creditsMonthlyGrant,
  m4WeeklySummary,
} from '../src/lib/inngest/jobs';

describe('Inngest Job Functions', () => {
  test('All Inngest job functions are properly exported and defined', () => {
    expect(k1DailyCalls).toBeDefined();
    expect(k2MonthlyCordis).toBeDefined();
    expect(alertsDaily).toBeDefined();
    expect(creditsMonthlyGrant).toBeDefined();
    expect(m4WeeklySummary).toBeDefined();
  });
});

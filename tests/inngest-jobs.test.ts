import { describe, test, expect } from 'vitest';
import * as jobs from '../src/lib/jobs/tasks';

describe('Inngest Job Schemas', () => {
  describe('All 5 jobs are properly exported', () => {
    test('k1DailyCalls is defined and exported', () => {
      expect(jobs.k1DailyCalls).toBeDefined();
      expect(typeof jobs.k1DailyCalls).not.toBe('undefined');
    });

    test('k2MonthlyCordis is defined and exported', () => {
      expect(jobs.k2MonthlyCordis).toBeDefined();
      expect(typeof jobs.k2MonthlyCordis).not.toBe('undefined');
    });

    test('alertsDaily is defined and exported', () => {
      expect(jobs.alertsDaily).toBeDefined();
      expect(typeof jobs.alertsDaily).not.toBe('undefined');
    });

    test('creditsMonthlyGrant is defined and exported', () => {
      expect(jobs.creditsMonthlyGrant).toBeDefined();
      expect(typeof jobs.creditsMonthlyGrant).not.toBe('undefined');
    });

    test('m4WeeklySummary is defined and exported', () => {
      expect(jobs.m4WeeklySummary).toBeDefined();
      expect(typeof jobs.m4WeeklySummary).not.toBe('undefined');
    });
  });
});

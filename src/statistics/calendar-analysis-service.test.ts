import { describe, expect, it } from 'vitest';
import { CalendarAnalysisService } from './calendar-analysis-service';
import { defaultRules } from '../sync/synchronization-service';
import type { EventRecord } from '../core/domain';

const makeEvent = (
  id: string,
  date: string,
  mainNumbers: number[],
  specialNumber: number,
): EventRecord => ({
  drawId: id,
  date,
  timestamp: `${date}T13:00:00.000Z`,
  mainNumbers,
  specialNumber,
  validation: { source: 'test', validatedAt: `${date}T13:00:00.000Z`, schemaVersion: '1' },
});

describe('CalendarAnalysisService', () => {
  it('generates 18 candidate numbers and 3 tickets excluding taboo numbers and sequences', () => {
    // Generate synthetic records for day 5, month 9 across multiple years
    const records: EventRecord[] = [];
    for (let year = 2020; year <= 2026; year += 1) {
      records.push(
        makeEvent(`id-${year}-1`, `${year}-09-05`, [1, 2, 3, 4, 5], 6),
        makeEvent(`id-${year}-2`, `${year}-09-05`, [1, 2, 7, 8, 9], 8),
        makeEvent(`id-${year}-3`, `${year}-09-05`, [1, 3, 10, 11, 12], 10),
        makeEvent(`id-${year}-4`, `${year}-09-12`, [15, 16, 17, 18, 19], 4),
      );
    }

    const service = new CalendarAnalysisService(defaultRules);
    const date = new Date('2026-09-05T13:00:00.000Z');
    const analysis = service.build(records, date);

    expect(analysis.dayOfMonthAnalysis).toHaveLength(31);
    expect(analysis.monthAnalysis).toHaveLength(12);

    const forecast = analysis.calendarForecast;
    expect(forecast.basedOnDay).toBe(5);
    expect(forecast.basedOnMonth).toBe(9);

    // Check candidate pool
    expect(forecast.candidatePool18.length).toBeGreaterThan(0);
    expect(forecast.candidatePool18.length).toBeLessThanOrEqual(18);

    // Taboo numbers must be excluded from candidatePool18
    const dayData = analysis.dayOfMonthAnalysis[4]; // day 5
    const monthData = analysis.monthAnalysis[8]; // month 9
    const tabooNumbers = new Set([
      ...dayData.tabooMainNumbers,
      ...monthData.tabooNumbers,
    ]);

    for (const num of forecast.candidatePool18) {
      expect(tabooNumbers.has(num)).toBe(false);
    }

    // Must generate 3 tickets
    expect(forecast.tickets).toHaveLength(3);
    for (const ticket of forecast.tickets) {
      expect(ticket.greens).toHaveLength(5);
      expect(ticket.orange).toBeGreaterThanOrEqual(1);
      expect(ticket.orange).toBeLessThanOrEqual(12);

      // Greens must be from candidatePool18
      for (const green of ticket.greens) {
        expect(forecast.candidatePool18).toContain(green);
        expect(tabooNumbers.has(green)).toBe(false);
      }

      // No taboo sequence should be present
      const tabooSeqSet = new Set(monthData.tabooSequences);
      const sorted = [...ticket.greens].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 2; i += 1) {
        for (let j = i + 1; j < sorted.length - 1; j += 1) {
          for (let k = j + 1; k < sorted.length; k += 1) {
            expect(tabooSeqSet.has(`${sorted[i]},${sorted[j]},${sorted[k]}`)).toBe(false);
          }
        }
      }

      // Special number must not be in day's taboo special list
      expect(dayData.tabooSpecialNumbers).not.toContain(ticket.orange);
    }

    // Dominant number 1 (which appeared in every day 5 record) should be in candidatePool18 and ticket 1
    expect(forecast.candidatePool18).toContain(1);
    expect(forecast.tickets[0].greens).toContain(1);
  });
});

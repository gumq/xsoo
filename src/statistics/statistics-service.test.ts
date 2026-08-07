import { describe, expect, it } from 'vitest';
import { StatisticsService } from './statistics-service';
import { defaultRules } from '../sync/synchronization-service';
import type { EventRecord } from '../core/domain';

const event = (id: string, timestamp: string, numbers: number[], specialNumber: number): EventRecord => ({ drawId: id, date: timestamp.slice(0, 10), timestamp, mainNumbers: numbers, specialNumber, validation: { source: 'test', validatedAt: timestamp, schemaVersion: '1' } });
describe('StatisticsService', () => {
  it('calculates main-number frequency and pairs', () => { const result = new StatisticsService(defaultRules).build([event('1', '2026-01-01T13:00:00.000Z', [1, 2, 3, 4, 5], 6), event('2', '2026-01-02T13:00:00.000Z', [1, 2, 7, 8, 9], 7)]); expect(result.frequency.find((item) => item.number === 1)?.count).toBe(2); expect(result.pairs.find((item) => item.key === '1,2')?.count).toBe(2); });
  it('calculates special-number recurrence and co-occurrence', () => { const result = new StatisticsService(defaultRules).build([event('1', '2026-01-01T13:00:00.000Z', [1, 2, 3, 4, 5], 6), event('2', '2026-01-06T13:00:00.000Z', [1, 7, 8, 9, 10], 6)]); const metric = result.specialFrequency.find((item) => item.number === 6); expect(metric?.count).toBe(2); expect(metric?.averageIntervalDays).toBe(5); expect(metric?.maxGapDraws).toBe(1); expect(result.specialAssociations['6'].find((item) => item.number === 1)?.count).toBe(2); });
  it('separates special transitions by target draw hour and builds coverage backtest', () => {
    const records = Array.from({ length: 301 }, (_, index) => { const start = index % 31 + 1; return event(String(index), `2026-01-${String(index % 28 + 1).padStart(2, '0')}T${index % 2 ? '13' : '21'}:00:00.000Z`, [start, start + 1, start + 2, start + 3, start + 4], index % 2 ? 6 : 7); });
    const result = new StatisticsService(defaultRules).build(records);
    expect(result.specialTransitionsByHour['13']['7'][0]).toMatchObject({ number: 6, count: 150 });
    expect(result.coverageBacktest.evaluated).toBe(1);
    expect(result.coverageBacktest.greenAtLeast3HitRate).toBeGreaterThanOrEqual(0);
    expect(result.coverageBacktest.tickets).toHaveLength(3);
    expect(new Set(result.coverageBacktest.tickets.flatMap((ticket) => ticket.greens)).size).toBe(15);
    expect(result.greenForecast.greens).toHaveLength(5);
    expect(result.greenBacktest.evaluated).toBe(1);
    expect(result.predictionHistory).toHaveLength(8);
  });
});

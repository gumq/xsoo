import { describe, expect, it } from 'vitest';
import { StatisticsService } from './statistics-service';
import { defaultRules } from '../sync/synchronization-service';
import type { EventRecord } from '../core/domain';

const event = (id: string, timestamp: string, numbers: number[], specialNumber: number): EventRecord => ({ drawId: id, date: timestamp.slice(0, 10), timestamp, mainNumbers: numbers, specialNumber, validation: { source: 'test', validatedAt: timestamp, schemaVersion: '1' } });
describe('StatisticsService', () => {
  it('calculates main-number frequency and pairs', () => { const result = new StatisticsService(defaultRules).build([event('1', '2026-01-01T13:00:00.000Z', [1, 2, 3, 4, 5], 6), event('2', '2026-01-02T13:00:00.000Z', [1, 2, 7, 8, 9], 7)]); expect(result.frequency.find((item) => item.number === 1)?.count).toBe(2); expect(result.pairs.find((item) => item.key === '1,2')?.count).toBe(2); });
  it('calculates special-number recurrence and co-occurrence', () => { const result = new StatisticsService(defaultRules).build([event('1', '2026-01-01T13:00:00.000Z', [1, 2, 3, 4, 5], 6), event('2', '2026-01-06T13:00:00.000Z', [1, 7, 8, 9, 10], 6)]); const metric = result.specialFrequency.find((item) => item.number === 6); expect(metric?.count).toBe(2); expect(metric?.averageIntervalDays).toBe(5); expect(result.specialAssociations['6'].find((item) => item.number === 1)?.count).toBe(2); });
});

import { describe, expect, it } from 'vitest';
import { EventValidator } from './event-validator';
import { defaultRules } from './synchronization-service';

const valid = { drawId: 'D-1', date: '2026-01-01', timestamp: '2026-01-01T12:00:00.000Z', mainNumbers: [1, 2, 3, 4, 5], specialNumber: 6, validation: { source: 'test', validatedAt: '2026-01-01T12:01:00.000Z', schemaVersion: '1' } };
describe('EventValidator', () => {
  it('normalizes a valid Lottto 5/35 record', () => expect(new EventValidator(defaultRules).validate({ ...valid, mainNumbers: [5, 1, 4, 2, 3] }).mainNumbers).toEqual([1, 2, 3, 4, 5]));
  it('rejects duplicate main numbers', () => expect(() => new EventValidator(defaultRules).validate({ ...valid, mainNumbers: [1, 1, 3, 4, 5] })).toThrow('unique'));
  it('rejects a special number outside 01–12', () => expect(() => new EventValidator(defaultRules).validate({ ...valid, specialNumber: 13 })).toThrow('Special number'));
});

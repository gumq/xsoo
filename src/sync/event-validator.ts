import { z } from 'zod';
import type { EventRecord, EventRules } from '../core/domain';
import { DomainError } from '../core/errors';

const recordSchema = z.object({ drawId: z.string().min(1), date: z.iso.date(), timestamp: z.iso.datetime(), mainNumbers: z.array(z.number().int()), specialNumber: z.number().int(), validation: z.object({ source: z.string().min(1), validatedAt: z.iso.datetime(), schemaVersion: z.string().min(1) }) });
export class EventValidator {
  public constructor(private readonly rules: EventRules) {}
  public validate(input: unknown, existing: readonly EventRecord[] = []): EventRecord {
    const event = recordSchema.parse(input);
    if (existing.some((record) => record.drawId === event.drawId)) throw new DomainError(`Duplicate draw id: ${event.drawId}`);
    if (event.mainNumbers.length !== this.rules.mainCount) throw new DomainError(`Expected ${this.rules.mainCount} main numbers.`);
    if (new Set(event.mainNumbers).size !== event.mainNumbers.length) throw new DomainError('Main numbers must be unique.');
    if (event.mainNumbers.some((number) => number < this.rules.mainMin || number > this.rules.mainMax)) throw new DomainError(`Main numbers must be between ${this.rules.mainMin} and ${this.rules.mainMax}.`);
    if (event.specialNumber < this.rules.specialMin || event.specialNumber > this.rules.specialMax) throw new DomainError(`Special number must be between ${this.rules.specialMin} and ${this.rules.specialMax}.`);
    return { ...event, mainNumbers: [...event.mainNumbers].sort((a, b) => a - b) };
  }
}

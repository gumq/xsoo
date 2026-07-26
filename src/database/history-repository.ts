import type { EventRecord } from '../core/domain';
import { DomainError } from '../core/errors';
import { JsonFileStore } from './json-file-store';

export interface HistoryRepository { load(): Promise<EventRecord[]>; save(records: EventRecord[]): Promise<void>; add(record: EventRecord): Promise<void>; update(record: EventRecord): Promise<void>; delete(drawId: string): Promise<void>; exists(drawId: string): Promise<boolean>; latest(): Promise<EventRecord | null>; count(): Promise<number>; findByDraw(drawId: string): Promise<EventRecord | null>; findByDate(date: string): Promise<EventRecord[]>; }
export class JsonHistoryRepository implements HistoryRepository {
  public constructor(private readonly store: JsonFileStore, private readonly path: string) {}
  public load(): Promise<EventRecord[]> { return this.store.read<EventRecord[]>(this.path, []); }
  public async save(records: EventRecord[]): Promise<void> { await this.store.write(this.path, [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp))); }
  public async add(record: EventRecord): Promise<void> { const records = await this.load(); if (records.some((item) => item.drawId === record.drawId)) throw new DomainError(`Draw '${record.drawId}' already exists.`); records.push(record); await this.save(records); }
  public async update(record: EventRecord): Promise<void> { const records = await this.load(); const index = records.findIndex((item) => item.drawId === record.drawId); if (index < 0) throw new DomainError(`Draw '${record.drawId}' does not exist.`); records[index] = record; await this.save(records); }
  public async delete(drawId: string): Promise<void> { await this.save((await this.load()).filter((record) => record.drawId !== drawId)); }
  public async exists(drawId: string): Promise<boolean> { return (await this.load()).some((record) => record.drawId === drawId); }
  public async latest(): Promise<EventRecord | null> { const records = await this.load(); return records.at(-1) ?? null; }
  public async count(): Promise<number> { return (await this.load()).length; }
  public async findByDraw(drawId: string): Promise<EventRecord | null> { return (await this.load()).find((record) => record.drawId === drawId) ?? null; }
  public async findByDate(date: string): Promise<EventRecord[]> { return (await this.load()).filter((record) => record.date === date); }
}

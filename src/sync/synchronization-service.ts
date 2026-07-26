import type { Cache, EventRecord, EventRules, Metadata } from '../core/domain';
import type { HistoryRepository } from '../database/history-repository';
import { JsonFileStore } from '../database/json-file-store';
import { StatisticsService } from '../statistics/statistics-service';
import { EventValidator } from './event-validator';

export class SynchronizationService {
  public constructor(private readonly history: HistoryRepository, private readonly validator: EventValidator, private readonly statistics: StatisticsService, private readonly store: JsonFileStore, private readonly metadataPath: string, private readonly cachePath: string) {}
  public async synchronize(rawEvents: readonly unknown[]): Promise<{ added: number; rejected: string[] }> {
    const records=await this.history.load(); const rejected: string[]=[]; const additions: EventRecord[]=[];
    for (const raw of rawEvents) { try { additions.push(this.validator.validate(raw,[...records,...additions])); } catch (error) { rejected.push(error instanceof Error ? error.message : 'Unknown validation error'); } }
    if (additions.length) await this.history.save([...records,...additions]); await this.rebuild(); return { added:additions.length, rejected };
  }
  public async rebuild(): Promise<void> { const records=await this.history.load(); const latest=records.at(-1) ?? null; const statistics=this.statistics.build(records); const now=new Date().toISOString(); const metadata: Metadata={latestDraw:latest?.drawId ?? null,totalDraws:records.length,lastSynchronization:now,projectVersion:'0.1.0',statisticsVersion:'1.0.0'}; const cache:Cache={generatedAt:now,statistics}; await Promise.all([this.store.write(this.metadataPath,metadata),this.store.write(this.cachePath,cache)]); }
}
// Mega 6/45 has six main balls and no bonus ball. A zero specialNumber is a
// deliberate sentinel so the generic fixed-format model remains usable.
export const defaultRules: EventRules = { mainCount: 5, mainMin: 1, mainMax: 35, specialMin: 1, specialMax: 12 };

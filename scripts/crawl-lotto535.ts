import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JsonHistoryRepository } from '../src/database/history-repository.ts';
import { JsonFileStore } from '../src/database/json-file-store.ts';
import { StatisticsService } from '../src/statistics/statistics-service.ts';
import { EventValidator } from '../src/sync/event-validator.ts';
import { Lotto535Source } from '../src/sync/lotto535-source.ts';
import { defaultRules, SynchronizationService } from '../src/sync/synchronization-service.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = new JsonFileStore(); const history = new JsonHistoryRepository(store, resolve(root, 'data/history.json'));
const sync = new SynchronizationService(history, new EventValidator(defaultRules), new StatisticsService(defaultRules), store, resolve(root, 'data/metadata.json'), resolve(root, 'data/cache.json'));
const existing = await history.load();
if (existing.some((record) => !record.drawId.startsWith('MEGA-') && !record.drawId.startsWith('LOTTO535-'))) throw new Error('Refusing to replace history containing user-managed records.');
if (existing.some((record) => record.drawId.startsWith('MEGA-'))) await history.save([]);
const source = new Lotto535Source(); const earliest = new Date('2025-12-15T00:00:00.000Z'); const initialAnchor = new Date(); initialAnchor.setUTCDate(initialAnchor.getUTCDate() - 1); let anchor = initialAnchor; let pages = 0; let added = 0;
const pause = (milliseconds: number) => new Promise((done) => setTimeout(done, milliseconds));
while (anchor >= earliest) {
  const batch = await source.fetchBatch(anchor); if (!batch.length) throw new Error(`No Lottto 5/35 results found for ${anchor.toISOString().slice(0, 10)}.`);
  const result = await sync.synchronize(batch); pages += 1; added += result.added;
  const oldest = batch.map((event) => event.date).sort()[0]; anchor = new Date(`${oldest}T00:00:00.000Z`);
  console.log(`Page ${pages}: ${result.added} new draws; oldest ${oldest}.`); await pause(400);
}
console.log(`Lottto 5/35 crawl complete: ${added} new records across ${pages} pages.`);

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JsonHistoryRepository } from '../src/database/history-repository.ts';
import { JsonFileStore } from '../src/database/json-file-store.ts';
import { StatisticsService } from '../src/statistics/statistics-service.ts';
import { EventValidator } from '../src/sync/event-validator.ts';
import { Lotto535Source } from '../src/sync/lotto535-source.ts';
import { defaultRules, SynchronizationService } from '../src/sync/synchronization-service.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'); const store = new JsonFileStore();
const sync = new SynchronizationService(new JsonHistoryRepository(store, resolve(root, 'data/history.json')), new EventValidator(defaultRules), new StatisticsService(defaultRules), store, resolve(root, 'data/metadata.json'), resolve(root, 'data/cache.json'));
const result = await sync.synchronize(await new Lotto535Source().fetchBatch(new Date()));
console.log(`Latest Lottto sync: ${result.added} added, ${result.rejected.length} rejected.`);

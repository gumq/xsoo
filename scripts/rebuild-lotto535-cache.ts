import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JsonHistoryRepository } from '../src/database/history-repository.ts';
import { JsonFileStore } from '../src/database/json-file-store.ts';
import { StatisticsService } from '../src/statistics/statistics-service.ts';
import { defaultRules, SynchronizationService } from '../src/sync/synchronization-service.ts';
import { EventValidator } from '../src/sync/event-validator.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = new JsonFileStore();
const service = new SynchronizationService(
  new JsonHistoryRepository(store, resolve(root, 'data/history.json')),
  new EventValidator(defaultRules),
  new StatisticsService(defaultRules),
  store,
  resolve(root, 'data/metadata.json'),
  resolve(root, 'data/cache.json'),
);

await service.rebuild();
console.log('Rebuilt Lottto 5/35 cache from the local history.');

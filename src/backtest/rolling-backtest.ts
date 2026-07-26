import type { EventRecord } from '../core/domain';
import type { Algorithm } from './algorithm';
export interface BacktestReport { algorithm: string; evaluated: number; hitRate: number; topKHitRate: number; averageHits: number; executionMs: number; }
export class RollingBacktest {
  public run(records: readonly EventRecord[], algorithm: Algorithm, minimumTrainingSize = 10): BacktestReport {
    const started=performance.now(); let hits=0; let topKHits=0; let evaluated=0;
    for(let index=minimumTrainingSize; index<records.length; index+=1) { algorithm.initialize(); algorithm.train(records.slice(0,index)); const actual=records[index]; const hit=algorithm.evaluate(actual); hits+=hit; const ranked=algorithm.score().slice(0,actual.mainNumbers.length*2); topKHits += ranked.some((candidate) => actual.mainNumbers.includes(candidate.number)) ? 1 : 0; evaluated+=1; }
    return { algorithm: algorithm.id, evaluated, hitRate: evaluated ? hits/(evaluated*records[0].mainNumbers.length) : 0, topKHitRate: evaluated ? topKHits/evaluated : 0, averageHits: evaluated ? hits/evaluated : 0, executionMs: performance.now()-started };
  }
}

import type { EventRecord } from '../core/domain';
export interface ScoredNumber { number: number; score: number; }
export interface Algorithm { readonly id: string; initialize(): void; train(records: readonly EventRecord[]): void; score(): ScoredNumber[]; evaluate(actual: EventRecord): number; export(): Record<string, unknown>; }
export class FrequencyAlgorithm implements Algorithm {
  public readonly id = 'frequency'; private scores: ScoredNumber[] = [];
  public initialize(): void { this.scores = []; }
  public train(records: readonly EventRecord[]): void { const counts = new Map<number, number>(); records.forEach((record) => record.mainNumbers.forEach((n) => counts.set(n,(counts.get(n) ?? 0)+1))); this.scores=[...counts].map(([number,score]) => ({number,score})).sort((a,b) => b.score-a.score); }
  public score(): ScoredNumber[] { return [...this.scores]; }
  public evaluate(actual: EventRecord): number { return this.scores.slice(0, actual.mainNumbers.length).filter((item) => actual.mainNumbers.includes(item.number)).length; }
  public export(): Record<string, unknown> { return { id: this.id, candidates: this.scores.length }; }
}
export class AlgorithmRegistry { private readonly algorithms = new Map<string, () => Algorithm>(); public register(factory: () => Algorithm): void { const algorithm = factory(); this.algorithms.set(algorithm.id, factory); } public createAll(): Algorithm[] { return [...this.algorithms.values()].map((factory) => factory()); } }

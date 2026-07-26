export interface EventRecord {
  drawId: string;
  date: string;
  timestamp: string;
  mainNumbers: number[];
  specialNumber: number;
  validation: { source: string; validatedAt: string; schemaVersion: string };
}

export interface EventRules { mainCount: number; mainMin: number; mainMax: number; specialMin: number; specialMax: number; }
export interface Metadata { latestDraw: string | null; totalDraws: number; lastSynchronization: string | null; projectVersion: string; statisticsVersion: string; }
export interface NumberMetric { number: number; count: number; gap: number; averageGap: number; }
export interface SpecialMetric { number: number; count: number; drawsSinceLatest: number; daysSinceLatest: number; averageGapDraws: number; averageIntervalDays: number; overdueDays: number; recurrencePercentile: number; }
export interface SpecialAssociation { number: number; count: number; rate: number; }
export interface SpecialBacktest { evaluated: number; top3Hits: number; top3HitRate: number; baselineTop3Rate: number; }
export interface Statistics { generatedAt: string; drawCount: number; frequency: NumberMetric[]; specialFrequency: SpecialMetric[]; specialByHour: Record<string, SpecialMetric[]>; specialAssociations: Record<string, SpecialAssociation[]>; specialTransitions: Record<string, SpecialAssociation[]>; specialBacktest: SpecialBacktest; pairs: Array<{ key: string; count: number }>; distributions: { oddEven: Record<string, number>; highLow: Record<string, number>; sums: number[]; }; rollingMeans: number[]; }
export interface Cache { generatedAt: string; statistics: Statistics; }

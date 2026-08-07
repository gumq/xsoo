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
export interface SpecialMetric { number: number; count: number; drawsSinceLatest: number; maxGapDraws: number; daysSinceLatest: number; averageGapDraws: number; averageIntervalDays: number; overdueDays: number; recurrencePercentile: number; }
export interface SpecialAssociation { number: number; count: number; rate: number; }
export interface SpecialBacktest { evaluated: number; top3Hits: number; top3HitRate: number; baselineTop3Rate: number; }
export interface ComboBacktest { id: string; label: string; evaluated: number; orangeHitRate: number; averageGreenHits: number; anyGreenHitRate: number; jointHitRate: number; fullComboHitRate: number; }
export interface Recommendation { model: string; orange: number; greens: number[]; }
export interface GreenForecast { model: string; greens: number[]; orange: number; }
export interface GreenBacktest { evaluated: number; greenAnyHitRate: number; greenAtLeast3HitRate: number; averageGreenHits: number; orangeHitRate: number; jointHitRate: number; }
export interface GreenModelBacktest extends GreenBacktest { id: string; label: string; baselineGreenAnyHitRate: number; baselineGreenAtLeast3HitRate: number; }
export interface PredictionHistoryItem { model: string; basedOnDrawId: string; targetDrawId: string; targetTimestamp: string; greens: number[]; orange: number; greenHits: number; orangeHit: boolean; }
export interface CoverageTicket { orange: number; greens: number[]; }
export interface CoverageTicketBacktest { greenAnyHitRate: number; averageGreenHits: number; orangeHitRate: number; jointHitRate: number; }
export interface CoverageBacktest { evaluated: number; greenAnyHitRate: number; greenAtLeast3HitRate: number; averageGreenHits: number; orangeAnyHitRate: number; anyTicketJointHitRate: number; ticketStats: CoverageTicketBacktest[]; tickets: CoverageTicket[]; }
export interface Statistics { generatedAt: string; drawCount: number; frequency: NumberMetric[]; specialFrequency: SpecialMetric[]; specialByHour: Record<string, SpecialMetric[]>; specialAssociations: Record<string, SpecialAssociation[]>; specialTransitions: Record<string, SpecialAssociation[]>; specialTransitionsByHour: Record<string, Record<string, SpecialAssociation[]>>; specialBacktest: SpecialBacktest; comboBacktests: ComboBacktest[]; coverageBacktest: CoverageBacktest; greenForecast: GreenForecast; greenForecasts: GreenForecast[]; greenBacktest: GreenBacktest; greenModelBacktests: GreenModelBacktest[]; predictionHistory: PredictionHistoryItem[]; recommendations: Recommendation[]; pairs: Array<{ key: string; count: number }>; distributions: { oddEven: Record<string, number>; highLow: Record<string, number>; sums: number[]; }; rollingMeans: number[]; }
export interface Cache { generatedAt: string; statistics: Statistics; }

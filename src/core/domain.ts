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
export interface MonthlyDominantSpecial { month: string; numbers: number[]; count: number; drawCount: number; }
export interface RecentHotPair { first: number; second: number; count: number; }
export interface RecentSpecialLink { green: number; special: number; count: number; }
export interface RecentPatternAnalysis { startDate: string; endDate: string; drawCount: number; hotMainPairs: RecentHotPair[]; hotSpecialLinks: RecentSpecialLink[]; candidates: CoverageTicket[]; }
export interface CoverageTicket { orange: number; greens: number[]; }
export interface CoverageTicketBacktest { greenAnyHitRate: number; averageGreenHits: number; orangeHitRate: number; jointHitRate: number; }
export interface CoverageBacktest { evaluated: number; greenAnyHitRate: number; greenAtLeast3HitRate: number; averageGreenHits: number; orangeAnyHitRate: number; anyTicketJointHitRate: number; ticketStats: CoverageTicketBacktest[]; tickets: CoverageTicket[]; }
export interface CoverageStrategyBacktest extends CoverageBacktest { id: string; label: string; }
export interface TopNumber { number: number; count: number; rate: number; }
export interface PairCount { pair: [number, number]; count: number; }
export interface DayOfMonthAnalysis {
  day: number; totalDraws: number;
  topMainNumbers: TopNumber[]; topSpecialNumbers: TopNumber[];
  oddRatio: number; evenRatio: number;
  consecutivePairRate: number; consecutivePairs: PairCount[];
  tabooMainNumbers: number[]; tabooSpecialNumbers: number[];
  oddGroupRate: number; evenGroupRate: number;
  under30Rate: number;
  specialOddRatio: number;
  specialEvenRatio: number;
  oddEvenDistribution: Record<string, number>;
  dominantOddEvenPattern: string;
}
export interface MonthAnalysis {
  month: number; totalDraws: number;
  dominantMainNumbers: TopNumber[]; dominantSpecialNumbers: TopNumber[];
  oddRatio: number; evenRatio: number;
  consecutivePairRate: number;
  tabooSequences: string[]; tabooNumbers: number[];
  oddGroupRate: number; evenGroupRate: number;
  under30Rate: number;
  specialOddRatio: number;
  specialEvenRatio: number;
  oddEvenDistribution: Record<string, number>;
  dominantOddEvenPattern: string;
}
export interface CalendarTicket {
  ticketIndex: number;
  greens: number[];
  orange: number;
}

export interface CalendarForecast {
  basedOnDay: number;
  basedOnMonth: number;
  candidatePool18: number[];
  tickets: CalendarTicket[];
  suggestedGreens: number[];
  suggestedOrange: number;
  reasoning: string[];
  avoidNumbers: number[];
  avoidSequences: string[];
}
export interface CalendarAnalysis {
  dayOfMonthAnalysis: DayOfMonthAnalysis[];
  monthAnalysis: MonthAnalysis[];
  calendarForecast: CalendarForecast;
  calendarForecasts?: CalendarForecast[];
}
export interface Statistics { generatedAt: string; drawCount: number; frequency: NumberMetric[]; specialFrequency: SpecialMetric[]; specialByHour: Record<string, SpecialMetric[]>; specialAssociations: Record<string, SpecialAssociation[]>; mainAssociations: Record<string, SpecialAssociation[]>; monthlyDominantSpecials: MonthlyDominantSpecial[]; recentPatternAnalysis: RecentPatternAnalysis; specialTransitions: Record<string, SpecialAssociation[]>; specialTransitionsByHour: Record<string, Record<string, SpecialAssociation[]>>; specialBacktest: SpecialBacktest; comboBacktests: ComboBacktest[]; coverageBacktest: CoverageBacktest; coverageBacktests: CoverageStrategyBacktest[]; greenForecast: GreenForecast; greenForecasts: GreenForecast[]; greenBacktest: GreenBacktest; greenModelBacktests: GreenModelBacktest[]; predictionHistory: PredictionHistoryItem[]; recommendations: Recommendation[]; pairs: Array<{ key: string; count: number }>; distributions: { oddEven: Record<string, number>; highLow: Record<string, number>; sums: number[]; }; rollingMeans: number[]; calendarAnalysis: CalendarAnalysis; }
export interface Cache { generatedAt: string; statistics: Statistics; }

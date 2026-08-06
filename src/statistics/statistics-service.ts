import type { EventRecord, EventRules, SpecialAssociation, SpecialMetric, Statistics } from '../core/domain';

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const combinations = (numbers: number[], size: number): string[] => size === 1 ? numbers.map(String) : numbers.flatMap((value, index) => combinations(numbers.slice(index + 1), size - 1).map((rest) => `${value},${rest}`));
const choose = (total: number, selected: number): number => { if (selected < 0 || selected > total) return 0; let result = 1; for (let index = 1; index <= selected; index += 1) result *= (total - selected + index) / index; return result; };
const hour = (record: EventRecord) => record.timestamp.slice(11, 13);

export class StatisticsService {
  public constructor(private readonly rules: EventRules) {}
  /**
   * Creates three non-overlapping tickets from historical conditional associations.
   * Consecutive values receive no artificial bonus: lottery ball positions are unordered,
   * so only observed co-occurrence with the selected special ball and current ticket matters.
   */
  private coverageTickets(train: readonly EventRecord[]): import('../core/domain').CoverageTicket[] {
    const metrics = this.specialMetrics(train);
    const last = train.at(-1)!.specialNumber;
    const transitions = new Map<number, number>();
    train.forEach((record, index) => { if (index && train[index - 1].specialNumber === last) transitions.set(record.specialNumber, (transitions.get(record.specialNumber) ?? 0) + 1); });
    const recent = this.specialMetrics(train.slice(-60));
    const recentByNumber = new Map(recent.map((metric) => [metric.number, metric.count]));
    const maxTransition = Math.max(1, ...transitions.values());
    const maxRecent = Math.max(1, ...recent.map((metric) => metric.count));
    const specials = [...metrics].sort((a, b) => {
      const score = (metric: SpecialMetric) => .65 * ((transitions.get(metric.number) ?? 0) / maxTransition) + .35 * ((recentByNumber.get(metric.number) ?? 0) / maxRecent);
      return score(b) - score(a) || a.number - b.number;
    }).slice(0, 3).map((metric) => metric.number);
    const globalCounts = new Map<number, number>();
    train.forEach((record) => record.mainNumbers.forEach((number) => globalCounts.set(number, (globalCounts.get(number) ?? 0) + 1)));
    const tickets = specials.map((orange) => ({ orange, greens: [] as number[], records: train.filter((record) => record.specialNumber === orange) }));
    const pairKey = (first: number, second: number) => first < second ? `${first},${second}` : `${second},${first}`;
    const used = new Set<number>();
    // Round-robin assignment prevents the first ticket from consuming all strong numbers.
    for (let round = 0; round < 5; round += 1) tickets.forEach((ticket) => {
      const conditionalCounts = new Map<number, number>(); const pairCounts = new Map<string, number>();
      ticket.records.forEach((record) => { record.mainNumbers.forEach((number) => conditionalCounts.set(number, (conditionalCounts.get(number) ?? 0) + 1)); combinations(record.mainNumbers, 2).forEach((pair) => pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1)); });
      const conditionalTotal = Math.max(1, ticket.records.length); const globalTotal = Math.max(1, train.length);
      const candidates = Array.from({ length: this.rules.mainMax - this.rules.mainMin + 1 }, (_, offset) => offset + this.rules.mainMin).filter((number) => !used.has(number));
      const score = (number: number) => {
        const conditional = (conditionalCounts.get(number) ?? 0) / conditionalTotal;
        const global = (globalCounts.get(number) ?? 0) / globalTotal;
        const synergy = ticket.greens.length ? average(ticket.greens.map((selected) => (pairCounts.get(pairKey(selected, number)) ?? 0) / conditionalTotal)) : 0;
        return .65 * conditional + .20 * synergy + .15 * global;
      };
      const selected = candidates.sort((a, b) => score(b) - score(a) || a - b)[0];
      if (selected !== undefined) { ticket.greens.push(selected); used.add(selected); }
    });
    return tickets.map(({ orange, greens }) => ({ orange, greens }));
  }
  private coverageBacktest(records: readonly EventRecord[]): Statistics['coverageBacktest'] {
    const start = 300; const ticketHits = Array.from({ length: 3 }, () => ({ greenAny: 0, green: 0, orange: 0, joint: 0 })); let greenAny = 0; let greenAtLeast3 = 0; let greenHits = 0; let orangeAny = 0; let joint = 0;
    for (let index = start; index < records.length; index += 1) {
      const tickets = this.coverageTickets(records.slice(0, index)); const actual = records[index]; const allGreens = new Set(tickets.flatMap((ticket) => ticket.greens)); const totalGreenHits = actual.mainNumbers.filter((number) => allGreens.has(number)).length;
      greenAny += Number(totalGreenHits > 0); greenAtLeast3 += Number(totalGreenHits >= 3); greenHits += totalGreenHits; orangeAny += Number(tickets.some((ticket) => ticket.orange === actual.specialNumber));
      tickets.forEach((ticket, ticketIndex) => { const hits = ticket.greens.filter((number) => actual.mainNumbers.includes(number)).length; const orangeHit = ticket.orange === actual.specialNumber; ticketHits[ticketIndex].greenAny += Number(hits > 0); ticketHits[ticketIndex].green += hits; ticketHits[ticketIndex].orange += Number(orangeHit); ticketHits[ticketIndex].joint += Number(orangeHit && hits > 0); });
      joint += Number(tickets.some((ticket) => ticket.orange === actual.specialNumber && ticket.greens.some((number) => actual.mainNumbers.includes(number))));
    }
    const evaluated = Math.max(0, records.length - start); const rate = (value: number) => evaluated ? value / evaluated : 0;
    return { evaluated, greenAnyHitRate: rate(greenAny), greenAtLeast3HitRate: rate(greenAtLeast3), averageGreenHits: rate(greenHits), orangeAnyHitRate: rate(orangeAny), anyTicketJointHitRate: rate(joint), ticketStats: ticketHits.map((value) => ({ greenAnyHitRate: rate(value.greenAny), averageGreenHits: rate(value.green), orangeHitRate: rate(value.orange), jointHitRate: rate(value.joint) })), tickets: records.length >= start ? this.coverageTickets(records) : [] };
  }
  /** Five-green ensemble, then a special ball inferred from its historical co-occurrence. */
  private greenForecast(train: readonly EventRecord[], model: 'bayesian' | 'ensemble' = 'ensemble'): Statistics['greenForecast'] {
    const counts = new Map<number, number>(); const recentCounts = new Map<number, number>(); const decayCounts = new Map<number, number>(); const lastSeen = new Map<number, number>(); const gaps = new Map<number, number[]>(); const pairCounts = new Map<string, number>();
    const pairKey = (first: number, second: number) => first < second ? `${first},${second}` : `${second},${first}`; let totalWeight = 0;
    train.forEach((record, index) => { const weight = Math.exp(-(train.length - 1 - index) / 30); totalWeight += weight; record.mainNumbers.forEach((number) => { counts.set(number, (counts.get(number) ?? 0) + 1); decayCounts.set(number, (decayCounts.get(number) ?? 0) + weight); if (index >= train.length - 60) recentCounts.set(number, (recentCounts.get(number) ?? 0) + 1); const last = lastSeen.get(number); if (last !== undefined) gaps.set(number, [...(gaps.get(number) ?? []), index - last]); lastSeen.set(number, index); }); combinations(record.mainNumbers, 2).forEach((pair) => pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1)); });
    const maxCount = Math.max(1, ...counts.values()); const maxRecent = Math.max(1, ...recentCounts.values()); const maxBayesian = Math.max(...Array.from({ length: this.rules.mainMax }, (_, index) => (1 + (decayCounts.get(index + 1) ?? 0)) / (7 + totalWeight))); const anchors = train.at(-1)!.mainNumbers; const greens: number[] = [];
    while (greens.length < this.rules.mainCount) {
      const candidate = Array.from({ length: this.rules.mainMax - this.rules.mainMin + 1 }, (_, offset) => offset + this.rules.mainMin).filter((number) => !greens.includes(number)).sort((a, b) => {
        const score = (number: number) => { const bayesian = ((1 + (decayCounts.get(number) ?? 0)) / (7 + totalWeight)) / maxBayesian; if (model === 'bayesian') return bayesian; const averageGap = average(gaps.get(number) ?? []); const overdue = Math.min(1, (train.length - 1 - (lastSeen.get(number) ?? -1)) / (averageGap || train.length)); const withAnchors = average(anchors.map((anchor) => (pairCounts.get(pairKey(anchor, number)) ?? 0) / train.length)); const withTicket = greens.length ? average(greens.map((selected) => (pairCounts.get(pairKey(selected, number)) ?? 0) / train.length)) : 0; return .35 * bayesian + .20 * ((recentCounts.get(number) ?? 0) / maxRecent) + .15 * ((counts.get(number) ?? 0) / maxCount) + .15 * overdue + .075 * withAnchors + .075 * withTicket; };
        return score(b) - score(a) || a - b;
      })[0];
      greens.push(candidate);
    }
    const orange = Array.from({ length: this.rules.specialMax - this.rules.specialMin + 1 }, (_, offset) => offset + this.rules.specialMin).sort((a, b) => {
      const likelihood = (special: number) => { const matching = train.filter((record) => record.specialNumber === special); return matching.length ? average(greens.map((green) => matching.filter((record) => record.mainNumbers.includes(green)).length / matching.length)) : 0; };
      return likelihood(b) - likelihood(a) || a - b;
    })[0];
    return { model: model === 'bayesian' ? 'Bayesian: tần suất gần đây có làm mượt' : 'Ensemble: Bayesian + dài hạn + chu kỳ + đi chung', greens, orange };
  }
  private greenBacktest(records: readonly EventRecord[], model: 'bayesian' | 'ensemble' = 'ensemble'): Statistics['greenBacktest'] {
    const start = 300; let any = 0; let atLeast3 = 0; let hits = 0; let orange = 0; let joint = 0;
    for (let index = start; index < records.length; index += 1) { const forecast = this.greenForecast(records.slice(0, index), model); const actual = records[index]; const greenHits = forecast.greens.filter((number) => actual.mainNumbers.includes(number)).length; const orangeHit = forecast.orange === actual.specialNumber; any += Number(greenHits > 0); atLeast3 += Number(greenHits >= 3); hits += greenHits; orange += Number(orangeHit); joint += Number(orangeHit && greenHits > 0); }
    const evaluated = Math.max(0, records.length - start); const rate = (value: number) => evaluated ? value / evaluated : 0;
    return { evaluated, greenAnyHitRate: rate(any), greenAtLeast3HitRate: rate(atLeast3), averageGreenHits: rate(hits), orangeHitRate: rate(orange), jointHitRate: rate(joint) };
  }
  private greenModelBacktests(records: readonly EventRecord[]): Statistics['greenModelBacktests'] {
    const baselineAny = 1 - choose(this.rules.mainMax - this.rules.mainCount, this.rules.mainCount) / choose(this.rules.mainMax, this.rules.mainCount);
    const baselineAtLeast3 = Array.from({ length: this.rules.mainCount - 2 }, (_, offset) => offset + 3).reduce((sum, hits) => sum + choose(this.rules.mainCount, hits) * choose(this.rules.mainMax - this.rules.mainCount, this.rules.mainCount - hits), 0) / choose(this.rules.mainMax, this.rules.mainCount);
    return (['bayesian', 'ensemble'] as const).map((id) => ({ id, label: id === 'bayesian' ? 'Bayesian làm mượt' : 'Ensemble lịch sử', ...this.greenBacktest(records, id), baselineGreenAnyHitRate: baselineAny, baselineGreenAtLeast3HitRate: baselineAtLeast3 }));
  }
  private specialMetrics(records: readonly EventRecord[], now = new Date()): SpecialMetric[] {
    const count = new Map<number, number>(); const latest = new Map<number, { index: number; date: Date }>(); const gaps = new Map<number, number[]>(); const gapDays = new Map<number, number[]>();
    records.forEach((record, index) => { const date = new Date(record.timestamp); const previous = latest.get(record.specialNumber); count.set(record.specialNumber, (count.get(record.specialNumber) ?? 0) + 1); if (previous) { gaps.set(record.specialNumber, [...(gaps.get(record.specialNumber) ?? []), index - previous.index]); gapDays.set(record.specialNumber, [...(gapDays.get(record.specialNumber) ?? []), (date.getTime() - previous.date.getTime()) / 86400000]); } latest.set(record.specialNumber, { index, date }); });
    return Array.from({ length: this.rules.specialMax - this.rules.specialMin + 1 }, (_, offset) => { const number = offset + this.rules.specialMin; const drawGaps = gaps.get(number) ?? []; const intervals = gapDays.get(number) ?? []; const last = latest.get(number); const daysSinceLatest = last ? (now.getTime() - last.date.getTime()) / 86400000 : Number.POSITIVE_INFINITY; return { number, count: count.get(number) ?? 0, drawsSinceLatest: last ? records.length - 1 - last.index : records.length, maxGapDraws: drawGaps.length ? Math.max(...drawGaps) : 0, daysSinceLatest, averageGapDraws: average(drawGaps), averageIntervalDays: average(intervals), overdueDays: intervals.length ? daysSinceLatest - average(intervals) : 0, recurrencePercentile: intervals.length ? intervals.filter((gap) => gap <= daysSinceLatest).length / intervals.length * 100 : 0 }; });
  }
  private backtest(records: readonly EventRecord[]): Statistics['specialBacktest'] {
    const start = 300; let hits = 0; for (let index = start; index < records.length; index += 1) { const train = records.slice(0, index); const ranked = this.specialMetrics(train, new Date(records[index].timestamp)).sort((a, b) => (b.count + Math.max(0, b.overdueDays)) - (a.count + Math.max(0, a.overdueDays))).slice(0, 3); if (ranked.some((metric) => metric.number === records[index].specialNumber)) hits += 1; } const evaluated = Math.max(0, records.length - start); return { evaluated, top3Hits: hits, top3HitRate: evaluated ? hits / evaluated : 0, baselineTop3Rate: 3 / (this.rules.specialMax - this.rules.specialMin + 1) };
  }
  private comboBacktests(records: readonly EventRecord[]): Statistics['comboBacktests'] {
    const scoreBest = (metrics: SpecialMetric[], score: (metric: SpecialMetric) => number) => [...metrics].sort((a, b) => score(b) - score(a) || a.number - b.number)[0].number;
    const transitionCounts = (train: readonly EventRecord[]) => { const last = train.at(-1)!.specialNumber; const result = new Map<number, number>(); train.forEach((record, index) => { if (index && train[index - 1].specialNumber === last) result.set(record.specialNumber, (result.get(record.specialNumber) ?? 0) + 1); }); return result; };
    const strategies = [
      { id: 'overdue', label: 'Quá hạn tuyệt đối', special: (metrics: SpecialMetric[]) => [...metrics].sort((a, b) => b.drawsSinceLatest - a.drawsSinceLatest)[0].number },
      { id: 'normalized-overdue', label: 'Quá hạn / chu kỳ trung bình', special: (metrics: SpecialMetric[]) => [...metrics].sort((a, b) => (b.overdueDays / (b.averageIntervalDays || 1)) - (a.overdueDays / (a.averageIntervalDays || 1)))[0].number },
      { id: 'recent-frequency', label: 'Tần suất ngắn hạn (30 kỳ)', special: (_: SpecialMetric[], train: readonly EventRecord[]) => [...this.specialMetrics(train.slice(-30))].sort((a, b) => b.count - a.count)[0].number },
      { id: 'long-frequency', label: 'Tần suất dài hạn (120 kỳ)', special: (_: SpecialMetric[], train: readonly EventRecord[]) => scoreBest(this.specialMetrics(train.slice(-120)), (metric) => metric.count) },
      { id: 'transition', label: 'Transition sau cam gần nhất', special: (metrics: SpecialMetric[], train: readonly EventRecord[]) => { const next = transitionCounts(train); return next.size ? [...next].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] : scoreBest(metrics, (metric) => metric.count); } },
      { id: 'hour-frequency', label: 'Tần suất theo giờ quay', special: (_: SpecialMetric[], train: readonly EventRecord[], target: EventRecord) => scoreBest(this.specialMetrics(train.filter((record) => hour(record) === hour(target))), (metric) => metric.count) },
      { id: 'decay-frequency', label: 'Tần suất suy giảm theo thời gian', special: (metrics: SpecialMetric[], train: readonly EventRecord[]) => { const weights = new Map<number, number>(); train.forEach((record, index) => { const age = train.length - 1 - index; weights.set(record.specialNumber, (weights.get(record.specialNumber) ?? 0) + Math.exp(-age / 20)); }); return scoreBest(metrics, (metric) => weights.get(metric.number) ?? 0); } },
      { id: 'pair-transition', label: 'Transition theo 2 cam gần nhất', special: (metrics: SpecialMetric[], train: readonly EventRecord[]) => { const penultimate = train.at(-2)!.specialNumber; const last = train.at(-1)!.specialNumber; const next = new Map<number, number>(); train.forEach((record, index) => { if (index >= 2 && train[index - 2].specialNumber === penultimate && train[index - 1].specialNumber === last) next.set(record.specialNumber, (next.get(record.specialNumber) ?? 0) + 1); }); return next.size ? [...next].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] : scoreBest(metrics, (metric) => metric.count); } },
      { id: 'hour-transition', label: 'Transition theo giờ quay', special: (metrics: SpecialMetric[], train: readonly EventRecord[], target: EventRecord) => { const last = train.at(-1)!.specialNumber; const next = new Map<number, number>(); train.forEach((record, index) => { if (index && hour(record) === hour(target) && train[index - 1].specialNumber === last) next.set(record.specialNumber, (next.get(record.specialNumber) ?? 0) + 1); }); return next.size ? [...next].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] : scoreBest(metrics, (metric) => metric.count); } },
      { id: 'transition-overdue', label: 'Kết hợp transition + quá hạn', special: (metrics: SpecialMetric[], train: readonly EventRecord[]) => { const next = transitionCounts(train); const max = Math.max(1, ...next.values()); return scoreBest(metrics, (metric) => 0.65 * ((next.get(metric.number) ?? 0) / max) + 0.35 * Math.max(0, metric.overdueDays) / (metric.averageIntervalDays || 1)); } },
      { id: 'ensemble', label: 'Ensemble: transition + gần đây + chu kỳ', special: (metrics: SpecialMetric[], train: readonly EventRecord[]) => { const next = transitionCounts(train); const maxTransition = Math.max(1, ...next.values()); const recent = this.specialMetrics(train.slice(-30)); const maxRecent = Math.max(1, ...recent.map((metric) => metric.count)); const recentByNumber = new Map(recent.map((metric) => [metric.number, metric.count])); return scoreBest(metrics, (metric) => 0.5 * ((next.get(metric.number) ?? 0) / maxTransition) + 0.3 * ((recentByNumber.get(metric.number) ?? 0) / maxRecent) + 0.2 * Math.max(0, metric.overdueDays) / (metric.averageIntervalDays || 1)); } },
    ];
    return strategies.map((strategy) => { let orange = 0; let green = 0; let anyGreen = 0; let joint = 0; let full = 0; const start = 300; for (let index = start; index < records.length; index += 1) { const train = records.slice(0, index); const actual = records[index]; const selected = strategy.special(this.specialMetrics(train, new Date(actual.timestamp)), train, actual); const counts = new Map<number, number>(); train.filter((record) => record.specialNumber === selected).forEach((record) => record.mainNumbers.forEach((number) => counts.set(number, (counts.get(number) ?? 0) + 1))); const picks = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([number]) => number); const orangeHit = selected === actual.specialNumber; const greenHits = picks.filter((number) => actual.mainNumbers.includes(number)).length; orange += Number(orangeHit); green += greenHits; anyGreen += Number(greenHits > 0); joint += Number(orangeHit && greenHits > 0); full += Number(orangeHit && greenHits === 3); } const evaluated = Math.max(0, records.length - start); return { id: strategy.id, label: strategy.label, evaluated, orangeHitRate: orange / evaluated, averageGreenHits: green / evaluated, anyGreenHitRate: anyGreen / evaluated, jointHitRate: joint / evaluated, fullComboHitRate: full / evaluated }; });
  }
  private recommendations(records: readonly EventRecord[]): Statistics['recommendations'] {
    const greenPicks = (special: number) => { const counts = new Map<number, number>(); records.filter((record) => record.specialNumber === special).forEach((record) => record.mainNumbers.forEach((number) => counts.set(number, (counts.get(number) ?? 0) + 1))); return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([number]) => number); };
    const frequency120 = this.specialMetrics(records.slice(-120)).sort((a, b) => b.count - a.count || a.number - b.number)[0].number;
    const last = records.at(-1)!.specialNumber; const transition = new Map<number, number>(); records.forEach((record, index) => { if (index && records[index - 1].specialNumber === last) transition.set(record.specialNumber, (transition.get(record.specialNumber) ?? 0) + 1); }); const transitionPick = transition.size ? [...transition].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] : frequency120;
    const overdue = this.specialMetrics(records).sort((a, b) => (b.overdueDays / (b.averageIntervalDays || 1)) - (a.overdueDays / (a.averageIntervalDays || 1)))[0].number;
    return [{ model: 'Transition sau cam gần nhất', orange: transitionPick, greens: greenPicks(transitionPick) }, { model: 'Tần suất dài hạn (120 kỳ)', orange: frequency120, greens: greenPicks(frequency120) }, { model: 'Quá hạn / chu kỳ trung bình', orange: overdue, greens: greenPicks(overdue) }];
  }
  public build(records: readonly EventRecord[]): Statistics {
    const counts = new Map<number, number>(); const lastSeen = new Map<number, number>(); const gaps = new Map<number, number[]>(); const pairCounts = new Map<string, number>(); const associations = new Map<number, Map<number, number>>(); const transitions = new Map<number, Map<number, number>>(); const transitionsByHour = new Map<string, Map<number, Map<number, number>>>(); const sums: number[] = []; const oddEven: Record<string, number> = {}; const highLow: Record<string, number> = {}; const rollingMeans: number[] = []; const midpoint = (this.rules.mainMax + this.rules.mainMin) / 2;
    records.forEach((record, index) => { const sum = record.mainNumbers.reduce((a, b) => a + b, 0); sums.push(sum); record.mainNumbers.forEach((number) => { counts.set(number, (counts.get(number) ?? 0) + 1); const last = lastSeen.get(number); if (last !== undefined) gaps.set(number, [...(gaps.get(number) ?? []), index - last]); lastSeen.set(number, index); }); const related = associations.get(record.specialNumber) ?? new Map<number, number>(); record.mainNumbers.forEach((number) => related.set(number, (related.get(number) ?? 0) + 1)); associations.set(record.specialNumber, related); if (index) { const from = records[index - 1].specialNumber; const next = transitions.get(from) ?? new Map<number, number>(); next.set(record.specialNumber, (next.get(record.specialNumber) ?? 0) + 1); transitions.set(from, next); const perHour = transitionsByHour.get(hour(record)) ?? new Map<number, Map<number, number>>(); const hourNext = perHour.get(from) ?? new Map<number, number>(); hourNext.set(record.specialNumber, (hourNext.get(record.specialNumber) ?? 0) + 1); perHour.set(from, hourNext); transitionsByHour.set(hour(record), perHour); } combinations(record.mainNumbers, 2).forEach((pair) => pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1)); const odd = record.mainNumbers.filter((number) => number % 2).length; oddEven[`${odd} odd / ${record.mainNumbers.length - odd} even`] = (oddEven[`${odd} odd / ${record.mainNumbers.length - odd} even`] ?? 0) + 1; const high = record.mainNumbers.filter((number) => number > midpoint).length; highLow[`${high} high / ${record.mainNumbers.length - high} low`] = (highLow[`${high} high / ${record.mainNumbers.length - high} low`] ?? 0) + 1; rollingMeans.push(average(sums.slice(Math.max(0, index - 9), index + 1))); });
    const frequency = Array.from({ length: this.rules.mainMax - this.rules.mainMin + 1 }, (_, offset) => { const number = offset + this.rules.mainMin; return { number, count: counts.get(number) ?? 0, gap: records.length - 1 - (lastSeen.get(number) ?? -1), averageGap: average(gaps.get(number) ?? []) }; }); const specialFrequency = this.specialMetrics(records); const convert = (map: Map<number, number>, total: number): SpecialAssociation[] => [...map].map(([number, count]) => ({ number, count, rate: total ? count / total : 0 })).sort((a, b) => b.count - a.count || a.number - b.number); const specialAssociations = Object.fromEntries(specialFrequency.map((metric) => [String(metric.number), convert(associations.get(metric.number) ?? new Map(), metric.count)])); const specialTransitions = Object.fromEntries(specialFrequency.map((metric) => { const map = transitions.get(metric.number) ?? new Map(); return [String(metric.number), convert(map, [...map.values()].reduce((sum, count) => sum + count, 0))]; }));
    const specialTransitionsByHour = Object.fromEntries(['13', '21'].map((value) => [value, Object.fromEntries(specialFrequency.map((metric) => { const map = transitionsByHour.get(value)?.get(metric.number) ?? new Map<number, number>(); return [String(metric.number), convert(map, [...map.values()].reduce((sum, count) => sum + count, 0))]; }))]));
    const greenForecasts = [this.greenForecast(records, 'bayesian'), this.greenForecast(records, 'ensemble')];
    return { generatedAt: new Date().toISOString(), drawCount: records.length, frequency, specialFrequency, specialByHour: { '13': this.specialMetrics(records.filter((record) => hour(record) === '13')), '21': this.specialMetrics(records.filter((record) => hour(record) === '21')) }, specialAssociations, specialTransitions, specialTransitionsByHour, specialBacktest: this.backtest(records), comboBacktests: this.comboBacktests(records), coverageBacktest: this.coverageBacktest(records), greenForecast: greenForecasts[1], greenForecasts, greenBacktest: this.greenBacktest(records), greenModelBacktests: this.greenModelBacktests(records), recommendations: this.recommendations(records), pairs: [...pairCounts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 50), distributions: { oddEven, highLow, sums }, rollingMeans };
  }
}

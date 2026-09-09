import type { CalendarAnalysis, CalendarForecast, CalendarTicket, DayOfMonthAnalysis, EventRecord, EventRules, HourAnalysis, MonthAnalysis, PairCount, TopNumber } from '../core/domain';

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export class CalendarAnalysisService {
  public constructor(private readonly rules: EventRules) {}

  public build(records: readonly EventRecord[], now = new Date()): CalendarAnalysis {
    const dayOfMonthAnalysis = this.analyzeDaysOfMonth(records);
    const monthAnalysis = this.analyzeMonths(records);
    const calendarForecast = this.forecast(records, dayOfMonthAnalysis, monthAnalysis, now);
    return { dayOfMonthAnalysis, monthAnalysis, calendarForecast };
  }

  /** Analyze statistics for a specific draw hour (13 or 21) given a subset of records. */
  public analyzeHourGroup(hour: 13 | 21, records: readonly EventRecord[]): HourAnalysis {
    const totalDraws = records.length;
    if (totalDraws === 0) {
      return {
        hour, totalDraws: 0,
        topMainNumbers: [], tabooMainNumbers: [],
        topSpecialNumbers: [], tabooSpecialNumbers: [],
        oddRatio: 0, evenRatio: 0, under30Rate: 0,
        specialOddRatio: 0, specialEvenRatio: 0,
        dominantOddEvenPattern: '—', oddEvenDistribution: {},
      };
    }

    const mainCounts = new Map<number, number>();
    const specialCounts = new Map<number, number>();
    let totalOdd = 0; let totalEven = 0; let totalNumbers = 0;
    let totalUnder30 = 0;
    let specialOddCount = 0; let specialEvenCount = 0;
    const oddEvenComboCounts = new Map<string, number>();

    records.forEach((record) => {
      record.mainNumbers.forEach((num) => {
        mainCounts.set(num, (mainCounts.get(num) ?? 0) + 1);
        if (num < 30) totalUnder30 += 1;
      });
      specialCounts.set(record.specialNumber, (specialCounts.get(record.specialNumber) ?? 0) + 1);
      if (record.specialNumber % 2 !== 0) specialOddCount += 1;
      else specialEvenCount += 1;

      const oddCount = record.mainNumbers.filter((n) => n % 2 !== 0).length;
      const evenCount = record.mainNumbers.length - oddCount;
      totalOdd += oddCount;
      totalEven += evenCount;
      totalNumbers += record.mainNumbers.length;

      const comboKey = `${oddCount} lẻ / ${evenCount} chẵn`;
      oddEvenComboCounts.set(comboKey, (oddEvenComboCounts.get(comboKey) ?? 0) + 1);
    });

    const topMainNumbers = this.topNumbers(mainCounts, totalDraws, 10);
    const topSpecialNumbers = this.topNumbers(specialCounts, totalDraws, 5);

    const avgMainCount = average([...mainCounts.values()]);
    const tabooMainNumbers = Array.from({ length: this.rules.mainMax - this.rules.mainMin + 1 }, (_, offset) => offset + this.rules.mainMin)
      .filter((num) => (mainCounts.get(num) ?? 0) < avgMainCount * 0.3)
      .sort((a, b) => (mainCounts.get(a) ?? 0) - (mainCounts.get(b) ?? 0))
      .slice(0, 8);

    const avgSpecialCount = average([...specialCounts.values()]);
    const tabooSpecialNumbers = Array.from({ length: this.rules.specialMax - this.rules.specialMin + 1 }, (_, offset) => offset + this.rules.specialMin)
      .filter((num) => (specialCounts.get(num) ?? 0) < avgSpecialCount * 0.3)
      .sort((a, b) => (specialCounts.get(a) ?? 0) - (specialCounts.get(b) ?? 0))
      .slice(0, 4);

    const oddEvenDistribution: Record<string, number> = {};
    oddEvenComboCounts.forEach((cnt, key) => {
      oddEvenDistribution[key] = totalDraws ? cnt / totalDraws : 0;
    });
    const dominantOddEvenPattern = [...oddEvenComboCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

    return {
      hour, totalDraws, topMainNumbers, tabooMainNumbers, topSpecialNumbers, tabooSpecialNumbers,
      oddRatio: totalNumbers ? totalOdd / totalNumbers : 0,
      evenRatio: totalNumbers ? totalEven / totalNumbers : 0,
      under30Rate: totalNumbers ? totalUnder30 / totalNumbers : 0,
      specialOddRatio: totalDraws ? specialOddCount / totalDraws : 0,
      specialEvenRatio: totalDraws ? specialEvenCount / totalDraws : 0,
      dominantOddEvenPattern, oddEvenDistribution,
    };
  }

  /** Helper to extract draw hour from a record's timestamp string. */
  private recordHour(record: EventRecord): number {
    return parseInt(record.timestamp.slice(11, 13), 10);
  }

  /** Analyze patterns for each day of the month (1-31) across all history. */
  private analyzeDaysOfMonth(records: readonly EventRecord[]): DayOfMonthAnalysis[] {
    const byDay = new Map<number, EventRecord[]>();
    records.forEach((record) => {
      const day = new Date(record.date).getUTCDate();
      byDay.set(day, [...(byDay.get(day) ?? []), record]);
    });

    return Array.from({ length: 31 }, (_, offset) => {
      const day = offset + 1;
      const dayRecords = byDay.get(day) ?? [];
      return this.analyzeDayGroup(day, dayRecords);
    });
  }

  /** Analyze patterns for each calendar month (1-12) across all history. */
  private analyzeMonths(records: readonly EventRecord[]): MonthAnalysis[] {
    const byMonth = new Map<number, EventRecord[]>();
    records.forEach((record) => {
      const month = new Date(record.date).getUTCMonth() + 1;
      byMonth.set(month, [...(byMonth.get(month) ?? []), record]);
    });

    return Array.from({ length: 12 }, (_, offset) => {
      const month = offset + 1;
      const monthRecords = byMonth.get(month) ?? [];
      return this.analyzeMonthGroup(month, monthRecords);
    });
  }

  private analyzeDayGroup(day: number, records: readonly EventRecord[]): DayOfMonthAnalysis {
    const totalDraws = records.length;
    if (totalDraws === 0) {
      return {
        day,
        totalDraws: 0,
        topMainNumbers: [],
        topSpecialNumbers: [],
        oddRatio: 0,
        evenRatio: 0,
        consecutivePairRate: 0,
        consecutivePairs: [],
        tabooMainNumbers: [],
        tabooSpecialNumbers: [],
        oddGroupRate: 0,
        evenGroupRate: 0,
        under30Rate: 0,
        specialOddRatio: 0,
        specialEvenRatio: 0,
        oddEvenDistribution: {},
        dominantOddEvenPattern: '—',
      };
    }

    // Count main numbers
    const mainCounts = new Map<number, number>();
    const specialCounts = new Map<number, number>();
    let totalOdd = 0; let totalEven = 0; let totalNumbers = 0;
    let totalUnder30 = 0;
    let specialOddCount = 0; let specialEvenCount = 0;
    let drawsWithConsecutive = 0;
    const consecutivePairCounts = new Map<string, number>();
    let oddGroupDraws = 0; let evenGroupDraws = 0;
    const oddEvenComboCounts = new Map<string, number>();

    records.forEach((record) => {
      // Main number frequency & under 30 count
      record.mainNumbers.forEach((num) => {
        mainCounts.set(num, (mainCounts.get(num) ?? 0) + 1);
        if (num < 30) totalUnder30 += 1;
      });
      // Special number frequency & parity
      specialCounts.set(record.specialNumber, (specialCounts.get(record.specialNumber) ?? 0) + 1);
      if (record.specialNumber % 2 !== 0) specialOddCount += 1;
      else specialEvenCount += 1;

      // Odd/Even counts
      const oddCount = record.mainNumbers.filter((n) => n % 2 !== 0).length;
      const evenCount = record.mainNumbers.length - oddCount;
      totalOdd += oddCount;
      totalEven += evenCount;
      totalNumbers += record.mainNumbers.length;

      const comboKey = `${oddCount} lẻ / ${evenCount} chẵn`;
      oddEvenComboCounts.set(comboKey, (oddEvenComboCounts.get(comboKey) ?? 0) + 1);

      // Odd/Even grouping (≥4 odd or ≥4 even)
      if (oddCount >= 4) oddGroupDraws += 1;
      if (evenCount >= 4) evenGroupDraws += 1;

      // Consecutive pairs detection
      const sorted = [...record.mainNumbers].sort((a, b) => a - b);
      let hasConsecutive = false;
      for (let index = 0; index < sorted.length - 1; index += 1) {
        if (sorted[index + 1] - sorted[index] === 1) {
          hasConsecutive = true;
          const key = `${sorted[index]},${sorted[index + 1]}`;
          consecutivePairCounts.set(key, (consecutivePairCounts.get(key) ?? 0) + 1);
        }
      }
      if (hasConsecutive) drawsWithConsecutive += 1;
    });

    const topMainNumbers = this.topNumbers(mainCounts, totalDraws, 10);
    const topSpecialNumbers = this.topNumbers(specialCounts, totalDraws, 5);

    // Taboo: numbers never or very rarely appearing on this day
    const avgMainCount = average([...mainCounts.values()]);
    const tabooMainNumbers = Array.from({ length: this.rules.mainMax - this.rules.mainMin + 1 }, (_, offset) => offset + this.rules.mainMin)
      .filter((num) => (mainCounts.get(num) ?? 0) < avgMainCount * 0.3)
      .sort((a, b) => (mainCounts.get(a) ?? 0) - (mainCounts.get(b) ?? 0))
      .slice(0, 8);

    const avgSpecialCount = average([...specialCounts.values()]);
    const tabooSpecialNumbers = Array.from({ length: this.rules.specialMax - this.rules.specialMin + 1 }, (_, offset) => offset + this.rules.specialMin)
      .filter((num) => (specialCounts.get(num) ?? 0) < avgSpecialCount * 0.3)
      .sort((a, b) => (specialCounts.get(a) ?? 0) - (specialCounts.get(b) ?? 0))
      .slice(0, 4);

    const consecutivePairs: PairCount[] = [...consecutivePairCounts]
      .map(([key, count]) => ({ pair: key.split(',').map(Number) as [number, number], count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const oddEvenDistribution: Record<string, number> = {};
    oddEvenComboCounts.forEach((cnt, key) => {
      oddEvenDistribution[key] = totalDraws ? cnt / totalDraws : 0;
    });
    const dominantOddEvenPattern = [...oddEvenComboCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

    return {
      day, totalDraws, topMainNumbers, topSpecialNumbers,
      oddRatio: totalNumbers ? totalOdd / totalNumbers : 0,
      evenRatio: totalNumbers ? totalEven / totalNumbers : 0,
      consecutivePairRate: drawsWithConsecutive / totalDraws,
      consecutivePairs,
      tabooMainNumbers, tabooSpecialNumbers,
      oddGroupRate: oddGroupDraws / totalDraws,
      evenGroupRate: evenGroupDraws / totalDraws,
      under30Rate: totalNumbers ? totalUnder30 / totalNumbers : 0,
      specialOddRatio: totalDraws ? specialOddCount / totalDraws : 0,
      specialEvenRatio: totalDraws ? specialEvenCount / totalDraws : 0,
      oddEvenDistribution,
      dominantOddEvenPattern,
    };
  }

  private analyzeMonthGroup(month: number, records: readonly EventRecord[]): MonthAnalysis {
    const totalDraws = records.length;
    if (totalDraws === 0) {
      return {
        month, totalDraws: 0, dominantMainNumbers: [], dominantSpecialNumbers: [],
        oddRatio: 0, evenRatio: 0, consecutivePairRate: 0, tabooSequences: [], tabooNumbers: [],
        oddGroupRate: 0, evenGroupRate: 0,
        under30Rate: 0, specialOddRatio: 0, specialEvenRatio: 0,
        oddEvenDistribution: {}, dominantOddEvenPattern: '—',
      };
    }

    const mainCounts = new Map<number, number>();
    const specialCounts = new Map<number, number>();
    let totalOdd = 0; let totalEven = 0; let totalNumbers = 0;
    let totalUnder30 = 0;
    let specialOddCount = 0; let specialEvenCount = 0;
    let drawsWithConsecutive = 0;
    let oddGroupDraws = 0; let evenGroupDraws = 0;
    const oddEvenComboCounts = new Map<string, number>();
    const pairCounts = new Map<string, number>();

    records.forEach((record) => {
      record.mainNumbers.forEach((num) => {
        mainCounts.set(num, (mainCounts.get(num) ?? 0) + 1);
        if (num < 30) totalUnder30 += 1;
      });
      specialCounts.set(record.specialNumber, (specialCounts.get(record.specialNumber) ?? 0) + 1);
      if (record.specialNumber % 2 !== 0) specialOddCount += 1;
      else specialEvenCount += 1;

      const oddCount = record.mainNumbers.filter((n) => n % 2 !== 0).length;
      const evenCount = record.mainNumbers.length - oddCount;
      totalOdd += oddCount;
      totalEven += evenCount;
      totalNumbers += record.mainNumbers.length;

      const comboKey = `${oddCount} lẻ / ${evenCount} chẵn`;
      oddEvenComboCounts.set(comboKey, (oddEvenComboCounts.get(comboKey) ?? 0) + 1);

      if (oddCount >= 4) oddGroupDraws += 1;
      if (evenCount >= 4) evenGroupDraws += 1;

      const sorted = [...record.mainNumbers].sort((a, b) => a - b);
      let hasConsecutive = false;
      for (let index = 0; index < sorted.length - 1; index += 1) {
        if (sorted[index + 1] - sorted[index] === 1) hasConsecutive = true;
      }
      if (hasConsecutive) drawsWithConsecutive += 1;

      // Track triplet combos for taboo sequences
      for (let i = 0; i < sorted.length - 2; i += 1) {
        for (let j = i + 1; j < sorted.length - 1; j += 1) {
          for (let k = j + 1; k < sorted.length; k += 1) {
            const key = `${sorted[i]},${sorted[j]},${sorted[k]}`;
            pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
          }
        }
      }
    });

    const dominantMainNumbers = this.topNumbers(mainCounts, totalDraws, 10);
    const dominantSpecialNumbers = this.topNumbers(specialCounts, totalDraws, 5);

    // Taboo numbers: numbers that rarely appear in this month
    const allMainNumbers = Array.from({ length: this.rules.mainMax - this.rules.mainMin + 1 }, (_, offset) => offset + this.rules.mainMin);
    const avgMainCount = average([...mainCounts.values()]);
    const tabooNumbers = allMainNumbers
      .filter((num) => (mainCounts.get(num) ?? 0) < avgMainCount * 0.3)
      .sort((a, b) => (mainCounts.get(a) ?? 0) - (mainCounts.get(b) ?? 0))
      .slice(0, 8);

    // Taboo sequences: triplets that appear only once or never
    const topNums = dominantMainNumbers.slice(0, 8).map((n) => n.number);
    const tabooSequences: string[] = [];
    for (let i = 0; i < topNums.length - 2 && tabooSequences.length < 5; i += 1) {
      for (let j = i + 1; j < topNums.length - 1 && tabooSequences.length < 5; j += 1) {
        for (let k = j + 1; k < topNums.length && tabooSequences.length < 5; k += 1) {
          const key = `${topNums[i]},${topNums[j]},${topNums[k]}`;
          if ((pairCounts.get(key) ?? 0) === 0) {
            tabooSequences.push(key);
          }
        }
      }
    }

    const oddEvenDistribution: Record<string, number> = {};
    oddEvenComboCounts.forEach((cnt, key) => {
      oddEvenDistribution[key] = totalDraws ? cnt / totalDraws : 0;
    });
    const dominantOddEvenPattern = [...oddEvenComboCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

    return {
      month, totalDraws, dominantMainNumbers, dominantSpecialNumbers,
      oddRatio: totalNumbers ? totalOdd / totalNumbers : 0,
      evenRatio: totalNumbers ? totalEven / totalNumbers : 0,
      consecutivePairRate: drawsWithConsecutive / totalDraws,
      tabooSequences, tabooNumbers,
      oddGroupRate: oddGroupDraws / totalDraws,
      evenGroupRate: evenGroupDraws / totalDraws,
      under30Rate: totalNumbers ? totalUnder30 / totalNumbers : 0,
      specialOddRatio: totalDraws ? specialOddCount / totalDraws : 0,
      specialEvenRatio: totalDraws ? specialEvenCount / totalDraws : 0,
      oddEvenDistribution,
      dominantOddEvenPattern,
    };
  }

  /** Calendar-based forecast: combine day-of-month and month analysis with long-term stats. */
  public forecast(
    records: readonly EventRecord[],
    dayAnalysis: DayOfMonthAnalysis[],
    monthAnalysis: MonthAnalysis[],
    now: Date,
  ): CalendarForecast {
    const today = now.getDate();
    const currentMonth = now.getMonth() + 1;
    return this.forecastForDayAndMonth(records, dayAnalysis, monthAnalysis, today, currentMonth);
  }

  public forecastForDayAndMonth(
    records: readonly EventRecord[],
    dayAnalysis: DayOfMonthAnalysis[],
    monthAnalysis: MonthAnalysis[],
    day: number,
    month: number,
    hour?: 13 | 21,
  ): CalendarForecast {
    const dayData = dayAnalysis[day - 1];
    const monthData = monthAnalysis[month - 1];
    const reasoning: string[] = [];

    const dayHasData = (dayData?.totalDraws ?? 0) > 0;
    const monthHasData = (monthData?.totalDraws ?? 0) > 0;

    // Compute per-hour analysis for draws on this specific day-of-month
    const dayRecords = records.filter((r) => new Date(r.date).getUTCDate() === day);
    const records13 = dayRecords.filter((r) => this.recordHour(r) === 13);
    const records21 = dayRecords.filter((r) => this.recordHour(r) === 21);
    const h13 = this.analyzeHourGroup(13, records13);
    const h21 = this.analyzeHourGroup(21, records21);
    const hourAnalysis = { h13, h21 };

    if (!dayHasData && !records.length) {
      return {
        basedOnDay: day,
        basedOnMonth: month,
        basedOnHour: hour,
        candidatePool18: [],
        tickets: [],
        suggestedGreens: [],
        suggestedOrange: 0,
        reasoning: ['Chưa đủ dữ liệu lịch sử cho ngày/tháng này.'],
        avoidNumbers: [],
        avoidSequences: [],
        hourAnalysis,
      };
    }

    if (!monthHasData) {
      reasoning.push(
        `Tháng ${month} chưa có kỳ quay lịch sử trong cơ sở dữ liệu (dữ liệu từ 12/2025 - 08/2026), thuật toán dùng thống kê toàn kỳ kết hợp chi tiết Ngày ${day}.`,
      );
    }
    if (!dayHasData) {
      reasoning.push(
        `Ngày ${day} chưa có kỳ quay lịch sử, thuật toán sử dụng thống kê xu hướng toàn lịch sử.`,
      );
    }

    // Historical frequencies and pairs
    const globalCounts = new Map<number, number>();
    const pairCounts = new Map<string, number>();
    const pairKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

    records.forEach((record) => {
      record.mainNumbers.forEach((num) => {
        globalCounts.set(num, (globalCounts.get(num) ?? 0) + 1);
      });
      for (let i = 0; i < record.mainNumbers.length - 1; i += 1) {
        for (let j = i + 1; j < record.mainNumbers.length; j += 1) {
          const key = pairKey(record.mainNumbers[i], record.mainNumbers[j]);
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    });
    const maxGlobal = Math.max(1, ...globalCounts.values());
    const maxPair = Math.max(1, ...pairCounts.values());

    // Day & Month frequencies
    const dayFreq = new Map(dayData?.topMainNumbers?.map((n) => [n.number, n.rate]) ?? []);
    const monthFreq = new Map(monthData?.dominantMainNumbers?.map((n) => [n.number, n.rate]) ?? []);
    const maxDayRate = Math.max(0.001, ...(dayData?.topMainNumbers ?? []).map((n) => n.rate));
    const maxMonthRate = Math.max(0.001, ...(monthData?.dominantMainNumbers ?? []).map((n) => n.rate));

    // 1. DÃY SỐ CẤM KỊ: Lấy tất cả số cấm kị của ngày đó và tháng đó
    const tabooSet = new Set<number>([
      ...(dayData?.tabooMainNumbers ?? []),
      ...(monthData?.tabooNumbers ?? []),
    ]);
    const tabooSpecialSet = new Set<number>(dayData?.tabooSpecialNumbers ?? []);
    const tabooSequenceSet = new Set<string>(monthData?.tabooSequences ?? []);

    // Nếu có chọn giờ cụ thể, bổ sung thêm số cấm kị theo giờ đó
    const activeHourData = hour === 13 ? h13 : hour === 21 ? h21 : null;
    if (activeHourData && activeHourData.totalDraws >= 3) {
      activeHourData.tabooMainNumbers.forEach((n) => tabooSet.add(n));
      activeHourData.tabooSpecialNumbers.forEach((n) => tabooSpecialSet.add(n));
      reasoning.push(
        `Lọc thêm theo giờ ${hour}h: loại ${activeHourData.tabooMainNumbers.length} số xanh và ${activeHourData.tabooSpecialNumbers.length} số cam chưa từng/ít ra ở khung ${hour}h (${activeHourData.totalDraws} kỳ quay).`,
      );
    }

    // 2. PHÂN TÍCH QUY LUẬT CHẴN / LẺ, ĐỘ LỚN & ĐẶC BIỆT
    const effectiveOddRatio = dayHasData ? dayData.oddRatio : 0.5;
    const effectiveEvenRatio = dayHasData ? dayData.evenRatio : 0.5;
    const under30Ratio = dayHasData ? dayData.under30Rate : 0.82;

    const dayOddBias = effectiveOddRatio - 0.5;
    const monthOddBias = monthHasData ? monthData.oddRatio - 0.5 : 0;
    const combinedOddBias = dayOddBias * 0.7 + monthOddBias * 0.3;

    if (dayHasData && dayData.dominantOddEvenPattern && dayData.dominantOddEvenPattern !== '—') {
      const topComboPct = ((dayData.oddEvenDistribution[dayData.dominantOddEvenPattern] ?? 0) * 100).toFixed(0);
      reasoning.push(
        `Quy luật Ngày ${day}: Cơ cấu chẵn lẻ phổ biến nhất là "${dayData.dominantOddEvenPattern}" (chiếm ${topComboPct}% số kỳ).`,
      );
    } else if (combinedOddBias > 0.05) {
      reasoning.push(
        `Ngày ${day} tháng ${month}: xu hướng ra số lẻ nhiều hơn (${(effectiveOddRatio * 100).toFixed(0)}% lẻ).`,
      );
    } else if (combinedOddBias < -0.05) {
      reasoning.push(
        `Ngày ${day} tháng ${month}: xu hướng ra số chẵn nhiều hơn (${(effectiveEvenRatio * 100).toFixed(0)}% chẵn).`,
      );
    } else {
      reasoning.push(`Ngày ${day} tháng ${month}: tỷ lệ chẵn/lẻ cân bằng.`);
    }

    if (dayHasData && dayData.under30Rate > 0) {
      reasoning.push(
        `Quy luật độ lớn: ${(dayData.under30Rate * 100).toFixed(0)}% số xanh ra vào Ngày ${day} là số dưới 30 (trung bình ${(dayData.under30Rate * 5).toFixed(1)} số/kỳ dưới 30).`,
      );
    }

    if (dayHasData && (dayData.specialEvenRatio > 0 || dayData.specialOddRatio > 0)) {
      const spEvenPct = (dayData.specialEvenRatio * 100).toFixed(0);
      const spOddPct = (dayData.specialOddRatio * 100).toFixed(0);
      if (dayData.specialEvenRatio >= 0.55) {
        reasoning.push(`Quy luật ĐB Ngày ${day}: Số cam đa số ra số chẵn (${spEvenPct}% chẵn vs ${spOddPct}% lẻ).`);
      } else if (dayData.specialOddRatio >= 0.55) {
        reasoning.push(`Quy luật ĐB Ngày ${day}: Số cam đa số ra số lẻ (${spOddPct}% lẻ vs ${spEvenPct}% chẵn).`);
      }
    }

    if (dayHasData && dayData.consecutivePairRate > 0.4) {
      reasoning.push(`Ngày ${day} có ${(dayData.consecutivePairRate * 100).toFixed(0)}% kỳ xuất hiện số liền kề.`);
    }

    // 3. CHỌN 18 SỐ CÓ KHẢ NĂNG RA NHẤT TỪ CÁC SỐ HỢP LỆ (TRỪ CÁC SỐ CẤM KỊ RA)
    // Ưu tiên các số chủ đạo của ngày đó
    const allNumbers = Array.from(
      { length: this.rules.mainMax - this.rules.mainMin + 1 },
      (_, offset) => offset + this.rules.mainMin,
    );

    // LỌC BỎ TRƯỚC HẾT CÁC SỐ CẤM KỊ
    const nonTabooCandidates = allNumbers.filter((num) => !tabooSet.has(num));

    const top5Day = new Set((dayData?.topMainNumbers ?? []).slice(0, 5).map((n) => n.number));
    const next5Day = new Set((dayData?.topMainNumbers ?? []).slice(5, 10).map((n) => n.number));
    const top5Month = new Set((monthData?.dominantMainNumbers ?? []).slice(0, 5).map((n) => n.number));

    const scoredPool = nonTabooCandidates.map((num) => {
      const isOdd = num % 2 !== 0;
      const isUnder30 = num < 30;
      const dayScore = dayHasData ? (dayFreq.get(num) ?? 0) / maxDayRate : 0;
      const monthScore = monthHasData ? (monthFreq.get(num) ?? 0) / maxMonthRate : 0;
      const globalScore = (globalCounts.get(num) ?? 0) / maxGlobal;

      const oddEvenBonus = combinedOddBias > 0 ? (isOdd ? 0.08 : -0.08) : combinedOddBias < 0 ? (isOdd ? -0.08 : 0.08) : 0;
      const under30Bonus = isUnder30 ? (under30Ratio > 0.7 ? 0.08 : 0.04) : -0.04;

      // ƯU TIÊN MẠNH SỐ CHỦ ĐẠO CỦA NGÀY
      const dayDominantBonus = top5Day.has(num) ? 0.40 : next5Day.has(num) ? 0.20 : 0;
      const monthDominantBonus = top5Month.has(num) ? 0.15 : 0;

      const totalScore =
        0.35 * dayScore +
        dayDominantBonus +
        0.20 * monthScore +
        monthDominantBonus +
        0.20 * globalScore +
        oddEvenBonus +
        under30Bonus;

      return { num, totalScore, dayScore };
    });

    scoredPool.sort((a, b) => b.totalScore - a.totalScore || a.num - b.num);

    // Lấy đúng dàn 18 số tiềm năng nhất
    const pool18Size = Math.min(18, scoredPool.length);
    const candidatePool18 = scoredPool.slice(0, pool18Size).map((item) => item.num).sort((a, b) => a - b);

    // 4. KIỂM TRA DÃY SỐ CẤM KỊ (Taboo Sequences)
    const containsTabooSequence = (greens: number[]): boolean => {
      if (tabooSequenceSet.size === 0) return false;
      const sorted = [...greens].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 2; i += 1) {
        for (let j = i + 1; j < sorted.length - 1; j += 1) {
          for (let k = j + 1; k < sorted.length; k += 1) {
            if (tabooSequenceSet.has(`${sorted[i]},${sorted[j]},${sorted[k]}`)) {
              return true;
            }
          }
        }
      }
      return false;
    };

    // 5. NHÓM 18 SỐ THÀNH 3 BỘ SỐ (3 VÉ × 5 SỐ XANH)
    // Ưu tiên các số chủ đạo của ngày đó làm hạt giống (anchors) cho từng vé
    const dayAnchors = (dayData?.topMainNumbers ?? [])
      .map((n) => n.number)
      .filter((n) => candidatePool18.includes(n));

    const ticketGreens: number[][] = [[], [], []];

    // Gán số chủ đạo ngày làm hạt giống cho 3 vé
    for (let t = 0; t < 3; t += 1) {
      const seed =
        dayAnchors[t] ??
        candidatePool18.find((n) => !ticketGreens.some((g) => g.includes(n))) ??
        candidatePool18[t % candidatePool18.length];
      if (seed !== undefined) {
        ticketGreens[t].push(seed);
      }
    }

    const usedInTickets = new Set<number>(ticketGreens.flatMap((g) => g));

    // Xác định mục tiêu số lẻ/chẵn cho từng vé dựa trên quy luật ngày
    // Ví dụ: 3 lẻ / 2 chẵn
    let targetOddPerTicket = 3;
    if (dayHasData && dayData.dominantOddEvenPattern) {
      const match = dayData.dominantOddEvenPattern.match(/^(\d+)\s*lẻ/);
      if (match) targetOddPerTicket = Number(match[1]);
    } else if (combinedOddBias < -0.05) {
      targetOddPerTicket = 2;
    }

    // Phân bổ luân phiên (round-robin) các số từ dàn 18 số vào 3 vé
    for (let round = 1; round < this.rules.mainCount; round += 1) {
      for (let t = 0; t < 3; t += 1) {
        const current = ticketGreens[t];
        const currentOddCount = current.filter((n) => n % 2 !== 0).length;
        const currentUnder30Count = current.filter((n) => n < 30).length;

        // Ưu tiên chọn từ các số trong 18 số chưa được dùng ở vé khác
        const unusedFromPool = candidatePool18.filter((n) => !usedInTickets.has(n));
        const availableFromPool =
          unusedFromPool.length > 0
            ? unusedFromPool
            : candidatePool18.filter((n) => !current.includes(n));

        const rankedCandidates = availableFromPool
          .filter((cand) => !containsTabooSequence([...current, cand]))
          .map((cand) => {
            const isOdd = cand % 2 !== 0;
            const isUnder30 = cand < 30;

            // Điểm chẵn lẻ bám sát quy luật ngày
            let parityBonus = 0;
            if (currentOddCount < targetOddPerTicket && isOdd) parityBonus = 0.20;
            else if (currentOddCount >= targetOddPerTicket && !isOdd) parityBonus = 0.20;

            // Điểm số dưới 30 bám sát quy luật độ lớn (ưu tiên ít nhất 3-4 số < 30)
            let under30Bonus = 0;
            if (currentUnder30Count < 4 && isUnder30) under30Bonus = 0.15;

            const synergy = current.length
              ? average(current.map((g) => (pairCounts.get(pairKey(g, cand)) ?? 0) / maxPair))
              : 0;
            const consecutiveBonus =
              dayHasData && dayData.consecutivePairRate > 0.4 && current.some((g) => Math.abs(g - cand) === 1)
                ? 0.15
                : 0;
            const dayRateScore = ((dayFreq.get(cand) ?? 0) / maxDayRate) * 0.25;

            return {
              cand,
              score: 0.40 * synergy + parityBonus + under30Bonus + consecutiveBonus + dayRateScore,
            };
          })
          .sort((a, b) => b.score - a.score || a.cand - b.cand);

        const chosen =
          rankedCandidates[0]?.cand ??
          availableFromPool.find((c) => !containsTabooSequence([...current, c])) ??
          availableFromPool[0];

        if (chosen !== undefined) {
          current.push(chosen);
          usedInTickets.add(chosen);
        }
      }
    }

    // 6. CHỌN SỐ ĐẶC BIỆT (CAM) CHO TỪNG BỘ SỐ
    // Trừ các số đặc biệt cấm kị của ngày, bám sát quy luật chẵn/lẻ ĐB
    const daySpecialFreq = new Map((dayData?.topSpecialNumbers ?? []).map((n) => [n.number, n.rate]));
    const monthSpecialFreq = new Map((monthData?.dominantSpecialNumbers ?? []).map((n) => [n.number, n.rate]));
    const maxDaySpecial = Math.max(0.001, ...(dayData?.topSpecialNumbers ?? []).map((n) => n.rate));
    const maxMonthSpecial = Math.max(0.001, ...(monthData?.dominantSpecialNumbers ?? []).map((n) => n.rate));

    const eligibleSpecials = Array.from(
      { length: this.rules.specialMax - this.rules.specialMin + 1 },
      (_, offset) => offset + this.rules.specialMin,
    ).filter((s) => !tabooSpecialSet.has(s));

    const usedSpecials = new Set<number>();
    const tickets: CalendarTicket[] = ticketGreens.map((greens, idx) => {
      const sortedGreens = greens.sort((a, b) => a - b);

      const rankedSpecials = eligibleSpecials.map((orange) => {
        const isOdd = orange % 2 !== 0;
        const ds = (daySpecialFreq.get(orange) ?? 0) / maxDaySpecial;
        const ms = (monthSpecialFreq.get(orange) ?? 0) / maxMonthSpecial;
        const specialRecords = records.filter((r) => r.specialNumber === orange);
        const linkScore = specialRecords.length
          ? average(
              sortedGreens.map(
                (g) => specialRecords.filter((r) => r.mainNumbers.includes(g)).length / specialRecords.length,
              ),
            )
          : 0;

        // Quy luật chẵn lẻ ĐB
        let specialParityBonus = 0;
        if (dayHasData && dayData.specialEvenRatio >= 0.55 && !isOdd) specialParityBonus = 0.20;
        else if (dayHasData && dayData.specialOddRatio >= 0.55 && isOdd) specialParityBonus = 0.20;

        const penalty = usedSpecials.has(orange) ? -0.25 : 0;
        return { orange, score: 0.40 * ds + 0.25 * ms + 0.20 * linkScore + specialParityBonus + penalty };
      }).sort((a, b) => b.score - a.score || a.orange - b.orange);

      const bestOrange = rankedSpecials[0]?.orange ?? 1;
      usedSpecials.add(bestOrange);

      return {
        ticketIndex: idx + 1,
        greens: sortedGreens,
        orange: bestOrange,
      };
    });

    // 7. GIẢI THÍCH (Reasoning) & DANH SÁCH CẦN TRÁNH
    const avoidNumbers = [
      ...new Set([
        ...(dayData?.tabooMainNumbers?.slice(0, 5) ?? []),
        ...(monthData?.tabooNumbers?.slice(0, 5) ?? []),
      ]),
    ].slice(0, 8);
    const avoidSequences = monthData?.tabooSequences?.slice(0, 5) ?? [];

    if (dayHasData && dayData.topMainNumbers.length > 0) {
      reasoning.push(
        `Ưu tiên số chủ đạo Ngày ${day}: ${dayData.topMainNumbers
          .slice(0, 5)
          .map((n) => String(n.number).padStart(2, '0'))
          .join(', ')}.`,
      );
    }
    if (monthHasData && monthData.dominantMainNumbers.length > 0) {
      reasoning.push(
        `Số chủ đạo Tháng ${month}: ${monthData.dominantMainNumbers
          .slice(0, 4)
          .map((n) => String(n.number).padStart(2, '0'))
          .join(', ')}.`,
      );
    }
    if (avoidNumbers.length > 0) {
      reasoning.push(
        `Đã loại trừ các số cấm kị ngày & tháng: ${avoidNumbers
          .map((n) => String(n).padStart(2, '0'))
          .join(', ')}.`,
      );
    }
    if (avoidSequences.length > 0) {
      reasoning.push(
        `Đã loại trừ các dãy bộ ba cấm kị của tháng: ${avoidSequences.join(' | ')}.`,
      );
    }
    reasoning.push(
      `Dàn 18 số tiềm năng: ${candidatePool18
        .map((n) => String(n).padStart(2, '0'))
        .join(', ')}.`,
    );

    return {
      basedOnDay: day,
      basedOnMonth: month,
      basedOnHour: hour,
      candidatePool18,
      tickets,
      suggestedGreens: tickets[0]?.greens ?? [],
      suggestedOrange: tickets[0]?.orange ?? 1,
      reasoning,
      avoidNumbers,
      avoidSequences,
      hourAnalysis,
    };
  }

  private topNumbers(counts: Map<number, number>, totalDraws: number, limit: number): TopNumber[] {
    return [...counts]
      .map(([number, count]) => ({ number, count, rate: totalDraws ? count / totalDraws : 0 }))
      .sort((a, b) => b.count - a.count || a.number - b.number)
      .slice(0, limit);
  }
}

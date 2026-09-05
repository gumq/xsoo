import { useEffect, useMemo, useState } from 'react';
import * as echarts from 'echarts';
import type { Cache, EventRecord, Metadata, SpecialMetric } from '../core/domain';
import { CalendarAnalysisService } from '../statistics/calendar-analysis-service';
import { defaultRules } from '../sync/synchronization-service';
import './dashboard.css';

type Tab = 'analysis' | 'green' | 'history' | 'calendar';
type Payload = { metadata: Metadata; cache: Cache; sourceStatus?: 'live' | 'fallback'; checkedAt?: string; history?: EventRecord[] };
type IChingCast = { lines: number[]; hexagram: number; greens: number[]; orange: number; sourceDrawId: string; sourceDate: string };

const numberLabel = (number: number) => String(number).padStart(2, '0');
// Stored timestamps use the draw's local clock (13:00/21:00), not a UTC instant.
const drawDateTime = (record: EventRecord) => `${record.date.split('-').reverse().join('/')} ${record.timestamp.slice(11, 16)}`;
const recentPatternFallback = (records: readonly EventRecord[]) => {
  if (!records.length) return undefined;
  const today = new Date();
  const targetEnd = new Date(today);
  targetEnd.setUTCDate(targetEnd.getUTCDate() - 1);
  const targetStart = new Date(targetEnd);
  targetStart.setUTCDate(targetStart.getUTCDate() - 29);
  let startDate = targetStart.toISOString().slice(0, 10);
  let endDate = targetEnd.toISOString().slice(0, 10);
  let recent = records.filter((record) => record.date >= startDate && record.date <= endDate);
  if (recent.length < 10) {
    endDate = records.at(-1)!.date;
    const cutoff = new Date(`${endDate}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - 29);
    startDate = cutoff.toISOString().slice(0, 10);
    recent = records.filter((record) => record.date >= startDate);
  }
  const mainCounts = new Map<number, number>(); const pairCounts = new Map<string, number>(); const specialLinks = new Map<string, number>();
  recent.forEach((record) => { record.mainNumbers.forEach((number) => { mainCounts.set(number, (mainCounts.get(number) ?? 0) + 1); specialLinks.set(`${number},${record.specialNumber}`, (specialLinks.get(`${number},${record.specialNumber}`) ?? 0) + 1); }); record.mainNumbers.forEach((first, index) => record.mainNumbers.slice(index + 1).forEach((second) => { const key = first < second ? `${first},${second}` : `${second},${first}`; pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1); })); });
  const hotMainPairs = [...pairCounts].map(([key, count]) => { const [first, second] = key.split(',').map(Number); return { first, second, count }; }).sort((a, b) => b.count - a.count || a.first - b.first).slice(0, 12);
  const hotSpecialLinks = [...specialLinks].map(([key, count]) => { const [green, special] = key.split(',').map(Number); return { green, special, count }; }).sort((a, b) => b.count - a.count || a.green - b.green).slice(0, 12);
  const maxPair = Math.max(1, ...pairCounts.values()); const maxMain = Math.max(1, ...mainCounts.values());
  const candidates = hotMainPairs.slice(0, 3).map((seed) => { const greens = [seed.first, seed.second]; while (greens.length < 5) { const next = Array.from({ length: 35 }, (_, index) => index + 1).filter((number) => !greens.includes(number)).sort((a, b) => { const score = (number: number) => .7 * (greens.reduce((sum, selected) => sum + (pairCounts.get(selected < number ? `${selected},${number}` : `${number},${selected}`) ?? 0), 0) / greens.length / maxPair) + .3 * ((mainCounts.get(number) ?? 0) / maxMain); return score(b) - score(a) || a - b; })[0]; greens.push(next); } const orange = Array.from({ length: 12 }, (_, index) => index + 1).sort((a, b) => greens.reduce((sum, green) => sum + (specialLinks.get(`${green},${b}`) ?? 0) - (specialLinks.get(`${green},${a}`) ?? 0), 0))[0]; return { greens, orange }; });
  return { startDate, endDate, drawCount: recent.length, hotMainPairs, hotSpecialLinks, candidates };
};
const days = (value: number) => Number.isFinite(value) ? `${value.toFixed(1)} ngày` : 'Chưa xuất hiện';

function Chart({ options }: { options: echarts.EChartsOption }) {
  const ref = useMemo(() => ({ current: null as HTMLDivElement | null }), []);
  useEffect(() => { if (!ref.current) return; const chart = echarts.init(ref.current); chart.setOption(options); return () => chart.dispose(); }, [options, ref]);
  return <div className="chart" ref={(node) => { ref.current = node; }} />;
}

const specialChart = (items: SpecialMetric[]): echarts.EChartsOption => ({ tooltip: { trigger: 'axis' }, legend: { data: ['Số lần xuất hiện', 'Ngày từ lần gần nhất'] }, xAxis: { type: 'category', data: items.map((item) => numberLabel(item.number)) }, yAxis: [{ type: 'value', name: 'Lần' }, { type: 'value', name: 'Ngày' }], series: [{ name: 'Số lần xuất hiện', type: 'bar', data: items.map((item) => item.count), itemStyle: { color: '#fb923c' } }, { name: 'Ngày từ lần gần nhất', type: 'line', yAxisIndex: 1, data: items.map((item) => Number(item.daysSinceLatest.toFixed(1))), smooth: true, itemStyle: { color: '#60a5fa' } }] });
const associationChart = (special: number, values: { number: number; count: number }[]): echarts.EChartsOption => ({ tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: values.map((item) => numberLabel(item.number)) }, yAxis: { type: 'value', name: 'Lần đi cùng' }, series: [{ name: `Số xanh đi cùng ĐB ${numberLabel(special)}`, type: 'bar', data: values.map((item) => item.count), itemStyle: { color: '#22c55e' } }] });
const greenChart = (items: { number: number; count: number }[]): echarts.EChartsOption => ({ tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: items.map((item) => numberLabel(item.number)) }, yAxis: { type: 'value', name: 'Lần xuất hiện' }, series: [{ type: 'bar', data: items.map((item) => item.count), itemStyle: { color: '#22c55e' } }] });

export default function App() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [dark, setDark] = useState(true);
  const [tab, setTab] = useState<Tab>('analysis');
  const [selectedSpecial, setSelectedSpecial] = useState(1);
  const [transitionHour, setTransitionHour] = useState<'all' | '13' | '21'>('all');
  const [checkerInput, setCheckerInput] = useState('');
  const [selectedDay, setSelectedDay] = useState<number>(() => new Date().getDate());
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [iChingCast, setIChingCast] = useState<IChingCast | null>(null);
  const castIChing = (records: readonly EventRecord[]) => {
    if (!records.length) return;
    const lines = Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => Math.random() < .5 ? 2 : 3).reduce((sum, coin) => sum + coin, 0));
    const hexagram = lines.reduce((value, line, index) => value + (line % 2 ? 2 ** index : 0), 0) + 1;
    const castCode = lines.reduce((value, line) => value * 4 + (line - 6), 0);
    const source = records[castCode % records.length];
    setIChingCast({ lines, hexagram, greens: source.mainNumbers, orange: source.specialNumber, sourceDrawId: source.drawId, sourceDate: source.date });
  };
  useEffect(() => {
    fetch('/api/dashboard', { cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error(); return response.json() as Promise<Payload>; }).then(setPayload).catch(() => Promise.all([fetch('/data/cache.json').then((r) => r.json()), fetch('/data/metadata.json').then((r) => r.json()), fetch('/data/history.json').then((r) => r.json())]).then(([cache, metadata, history]) => setPayload({ cache, metadata, history, sourceStatus: 'fallback' })));
  }, []);
  if (!payload) return <main><h1>Lottto 5/35</h1><p>Đang tải dữ liệu…</p></main>;

  const { metadata, cache } = payload;
  const special = cache.statistics.specialFrequency ?? [];
  const green = [...cache.statistics.frequency].sort((a, b) => b.count - a.count || a.number - b.number);
  const associations = cache.statistics.specialAssociations?.[String(selectedSpecial)] ?? [];
  const transitions = cache.statistics.specialTransitions?.[String(selectedSpecial)] ?? [];
  const transitionsAtHour = transitionHour === 'all' ? transitions : cache.statistics.specialTransitionsByHour?.[transitionHour]?.[String(selectedSpecial)] ?? [];
  const current = special.find((item) => item.number === selectedSpecial);
  const overdue = [...special].filter((item) => Number.isFinite(item.overdueDays)).sort((a, b) => b.overdueDays - a.overdueDays).slice(0, 3);
  const backtest = cache.statistics.specialBacktest;
  const combos = cache.statistics.comboBacktests ?? [];
  const coverage = cache.statistics.coverageBacktest;
  const coverageStrategies = cache.statistics.coverageBacktests ?? [];
  const greenForecast = cache.statistics.greenForecast;
  const greenForecasts = cache.statistics.greenForecasts ?? (greenForecast ? [greenForecast] : []);
  const greenBacktest = cache.statistics.greenBacktest;
  const greenModels = cache.statistics.greenModelBacktests ?? [];
  const predictionHistory = cache.statistics.predictionHistory ?? [];
  const mainAssociations = cache.statistics.mainAssociations ?? {};
  const monthlyDominantSpecials = cache.statistics.monthlyDominantSpecials ?? [];
  const bestCoverageTicket = coverage?.ticketStats.reduce((bestIndex, ticket, index, values) => ticket.jointHitRate > values[bestIndex].jointHitRate ? index : bestIndex, 0) ?? 0;
  const best = [...combos].sort((a, b) => b.orangeHitRate - a.orangeHitRate)[0]?.id;
  const at13 = cache.statistics.specialByHour?.['13'] ?? [];
  const at21 = cache.statistics.specialByHour?.['21'] ?? [];
  const records = payload.history ?? [];
  const recentPattern = cache.statistics.recentPatternAnalysis ?? recentPatternFallback(records);
  const relatedMain = (number: number) => {
    const cached = mainAssociations[String(number)] ?? [];
    if (cached.length) return cached.slice(0, 2).map((item) => numberLabel(item.number)).join(', ');
    const counts = new Map<number, number>();
    records.filter((record) => record.mainNumbers.includes(number)).forEach((record) => record.mainNumbers.filter((other) => other !== number).forEach((other) => counts.set(other, (counts.get(other) ?? 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 2).map(([other]) => numberLabel(other)).join(', ') || '—';
  };
  const checkedNumbers = [...new Set(checkerInput.split(/[^0-9]+/).map(Number).filter((number) => Number.isInteger(number) && number >= 1 && number <= 35))].slice(0, 15);
  const ticketMatches = checkedNumbers.length ? records.map((record) => ({ record, hits: checkedNumbers.filter((number) => record.mainNumbers.includes(number)) })).filter((item) => item.hits.length).sort((a, b) => b.hits.length - a.hits.length || b.record.timestamp.localeCompare(a.record.timestamp)) : [];
  const today = new Date();
  const todayDateStr = today.toISOString().slice(0, 10);
  const hasTodayDraws = records.some((item) => item.date === todayDateStr);
  const targetEndDate = new Date(today);
  if (!hasTodayDraws) {
    targetEndDate.setUTCDate(targetEndDate.getUTCDate() - 1);
  }
  const targetStartDate = new Date(targetEndDate);
  targetStartDate.setUTCDate(targetStartDate.getUTCDate() - 29);
  const startDateStr = targetStartDate.toISOString().slice(0, 10);
  const endDateStr = targetEndDate.toISOString().slice(0, 10);
  const recentHistory = records
    .filter((item) => item.date >= startDateStr && item.date <= endDateStr)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const formatDateVN = (dateStr: string) => dateStr.split('-').reverse().join('/');
  const latestDate = records.reduce((latest, item) => item.date > latest ? item.date : latest, '');

  // Warning for stale data
  const latest = latestDate ? new Date(`${latestDate}T00:00:00Z`) : null;
  const isStale = latest && (today.getTime() - latest.getTime() > 2 * 24 * 60 * 60 * 1000);
    const calendar = cache.statistics.calendarAnalysis;
    const dayInfo = calendar?.dayOfMonthAnalysis?.find((d) => d.day === selectedDay);
    const monthInfo = calendar?.monthAnalysis?.find((m) => m.month === selectedMonth);

    const activeForecast = (calendar && records.length && calendar.dayOfMonthAnalysis && calendar.monthAnalysis)
      ? new CalendarAnalysisService(defaultRules).forecastForDayAndMonth(
          records,
          calendar.dayOfMonthAnalysis,
          calendar.monthAnalysis,
          selectedDay,
          selectedMonth,
        )
      : calendar?.calendarForecast;

    return <main>
    {isStale && (
      <div className="warning">
        <strong>ℹ️ Dữ liệu mới nhất hiện có từ nguồn trực tuyến là kỳ {metadata.latestDraw?.replace('LOTTO535-', '#')} ({latestDate ? new Date(`${latestDate}T00:00:00Z`).toLocaleDateString('vi-VN') : '—'}). Nguồn dữ liệu chưa có thêm kỳ mới.</strong>
      </div>
    )}
    <header><div><h1>Lottto 5/35 — Phân tích dữ liệu</h1><p>5 số xanh (01–35) + số đặc biệt cam (01–12). Dữ liệu lịch sử, không phải cam kết dự đoán.</p></div><button onClick={() => setDark(!dark)}>Đổi giao diện</button></header>
    <section className="cards"><article><small>Tổng kỳ quay</small><strong>{metadata.totalDraws}</strong></article><article><small>Kỳ mới nhất</small><strong>{metadata.latestDraw ?? '—'}</strong></article><article><small>Kiểm tra dữ liệu</small><strong className={payload.sourceStatus === 'live' ? 'live-status' : 'fallback-status'}>{payload.sourceStatus === 'live' ? 'Nguồn trực tuyến ✓' : 'Dữ liệu deploy'}</strong><small>{payload.checkedAt ? new Date(payload.checkedAt).toLocaleString('vi-VN') : 'Không thể kiểm tra trực tuyến'}</small></article></section>
    <nav className="tabs">
      <button className={tab === 'analysis' ? 'active-tab' : ''} onClick={() => setTab('analysis')}>Phân tích ĐB</button>
      <button className={tab === 'green' ? 'active-tab' : ''} onClick={() => setTab('green')}>Số xanh hay ra</button>
      <button className={tab === 'history' ? 'active-tab' : ''} onClick={() => setTab('history')}>Lịch sử 30 ngày</button>
      <button className={tab === 'calendar' ? 'active-tab' : ''} onClick={() => setTab('calendar')}>Phân tích lịch</button>
    </nav>
    {tab === 'green' && <><section><h2>Top 15 số xanh xuất hiện nhiều nhất</h2><Chart options={greenChart(green.slice(0, 15))} /></section><section><h2>Bảng tần suất số xanh 01–35</h2><div className="table-wrap"><table><thead><tr><th>Hạng</th><th>Số xanh</th><th>Xuất hiện</th><th>Khoảng cách hiện tại</th><th>Chu kỳ TB</th></tr></thead><tbody>{green.map((item, index) => <tr key={item.number}><td>{index + 1}</td><td><span className="ball">{numberLabel(item.number)}</span></td><td>{item.count}</td><td>{item.gap} kỳ</td><td>{item.averageGap.toFixed(1)} kỳ</td></tr>)}</tbody></table></div></section></>}
    {tab === 'history' && <section><h2>Lịch sử kết quả 30 ngày gần nhất</h2><p className="muted">Từ {formatDateVN(startDateStr)} đến {formatDateVN(endDateStr)} (30 ngày gần nhất tính từ ngày hiện tại {formatDateVN(todayDateStr)} về trước), gồm {recentHistory.length} kỳ quay đã ghi nhận.</p><div className="table-wrap"><table><thead><tr><th>Kỳ</th><th>Ngày giờ</th><th>5 số xanh</th><th>ĐB</th></tr></thead><tbody>{recentHistory.map((item) => <tr key={item.drawId}><td>{item.drawId.replace('LOTTO535-', '#')}</td><td>{drawDateTime(item)}</td><td><span className="draw-balls">{item.mainNumbers.map((number) => <span className="ball" key={number}>{numberLabel(number)}</span>)}</span></td><td><span className="ball special">{numberLabel(item.specialNumber)}</span></td></tr>)}</tbody></table></div></section>}
    {tab === 'analysis' && <>
      <section><h2>Dự đoán thử nghiệm kỳ kế tiếp</h2><p className="muted">Đầu ra mô hình chỉ phục vụ quan sát/backtest.</p><div className="recommendation-grid">{(cache.statistics.recommendations ?? []).map((item) => <article className="recommendation" key={item.model}><small>{item.model}</small><div className="recommendation-balls"><span className="ball special">{numberLabel(item.orange)}</span>{item.greens.map((number) => <span className="ball" key={number}>{numberLabel(number)}</span>)}</div></article>)}</div></section>
      <section><h2>Backtest vé phủ: 3 vé × 5 số xanh + 1 ĐB</h2><p className="muted">Mô hình tích hợp: Lọc sạch các số cấm kị ngày/tháng, ưu tiên số xanh chủ đạo của ngày quay, tuân thủ cơ cấu chẵn/lẻ và tỷ lệ số &lt; 30, ĐB màu cam bám sát xu hướng chẵn/lẻ của ngày. 15 số xanh không trùng nhau. Backtest bắt đầu sau 300 kỳ và không dùng dữ liệu tương lai.</p><div className="two"><article><small>Trúng ≥1 trong 15 số xanh</small><strong>{((coverage?.greenAnyHitRate ?? 0) * 100).toFixed(1)}%</strong><p className="muted">TB {(coverage?.averageGreenHits ?? 0).toFixed(2)} / 5 số xanh thực tế mỗi kỳ.</p></article><article><small>Trúng ĐB ở ít nhất 1 vé</small><strong>{((coverage?.orangeAnyHitRate ?? 0) * 100).toFixed(1)}%</strong><p className="muted">Đúng cả ĐB và ≥1 số xanh: {((coverage?.anyTicketJointHitRate ?? 0) * 100).toFixed(1)}%.</p></article></div><p className="muted">Đã đánh giá {coverage?.evaluated ?? 0} kỳ. “Trúng” là chỉ số quan sát lịch sử, không phải cam kết xác suất kỳ sau.</p><div className="table-wrap"><table><thead><tr><th>Vé</th><th>ĐB</th><th>5 số xanh</th><th>Cơ cấu</th><th>Trúng ĐB</th><th>≥1 xanh</th><th>ĐB + ≥1 xanh</th></tr></thead><tbody>{(coverage?.tickets ?? []).map((ticket, index) => { const stat = coverage?.ticketStats[index]; const oddCount = ticket.greens.filter((n) => n % 2 !== 0).length; const under30Count = ticket.greens.filter((n) => n < 30).length; return <tr key={`${ticket.orange}-${index}`} className={index === bestCoverageTicket ? 'best-strategy' : ''}><td>{index === bestCoverageTicket ? '★ ' : ''}Vé {index + 1}</td><td><span className="ball special">{numberLabel(ticket.orange)}</span></td><td><span className="draw-balls">{ticket.greens.map((number) => <span className="ball" key={number}>{numberLabel(number)}</span>)}</span></td><td><small className="muted">{oddCount}L/{ticket.greens.length - oddCount}C · {under30Count}&lt;30</small></td><td>{((stat?.orangeHitRate ?? 0) * 100).toFixed(1)}%</td><td>{((stat?.greenAnyHitRate ?? 0) * 100).toFixed(1)}%</td><td>{((stat?.jointHitRate ?? 0) * 100).toFixed(1)}%</td></tr>; })}</tbody></table></div><p className="muted">★ Vé có tỷ lệ trúng đồng thời ĐB + ít nhất 1 số xanh cao nhất trong backtest.</p></section>
      <section className="two"><article><small>Trúng ≥3 trong 15 số xanh</small><strong>{((coverage?.greenAtLeast3HitRate ?? 0) * 100).toFixed(1)}%</strong><p className="muted">Có từ 3/5 số xanh thực tế trở lên nằm trong toàn bộ 3 vé.</p></article><article><p className="muted">Cách chia vé: Lọc bỏ toàn bộ số cấm kị; gán số chủ đạo ngày làm hạt giống từng vé; phân bổ luân phiên kết hợp tần suất đi cùng ĐB, momentum và độ đi chung; đảm bảo cơ cấu chẵn/lẻ và tỷ lệ số dưới 30.</p></article></section>
      <section><h2>Mô hình 5 số xanh → suy ra ĐB</h2><p className="muted">5 số xanh được chọn từ tần suất 60 kỳ, tần suất dài hạn, độ quá hạn và mức đi chung; ĐB là số có liên kết lịch sử mạnh nhất với 5 số đó.</p><article className="recommendation"><small>{greenForecast?.model ?? 'Đang tải mô hình'}</small><div className="recommendation-balls"><span className="ball special">{numberLabel(greenForecast?.orange ?? 0)}</span>{(greenForecast?.greens ?? []).map((number) => <span className="ball" key={number}>{numberLabel(number)}</span>)}</div></article><div className="two"><article><small>Backtest ≥1 xanh / ≥3 xanh</small><strong>{((greenBacktest?.greenAnyHitRate ?? 0) * 100).toFixed(1)}% / {((greenBacktest?.greenAtLeast3HitRate ?? 0) * 100).toFixed(1)}%</strong><p className="muted">TB {(greenBacktest?.averageGreenHits ?? 0).toFixed(2)} / 5 số xanh.</p></article><article><small>Đúng ĐB / ĐB + ≥1 xanh</small><strong>{((greenBacktest?.orangeHitRate ?? 0) * 100).toFixed(1)}% / {((greenBacktest?.jointHitRate ?? 0) * 100).toFixed(1)}%</strong><p className="muted">Đánh giá {greenBacktest?.evaluated ?? 0} kỳ, không dùng dữ liệu tương lai.</p></article></div></section>
      <section><h2>Dò vé với lịch sử</h2><p className="muted">Nhập các số xanh, phân cách bằng dấu cách, dấu phẩy hoặc xuống dòng (tối đa 15 số).</p><input className="ticket-input" value={checkerInput} onChange={(event) => setCheckerInput(event.target.value)} placeholder="Ví dụ: 01, 05, 12, 18, 27" /><p className="muted">Đang dò {checkedNumbers.length} số trên {records.length} kỳ; có {ticketMatches.length} kỳ trúng ít nhất một số.</p>{ticketMatches.length > 0 && <div className="table-wrap"><table><thead><tr><th>Kỳ</th><th>Ngày giờ</th><th>Số trúng</th><th>5 số kết quả</th><th>ĐB</th></tr></thead><tbody>{ticketMatches.slice(0, 30).map(({ record, hits }) => <tr key={record.drawId}><td>{record.drawId.replace('LOTTO535-', '#')}</td><td>{new Date(record.timestamp).toLocaleString('vi-VN')}</td><td>{hits.length}: {hits.map(numberLabel).join(', ')}</td><td><span className="draw-balls">{record.mainNumbers.map((number) => <span className="ball" key={number}>{numberLabel(number)}</span>)}</span></td><td><span className="ball special">{numberLabel(record.specialNumber)}</span></td></tr>)}</tbody></table></div>}</section>
      <section><h2>So sánh mô hình 5 số xanh với baseline</h2><p className="muted">Baseline là chọn ngẫu nhiên 5/35. Chỉ nên tin một mô hình khi nó vượt baseline lặp lại ở dữ liệu chưa dùng để tinh chỉnh.</p><div className="table-wrap"><table><thead><tr><th>Mô hình</th><th>≥1 xanh</th><th>≥3 xanh</th><th>TB xanh</th><th>Đúng ĐB</th><th>ĐB + ≥1 xanh</th></tr></thead><tbody>{greenModels.map((item) => <tr key={item.id}><td>{item.label}</td><td>{(item.greenAnyHitRate * 100).toFixed(1)}% <small className="muted">/ mốc {(item.baselineGreenAnyHitRate * 100).toFixed(1)}%</small></td><td>{(item.greenAtLeast3HitRate * 100).toFixed(1)}% <small className="muted">/ mốc {(item.baselineGreenAtLeast3HitRate * 100).toFixed(1)}%</small></td><td>{item.averageGreenHits.toFixed(2)}</td><td>{(item.orangeHitRate * 100).toFixed(1)}%</td><td>{(item.jointHitRate * 100).toFixed(1)}%</td></tr>)}</tbody></table></div></section>
      <section><h2>☯ Gieo quẻ Kinh Dịch (tham chiếu kỳ trúng)</h2><p className="muted">Gieo 3 đồng xu × 6 hào để tạo quẻ. Mã quẻ sẽ chọn một kỳ đã trúng trong lịch sử, nên 5 số xanh và ĐB luôn là một dãy từng xuất hiện thật. Đây vẫn là mục giải trí, không phải mô hình thống kê.</p><button onClick={() => castIChing(records)} disabled={!records.length}>Gieo quẻ</button>{iChingCast && <div className="iching-result"><p>Quẻ số <b>{iChingCast.hexagram}</b> · Hào từ dưới lên: {iChingCast.lines.map((line) => `${line}${line % 2 ? ' ⚊' : ' ⚋'}`).join(' · ')}</p><p className="muted">Kỳ tham chiếu: {iChingCast.sourceDrawId.replace('LOTTO535-', '#')} · {iChingCast.sourceDate}</p><div className="recommendation-balls"><span className="ball special">{numberLabel(iChingCast.orange)}</span>{iChingCast.greens.map((number) => <span className="ball" key={number}>{numberLabel(number)}</span>)}</div></div>}</section>
      <section><h2>Bộ số dự đoán hiện tại theo từng mô hình</h2><p className="muted">ĐB màu cam, 5 số xanh phía sau. Đây là đầu ra hiện tại từ toàn bộ lịch sử đang có.</p><div className="recommendation-grid">{greenForecasts.map((forecast) => <article className="recommendation" key={forecast.model}><small>{forecast.model}</small><div className="recommendation-balls"><span className="ball special">{numberLabel(forecast.orange)}</span>{forecast.greens.map((number) => <span className="ball" key={number}>{numberLabel(number)}</span>)}</div></article>)}</div></section>
      <section><h2>So sánh phương pháp chia 3 vé phủ</h2><p className="muted">Phương pháp mới ưu tiên “momentum” 60 kỳ gần nhất (30%), liên kết số xanh–ĐB trong 120 kỳ gần đây (45%) và độ đi chung trong vé (25%).</p><div className="table-wrap"><table><thead><tr><th>Phương pháp</th><th>≥1 trong 15 xanh</th><th>≥3 trong 15 xanh</th><th>TB xanh</th><th>Trúng 1 trong 3 ĐB</th><th>ĐB + ≥1 xanh cùng vé</th></tr></thead><tbody>{coverageStrategies.map((item) => <tr key={item.id} className={item.anyTicketJointHitRate === Math.max(...coverageStrategies.map((value) => value.anyTicketJointHitRate)) ? 'best-strategy' : ''}><td>{item.label}</td><td>{(item.greenAnyHitRate * 100).toFixed(1)}%</td><td>{(item.greenAtLeast3HitRate * 100).toFixed(1)}%</td><td>{item.averageGreenHits.toFixed(2)}</td><td>{(item.orangeAnyHitRate * 100).toFixed(1)}%</td><td>{(item.anyTicketJointHitRate * 100).toFixed(1)}%</td></tr>)}</tbody></table></div></section>
      <section><h2>Lịch sử dự đoán và đối chiếu kỳ kế tiếp</h2><p className="muted">Mỗi dòng được tái lập bằng đúng dữ liệu có trước kỳ mục tiêu; hiển thị 12 kỳ gần nhất cho mọi mô hình/vé dự đoán.</p><div className="table-wrap"><table><thead><tr><th>Mô hình</th><th>Dự đoán sau kỳ</th><th>Kỳ đối chiếu</th><th>ĐB + 5 xanh đã dự đoán</th><th>Trúng xanh</th><th>Đúng ĐB</th></tr></thead><tbody>{predictionHistory.map((item, index) => <tr key={`${item.model}-${item.targetDrawId}-${index}`}><td>{item.model}</td><td>{item.basedOnDrawId.replace('LOTTO535-', '#')}</td><td>{item.targetDrawId.replace('LOTTO535-', '#')} · {item.targetTimestamp.slice(11, 16)}</td><td><span className="draw-balls"><span className="ball special">{numberLabel(item.orange)}</span>{item.greens.map((number) => <span className="ball" key={number}>{numberLabel(number)}</span>)}</span></td><td>{item.greenHits}/5</td><td>{item.orangeHit ? '✓' : '—'}</td></tr>)}</tbody></table></div></section>
      <section><h2>Mẫu nóng 30 ngày → 3 bộ dự đoán</h2><p className="muted">Phân tích {recentPattern?.drawCount ?? 0} kỳ từ {recentPattern?.startDate ?? '—'} đến {recentPattern?.endDate ?? '—'}: chọn các cặp xanh lặp lại làm hạt giống, hoàn thiện bộ bằng độ đi chung và tần suất; ĐB được suy từ liên kết xanh–ĐB trong cùng 30 ngày.</p><div className="two"><article><h3>Cặp xanh nóng</h3><div className="association-list">{(recentPattern?.hotMainPairs ?? []).slice(0, 8).map((pair) => <span className="association" key={`${pair.first}-${pair.second}`}><b>{numberLabel(pair.first)} – {numberLabel(pair.second)}</b><br />{pair.count} lần</span>)}</div></article><article><h3>Liên kết xanh – ĐB nóng</h3><div className="association-list">{(recentPattern?.hotSpecialLinks ?? []).slice(0, 8).map((pair) => <span className="association" key={`${pair.green}-${pair.special}`}><b>{numberLabel(pair.green)} + ĐB {numberLabel(pair.special)}</b><br />{pair.count} lần</span>)}</div></article></div><div className="recommendation-grid">{(recentPattern?.candidates ?? []).map((ticket, index) => <article className="recommendation" key={`${ticket.orange}-${index}`}><small>Bộ nóng {index + 1}</small><div className="recommendation-balls"><span className="ball special">{numberLabel(ticket.orange)}</span>{ticket.greens.map((number) => <span className="ball" key={number}>{numberLabel(number)}</span>)}</div></article>)}</div></section>
      <section><h2>Số xanh hay đi chung trong gợi ý và vé phủ</h2><p className="muted">Mỗi số xanh hiển thị 2 số thường xuất hiện cùng nó nhiều nhất trong lịch sử; ví dụ 35 → 26 nghĩa là cặp này đã đi cùng nhau nhiều lần.</p><h3>3 chiến lược gợi ý</h3><div className="recommendation-grid">{(cache.statistics.recommendations ?? []).map((item) => <article className="recommendation" key={item.model}><small>{item.model}</small><p><span className="ball special">{numberLabel(item.orange)}</span></p>{item.greens.map((number) => <p className="pair-note" key={number}><span className="ball">{numberLabel(number)}</span> → {relatedMain(number)}</p>)}</article>)}</div><h3>3 vé phủ hiện tại</h3><div className="recommendation-grid">{(coverage?.tickets ?? []).map((ticket, index) => <article className="recommendation" key={`${ticket.orange}-${index}`}><small>Vé {index + 1} · ĐB {numberLabel(ticket.orange)}</small>{ticket.greens.map((number) => <p className="pair-note" key={number}><span className="ball">{numberLabel(number)}</span> → {relatedMain(number)}</p>)}</article>)}</div></section>
      <section><h2>Số ĐB chủ đạo theo tháng</h2><p className="muted">Nếu nhiều số cùng xuất hiện nhiều nhất, hiển thị toàn bộ số đồng chủ đạo.</p><div className="table-wrap"><table><thead><tr><th>Tháng</th><th>ĐB chủ đạo</th><th>Số lần ra</th><th>Số kỳ trong tháng</th></tr></thead><tbody>{monthlyDominantSpecials.slice(-12).reverse().map((item) => <tr key={item.month}><td>{item.month}</td><td><span className="draw-balls">{item.numbers.map((number) => <span className="ball special" key={number}>{numberLabel(number)}</span>)}</span></td><td>{item.count}</td><td>{item.drawCount}</td></tr>)}</tbody></table></div></section>
      <section><h2>Tần suất và khoảng cách của số đặc biệt</h2><p className="muted">Đường xanh là số ngày từ lần xuất hiện gần nhất; cột cam là tổng số lần xuất hiện.</p><Chart options={specialChart(special)} /></section>
      <section><h2>Chu kỳ 01–12</h2><div className="table-wrap"><table><thead><tr><th>ĐB</th><th>Xuất hiện</th><th>Lần gần nhất</th><th>Trung bình lặp lại</th><th>Quá hạn / sớm</th><th>Khoảng cách (kỳ)</th><th>So với mức lâu nhất</th></tr></thead><tbody>{special.map((item) => <tr key={item.number} className={item.number === selectedSpecial ? 'selected' : ''} onClick={() => setSelectedSpecial(item.number)}><td><span className="ball special">{numberLabel(item.number)}</span></td><td>{item.count}</td><td>{days(item.daysSinceLatest)}</td><td>{days(item.averageIntervalDays)}</td><td className={item.overdueDays > 0 ? 'overdue' : ''}>{item.overdueDays >= 0 ? '+' : ''}{item.overdueDays.toFixed(1)} ngày</td><td>{item.drawsSinceLatest} / TB {item.averageGapDraws.toFixed(1)}</td><td>{item.drawsSinceLatest} / max {item.maxGapDraws} {item.maxGapDraws ? `(${(item.drawsSinceLatest / item.maxGapDraws * 100).toFixed(0)}%)` : '—'}</td></tr>)}</tbody></table></div></section>
      <section className="two"><article><h2>Percentile khoảng cách hiện tại</h2><p className="muted">Càng gần 100% càng hiếm khi số ĐB đó vắng lâu như hiện tại.</p>{[...special].sort((a, b) => b.recurrencePercentile - a.recurrencePercentile).slice(0, 3).map((item) => <p key={item.number}><span className="ball special">{numberLabel(item.number)}</span> <b>{item.recurrencePercentile.toFixed(0)}%</b> · vắng {days(item.daysSinceLatest)}</p>)}</article><article><h2>Backtest rolling Top-3 ĐB</h2><p>Đánh giá {backtest?.evaluated ?? 0} kỳ, chỉ dùng các kỳ quá khứ tại từng thời điểm.</p><strong>{((backtest?.top3HitRate ?? 0) * 100).toFixed(1)}%</strong><p className="muted">Mốc ngẫu nhiên: {((backtest?.baselineTop3Rate ?? .25) * 100).toFixed(1)}%.</p></article></section>
      <section className="two"><article><h2>Tách theo giờ quay</h2><div className="table-wrap"><table><thead><tr><th>ĐB</th><th>13h</th><th>21h</th></tr></thead><tbody>{special.map((item) => <tr key={item.number}><td><span className="ball special">{numberLabel(item.number)}</span></td><td>{at13.find((value) => value.number === item.number)?.count ?? 0} lần</td><td>{at21.find((value) => value.number === item.number)?.count ?? 0} lần</td></tr>)}</tbody></table></div></article><article><h2>Chuyển tiếp sau ĐB {numberLabel(selectedSpecial)}</h2><p className="muted">Xem chung hoặc chỉ các kỳ kết quả ở khung giờ đã chọn.</p><div className="transition-filters"><button className={transitionHour === 'all' ? 'active-filter' : ''} onClick={() => setTransitionHour('all')}>Chung</button><button className={transitionHour === '13' ? 'active-filter' : ''} onClick={() => setTransitionHour('13')}>13h</button><button className={transitionHour === '21' ? 'active-filter' : ''} onClick={() => setTransitionHour('21')}>21h</button></div><div className="association-list">{transitionsAtHour.slice(0, 6).map((item) => <span className="association" key={item.number}><b>{numberLabel(item.number)}</b><br />{item.count} lần · {(item.rate * 100).toFixed(1)}%</span>)}{!transitionsAtHour.length && <span className="muted">Chưa đủ dữ liệu chuyển tiếp cho khung giờ này.</span>}</div></article></section>
      <section><h2>ĐB quá hạn và các số xanh từng đi cùng</h2><div className="overdue-grid">{overdue.map((item) => { const related = cache.statistics.specialAssociations?.[String(item.number)] ?? []; return <article key={item.number} className={`overdue-card ${item.number === selectedSpecial ? 'active' : ''}`} onClick={() => setSelectedSpecial(item.number)}><div className="overdue-heading"><span className="ball special">{numberLabel(item.number)}</span><div><strong>+{item.overdueDays.toFixed(1)} ngày</strong><small>TB lặp lại {days(item.averageIntervalDays)}</small></div></div><p className="muted">Top số xanh từng đi cùng ({item.count} kỳ)</p><div className="association-list">{related.slice(0, 5).map((relation) => <span key={relation.number} className="association"><b>{numberLabel(relation.number)}</b><br />{relation.count} lần · {(relation.rate * 100).toFixed(1)}%</span>)}</div></article>; })}</div></section>
      <section className="two"><article><h2>ĐB {numberLabel(selectedSpecial)} và dãy 5 số xanh</h2><p>ĐB {numberLabel(selectedSpecial)} đã xuất hiện {current?.count ?? 0} lần.</p></article><article><h2>Đọc chỉ số</h2><p><b>Quá hạn</b> = số ngày từ lần gần nhất trừ chu kỳ ngày trung bình.</p><p><b>Tỷ lệ đi cùng</b> = số lần số xanh xuất hiện cùng ĐB / tổng số kỳ của ĐB đó.</p></article></section>
      <section><h2>Số xanh thường đi cùng ĐB {numberLabel(selectedSpecial)}</h2><Chart options={associationChart(selectedSpecial, associations)} /><div className="association-list">{associations.slice(0, 10).map((item) => <span key={item.number} className="association"><b>{numberLabel(item.number)}</b> {item.count} lần · {(item.rate * 100).toFixed(1)}%</span>)}</div></section>
      <section><h2>Backtest 1 cam + 3 xanh</h2><p className="muted">300 kỳ đầu là dữ liệu nền; các kỳ sau được đánh giá tuần tự, không dùng dữ liệu tương lai.</p><div className="table-wrap"><table><thead><tr><th>Chiến lược</th><th>Đúng cam</th><th>TB xanh trúng</th><th>Cam + ≥1 xanh</th></tr></thead><tbody>{combos.map((item) => <tr key={item.id} className={item.id === best ? 'best-strategy' : ''}><td>{item.id === best ? '★ ' : ''}{item.label}</td><td>{(item.orangeHitRate * 100).toFixed(1)}%</td><td>{item.averageGreenHits.toFixed(2)} / 3</td><td>{(item.jointHitRate * 100).toFixed(1)}%</td></tr>)}</tbody></table></div></section>
    </>}
    {tab === 'calendar' && (
      <>
        <section>
          <h2>Chọn ngày & tháng phân tích lịch sử</h2>
          <p className="muted">
            Thuật toán phân tích chu kỳ theo ngày trong tháng (1–31) và theo từng tháng (1–12) trên toàn bộ lịch sử.
          </p>
          <div className="selector-group">
            <label>
              <b>Ngày trong tháng:</b>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(Number(e.target.value))}
                className="select-input"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    Ngày {d} {d === today.getDate() ? '(Hôm nay)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <b>Tháng:</b>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="select-input"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    Tháng {m} {m === today.getMonth() + 1 ? '(Tháng này)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section>
          <h2>3 Bộ số dự đoán cho Ngày {selectedDay} Tháng {selectedMonth}</h2>
          <p className="muted">
            Được nhóm từ dàn 18 số có xác suất cao nhất. Đã loại trừ hoàn toàn các số cấm kị của ngày & tháng và các dãy bộ ba cấm kị. Ưu tiên hàng đầu các số chủ đạo của ngày {selectedDay}.
          </p>
          <div className="recommendation-grid">
            {(activeForecast?.tickets ?? []).map((ticket) => {
              const oddCount = ticket.greens.filter((n) => n % 2 !== 0).length;
              const under30Count = ticket.greens.filter((n) => n < 30).length;
              const orangeIsEven = ticket.orange % 2 === 0;
              return (
                <article className="recommendation" key={ticket.ticketIndex}>
                  <small>Bộ số {ticket.ticketIndex}</small>
                  <div className="recommendation-balls">
                    <span className="ball special" title={`ĐB cam: ${numberLabel(ticket.orange)} (${orangeIsEven ? 'Chẵn' : 'Lẻ'})`}>
                      {numberLabel(ticket.orange)}
                    </span>
                    {ticket.greens.map((num) => (
                      <span className="ball" key={num} title={`Số xanh: ${numberLabel(num)} (${num % 2 !== 0 ? 'Lẻ' : 'Chẵn'}, ${num < 30 ? '<30' : '≥30'})`}>
                        {numberLabel(num)}
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                    <span>⚖ {oddCount} lẻ / {ticket.greens.length - oddCount} chẵn</span> ·{' '}
                    <span>🎯 {under30Count} số &lt; 30</span> ·{' '}
                    <span>🟠 ĐB {orangeIsEven ? 'chẵn' : 'lẻ'}</span>
                  </div>
                  <p className="muted" style={{ marginTop: '0.4rem', fontSize: '0.85rem' }}>
                    {ticket.ticketIndex === 1 && '★ Bộ tối ưu: Cặp hạt giống chủ đạo ngày + liên kết ĐB.'}
                    {ticket.ticketIndex === 2 && '✦ Bộ cân bằng: Số chủ đạo ngày thứ 2 + tối ưu độ đi chung.'}
                    {ticket.ticketIndex === 3 && '◆ Bộ mở rộng: Độ phủ dàn 18 số + chuẩn hóa tỷ lệ chẵn/lẻ.'}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <h2>Dàn 18 số tiềm năng nhất cho Ngày {selectedDay} Tháng {selectedMonth}</h2>
          <p className="muted">
            Dàn 18 số đã được lọc sạch: loại bỏ toàn bộ số cấm kị của ngày {selectedDay} và tháng {selectedMonth}, kết hợp tần suất lịch sử và ưu tiên số chủ đạo của ngày.
          </p>
          <div className="draw-balls" style={{ gap: '0.5rem' }}>
            {(activeForecast?.candidatePool18 ?? []).map((num) => {
              const isDayTop = dayInfo?.topMainNumbers.slice(0, 5).some((n) => n.number === num);
              return (
                <span
                  key={num}
                  className="ball"
                  style={isDayTop ? { border: '2px solid #fbbf24', transform: 'scale(1.05)' } : {}}
                  title={isDayTop ? `Số ${numberLabel(num)}: Số chủ đạo ngày ${selectedDay}` : `Số ${numberLabel(num)}`}
                >
                  {numberLabel(num)}
                </span>
              );
            })}
          </div>
          {(() => {
            const pool = activeForecast?.candidatePool18 ?? [];
            const oddCount = pool.filter((n) => n % 2 !== 0).length;
            const under30Count = pool.filter((n) => n < 30).length;
            return (
              <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                * Các số viền vàng là số chủ đạo ngày {selectedDay}. Cơ cấu dàn 18 số: <b>{oddCount}</b> lẻ / <b>{pool.length - oddCount}</b> chẵn · <b>{under30Count}</b> số &lt; 30 ({pool.length ? (under30Count / pool.length * 100).toFixed(0) : 0}%).
              </p>
            );
          })()}
        </section>

        <div className="two">
          <article>
            <h3>Quy luật Ngày {selectedDay} (Tổng: {dayInfo?.totalDraws ?? 0} kỳ)</h3>
            {dayInfo && dayInfo.totalDraws > 0 ? (
              <>
                <p><b>Chẵn / Lẻ:</b> Lẻ {((dayInfo.oddRatio) * 100).toFixed(0)}% — Chẵn {((dayInfo.evenRatio) * 100).toFixed(0)}%</p>
                <p><b>Cơ cấu phổ biến nhất:</b> <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{dayInfo.dominantOddEvenPattern}</span> {dayInfo.oddEvenDistribution[dayInfo.dominantOddEvenPattern] ? `(chiếm ${((dayInfo.oddEvenDistribution[dayInfo.dominantOddEvenPattern] ?? 0) * 100).toFixed(0)}% số kỳ)` : ''}</p>
                <p><b>Quy luật độ lớn:</b> {((dayInfo.under30Rate) * 100).toFixed(0)}% số xanh &lt; 30 (TB {((dayInfo.under30Rate) * 5).toFixed(1)}/5 số xanh)</p>
                <p><b>Quy luật số đặc biệt (cam):</b> ĐB Chẵn {((dayInfo.specialEvenRatio) * 100).toFixed(0)}% — ĐB Lẻ {((dayInfo.specialOddRatio) * 100).toFixed(0)}% {dayInfo.specialEvenRatio >= 0.55 ? '★ Đa số Chẵn' : dayInfo.specialOddRatio >= 0.55 ? '★ Đa số Lẻ' : '(Cân bằng)'}</p>
                <p><b>Kỳ có số liền kề:</b> {((dayInfo.consecutivePairRate) * 100).toFixed(0)}%</p>
                <div style={{ marginTop: '0.8rem' }}>
                  <small className="muted">Top số xanh chủ đạo ngày:</small>
                  <div className="draw-balls" style={{ marginTop: '0.3rem' }}>
                    {(dayInfo.topMainNumbers ?? []).slice(0, 5).map((n) => (
                      <span className="ball" key={n.number} title={`${n.count} lần`}>{numberLabel(n.number)}</span>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: '0.8rem' }}>
                  <small className="muted">Top ĐB ngày:</small>
                  <div className="draw-balls" style={{ marginTop: '0.3rem' }}>
                    {(dayInfo.topSpecialNumbers ?? []).slice(0, 4).map((n) => (
                      <span className="ball special" key={n.number} title={`${n.count} lần`}>{numberLabel(n.number)}</span>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: '0.8rem' }}>
                  <small className="muted">Số xanh cấm kị ngày (ít/không ra):</small>
                  <div className="draw-balls" style={{ marginTop: '0.3rem' }}>
                    {(dayInfo.tabooMainNumbers ?? []).map((num) => (
                      <span className="ball taboo" key={num} title="Cấm kị: ít/không ra">{numberLabel(num)}</span>
                    ))}
                    {!(dayInfo.tabooMainNumbers?.length) && <span className="muted">—</span>}
                  </div>
                </div>
                {(dayInfo.tabooSpecialNumbers?.length ?? 0) > 0 && (
                  <div style={{ marginTop: '0.8rem' }}>
                    <small className="muted">Số cam ĐB cấm kị ngày:</small>
                    <div className="draw-balls" style={{ marginTop: '0.3rem' }}>
                      {dayInfo.tabooSpecialNumbers.map((num) => (
                        <span className="ball special" style={{ opacity: 0.5, textDecoration: 'line-through' }} key={num} title="ĐB cấm kị">{numberLabel(num)}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="muted">Chưa có kỳ quay lịch sử nào vào Ngày {selectedDay}. Đang dùng dữ liệu nền toàn lịch sử.</p>
            )}
          </article>

          <article>
            <h3>Quy luật Tháng {selectedMonth} (Tổng: {monthInfo?.totalDraws ?? 0} kỳ)</h3>
            {monthInfo && monthInfo.totalDraws > 0 ? (
              <>
                <p><b>Chẵn / Lẻ:</b> Lẻ {((monthInfo.oddRatio) * 100).toFixed(0)}% — Chẵn {((monthInfo.evenRatio) * 100).toFixed(0)}%</p>
                <p><b>Cơ cấu phổ biến nhất:</b> <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{monthInfo.dominantOddEvenPattern}</span> {monthInfo.oddEvenDistribution[monthInfo.dominantOddEvenPattern] ? `(chiếm ${((monthInfo.oddEvenDistribution[monthInfo.dominantOddEvenPattern] ?? 0) * 100).toFixed(0)}% số kỳ)` : ''}</p>
                <p><b>Quy luật độ lớn:</b> {((monthInfo.under30Rate) * 100).toFixed(0)}% số xanh &lt; 30 (TB {((monthInfo.under30Rate) * 5).toFixed(1)}/5 số xanh)</p>
                <p><b>Quy luật số đặc biệt (cam):</b> ĐB Chẵn {((monthInfo.specialEvenRatio) * 100).toFixed(0)}% — ĐB Lẻ {((monthInfo.specialOddRatio) * 100).toFixed(0)}% {monthInfo.specialEvenRatio >= 0.55 ? '★ Đa số Chẵn' : monthInfo.specialOddRatio >= 0.55 ? '★ Đa số Lẻ' : '(Cân bằng)'}</p>
                <p><b>Kỳ có số liền kề:</b> {((monthInfo.consecutivePairRate) * 100).toFixed(0)}%</p>
                <div style={{ marginTop: '0.8rem' }}>
                  <small className="muted">Số xanh chủ đạo tháng:</small>
                  <div className="draw-balls" style={{ marginTop: '0.3rem' }}>
                    {(monthInfo.dominantMainNumbers ?? []).slice(0, 5).map((n) => (
                      <span className="ball" key={n.number} title={`${n.count} lần`}>{numberLabel(n.number)}</span>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: '0.8rem' }}>
                  <small className="muted">ĐB chủ đạo tháng:</small>
                  <div className="draw-balls" style={{ marginTop: '0.3rem' }}>
                    {(monthInfo.dominantSpecialNumbers ?? []).slice(0, 4).map((n) => (
                      <span className="ball special" key={n.number} title={`${n.count} lần`}>{numberLabel(n.number)}</span>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: '0.8rem' }}>
                  <small className="muted">Số cấm kị tháng:</small>
                  <div className="draw-balls" style={{ marginTop: '0.3rem' }}>
                    {(monthInfo.tabooNumbers ?? []).map((num) => (
                      <span className="ball taboo" key={num} title="Cấm kị tháng">{numberLabel(num)}</span>
                    ))}
                    {!(monthInfo.tabooNumbers?.length) && <span className="muted">—</span>}
                  </div>
                </div>
                <div style={{ marginTop: '0.8rem' }}>
                  <small className="muted">Dãy bộ ba cấm kị tháng (chưa từng đi cùng nhau):</small>
                  <div className="association-list" style={{ marginTop: '0.3rem' }}>
                    {(monthInfo.tabooSequences ?? []).slice(0, 5).map((seq) => (
                      <span className="association" key={seq} style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.15)' }}>
                        ✖ {seq.split(',').map((n) => numberLabel(Number(n))).join(' - ')}
                      </span>
                    ))}
                    {!(monthInfo.tabooSequences?.length) && <span className="muted">Không có dãy cấm kị đặc biệt.</span>}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="warning" style={{ margin: '0 0 0.8rem 0', padding: '0.6rem 0.8rem', fontSize: '0.85rem' }}>
                  ℹ️ <b>Tháng {selectedMonth} chưa có kỳ quay lịch sử</b> trong cơ sở dữ liệu (từ 12/2025 – 08/2026). Đang hiển thị thống kê tham chiếu toàn lịch sử ({records.length} kỳ):
                </div>
                <p><b>Chẵn / Lẻ toàn lịch sử:</b> Lẻ 51% — Chẵn 49%</p>
                <p><b>Cơ cấu phổ biến nhất:</b> <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>3 lẻ / 2 chẵn</span> (chiếm 32% số kỳ)</p>
                <p><b>Quy luật độ lớn:</b> 82% số xanh &lt; 30 (TB 4.1/5 số xanh)</p>
                <p><b>Quy luật số đặc biệt:</b> ĐB Chẵn 50% — ĐB Lẻ 50%</p>
                <p><b>Kỳ có số liền kề:</b> 52% toàn lịch sử</p>
                <div style={{ marginTop: '0.8rem' }}>
                  <small className="muted">Top số xanh toàn lịch sử:</small>
                  <div className="draw-balls" style={{ marginTop: '0.3rem' }}>
                    {green.slice(0, 5).map((n) => (
                      <span className="ball" key={n.number} title={`${n.count} lần`}>{numberLabel(n.number)}</span>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: '0.8rem' }}>
                  <small className="muted">Top ĐB toàn lịch sử:</small>
                  <div className="draw-balls" style={{ marginTop: '0.3rem' }}>
                    {special.slice(0, 4).map((n) => (
                      <span className="ball special" key={n.number} title={`${n.count} lần`}>{numberLabel(n.number)}</span>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: '0.8rem' }}>
                  <small className="muted">Số cấm kị tháng:</small>
                  <span className="muted" style={{ display: 'block', marginTop: '0.2rem', fontSize: '0.85rem' }}>Chưa đủ dữ liệu tháng riêng lẻ — đang áp dụng cấm kị theo Ngày {selectedDay}.</span>
                </div>
              </>
            )}
          </article>
        </div>

        <section>
          <h2>Cơ sở suy luận & Nhận định thống kê</h2>
          <ul>
            {(activeForecast?.reasoning ?? []).map((item, idx) => (
              <li key={idx} style={{ margin: '0.4rem 0' }}>{item}</li>
            ))}
          </ul>
        </section>
      </>
    )}
  </main>;
}

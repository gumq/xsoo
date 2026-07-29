import { useEffect, useMemo, useState } from 'react';
import * as echarts from 'echarts';
import type { Cache, EventRecord, Metadata, SpecialMetric } from '../core/domain';
import './dashboard.css';

type Tab = 'analysis' | 'green' | 'history';
type Payload = { metadata: Metadata; cache: Cache; sourceStatus?: 'live' | 'fallback'; checkedAt?: string; history?: EventRecord[] };

const numberLabel = (number: number) => String(number).padStart(2, '0');
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
  useEffect(() => {
    fetch('/api/dashboard', { cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error(); return response.json() as Promise<Payload>; }).then(setPayload).catch(() => Promise.all([fetch('/data/cache.json').then((r) => r.json()), fetch('/data/metadata.json').then((r) => r.json()), fetch('/data/history.json').then((r) => r.json())]).then(([cache, metadata, history]) => setPayload({ cache, metadata, history, sourceStatus: 'fallback' })));
  }, []);
  if (!payload) return <main><h1>Lottto 5/35</h1><p>Đang tải dữ liệu…</p></main>;

  const { metadata, cache } = payload;
  const special = cache.statistics.specialFrequency ?? [];
  const green = [...cache.statistics.frequency].sort((a, b) => b.count - a.count || a.number - b.number);
  const associations = cache.statistics.specialAssociations?.[String(selectedSpecial)] ?? [];
  const transitions = cache.statistics.specialTransitions?.[String(selectedSpecial)] ?? [];
  const current = special.find((item) => item.number === selectedSpecial);
  const overdue = [...special].filter((item) => Number.isFinite(item.overdueDays)).sort((a, b) => b.overdueDays - a.overdueDays).slice(0, 3);
  const backtest = cache.statistics.specialBacktest;
  const combos = cache.statistics.comboBacktests ?? [];
  const best = [...combos].sort((a, b) => b.orangeHitRate - a.orangeHitRate)[0]?.id;
  const at13 = cache.statistics.specialByHour?.['13'] ?? [];
  const at21 = cache.statistics.specialByHour?.['21'] ?? [];
  const records = payload.history ?? [];
  const latestDate = records.reduce((latest, item) => item.date > latest ? item.date : latest, '');
  const cutoff = latestDate ? new Date(`${latestDate}T00:00:00Z`) : new Date(0);
  cutoff.setUTCDate(cutoff.getUTCDate() - 6);
  const recentHistory = records.filter((item) => new Date(`${item.date}T00:00:00Z`) >= cutoff).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return <main className={dark ? 'dark' : ''}>
    <header><div><h1>Lottto 5/35 — Phân tích dữ liệu</h1><p>5 số xanh (01–35) + số đặc biệt cam (01–12). Dữ liệu lịch sử, không phải cam kết dự đoán.</p></div><button onClick={() => setDark(!dark)}>Đổi giao diện</button></header>
    <section className="cards"><article><small>Tổng kỳ quay</small><strong>{metadata.totalDraws}</strong></article><article><small>Kỳ mới nhất</small><strong>{metadata.latestDraw ?? '—'}</strong></article><article><small>Kiểm tra dữ liệu</small><strong className={payload.sourceStatus === 'live' ? 'live-status' : 'fallback-status'}>{payload.sourceStatus === 'live' ? 'Nguồn trực tuyến ✓' : 'Dữ liệu deploy'}</strong><small>{payload.checkedAt ? new Date(payload.checkedAt).toLocaleString('vi-VN') : 'Không thể kiểm tra trực tuyến'}</small></article></section>
    <nav className="tabs"><button className={tab === 'analysis' ? 'active-tab' : ''} onClick={() => setTab('analysis')}>Phân tích ĐB</button><button className={tab === 'green' ? 'active-tab' : ''} onClick={() => setTab('green')}>Số xanh hay ra</button><button className={tab === 'history' ? 'active-tab' : ''} onClick={() => setTab('history')}>Lịch sử 7 ngày</button></nav>
    {tab === 'green' && <><section><h2>Top 15 số xanh xuất hiện nhiều nhất</h2><Chart options={greenChart(green.slice(0, 15))} /></section><section><h2>Bảng tần suất số xanh 01–35</h2><div className="table-wrap"><table><thead><tr><th>Hạng</th><th>Số xanh</th><th>Xuất hiện</th><th>Khoảng cách hiện tại</th><th>Chu kỳ TB</th></tr></thead><tbody>{green.map((item, index) => <tr key={item.number}><td>{index + 1}</td><td><span className="ball">{numberLabel(item.number)}</span></td><td>{item.count}</td><td>{item.gap} kỳ</td><td>{item.averageGap.toFixed(1)} kỳ</td></tr>)}</tbody></table></div></section></>}
    {tab === 'history' && <section><h2>Lịch sử kết quả 7 ngày gần nhất</h2><p className="muted">Từ {cutoff.toLocaleDateString('vi-VN')} đến {latestDate ? new Date(`${latestDate}T00:00:00Z`).toLocaleDateString('vi-VN') : '—'}, gồm {recentHistory.length} kỳ quay.</p><div className="table-wrap"><table><thead><tr><th>Kỳ</th><th>Ngày giờ</th><th>5 số xanh</th><th>ĐB</th></tr></thead><tbody>{recentHistory.map((item) => <tr key={item.drawId}><td>{item.drawId.replace('LOTTO535-', '#')}</td><td>{new Date(item.timestamp).toLocaleString('vi-VN')}</td><td><span className="draw-balls">{item.mainNumbers.map((number) => <span className="ball" key={number}>{numberLabel(number)}</span>)}</span></td><td><span className="ball special">{numberLabel(item.specialNumber)}</span></td></tr>)}</tbody></table></div></section>}
    {tab === 'analysis' && <>
      <section><h2>Dự đoán thử nghiệm kỳ kế tiếp</h2><p className="muted">Đầu ra mô hình chỉ phục vụ quan sát/backtest.</p><div className="recommendation-grid">{(cache.statistics.recommendations ?? []).map((item) => <article className="recommendation" key={item.model}><small>{item.model}</small><div className="recommendation-balls"><span className="ball special">{numberLabel(item.orange)}</span>{item.greens.map((number) => <span className="ball" key={number}>{numberLabel(number)}</span>)}</div></article>)}</div></section>
      <section><h2>Tần suất và khoảng cách của số đặc biệt</h2><p className="muted">Đường xanh là số ngày từ lần xuất hiện gần nhất; cột cam là tổng số lần xuất hiện.</p><Chart options={specialChart(special)} /></section>
      <section><h2>Chu kỳ 01–12</h2><div className="table-wrap"><table><thead><tr><th>ĐB</th><th>Xuất hiện</th><th>Lần gần nhất</th><th>Trung bình lặp lại</th><th>Quá hạn / sớm</th><th>Khoảng cách (kỳ)</th></tr></thead><tbody>{special.map((item) => <tr key={item.number} className={item.number === selectedSpecial ? 'selected' : ''} onClick={() => setSelectedSpecial(item.number)}><td><span className="ball special">{numberLabel(item.number)}</span></td><td>{item.count}</td><td>{days(item.daysSinceLatest)}</td><td>{days(item.averageIntervalDays)}</td><td className={item.overdueDays > 0 ? 'overdue' : ''}>{item.overdueDays >= 0 ? '+' : ''}{item.overdueDays.toFixed(1)} ngày</td><td>{item.drawsSinceLatest} / TB {item.averageGapDraws.toFixed(1)}</td></tr>)}</tbody></table></div></section>
      <section className="two"><article><h2>Percentile khoảng cách hiện tại</h2><p className="muted">Càng gần 100% càng hiếm khi số ĐB đó vắng lâu như hiện tại.</p>{[...special].sort((a, b) => b.recurrencePercentile - a.recurrencePercentile).slice(0, 3).map((item) => <p key={item.number}><span className="ball special">{numberLabel(item.number)}</span> <b>{item.recurrencePercentile.toFixed(0)}%</b> · vắng {days(item.daysSinceLatest)}</p>)}</article><article><h2>Backtest rolling Top-3 ĐB</h2><p>Đánh giá {backtest?.evaluated ?? 0} kỳ, chỉ dùng các kỳ quá khứ tại từng thời điểm.</p><strong>{((backtest?.top3HitRate ?? 0) * 100).toFixed(1)}%</strong><p className="muted">Mốc ngẫu nhiên: {((backtest?.baselineTop3Rate ?? .25) * 100).toFixed(1)}%.</p></article></section>
      <section className="two"><article><h2>Tách theo giờ quay</h2><div className="table-wrap"><table><thead><tr><th>ĐB</th><th>13h</th><th>21h</th></tr></thead><tbody>{special.map((item) => <tr key={item.number}><td><span className="ball special">{numberLabel(item.number)}</span></td><td>{at13.find((value) => value.number === item.number)?.count ?? 0} lần</td><td>{at21.find((value) => value.number === item.number)?.count ?? 0} lần</td></tr>)}</tbody></table></div></article><article><h2>Chuyển tiếp sau ĐB {numberLabel(selectedSpecial)}</h2><p className="muted">Các ĐB ở kỳ kế tiếp sau khi ĐB đã chọn xuất hiện.</p><div className="association-list">{transitions.slice(0, 6).map((item) => <span className="association" key={item.number}><b>{numberLabel(item.number)}</b><br />{item.count} lần · {(item.rate * 100).toFixed(1)}%</span>)}</div></article></section>
      <section><h2>ĐB quá hạn và các số xanh từng đi cùng</h2><div className="overdue-grid">{overdue.map((item) => { const related = cache.statistics.specialAssociations?.[String(item.number)] ?? []; return <article key={item.number} className={`overdue-card ${item.number === selectedSpecial ? 'active' : ''}`} onClick={() => setSelectedSpecial(item.number)}><div className="overdue-heading"><span className="ball special">{numberLabel(item.number)}</span><div><strong>+{item.overdueDays.toFixed(1)} ngày</strong><small>TB lặp lại {days(item.averageIntervalDays)}</small></div></div><p className="muted">Top số xanh từng đi cùng ({item.count} kỳ)</p><div className="association-list">{related.slice(0, 5).map((relation) => <span key={relation.number} className="association"><b>{numberLabel(relation.number)}</b><br />{relation.count} lần · {(relation.rate * 100).toFixed(1)}%</span>)}</div></article>; })}</div></section>
      <section className="two"><article><h2>ĐB {numberLabel(selectedSpecial)} và dãy 5 số xanh</h2><p>ĐB {numberLabel(selectedSpecial)} đã xuất hiện {current?.count ?? 0} lần.</p></article><article><h2>Đọc chỉ số</h2><p><b>Quá hạn</b> = số ngày từ lần gần nhất trừ chu kỳ ngày trung bình.</p><p><b>Tỷ lệ đi cùng</b> = số lần số xanh xuất hiện cùng ĐB / tổng số kỳ của ĐB đó.</p></article></section>
      <section><h2>Số xanh thường đi cùng ĐB {numberLabel(selectedSpecial)}</h2><Chart options={associationChart(selectedSpecial, associations)} /><div className="association-list">{associations.slice(0, 10).map((item) => <span key={item.number} className="association"><b>{numberLabel(item.number)}</b> {item.count} lần · {(item.rate * 100).toFixed(1)}%</span>)}</div></section>
      <section><h2>Backtest 1 cam + 3 xanh</h2><p className="muted">300 kỳ đầu là dữ liệu nền; các kỳ sau được đánh giá tuần tự, không dùng dữ liệu tương lai.</p><div className="table-wrap"><table><thead><tr><th>Chiến lược</th><th>Đúng cam</th><th>TB xanh trúng</th><th>Cam + ≥1 xanh</th></tr></thead><tbody>{combos.map((item) => <tr key={item.id} className={item.id === best ? 'best-strategy' : ''}><td>{item.id === best ? '★ ' : ''}{item.label}</td><td>{(item.orangeHitRate * 100).toFixed(1)}%</td><td>{item.averageGreenHits.toFixed(2)} / 3</td><td>{(item.jointHitRate * 100).toFixed(1)}%</td></tr>)}</tbody></table></div></section>
    </>}
  </main>;
}

import historyJson from '../../data/history.json';
import type { EventRecord, Metadata } from '../../src/core/domain';
import { Lotto535Source } from '../../src/sync/lotto535-source';
import { defaultRules } from '../../src/sync/synchronization-service';
import { StatisticsService } from '../../src/statistics/statistics-service';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const recentSevenDays = (records: EventRecord[]) => {
  const latest = records.at(-1)?.date;
  if (!latest) return [];
  const cutoff = new Date(`${latest}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 6);
  return records.filter((record) => new Date(`${record.date}T00:00:00Z`) >= cutoff);
};

export default async () => {
  const historical = historyJson as EventRecord[];
  try {
    const latest = await new Lotto535Source().fetchBatch(new Date());
    const records = [...new Map([...historical, ...latest].map((record) => [record.drawId, record])).values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const latestRecord = records.at(-1) ?? null;
    const metadata: Metadata = { latestDraw: latestRecord?.drawId ?? null, totalDraws: records.length, lastSynchronization: new Date().toISOString(), projectVersion: '0.1.0', statisticsVersion: '1.0.0' };
    return json({ sourceStatus: 'live', checkedAt: new Date().toISOString(), metadata, history: recentSevenDays(records), cache: { generatedAt: new Date().toISOString(), statistics: new StatisticsService(defaultRules).build(records) } });
  } catch {
    return json({ sourceStatus: 'fallback', checkedAt: new Date().toISOString(), warning: 'Không thể kiểm tra nguồn trực tuyến; đang dùng dữ liệu đã deploy.', metadata: { latestDraw: historical.at(-1)?.drawId ?? null, totalDraws: historical.length, lastSynchronization: null, projectVersion: '0.1.0', statisticsVersion: '1.0.0' }, history: recentSevenDays(historical), cache: { generatedAt: new Date().toISOString(), statistics: new StatisticsService(defaultRules).build(historical) } });
  }
};

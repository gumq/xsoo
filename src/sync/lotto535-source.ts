import type { EventRecord } from '../core/domain';
import { DomainError } from '../core/errors';

const baseUrl = 'https://www.ketquadientoan.com/ket-qua-xo-so-dien-toan-lotto-535';
const formatDate = (date: Date) => date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).replaceAll('/', '-');
const toIso = (value: string) => { const [day, month, year] = value.split('/'); return `${year}-${month}-${day}`; };

export class Lotto535Source {
  public async fetchBatch(anchor: Date): Promise<EventRecord[]> {
    const sourceUrl = `${baseUrl}/${formatDate(anchor)}.html`;
    const response = await fetch(sourceUrl, { headers: { 'User-Agent': 'HistoricalEventAnalysis/0.1 (research data collector)' } });
    if (!response.ok) throw new DomainError(`Lottto 5/35 source returned HTTP ${response.status}.`);
    const html = await response.text(); const events: EventRecord[] = [];
    const blocks = html.matchAll(/Kỳ vé #(\d+)\s*\|[^|]*,\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2})H<\/div>\s*<div class="box_ketqua">([\s\S]*?)<\/div>/g);
    for (const match of blocks) {
      const balls = [...match[4].matchAll(/<span class="([^"]*)">(\d{2})<\/span>/g)];
      const mainNumbers = balls.filter((ball) => ball[1] === 'ball ball_lotto').map((ball) => Number(ball[2]));
      const special = balls.find((ball) => ball[1].includes('ball_power2'));
      if (mainNumbers.length !== 5 || !special) continue;
      const date = toIso(match[2]);
      events.push({ drawId: `LOTTO535-${match[1]}`, date, timestamp: `${date}T${match[3]}:00:00.000Z`, mainNumbers, specialNumber: Number(special[2]), validation: { source: sourceUrl, validatedAt: new Date().toISOString(), schemaVersion: '1' } });
    }
    return [...new Map(events.map((event) => [event.drawId, event])).values()];
  }
}

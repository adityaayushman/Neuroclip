import type { Debrief } from '@neuroclip/shared';

export const CARD_W = 1200;
export const CARD_H = 630;

export interface CardData {
  name: string;
  mode: string;
  score: number;
  rank: number | null;
  ruptures: number;
  bloodMl: number;
  durationS: number;
}

export function cardData(d: Debrief, name: string): CardData {
  return {
    name: name.trim() || 'Surgeon',
    mode: d.mode,
    score: d.score,
    rank: d.rank ?? null,
    ruptures: d.summary.ruptures,
    bloodMl: Math.round(d.summary.blood_loss_ml),
    durationS: Math.round(d.summary.duration_ms / 1000),
  };
}

export function cardLines(c: CardData): { title: string; stats: [string, string][]; footer: string } {
  const mm = `${Math.floor(c.durationS / 60)}:${String(c.durationS % 60).padStart(2, '0')}`;
  return {
    title: `${c.name} scored ${c.score}/1000`,
    stats: [
      ['Mode', c.mode],
      ['Rank', c.rank ? `#${c.rank}` : 'unranked'],
      ['Ruptures', String(c.ruptures)],
      ['Blood loss', `${c.bloodMl} mL`],
      ['Time', mm],
    ],
    footer: 'NeuroClip simulator. Educational use only. Not a medical device.',
  };
}

export function drawShareCard(ctx: CanvasRenderingContext2D, c: CardData) {
  const { title, stats, footer } = cardLines(c);
  const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  g.addColorStop(0, '#0b1220');
  g.addColorStop(1, '#2a0a12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.beginPath();
  ctx.arc(1030, 110, 70, 0, Math.PI * 2);
  ctx.fillStyle = '#c0262d';
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#e5e7eb';
  ctx.stroke();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 32px system-ui, sans-serif';
  ctx.fillText('NEUROCLIP', 70, 100);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 60px system-ui, sans-serif';
  ctx.fillText(title, 70, 240, 1060);
  stats.forEach(([k, v], i) => {
    const x = 70 + (i % 3) * 360;
    const y = 360 + Math.floor(i / 3) * 110;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 26px system-ui, sans-serif';
    ctx.fillText(k, x, y);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText(v, x, y + 52);
  });
  ctx.fillStyle = '#fbbf24';
  ctx.font = '500 24px system-ui, sans-serif';
  ctx.fillText(footer, 70, CARD_H - 40);
}

export function shareCardBlob(c: CardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  drawShareCard(canvas.getContext('2d')!, c);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'));
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

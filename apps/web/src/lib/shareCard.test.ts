import { describe, expect, it } from 'vitest';
import { cardLines } from './shareCard';

const base = { name: 'Ada', mode: 'guided', score: 812, rank: 3, ruptures: 1, bloodMl: 240, durationS: 305 };

describe('share card', () => {
  it('formats the title, stats and disclaimer footer', () => {
    const l = cardLines(base);
    expect(l.title).toBe('Ada scored 812/1000');
    expect(l.stats).toContainEqual(['Rank', '#3']);
    expect(l.stats).toContainEqual(['Time', '5:05']);
    expect(l.footer).toMatch(/educational use only/i);
  });
  it('shows unranked runs honestly', () => {
    expect(cardLines({ ...base, rank: null }).stats).toContainEqual(['Rank', 'unranked']);
  });
});

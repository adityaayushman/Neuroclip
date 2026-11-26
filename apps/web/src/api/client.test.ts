import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  askMentor,
  clearPlayer,
  ensurePlayer,
  finishSession,
  getLeaderboard,
  gzipJson,
  loadPlayer,
  parseSse,
  saveRun,
  uploadTelemetry,
} from './client';

const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const debrief = {
  run_id: uuid,
  mode: 'guided',
  status: 'finished',
  score: 900,
  breakdown: { completion: 400, safety: 300, blood: 100, efficiency: 100 },
  summary: {
    duration_ms: 1000, steps_completed: 6, timeline: [], errors: [], alarms: 0, ruptures: 0,
    blood_loss_ml: 0, max_icp: 11, min_sbp: 100,
  },
  flagged: false, flags: [], ml_skill: null, rank: 1,
};

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  clearPlayer();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('creates and caches a player', async () => {
    fetchMock.mockResolvedValueOnce(ok({ player_id: uuid, token: 'tok' }, 201));
    const p = await ensurePlayer('Alice');
    expect(p).toMatchObject({ token: 'tok', display_name: 'Alice' });
    expect(loadPlayer()?.token).toBe('tok');
    expect(await ensurePlayer('Alice')).toEqual(p);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/players$/);
    expect(JSON.parse(init.body as string)).toEqual({ display_name: 'Alice' });
  });

  it('rejects malformed server responses via zod', async () => {
    fetchMock.mockResolvedValueOnce(ok({ nope: true }));
    await expect(getLeaderboard()).rejects.toMatchObject({ status: 502 });
  });

  it('surfaces API error details and network failures', async () => {
    fetchMock.mockResolvedValueOnce(ok({ detail: 'Rate limit exceeded' }, 429));
    await expect(getLeaderboard()).rejects.toMatchObject({ status: 429, message: 'Rate limit exceeded' });
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(getLeaderboard()).rejects.toBeInstanceOf(ApiError);
  });

  it('sends bearer tokens and parses the debrief', async () => {
    fetchMock.mockResolvedValueOnce(ok(debrief));
    const d = await finishSession(uuid, 'tok');
    expect(d.score).toBe(900);
    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });

  it('gzips telemetry in batches with a running offset', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok({ accepted: 1, next_offset: 1 })));
    const events = Array.from({ length: 2500 }, (_, i) => ({
      t: i, step: 'dural_opening' as const, tool: null, kind: 'fact', data: null,
    }));
    await uploadTelemetry(uuid, events, 'tok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = first[1].headers as Headers;
    if (typeof CompressionStream !== 'undefined') {
      expect(headers.get('Content-Encoding')).toBe('gzip');
      const text = await new Response(
        new Response(first[1].body as ArrayBuffer).body!.pipeThrough(new DecompressionStream('gzip')),
      ).text();
      const body = JSON.parse(text) as { offset: number; events: unknown[] };
      expect(body.offset).toBe(0);
      expect(body.events).toHaveLength(2000);
    }
  });

  it('gzipJson falls back to plain JSON without CompressionStream', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const out = await gzipJson({ a: 1 });
    expect(out).toEqual({ body: '{"a":1}', gzip: false });
  });

  it('saveRun clears a stale token and retries once on 401', async () => {
    localStorage.setItem('neuroclip.player', JSON.stringify({ player_id: uuid, token: 'old', display_name: 'Bob' }));
    fetchMock
      .mockResolvedValueOnce(ok({ detail: 'Invalid token' }, 401))
      .mockResolvedValueOnce(ok({ player_id: uuid, token: 'new' }, 201))
      .mockResolvedValueOnce(ok({ session_id: uuid }, 201))
      .mockResolvedValueOnce(ok(debrief));
    const { debrief: d } = await saveRun('Bob', 'guided', 1, []);
    expect(d.rank).toBe(1);
    expect(loadPlayer()?.token).toBe('new');
  });
});

describe('mentor SSE', () => {
  it('parses partial buffers', () => {
    const a = parseSse('event: delta\ndata: {"text":"Hi "}\n\nevent: do');
    expect(a.events).toEqual([{ event: 'delta', data: { text: 'Hi ' } }]);
    expect(a.rest).toBe('event: do');
  });

  it('streams text deltas and reports the source', async () => {
    const sse = 'event: delta\ndata: {"text":"Use "}\n\nevent: delta\ndata: {"text":"suction."}\n\nevent: done\ndata: {"source":"scripted"}\n\n';
    fetchMock.mockResolvedValueOnce(new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } }));
    const gen = askMentor('rupture?', 'clip_placement');
    const parts: string[] = [];
    let next = await gen.next();
    while (!next.done) {
      parts.push(next.value);
      next = await gen.next();
    }
    expect(parts.join('')).toBe('Use suction.');
    expect(next.value).toBe('scripted');
  });
});

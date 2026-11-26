import {
  DebriefSchema,
  LeaderboardSchema,
  PlayerOutSchema,
  SessionOutSchema,
  TelemetryAckSchema,
  type Debrief,
  type Mode,
  type Step,
  type TelemetryEvent,
} from '@neuroclip/shared';
import type { ZodType } from 'zod';

const BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const PLAYER_KEY = 'neuroclip.player';
const BATCH = 2000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface StoredPlayer {
  player_id: string;
  token: string;
  display_name: string;
}

export const loadPlayer = (): StoredPlayer | null => {
  try {
    const raw = localStorage.getItem(PLAYER_KEY);
    return raw ? (JSON.parse(raw) as StoredPlayer) : null;
  } catch {
    return null;
  }
};
const savePlayer = (p: StoredPlayer) => localStorage.setItem(PLAYER_KEY, JSON.stringify(p));
export const clearPlayer = () => localStorage.removeItem(PLAYER_KEY);

async function request<T>(path: string, schema: ZodType<T>, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Cannot reach the server');
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new ApiError(502, 'Unexpected response from the server');
  return parsed.data;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function gzipJson(value: unknown): Promise<{ body: BodyInit; gzip: boolean }> {
  const text = JSON.stringify(value);
  if (typeof CompressionStream === 'undefined') return { body: text, gzip: false };
  const source = new Response(text).body;
  if (!source) return { body: text, gzip: false };
  const stream = source.pipeThrough(new CompressionStream('gzip'));
  return { body: await new Response(stream).arrayBuffer(), gzip: true };
}

export async function ensurePlayer(displayName: string): Promise<StoredPlayer> {
  const existing = loadPlayer();
  if (existing && existing.display_name === displayName) return existing;
  const out = await request('/v1/players', PlayerOutSchema, json({ display_name: displayName }));
  const player = { ...out, display_name: displayName };
  savePlayer(player);
  return player;
}

export const createSession = (mode: Mode, seed: number, token: string) =>
  request('/v1/sessions', SessionOutSchema, json({ mode, seed }), token);

export async function uploadTelemetry(sessionId: string, events: TelemetryEvent[], token: string): Promise<void> {
  for (let offset = 0; offset < events.length; offset += BATCH) {
    const { body, gzip } = await gzipJson({ offset, events: events.slice(offset, offset + BATCH) });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (gzip) headers['Content-Encoding'] = 'gzip';
    await request(`/v1/sessions/${sessionId}/telemetry`, TelemetryAckSchema, { method: 'POST', headers, body }, token);
  }
}

export const finishSession = (sessionId: string, token: string): Promise<Debrief> =>
  request(`/v1/sessions/${sessionId}/finish`, DebriefSchema, { method: 'POST' }, token);

export const getLeaderboard = (mode?: Mode, limit = 10) =>
  request(`/v1/leaderboard?limit=${limit}${mode ? `&mode=${mode}` : ''}`, LeaderboardSchema);

export interface SaveResult {
  debrief: Debrief;
}

export async function saveRun(displayName: string, mode: Mode, seed: number, events: TelemetryEvent[]): Promise<SaveResult> {
  const attempt = async () => {
    const player = await ensurePlayer(displayName);
    const { session_id } = await createSession(mode, seed, player.token);
    if (events.length > 0) await uploadTelemetry(session_id, events, player.token);
    return finishSession(session_id, player.token);
  };
  try {
    return { debrief: await attempt() };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      clearPlayer();
      return { debrief: await attempt() };
    }
    throw e;
  }
}

export function parseSse(buffer: string): { events: { event: string; data: unknown }[]; rest: string } {
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events = blocks.flatMap((block) => {
    const fields = Object.fromEntries(
      block
        .split('\n')
        .map((l) => l.split(/: (.*)/s))
        .filter((p): p is [string, string, string] => p.length >= 2),
    ) as Record<string, string>;
    if (!fields.event || fields.data === undefined) return [];
    try {
      return [{ event: fields.event, data: JSON.parse(fields.data) as unknown }];
    } catch {
      return [];
    }
  });
  return { events, rest };
}

export async function* askMentor(question: string, step?: Step): AsyncGenerator<string, 'llm' | 'scripted'> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/mentor/ask`, json({ question, step }));
  } catch {
    throw new ApiError(0, 'Cannot reach the server');
  }
  if (!res.ok || !res.body) throw new ApiError(res.status, 'Mentor unavailable');
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let source: 'llm' | 'scripted' = 'scripted';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const parsed = parseSse(buffer);
    buffer = parsed.rest;
    for (const ev of parsed.events) {
      const data = ev.data as { text?: string; source?: 'llm' | 'scripted' };
      if (ev.event === 'delta' && data.text) yield data.text;
      if (ev.event === 'done' && data.source) source = data.source;
    }
  }
  return source;
}

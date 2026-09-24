export interface OnlinePoint {
  timestamp: number;
  value: number;
}

export interface TverskoyOnline {
  current: number;
  points: OnlinePoint[];
  fetchedAt: number;
}

const API = 'https://wiki.russia.online/api/online/ro2';

function valueOf(point: { m?: { p?: number; q?: number; a?: number }; t?: number }) {
  const players = Number(point.m?.p || 0);
  const queued = Number(point.m?.q || 0);
  return Number(point.m?.a ?? players + queued);
}

export async function fetchTverskoyOnline(signal?: AbortSignal, period: '1d' | '7d' | '30d' = '1d'): Promise<TverskoyOnline> {
  const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Online endpoint timeout')), 12_000));
  const request = fetch(`${API}/${period}`, { signal, headers: { Accept: 'application/json' } });
  const response = await Promise.race([request, timeout]);
  if (!response.ok) throw new Error(`Online endpoint returned ${response.status}`);
  const payload = await response.json() as { data?: Array<{ m?: { p?: number; q?: number; a?: number }; t?: number }> };
  const points = (payload.data || [])
    .map(point => ({ timestamp: Number(point.t), value: valueOf(point) }))
    .filter(point => Number.isFinite(point.timestamp) && Number.isFinite(point.value));
  if (!points.length) throw new Error('Online endpoint returned no points');
  return { current: points[points.length - 1].value, points, fetchedAt: Date.now() };
}

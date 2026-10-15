/**
 * Cliente de las integraciones opcionales del servidor. El navegador nunca ve
 * claves: solo pregunta qué está disponible y envía peticiones al backend, que
 * valida todo lo que devuelve un proveedor externo.
 */
import { StoryPlanSchema, type StoryPlan, type StoryRequest } from '../../shared/aiContract';
import { OperationPlanSchema, type OperationPlan } from '../../shared/operations';
import type { VisualParams, WorldId } from '../../shared/params';
import type { AudioBinding } from '../../shared/schema';

export interface Capabilities {
  server: boolean;
  ai: { available: boolean; provider: string | null; model: string | null; reason: string | null };
  music: {
    available: boolean;
    provider: string | null;
    isMock: boolean;
    maxDurationSec: number;
    dailyLimit: number;
    remainingToday: number;
    costPerSecUsd: number;
    reason: string | null;
  };
  video: { available: false; reason: string };
}

export const OFFLINE_CAPABILITIES: Capabilities = {
  server: false,
  ai: { available: false, provider: null, model: null, reason: 'El servidor de integraciones no está en ejecución.' },
  music: { available: false, provider: null, isMock: false, maxDurationSec: 0, dailyLimit: 0, remainingToday: 0, costPerSecUsd: 0, reason: 'El servidor de integraciones no está en ejecución.' },
  video: { available: false, reason: 'La generación de vídeo con IA está planificada para una fase posterior.' },
};

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30000);
  try {
    const res = await fetch(path, { ...init, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      const body = type.includes('json') ? await res.json().catch(() => null) : null;
      throw new ApiError(body?.error?.message ?? `Error ${res.status}`, body?.error?.code ?? 'http_error', res.status);
    }
    if (!type.includes('json')) throw new ApiError('Respuesta inesperada del servidor.', 'bad_response', res.status);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError('La petición superó el tiempo de espera.', 'timeout', 0);
    throw new ApiError('No se pudo contactar con el servidor de integraciones.', 'network', 0);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCapabilities(): Promise<Capabilities> {
  try {
    return await request<Capabilities>('/api/capabilities', { timeoutMs: 4000 });
  } catch {
    return OFFLINE_CAPABILITIES;
  }
}

export async function interpretWithAi(instruction: string, state: { world: WorldId; params: VisualParams; bindings: AudioBinding[] }): Promise<OperationPlan & { provider: string }> {
  const body = await request<{ plan: unknown; provider: string }>('/api/ai/interpret', {
    method: 'POST',
    body: JSON.stringify({ instruction, state: { world: state.world, params: state.params, bindings: state.bindings.map(({ source, target, amount, enabled }) => ({ source, target, amount, enabled })) } }),
    timeoutMs: 45000,
  });
  // Segunda validación en el cliente: nunca se aplica nada que no cumpla el esquema.
  const parsed = OperationPlanSchema.safeParse(body.plan);
  if (!parsed.success) throw new ApiError('La IA devolvió un plan que no cumple el esquema.', 'invalid_output', 422);
  return { ...parsed.data, provider: body.provider };
}

export async function storyWithAi(req: StoryRequest): Promise<StoryPlan & { provider: string }> {
  const body = await request<{ plan: unknown; provider: string }>('/api/ai/story', { method: 'POST', body: JSON.stringify(req), timeoutMs: 90000 });
  const parsed = StoryPlanSchema.safeParse(body.plan);
  if (!parsed.success) throw new ApiError('La IA devolvió un guion que no cumple el esquema.', 'invalid_output', 422);
  return { ...parsed.data, provider: body.provider };
}

export interface GeneratedMusic {
  blob: Blob;
  provider: string;
  isMock: boolean;
  durationSec: number;
  costEstimateUsd: number;
  remainingToday: number;
}

export async function generateMusic(prompt: string, durationSec: number, signal?: AbortSignal): Promise<GeneratedMusic> {
  let res: Response;
  try {
    res = await fetch('/api/music/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, durationSec }), signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError('Generación cancelada.', 'aborted', 0);
    throw new ApiError('No se pudo contactar con el servidor de integraciones.', 'network', 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error?.message ?? `Error ${res.status}`, body?.error?.code ?? 'http_error', res.status);
  }
  const blob = await res.blob();
  return {
    blob,
    provider: res.headers.get('x-music-provider') ?? 'desconocido',
    isMock: res.headers.get('x-music-mock') === '1',
    durationSec: Number(res.headers.get('x-music-duration') ?? durationSec),
    costEstimateUsd: Number(res.headers.get('x-music-cost-usd') ?? 0),
    remainingToday: Number(res.headers.get('x-music-remaining') ?? 0),
  };
}

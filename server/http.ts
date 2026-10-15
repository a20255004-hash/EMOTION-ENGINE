import type { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export function sendError(res: Response, err: unknown) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  console.error('[api] error inesperado', err);
  res.status(500).json({ error: { code: 'internal', message: 'Error interno del servidor.' } });
}

/** Limitador por IP con ventana deslizante (memoria del proceso). */
export function rateLimit(perMinute: number) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= perMinute) {
      const retry = Math.ceil((60_000 - (now - recent[0])) / 1000);
      res.setHeader('Retry-After', String(retry));
      sendError(res, new HttpError(429, 'rate_limited', `Demasiadas peticiones. Vuelve a intentarlo en ${retry} s.`));
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

/** Ejecuta una tarea con límite de tiempo y la cancela al vencer. */
export async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>, label: string, external?: AbortSignal): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onExternal = () => ctrl.abort();
  external?.addEventListener('abort', onExternal);
  try {
    return await fn(ctrl.signal);
  } catch (e) {
    if (external?.aborted) throw new HttpError(499, 'aborted', 'Petición cancelada por el cliente.');
    if (ctrl.signal.aborted) throw new HttpError(504, 'timeout', `${label} superó el tiempo máximo de ${Math.round(ms / 1000)} s.`);
    throw e;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternal);
  }
}

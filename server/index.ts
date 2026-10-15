/**
 * Servidor de integraciones de EMOTION ENGINE.
 *
 * Responsabilidades: custodiar credenciales, aplicar límites de uso y tiempos
 * de espera, y validar con los esquemas compartidos todo lo que devuelve un
 * proveedor antes de enviarlo al navegador. La aplicación funciona sin él.
 */
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { InterpretRequestSchema, StoryPlanSchema, StoryRequestSchema, buildStorySystemPrompt, buildSystemPrompt, describeState } from '../shared/aiContract';
import { OperationPlanSchema } from '../shared/operations';
import type { WorldId } from '../shared/params';
import { createAiProvider } from './ai';
import { config } from './config';
import { HttpError, rateLimit, sendError, withTimeout } from './http';
import { DailyQuota, createMusicProvider } from './music';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '64kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

const ai = createAiProvider(config.ai);
const music = createMusicProvider(config.music);
const quota = new DailyQuota(config.music.dailyLimit);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Solo describe qué hay disponible. Nunca incluye claves ni URLs internas.
app.get('/api/capabilities', (_req, res) => {
  res.json({
    server: true,
    ai: { available: !!ai.provider, provider: ai.provider?.id ?? null, model: ai.provider?.model ?? null, reason: ai.reason },
    music: {
      available: !!music.provider,
      provider: music.provider?.id ?? null,
      isMock: music.provider?.isMock ?? false,
      maxDurationSec: config.music.maxDurationSec,
      dailyLimit: config.music.dailyLimit,
      remainingToday: quota.remaining(),
      costPerSecUsd: config.music.costPerSecUsd,
      reason: music.reason,
    },
    video: { available: false, reason: 'La generación de vídeo con IA está planificada para una fase posterior; no hay proveedor configurado.' },
  });
});

const parseBody = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, 'bad_request', `Petición no válida: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  return r.data;
};

app.post('/api/ai/interpret', rateLimit(config.ai.ratePerMin), async (req, res) => {
  try {
    if (!ai.provider) throw new HttpError(503, 'not_configured', ai.reason ?? 'IA no configurada.');
    const body = parseBody(InterpretRequestSchema, req.body);
    const user = `${describeState(body.state.world as WorldId, body.state.params, body.state.bindings as never)}\n\nInstrucción del usuario: «${body.instruction}»`;
    const raw = await withTimeout(config.ai.timeoutMs, (signal) => ai.provider!.generateStructured({ system: buildSystemPrompt(), user, schema: OperationPlanSchema, schemaName: 'OperationPlan', signal }), 'La IA');
    const plan = OperationPlanSchema.safeParse(raw);
    if (!plan.success) throw new HttpError(422, 'invalid_output', 'La IA devolvió operaciones fuera del esquema permitido.');
    res.json({ plan: plan.data, provider: ai.provider.id });
  } catch (e) {
    sendError(res, e);
  }
});

app.post('/api/ai/story', rateLimit(Math.max(2, Math.floor(config.ai.ratePerMin / 2))), async (req, res) => {
  try {
    if (!ai.provider) throw new HttpError(503, 'not_configured', ai.reason ?? 'IA no configurada.');
    const body = parseBody(StoryRequestSchema, req.body);
    const user = `Idea: «${body.idea}»\nNúmero de escenas: ${body.sceneCount}. Duración total aproximada: ${body.totalDurationSec} s. Consistencia visual: ${body.consistent ? 'sí' : 'no'}.`;
    const raw = await withTimeout(config.ai.timeoutMs * 2, (signal) => ai.provider!.generateStructured({ system: buildStorySystemPrompt(), user, schema: StoryPlanSchema, schemaName: 'StoryPlan', signal }), 'La IA');
    const plan = StoryPlanSchema.safeParse(raw);
    if (!plan.success) throw new HttpError(422, 'invalid_output', 'La IA devolvió un guion fuera del esquema permitido.');
    res.json({ plan: plan.data, provider: ai.provider.id });
  } catch (e) {
    sendError(res, e);
  }
});

const MusicRequestSchema = z.object({ prompt: z.string().trim().min(3).max(400), durationSec: z.number().min(2).max(600) });

app.post('/api/music/generate', rateLimit(3), async (req, res) => {
  let took = false;
  try {
    if (!music.provider) throw new HttpError(503, 'not_configured', music.reason ?? 'Generación musical no configurada.');
    const body = parseBody(MusicRequestSchema, req.body);
    if (body.durationSec > config.music.maxDurationSec) throw new HttpError(400, 'too_long', `La duración máxima es ${config.music.maxDurationSec} s.`);
    if (!quota.take()) throw new HttpError(429, 'quota_exceeded', `Se alcanzó el límite diario de ${config.music.dailyLimit} generaciones.`);
    took = true;
    // Si el cliente cierra la conexión, se cancela la petición al proveedor.
    const clientGone = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) clientGone.abort();
    });
    const result = await withTimeout(
      config.music.timeoutMs,
      (signal) => music.provider!.generate({ prompt: body.prompt, durationSec: body.durationSec, signal }),
      'La generación musical',
      clientGone.signal,
    );
    res.setHeader('Content-Type', result.mime);
    res.setHeader('X-Music-Provider', music.provider.id);
    res.setHeader('X-Music-Mock', music.provider.isMock ? '1' : '0');
    res.setHeader('X-Music-Duration', String(result.durationSec));
    res.setHeader('X-Music-Cost-Usd', (config.music.costPerSecUsd * result.durationSec).toFixed(4));
    res.setHeader('X-Music-Remaining', String(quota.remaining()));
    res.send(result.audio);
  } catch (e) {
    // Un fallo del proveedor no consume cupo.
    if (took) quota.refund();
    sendError(res, e);
  }
});

app.use('/api', (_req, res) => sendError(res, new HttpError(404, 'not_found', 'Ruta no encontrada.')));

// En producción sirve la aplicación compilada.
const dist = path.resolve('dist');
if (config.production && existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`[emotion-engine] API en http://localhost:${config.port}`);
  console.log(`[emotion-engine] IA: ${ai.provider ? `${ai.provider.id} (${ai.provider.model})` : `desactivada — ${ai.reason}`}`);
  console.log(`[emotion-engine] Música: ${music.provider ? `${music.provider.id}${music.provider.isMock ? ' (prueba, no IA)' : ''}` : `desactivada — ${music.reason}`}`);
});

import { existsSync } from 'node:fs';

// Carga .env si existe (Node ≥ 20.12). Las variables del entorno real tienen prioridad.
if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* .env con formato inválido: se ignora */
  }
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : d;
};
const str = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export const config = {
  port: num(process.env.API_PORT, 8787),
  production: process.env.NODE_ENV === 'production',
  ai: {
    provider: (str(process.env.AI_PROVIDER) ?? 'none') as 'none' | 'anthropic' | 'openai-compatible',
    anthropicKey: str(process.env.ANTHROPIC_API_KEY),
    model: str(process.env.AI_MODEL) ?? 'claude-opus-5-5',
    effort: (str(process.env.AI_EFFORT) ?? 'low') as 'low' | 'medium' | 'high' | 'xhigh' | 'max',
    openaiBaseUrl: str(process.env.OPENAI_COMPAT_BASE_URL),
    openaiKey: str(process.env.OPENAI_COMPAT_API_KEY),
    openaiModel: str(process.env.OPENAI_COMPAT_MODEL),
    timeoutMs: num(process.env.AI_TIMEOUT_MS, 30000),
    ratePerMin: num(process.env.AI_RATE_LIMIT_PER_MIN, 10),
  },
  music: {
    provider: (str(process.env.MUSIC_PROVIDER) ?? 'none') as 'none' | 'mock' | 'http',
    url: str(process.env.MUSIC_API_URL),
    key: str(process.env.MUSIC_API_KEY),
    timeoutMs: num(process.env.MUSIC_TIMEOUT_MS, 120000),
    maxDurationSec: num(process.env.MUSIC_MAX_DURATION_SEC, 30),
    dailyLimit: num(process.env.MUSIC_DAILY_LIMIT, 20),
    costPerSecUsd: num(process.env.MUSIC_COST_PER_SEC_USD, 0),
  },
};

export type Config = typeof config;

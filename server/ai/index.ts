import type { Config } from '../config';
import { AnthropicProvider } from './anthropic';
import { OpenAICompatibleProvider } from './openaiCompatible';
import type { LlmProvider } from './types';

export interface AiSetup {
  provider: LlmProvider | null;
  reason: string | null;
}

export function createAiProvider(cfg: Config['ai']): AiSetup {
  switch (cfg.provider) {
    case 'anthropic':
      if (!cfg.anthropicKey) return { provider: null, reason: 'AI_PROVIDER=anthropic pero falta ANTHROPIC_API_KEY en el servidor.' };
      return { provider: new AnthropicProvider(cfg.anthropicKey, cfg.model, cfg.effort, cfg.timeoutMs), reason: null };
    case 'openai-compatible':
      if (!cfg.openaiBaseUrl || !cfg.openaiModel) return { provider: null, reason: 'Faltan OPENAI_COMPAT_BASE_URL u OPENAI_COMPAT_MODEL en el servidor.' };
      return { provider: new OpenAICompatibleProvider(cfg.openaiBaseUrl, cfg.openaiKey, cfg.openaiModel), reason: null };
    default:
      return { provider: null, reason: 'No hay proveedor de IA configurado (AI_PROVIDER=none). El intérprete local sigue disponible.' };
  }
}

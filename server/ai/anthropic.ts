import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { HttpError } from '../http';
import type { LlmProvider } from './types';

/** Proveedor Claude mediante el SDK oficial, con salida estructurada validada por esquema. */
export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string, readonly model: string, private effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max', timeoutMs: number) {
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  async generateStructured<T>({ system, user, schema, signal }: Parameters<LlmProvider['generateStructured']>[0] & { schema: import('zod').ZodType<T> }) {
    try {
      const response = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: 16000,
          // Reintento en el servidor de Anthropic con un modelo alternativo si el principal declina.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: this.effort, format: betaZodOutputFormat(schema) },
          system,
          messages: [{ role: 'user', content: user }],
        },
        { signal },
      );
      if (response.stop_reason === 'refusal') {
        throw new HttpError(422, 'refused', 'El modelo declinó esta instrucción. Reformúlala o usa el intérprete local.');
      }
      if (response.stop_reason === 'max_tokens') {
        throw new HttpError(502, 'truncated', 'La respuesta del modelo quedó incompleta.');
      }
      if (response.parsed_output == null) throw new HttpError(422, 'invalid_output', 'El modelo no devolvió JSON válido para el esquema.');
      return response.parsed_output;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(502, 'provider_auth', 'La clave del proveedor de IA no es válida (revisa la configuración del servidor).');
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'provider_rate_limited', 'El proveedor de IA está limitando las peticiones. Inténtalo en unos segundos.');
      if (e instanceof Anthropic.BadRequestError) throw new HttpError(502, 'provider_bad_request', `El proveedor rechazó la petición: ${e.message}`);
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new HttpError(504, 'timeout', 'El proveedor de IA tardó demasiado en responder.');
      if (e instanceof Anthropic.APIUserAbortError) throw e;
      if (e instanceof Anthropic.APIConnectionError) throw new HttpError(502, 'provider_unreachable', 'No se pudo conectar con el proveedor de IA.');
      if (e instanceof Anthropic.APIError) throw new HttpError(502, 'provider_error', `Error del proveedor de IA (${e.status ?? '—'}).`);
      throw e;
    }
  }
}

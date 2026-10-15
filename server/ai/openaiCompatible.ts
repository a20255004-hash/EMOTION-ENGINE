import { z } from 'zod';
import { HttpError } from '../http';
import type { LlmProvider } from './types';

/**
 * Proveedor genérico para cualquier servicio con la API de chat compatible con
 * OpenAI (OpenAI, OpenRouter, Ollama, LM Studio, vLLM…). Pide JSON y el esquema
 * se describe en el mensaje de sistema; la validación real ocurre después.
 */
export class OpenAICompatibleProvider implements LlmProvider {
  readonly id = 'openai-compatible';

  constructor(private baseUrl: string, private apiKey: string | null, readonly model: string) {}

  async generateStructured<T>({ system, user, schema, schemaName, signal }: Parameters<LlmProvider['generateStructured']>[0] & { schema: z.ZodType<T> }) {
    const jsonSchema = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: `${system}\n\nResponde SOLO con un objeto JSON "${schemaName}" que cumpla este JSON Schema:\n${JSON.stringify(jsonSchema)}` },
            { role: 'user', content: user },
          ],
        }),
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new HttpError(502, 'provider_unreachable', 'No se pudo conectar con el proveedor de IA.');
    }
    if (res.status === 401 || res.status === 403) throw new HttpError(502, 'provider_auth', 'La clave del proveedor de IA no es válida.');
    if (res.status === 429) throw new HttpError(429, 'provider_rate_limited', 'El proveedor de IA está limitando las peticiones.');
    if (!res.ok) throw new HttpError(502, 'provider_error', `Error del proveedor de IA (${res.status}).`);
    const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (!content) throw new HttpError(422, 'invalid_output', 'El proveedor no devolvió contenido.');
    try {
      return JSON.parse(content);
    } catch {
      throw new HttpError(422, 'invalid_output', 'El proveedor no devolvió JSON válido.');
    }
  }
}

import type { z } from 'zod';

/**
 * Contrato de un proveedor de lenguaje. Cualquier proveedor (Anthropic, uno
 * compatible con OpenAI, un modelo local…) solo tiene que devolver JSON que
 * cumpla el esquema pedido; el servidor lo vuelve a validar antes de responder.
 */
export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  generateStructured<T>(args: { system: string; user: string; schema: z.ZodType<T>; schemaName: string; signal: AbortSignal }): Promise<unknown>;
}

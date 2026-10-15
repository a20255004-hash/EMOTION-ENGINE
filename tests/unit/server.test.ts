import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StoryPlanSchema, buildSystemPrompt, describeState } from '../../shared/aiContract';
import { OperationPlanSchema } from '../../shared/operations';
import { worldPreset } from '../../shared/presets';
import { DailyQuota, createMusicProvider } from '../../server/music';
import { createAiProvider } from '../../server/ai';

describe('contrato IA', () => {
  it('los esquemas se pueden expresar como JSON Schema para cualquier proveedor', () => {
    expect(() => z.toJSONSchema(OperationPlanSchema, { io: 'input' })).not.toThrow();
    expect(() => z.toJSONSchema(StoryPlanSchema, { io: 'input' })).not.toThrow();
  });
  it('el prompt incluye todos los parámetros y operaciones', () => {
    const s = buildSystemPrompt();
    for (const k of ['particleDensity', 'bindAudio', 'applyMood', 'setWorld']) expect(s).toContain(k);
    expect(describeState('ocean', worldPreset('ocean'), [])).toContain('Mundo actual: ocean');
  });
  it('sin proveedor configurado no hay IA y se explica el motivo', () => {
    const r = createAiProvider({ provider: 'none' } as never);
    expect(r.provider).toBeNull();
    expect(r.reason).toMatch(/intérprete local/);
    expect(createAiProvider({ provider: 'anthropic', anthropicKey: null } as never).reason).toMatch(/ANTHROPIC_API_KEY/);
  });
});

describe('música', () => {
  it('el proveedor de prueba devuelve un WAV válido', async () => {
    const { provider } = createMusicProvider({ provider: 'mock' } as never);
    const r = await provider!.generate({ prompt: 'test', durationSec: 2, signal: new AbortController().signal });
    expect(r.audio.subarray(0, 4).toString()).toBe('RIFF');
    expect(r.audio.length).toBeGreaterThan(44 + 22050 * 2 * 2 * 1.9);
    expect(provider!.isMock).toBe(true);
  });
  it('cupo diario', () => {
    const q = new DailyQuota(2);
    expect(q.take()).toBe(true);
    expect(q.take()).toBe(true);
    expect(q.take()).toBe(false);
    q.refund();
    expect(q.remaining()).toBe(1);
  });
});

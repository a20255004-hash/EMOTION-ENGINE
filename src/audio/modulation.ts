import { PARAM_DEFS, clampParam, type NumericParamId, type VisualParams } from '../../shared/params';
import type { AudioBinding, AudioSettings } from '../../shared/schema';
import type { AudioFrame } from '../engine/types';

/**
 * Calcula los parámetros efectivos de un fotograma: valor base + suma de las
 * vinculaciones activas. No modifica el estado guardado del proyecto.
 */
export function modulate(base: VisualParams, bindings: AudioBinding[], frame: AudioFrame, settings: Pick<AudioSettings, 'bindingsEnabled' | 'intensity'>): VisualParams {
  if (!settings.bindingsEnabled || bindings.length === 0) return base;
  let out: VisualParams | null = null;
  for (const b of bindings) {
    if (!b.enabled) continue;
    const signal = frame[b.source];
    if (!signal) continue;
    const d = PARAM_DEFS[b.target];
    out ??= { ...base };
    const delta = b.amount * signal * (d.max - d.min) * settings.intensity;
    out[b.target] = clampParam(b.target, out[b.target] + delta);
  }
  return out ?? base;
}

/** Desviación actual de cada parámetro modulado (para indicadores en la UI). */
export function modulationDeltas(base: VisualParams, effective: VisualParams): Partial<Record<NumericParamId, number>> {
  const out: Partial<Record<NumericParamId, number>> = {};
  for (const key of Object.keys(PARAM_DEFS) as NumericParamId[]) {
    if (PARAM_DEFS[key].kind !== 'number') continue;
    const d = (effective[key] as number) - (base[key] as number);
    if (Math.abs(d) > 1e-6) out[key] = d;
  }
  return out;
}

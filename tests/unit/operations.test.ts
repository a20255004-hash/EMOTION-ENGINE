import { describe, expect, it } from 'vitest';
import { applyOperations, mixHex } from '../../shared/operations';
import { worldPreset } from '../../shared/presets';
import { defaultAudioSettings } from '../../shared/schema';

const base = () => ({ world: 'ocean' as const, params: worldPreset('ocean'), bindings: [], audioSettings: defaultAudioSettings() });

describe('applyOperations', () => {
  it('recorta valores fuera de rango', () => {
    const r = applyOperations(base(), [{ op: 'setNumber', param: 'speed', value: 99 }]);
    expect(r.state.params.speed).toBe(3);
    expect(r.changes).toHaveLength(1);
  });

  it('rechaza operaciones fuera del esquema sin aplicar nada', () => {
    const r = applyOperations(base(), [{ op: 'eval', code: 'alert(1)' }, { op: 'setNumber', param: 'noExiste', value: 1 }, { op: 'setColor', param: 'primaryColor', value: 'red' }]);
    expect(r.rejected).toHaveLength(3);
    expect(r.changes).toHaveLength(0);
    expect(r.state.params).toEqual(base().params);
  });

  it('multiplica relativo y parte de un mínimo si el valor es 0', () => {
    const s = base();
    s.params.grain = 0;
    const r = applyOperations(s, [{ op: 'scaleNumber', param: 'grain', factor: 2 }, { op: 'scaleNumber', param: 'speed', factor: 0.5 }]);
    expect(r.state.params.grain).toBeGreaterThan(0);
    expect(r.state.params.speed).toBeCloseTo(0.4);
  });

  it('cambia de mundo cargando su preset y conservando la dinámica', () => {
    const s = base();
    s.params.speed = 2.2;
    const r = applyOperations(s, [{ op: 'setWorld', world: 'cosmos' }]);
    expect(r.state.world).toBe('cosmos');
    expect(r.state.params.primaryColor).toBe(worldPreset('cosmos').primaryColor);
    expect(r.state.params.speed).toBe(2.2);
  });

  it('crea, actualiza y elimina vinculaciones de audio', () => {
    let r = applyOperations(base(), [{ op: 'bindAudio', source: 'bass', target: 'scale', amount: 0.4 }]);
    expect(r.state.bindings).toHaveLength(1);
    r = applyOperations(r.state, [{ op: 'bindAudio', source: 'bass', target: 'scale', amount: 0.7 }]);
    expect(r.state.bindings).toHaveLength(1);
    expect(r.state.bindings[0].amount).toBe(0.7);
    r = applyOperations(r.state, [{ op: 'unbindAudio', target: null, source: null }]);
    expect(r.state.bindings).toHaveLength(0);
  });

  it('no permite vincular audio a parámetros no modulables', () => {
    const r = applyOperations(base(), [{ op: 'bindAudio', source: 'bass', target: 'lightAngle', amount: 0.4 }]);
    expect(r.rejected).toHaveLength(1);
  });

  it('aplica estados de ánimo con intensidad', () => {
    const r = applyOperations(base(), [{ op: 'applyMood', mood: 'mysterious', strength: 1 }]);
    expect(r.state.params.fogDensity).toBeGreaterThan(base().params.fogDensity);
    expect(r.state.params.lightIntensity).toBeLessThan(base().params.lightIntensity);
  });

  it('mezcla colores', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#ff0000', '#0000ff', 0)).toBe('#ff0000');
  });
});

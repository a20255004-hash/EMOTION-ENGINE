import { describe, expect, it } from 'vitest';
import { applyOperations } from '../../shared/operations';
import { worldPreset } from '../../shared/presets';
import { defaultAudioSettings } from '../../shared/schema';
import { interpretLocally } from '../../src/nlp/localInterpreter';

const state = () => ({ world: 'ocean' as const, params: worldPreset('ocean'), bindings: [], audioSettings: defaultAudioSettings() });
const run = (text: string) => {
  const i = interpretLocally(text, 'ocean');
  return { i, r: applyOperations(state(), i.operations) };
};

describe('intérprete local', () => {
  it('«haz el movimiento más lento» reduce la velocidad', () => {
    const { r, i } = run('haz el movimiento más lento');
    expect(r.state.params.speed).toBeLessThan(state().params.speed);
    expect(i.unmatched).toEqual([]);
  });

  it('«añade partículas doradas» cambia color y aumenta densidad', () => {
    const { r } = run('añade partículas doradas');
    expect(r.state.params.particleColor).toBe('#ffc24a');
    expect(r.state.params.particleDensity).toBeGreaterThan(state().params.particleDensity);
  });

  it('«crea una atmósfera más misteriosa» aplica el mood', () => {
    const { i, r } = run('crea una atmósfera más misteriosa');
    expect(i.operations.some((o) => o.op === 'applyMood' && o.mood === 'mysterious')).toBe(true);
    expect(r.state.params.fogDensity).toBeGreaterThan(state().params.fogDensity);
  });

  it('«haz que las formas reaccionen a los graves» crea una vinculación bass→scale', () => {
    const { r } = run('haz que las formas reaccionen a los graves');
    expect(r.state.bindings).toHaveLength(1);
    expect(r.state.bindings[0]).toMatchObject({ source: 'bass', target: 'scale', enabled: true });
  });

  it('entiende valores concretos y porcentajes', () => {
    expect(run('velocidad a 2').r.state.params.speed).toBe(2);
    expect(run('partículas al 80%').r.state.params.particleDensity).toBeCloseTo(0.8);
  });

  it('modificadores de intensidad', () => {
    const poco = run('un poco más rápido').r.state.params.speed;
    const mucho = run('mucho más rápido').r.state.params.speed;
    expect(mucho).toBeGreaterThan(poco);
  });

  it('varias cláusulas en una instrucción', () => {
    const { r } = run('luz roja, olas más altas y cámara en órbita');
    expect(r.state.params.lightColor).toBe('#ff3b3b');
    expect(r.state.params.waveAmplitude).toBeGreaterThan(state().params.waveAmplitude);
    expect(r.state.params.cameraMode).toBe('orbit');
  });

  it('cambia de mundo solo con verbo explícito', () => {
    expect(run('llévame al espacio').r.state.world).toBe('cosmos');
    expect(run('partículas como estrellas').i.operations.some((o) => o.op === 'setWorld')).toBe(false);
  });

  it('quita vinculaciones', () => {
    const i = interpretLocally('quita las reacciones al audio', 'ocean');
    expect(i.operations[0]).toMatchObject({ op: 'unbindAudio' });
  });

  it('declara lo que no entiende en vez de inventarlo', () => {
    const { i } = run('escribe un poema sobre mi gato');
    expect(i.operations).toHaveLength(0);
    expect(i.unmatched.length).toBeGreaterThan(0);
  });

  it('todas las operaciones producidas son válidas para el esquema', () => {
    const samples = ['más brillante y con menos niebla', 'paleta violeta', 'atmósfera épica', 'la luz al ritmo', 'restablece los valores', 'zoom', 'más grano y viñeta'];
    for (const s of samples) {
      const i = interpretLocally(s, 'cosmos');
      const r = applyOperations({ ...state(), world: 'cosmos', params: worldPreset('cosmos') }, i.operations);
      expect(r.rejected, s).toEqual([]);
    }
  });
});

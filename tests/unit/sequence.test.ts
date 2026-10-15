import { describe, expect, it } from 'vitest';
import { createScene } from '../../shared/projectFactory';
import { worldPreset } from '../../shared/presets';
import { applyConsistency, resolveAt, totalDuration } from '../../src/story/sequence';
import { STORY_TEMPLATES, scenesFromIdea, scenesFromPlan, scenesFromTemplate } from '../../src/story/templates';
import { StorySceneSchema } from '../../shared/schema';

const a = createScene('ocean', { duration: 10, transition: { type: 'cut', duration: 0 } });
const b = createScene('ocean', { duration: 10, params: { ...worldPreset('ocean'), speed: 2 }, transition: { type: 'morph', duration: 2 } });
const c = createScene('cosmos', { duration: 10, transition: { type: 'fade', duration: 2 } });

describe('secuencias', () => {
  it('calcula duración y escena activa', () => {
    expect(totalDuration([a, b, c])).toBe(30);
    expect(resolveAt([a, b, c], 5)!.index).toBe(0);
    expect(resolveAt([a, b, c], 25)!.index).toBe(2);
  });

  it('morph interpola parámetros dentro del mismo mundo', () => {
    const f = resolveAt([a, b, c], 11)!;
    expect(f.transition?.type).toBe('morph');
    expect(f.params.speed).toBeGreaterThan(a.params.speed);
    expect(f.params.speed).toBeLessThan(2);
  });

  it('fade cambia de mundo a mitad de la transición pasando por negro', () => {
    const before = resolveAt([a, b, c], 20.5)!;
    const after = resolveAt([a, b, c], 21.5)!;
    expect(before.world).toBe('ocean');
    expect(after.world).toBe('cosmos');
    expect(before.fade).toBeGreaterThan(0);
    expect(after.fade).toBeGreaterThan(0);
    expect(resolveAt([a, b, c], 23)!.fade).toBe(0);
  });

  it('bucle', () => {
    expect(resolveAt([a, b, c], 35, true)!.index).toBe(0);
  });

  it('consistencia copia los grupos bloqueados desde la escena 1', () => {
    const out = applyConsistency([a, c], ['palette', 'world']);
    expect(out[1].world).toBe('ocean');
    expect(out[1].params.primaryColor).toBe(a.params.primaryColor);
  });
});

describe('generación de escenas', () => {
  it('las plantillas producen escenas válidas', () => {
    for (const t of STORY_TEMPLATES) {
      const scenes = scenesFromTemplate(t.id);
      expect(scenes).toHaveLength(t.scenes.length);
      for (const s of scenes) expect(StorySceneSchema.safeParse(s).success).toBe(true);
    }
  });

  it('el generador local divide la idea y elige mundos', () => {
    const r = scenesFromIdea('Una noche serena en el mar. Luego viajamos al espacio entre estrellas misteriosas. Finalmente amanece sobre las montañas con niebla.', { totalDuration: 30, maxScenes: 6, fallbackWorld: 'ocean' });
    expect(r.scenes.map((s) => s.world)).toEqual(['ocean', 'cosmos', 'atmosphere']);
    expect(r.scenes[1].params.fogDensity).toBeGreaterThan(worldPreset('cosmos').fogDensity);
  });

  it('no inventa escenas sin contenido', () => {
    expect(scenesFromIdea('...', { totalDuration: 30, maxScenes: 6, fallbackWorld: 'ocean' }).scenes).toHaveLength(0);
  });

  it('convierte un guion de IA validado en escenas', () => {
    const scenes = scenesFromPlan({ title: 'x', scenes: [{ name: 'Uno', description: 'd', duration: 5, world: 'cosmos', mood: 'epic', transition: 'fade', operations: [{ op: 'setNumber', param: 'speed', value: 2 }] }] });
    expect(scenes[0].params.speed).toBe(2);
  });
});

describe('escenarios', () => {
  it('cada uno de los 10 escenarios tiene preset válido, nombre y sonido', async () => {
    const { WORLD_IDS } = await import('../../shared/params');
    const { WORLDS } = await import('../../shared/presets');
    const { VisualParamsSchema } = await import('../../shared/schema');
    expect(WORLD_IDS.length).toBeGreaterThanOrEqual(10);
    for (const w of WORLD_IDS) {
      expect(WORLDS[w].name.length).toBeGreaterThan(3);
      const p = worldPreset(w);
      expect(VisualParamsSchema.parse(p)).toEqual(p);
    }
  });
});

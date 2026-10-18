import type { Operation } from '../../shared/operations';
import { CAMERA_MODES, WORLD_IDS, type ColorParamId, type WorldId } from '../../shared/params';
import { MOOD_IDS, MOODS, PALETTES, WORLDS } from '../../shared/presets';

const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
const r = (a: number, b: number) => Math.round((a + Math.random() * (b - a)) * 100) / 100;

/**
 * «Sorpréndeme»: combina al azar un escenario, una atmósfera, a veces una
 * paleta y ajustes de movimiento. Todo son operaciones validadas, así que se
 * puede deshacer como cualquier otro cambio.
 */
export function surpriseOps(current: WorldId): { ops: Operation[]; summary: string } {
  const world = pick(WORLD_IDS.filter((w) => w !== current));
  const mood = pick(MOOD_IDS);
  const ops: Operation[] = [{ op: 'setWorld', world }, { op: 'applyMood', mood, strength: r(0.5, 0.9) }];
  let paletteLabel = '';
  if (Math.random() < 0.45) {
    const pal = pick(PALETTES);
    paletteLabel = `, paleta ${pal.label.toLowerCase()}`;
    for (const [k, v] of Object.entries(pal.colors)) ops.push({ op: 'setColor', param: k as ColorParamId, value: v });
  }
  ops.push(
    { op: 'scaleNumber', param: 'speed', factor: r(0.6, 1.5) },
    { op: 'scaleNumber', param: 'turbulence', factor: r(0.6, 1.6) },
    { op: 'scaleNumber', param: 'waveAmplitude', factor: r(0.7, 1.5) },
    { op: 'scaleNumber', param: 'particleDensity', factor: r(0.6, 1.6) },
    { op: 'setNumber', param: 'hueShift', value: Math.random() < 0.3 ? r(-40, 40) : 0 },
  );
  if (Math.random() < 0.4) ops.push({ op: 'setCameraMode', mode: pick(CAMERA_MODES.filter((m) => m !== 'static')) });
  return { ops, summary: `${WORLDS[world].name} con atmósfera ${MOODS[mood].label.toLowerCase()}${paletteLabel}` };
}

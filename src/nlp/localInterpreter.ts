/**
 * Intérprete local de lenguaje natural basado en reglas.
 *
 * Funciona sin red. Reconoce un vocabulario acotado en español (y lo básico en
 * inglés) y lo traduce a operaciones validadas del esquema compartido. Lo que no
 * reconoce lo devuelve en `unmatched` para que la interfaz lo explique en vez
 * de fingir que lo entendió.
 */
import type { Operation } from '../../shared/operations';
import { PARAM_DEFS, type NumericParamId, type ColorParamId, type CameraMode, type WorldId } from '../../shared/params';
import { MOODS, MOOD_IDS, WORLDS, worldPreset, type MoodId } from '../../shared/presets';
import type { AudioSource } from '../../shared/schema';

export interface Interpretation {
  operations: Operation[];
  notes: string[];
  unmatched: string[];
}

export const LOCAL_CAPABILITIES = [
  'Más / menos de: velocidad, ondas, turbulencia, escala, detalle, luz, exposición, partículas, niebla, profundidad, resplandor, saturación, viñeta, grano, cámara.',
  'Valores concretos: «velocidad a 2», «partículas al 80 %», «niebla al 10%».',
  'Colores por nombre: «partículas doradas», «luz roja», «cielo violeta», «acentos turquesa», «paleta fría».',
  'Atmósferas: serena, misteriosa, épica, melancólica, eufórica, onírica, amenazante, cálida, fría.',
  'Cámara: órbita, deriva, travesía, fija. Mundos: «cambia al océano / universo / paisaje».',
  'Audio: «que las formas reaccionen a los graves», «la luz al ritmo», «quita las reacciones al audio».',
];

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

interface ParamSynonym {
  param: NumericParamId;
  words: string[];
  label: string;
}

// El orden importa: lo más específico primero.
const PARAM_SYNONYMS: ParamSynonym[] = [
  { param: 'particleSize', words: ['tamano de las particulas', 'tamano de particulas', 'particulas mas grandes', 'particulas mas pequenas', 'particulas grandes', 'particulas pequenas', 'particle size'], label: 'tamaño de partículas' },
  { param: 'particleSpeed', words: ['velocidad de las particulas', 'velocidad de particulas', 'particulas mas rapidas', 'particulas mas lentas', 'particle speed'], label: 'velocidad de partículas' },
  { param: 'cameraSpeed', words: ['velocidad de camara', 'velocidad de la camara', 'camara mas rapida', 'camara mas lenta', 'camera speed'], label: 'velocidad de cámara' },
  { param: 'ambientIntensity', words: ['luz ambiente', 'luz ambiental', 'ambiente', 'relleno', 'ambient'], label: 'luz ambiente' },
  { param: 'fov', words: ['campo de vision', 'gran angular', 'angular', 'zoom', 'fov'], label: 'campo de visión' },
  { param: 'waveAmplitude', words: ['ola', 'onda', 'oleaje', 'pulsacion', 'wave'], label: 'ondas' },
  { param: 'turbulence', words: ['turbulen', 'caos', 'caotic', 'agitad', 'agitacion', 'distorsion', 'rugos', 'chaos'], label: 'turbulencia' },
  { param: 'complexity', words: ['complej', 'detalle', 'detallad', 'elementos', 'complex', 'detail'], label: 'complejidad' },
  { param: 'particleDensity', words: ['particula', 'polvo', 'chispa', 'luciernaga', 'plancton', 'estrellitas', 'particle', 'sparkle'], label: 'partículas' },
  { param: 'fogDensity', words: ['niebla', 'bruma', 'neblina', 'humo', 'fog', 'haze', 'mist'], label: 'niebla' },
  { param: 'depth', words: ['profundidad', 'lejan', 'distancia', 'horizonte', 'depth'], label: 'profundidad' },
  { param: 'intensity', words: ['resplandor', 'bloom', 'glow', 'brillo', 'intensidad visual', 'intensidad', 'neon', 'luminos', 'brillante'], label: 'resplandor' },
  { param: 'exposure', words: ['exposicion', 'claridad', 'exposure'], label: 'exposición' },
  { param: 'saturation', words: ['saturac', 'colores vivos', 'color vivo', 'vivido', 'saturat'], label: 'saturación' },
  { param: 'vignette', words: ['vineta', 'bordes oscuros', 'vignette'], label: 'viñeta' },
  { param: 'grain', words: ['grano', 'granulad', 'film', 'grain'], label: 'grano' },
  { param: 'chromatic', words: ['aberracion', 'cromatic', 'chromatic', 'glitch'], label: 'aberración' },
  { param: 'lightIntensity', words: ['luz', 'ilumin', 'luces', 'light'], label: 'luz' },
  { param: 'scale', words: ['escala', 'tamano', 'forma', 'nucleo', 'grande', 'pequen', 'enorme', 'diminut', 'scale', 'size'], label: 'escala' },
  { param: 'speed', words: ['velocidad', 'movimiento', 'animacion', 'ritmo visual', 'rapid', 'lent', 'veloz', 'speed', 'fast', 'slow', 'motion'], label: 'velocidad' },
];

const UP_WORDS = ['mas', 'aument', 'sube', 'subir', 'increment', 'mayor', 'intensific', 'potencia', 'agrega', 'anade', 'pon mas', 'more', 'increase', 'add', 'boost', 'higher', 'acelera'];
const DOWN_WORDS = ['menos', 'reduc', 'baja', 'bajar', 'disminu', 'menor', 'suaviza', 'quita', 'atenua', 'less', 'decrease', 'reduce', 'lower', 'remove', 'frena', 'ralentiza', 'calma'];

/** Adjetivos que implican una dirección para un parámetro concreto. */
const IMPLIED: { words: string[]; param: NumericParamId; dir: 1 | -1 }[] = [
  { words: ['lent', 'pausad', 'slow', 'ralentiz', 'frena'], param: 'speed', dir: -1 },
  { words: ['rapid', 'veloz', 'fast', 'acelera', 'frenetic', 'dinamic'], param: 'speed', dir: 1 },
  { words: ['grande', 'enorme', 'gigante', 'bigger', 'huge'], param: 'scale', dir: 1 },
  { words: ['pequen', 'diminut', 'smaller', 'tiny'], param: 'scale', dir: -1 },
  { words: ['brillante', 'luminos', 'brighter', 'bright'], param: 'lightIntensity', dir: 1 },
  { words: ['oscur', 'darker', 'tenue', 'dark'], param: 'lightIntensity', dir: -1 },
  { words: ['agitad', 'caotic', 'violent', 'tormentos', 'chaotic'], param: 'turbulence', dir: 1 },
  { words: ['tranquil', 'quiet', 'sereno', 'en calma', 'calmad', 'plano'], param: 'turbulence', dir: -1 },
  { words: ['denso', 'densa', 'espeso', 'espesa', 'dense', 'thick'], param: 'fogDensity', dir: 1 },
  { words: ['despejad', 'limpi', 'nitid', 'clear'], param: 'fogDensity', dir: -1 },
];

const COLOR_NAMES: { words: string[]; hex: string; label: string }[] = [
  { words: ['dorad', 'oro', 'gold'], hex: '#ffc24a', label: 'dorado' },
  { words: ['platead', 'plata', 'silver'], hex: '#d7dde6', label: 'plateado' },
  { words: ['rojo', 'roja', 'rojas', 'rojos', 'carmesi', 'red'], hex: '#ff3b3b', label: 'rojo' },
  { words: ['naranja', 'anaranjad', 'orange'], hex: '#ff8a2a', label: 'naranja' },
  { words: ['amarill', 'yellow'], hex: '#ffe14d', label: 'amarillo' },
  { words: ['verde esmeralda', 'esmeralda', 'emerald'], hex: '#22d39a', label: 'esmeralda' },
  { words: ['verde', 'green'], hex: '#4ee36b', label: 'verde' },
  { words: ['turquesa', 'cian', 'cyan', 'aqua', 'teal'], hex: '#38e8e0', label: 'turquesa' },
  { words: ['azul', 'blue'], hex: '#3a7bff', label: 'azul' },
  { words: ['indigo', 'anil'], hex: '#4b3bff', label: 'índigo' },
  { words: ['violeta', 'morad', 'purpura', 'lila', 'purple', 'violet'], hex: '#9b5bff', label: 'violeta' },
  { words: ['magenta', 'fucsia', 'fuchsia'], hex: '#ff3bd2', label: 'magenta' },
  { words: ['rosa', 'rosad', 'pink'], hex: '#ff8ccf', label: 'rosa' },
  { words: ['blanc', 'white'], hex: '#f4f7ff', label: 'blanco' },
  { words: ['negr', 'black'], hex: '#05060a', label: 'negro' },
  { words: ['gris', 'grey', 'gray'], hex: '#8a919e', label: 'gris' },
  { words: ['ambar', 'amber'], hex: '#ffb020', label: 'ámbar' },
  { words: ['cobre', 'copper'], hex: '#d9814a', label: 'cobre' },
];

const COLOR_TARGETS: { words: string[]; param: ColorParamId; label: string }[] = [
  { words: ['particula', 'polvo', 'chispa', 'luciernaga', 'plancton', 'particle'], param: 'particleColor', label: 'partículas' },
  { words: ['luz', 'ilumin', 'sol', 'luna', 'light'], param: 'lightColor', label: 'luz' },
  { words: ['cielo', 'fondo', 'niebla', 'sky', 'background'], param: 'backgroundColor', label: 'cielo/fondo' },
  { words: ['acento', 'brillo', 'detalle', 'borde', 'espuma', 'accent'], param: 'accentColor', label: 'acento' },
  { words: ['sombra', 'profund', 'shadow'], param: 'secondaryColor', label: 'color secundario' },
  { words: ['agua', 'mar', 'forma', 'nucleo', 'montana', 'principal', 'primario', 'water'], param: 'primaryColor', label: 'color primario' },
];

const AUDIO_TRIGGERS = ['reaccion', 'respond', 'al ritmo', 'ritmo de', 'con la musica', 'con el audio', 'sincroniz', 'pulse', 'pulsen', 'late', 'laten', 'baile', 'bailen', 'react', 'sync', 'segun la musica', 'siga', 'sigan'];
const AUDIO_SOURCES_WORDS: { words: string[]; source: AudioSource; label: string }[] = [
  { words: ['grave', 'bajo', 'bajos', 'bass', 'sub'], source: 'bass', label: 'graves' },
  { words: ['medios graves', 'medio-grave', 'low mid'], source: 'lowMid', label: 'medios-graves' },
  { words: ['medio', 'medios', 'voz', 'voces', 'mid'], source: 'mid', label: 'medios' },
  { words: ['agud', 'alto', 'altos', 'platillo', 'hi-hat', 'treble', 'high'], source: 'high', label: 'agudos' },
  { words: ['beat', 'golpe', 'pulso', 'bombo', 'ritmo', 'kick'], source: 'beat', label: 'pulso rítmico' },
  { words: ['volumen', 'intensidad del audio', 'volume', 'musica', 'sonido', 'audio'], source: 'volume', label: 'volumen' },
];
const AUDIO_DEFAULT_TARGET: Record<AudioSource, NumericParamId> = {
  bass: 'scale',
  lowMid: 'waveAmplitude',
  mid: 'turbulence',
  high: 'particleSize',
  beat: 'intensity',
  volume: 'lightIntensity',
};
const AUDIO_TARGET_WORDS: { words: string[]; param: NumericParamId }[] = [
  { words: ['forma', 'nucleo', 'escala', 'tamano', 'shape', 'scale'], param: 'scale' },
  { words: ['ola', 'onda', 'wave'], param: 'waveAmplitude' },
  { words: ['particula', 'polvo', 'particle'], param: 'particleDensity' },
  { words: ['luz', 'brillo', 'light'], param: 'lightIntensity' },
  { words: ['resplandor', 'glow', 'bloom'], param: 'intensity' },
  { words: ['color', 'tono', 'hue'], param: 'hueShift' },
  { words: ['camara', 'camera'], param: 'cameraSpeed' },
  { words: ['niebla', 'fog'], param: 'fogDensity' },
  { words: ['velocidad', 'movimiento', 'speed'], param: 'speed' },
  { words: ['turbulen', 'distors', 'caos'], param: 'turbulence' },
];

const CAMERA_WORDS: { words: string[]; mode: CameraMode; label: string }[] = [
  { words: ['orbita', 'orbitar', 'gira alrededor', 'girar alrededor', 'orbit'], mode: 'orbit', label: 'órbita' },
  { words: ['camara fija', 'camara quieta', 'camara estatica', 'deten la camara', 'para la camara', 'static camera'], mode: 'static', label: 'fija' },
  { words: ['deriva', 'flota la camara', 'camara flotante', 'drift'], mode: 'drift', label: 'deriva' },
  { words: ['travesia', 'vuela', 'volar', 'avanza', 'recorrido', 'fly'], mode: 'flythrough', label: 'travesía' },
];

const WORLD_VERBS = ['cambia', 'cambiar', 've a', 'ir a', 'llevame', 'lleva', 'muestra', 'pasa a', 'pasar a', 'transporta', 'switch', 'go to', 'usa el', 'usa la', 'quiero un', 'quiero una', 'quiero el', 'quiero la'];

interface Modifier {
  up: number;
  down: number;
  strength: number;
}
function modifier(text: string): Modifier {
  if (has(text, ['el doble', 'doble', 'twice', 'double'])) return { up: 2, down: 0.5, strength: 1 };
  if (has(text, ['la mitad', 'mitad', 'half'])) return { up: 1.5, down: 0.5, strength: 0.8 };
  if (has(text, ['muchisim', 'extremadamente', 'totalmente', 'radical', 'much more', 'way more'])) return { up: 2, down: 0.35, strength: 1 };
  if (has(text, ['mucho', 'mucha', 'bastante', 'muy', 'super', 'a lot', 'very', 'much'])) return { up: 1.6, down: 0.5, strength: 0.9 };
  if (has(text, ['un poco', 'ligeramente', 'levemente', 'algo ', 'un toque', 'apenas', 'sutil', 'slightly', 'a bit', 'a little'])) return { up: 1.15, down: 0.85, strength: 0.4 };
  return { up: 1.35, down: 0.7, strength: 0.7 };
}

const wordRe = (words: string[]) => new RegExp(`\\b(?:${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
const UP_RE = wordRe(UP_WORDS);
const DOWN_RE = wordRe(DOWN_WORDS);

function direction(text: string): 1 | -1 | 0 {
  const up = text.search(UP_RE);
  const down = text.search(DOWN_RE);
  if (up === -1 && down === -1) return 0;
  if (up === -1) return -1;
  if (down === -1) return 1;
  return down < up ? -1 : 1;
}

function findParam(text: string): ParamSynonym | undefined {
  return PARAM_SYNONYMS.find((s) => s.words.some((w) => text.includes(w)));
}

function explicitValue(text: string, param: NumericParamId): number | null {
  const m = text.match(/(?:\ba\b|\bal\b|\ben\b|=|\bto\b|\bat\b)\s*(-?\d+(?:[.,]\d+)?)\s*(%|por ciento)?/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const d = PARAM_DEFS[param];
  if (m[2]) return d.min + (d.max - d.min) * (n / 100);
  return n;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function splitClauses(text: string): string[] {
  return text
    .split(/[.;\n]|,(?!\d)|\by luego\b|\bluego\b|\bdespues\b|\bpero\b|\band then\b|\bthen\b|\by ademas\b|\badem[aá]s\b|\by\b(?=\s+(?:haz|pon|que|cambia|anade|agrega|sube|baja|quita|reduce|aumenta|crea|usa|vuelve|make|add))/)
    .map((c) => c.trim())
    .filter((c) => c.length > 1);
}

function interpretClause(clause: string, world: WorldId): { ops: Operation[]; notes: string[] } | null {
  const t = ` ${clause} `;
  const ops: Operation[] = [];
  const notes: string[] = [];
  const mod = modifier(t);

  // 1) Restablecer
  if (has(t, ['restablece', 'resetea', 'reinicia los parametros', 'valores por defecto', 'vuelve al original', 'reset'])) {
    const preset = worldPreset(world);
    for (const [k, def] of Object.entries(PARAM_DEFS)) {
      const v = preset[k as keyof typeof preset];
      if (def.kind === 'number') ops.push({ op: 'setNumber', param: k as NumericParamId, value: v as number });
      else if (def.kind === 'color') ops.push({ op: 'setColor', param: k as ColorParamId, value: v as string });
    }
    ops.push({ op: 'setCameraMode', mode: preset.cameraMode });
    notes.push(`Restablecidos los parámetros del preset de «${WORLDS[world].name}».`);
    return { ops, notes };
  }

  // 2) Audio
  const removeAudio = has(t, ['deja de reaccionar', 'dejen de reaccionar', 'sin reaccion', 'quita las reacciones', 'quita la reaccion', 'quita las vinculaciones', 'desvincula', 'no reaccion', 'stop reacting', 'unbind']);
  if (removeAudio) {
    const target = AUDIO_TARGET_WORDS.find((x) => x.words.some((w) => t.includes(w)))?.param ?? null;
    const src = AUDIO_SOURCES_WORDS.find((x) => x.words.some((w) => t.includes(w)) && x.source !== 'volume')?.source ?? null;
    ops.push({ op: 'unbindAudio', target, source: src });
    notes.push(target || src ? 'Eliminadas las vinculaciones de audio indicadas.' : 'Eliminadas todas las vinculaciones de audio.');
    return { ops, notes };
  }
  if (has(t, AUDIO_TRIGGERS)) {
    const sources = AUDIO_SOURCES_WORDS.filter((x) => x.words.some((w) => t.includes(w)));
    // "medios graves" no debe contar también como "medios" y "graves".
    let picked = sources.some((s) => s.source === 'lowMid') ? sources.filter((s) => s.source !== 'mid' && s.source !== 'bass') : sources;
    if (picked.length > 1) picked = picked.filter((s) => s.source !== 'volume');
    if (picked.length === 0) picked = [AUDIO_SOURCES_WORDS.find((s) => s.source === 'beat')!];
    const targets = AUDIO_TARGET_WORDS.filter((x) => x.words.some((w) => t.includes(w))).map((x) => x.param);
    const amount = Math.min(1, 0.45 * (mod.up / 1.35));
    for (const s of picked) {
      const tgts = targets.length ? targets : [AUDIO_DEFAULT_TARGET[s.source]];
      for (const target of tgts) {
        ops.push({ op: 'bindAudio', source: s.source, target, amount: Math.round(amount * 100) / 100 });
        notes.push(`${capitalize(PARAM_DEFS[target].label)} reaccionará a ${s.label} (activa una pista en Sound Lab para verlo).`);
      }
    }
    return { ops, notes };
  }

  // 3) Cambio de mundo (requiere verbo de cambio)
  if (has(t, WORLD_VERBS)) {
    const target = (Object.values(WORLDS) as (typeof WORLDS)[WorldId][]).find((w) => w.keywords.some((k) => t.includes(strip(k))));
    if (target) {
      ops.push({ op: 'setWorld', world: target.id });
      notes.push(`Cambio al mundo «${target.name}».`);
    }
  }

  // 4) Cámara
  if (has(t, ['camara', 'camera', 'orbita', 'travesia', 'vuela', 'deriva'])) {
    const cam = CAMERA_WORDS.find((c) => c.words.some((w) => t.includes(w)));
    if (cam) {
      ops.push({ op: 'setCameraMode', mode: cam.mode });
      notes.push(`Cámara en modo ${cam.label}.`);
    }
  }

  // 6) Estados de ánimo / atmósferas
  const moods = MOOD_IDS.filter((m) => MOODS[m].keywords.some((k) => t.includes(strip(k))));
  // "oscuro" solo es mood si no hay un parámetro explícito.
  for (const mood of moods) {
    const neg = direction(t) === -1 && has(t, ['menos']);
    if (neg) continue;
    ops.push({ op: 'applyMood', mood: mood as MoodId, strength: mod.strength });
    notes.push(`Atmósfera ${MOODS[mood].label.toLowerCase()} (intensidad ${Math.round(mod.strength * 100)} %).`);
  }
  if (has(t, ['amanecer', 'atardecer', 'puesta de sol', 'hora dorada', 'sunset', 'sunrise'])) {
    ops.push({ op: 'setNumber', param: 'lightElevation', value: 6 });
    notes.push('Sol bajo sobre el horizonte.');
  } else if (has(t, ['mediodia', 'pleno dia', 'noon'])) {
    ops.push({ op: 'setNumber', param: 'lightElevation', value: 65 });
    ops.push({ op: 'scaleNumber', param: 'lightIntensity', factor: 1.3 });
    notes.push('Sol alto, luz de mediodía.');
  } else if (has(t, ['noche', 'nocturn', 'night'])) {
    ops.push({ op: 'scaleNumber', param: 'lightIntensity', factor: 0.6 });
    ops.push({ op: 'setColor', param: 'backgroundColor', value: '#03050d' });
    notes.push('Ambiente nocturno.');
  }

  // 5) Colores
  const colorMatch = COLOR_NAMES.find((c) => c.words.some((w) => new RegExp(`\\b${w}`).test(t)));
  if (colorMatch) {
    const targets = COLOR_TARGETS.filter((ct) => ct.words.some((w) => t.includes(w)));
    if (targets.length) {
      for (const ct of targets) {
        ops.push({ op: 'setColor', param: ct.param, value: colorMatch.hex });
        notes.push(`${capitalize(ct.label)} en ${colorMatch.label}.`);
      }
    } else if (has(t, ['color', 'paleta', 'tono', 'tonos', 'tonalidad', 'palette'])) {
      ops.push({ op: 'setColor', param: 'accentColor', value: colorMatch.hex });
      ops.push({ op: 'setColor', param: 'primaryColor', value: colorMatch.hex });
      notes.push(`Paleta orientada al ${colorMatch.label}.`);
    }
    // "añade partículas doradas": añadir implica también más partículas.
    if (targets.some((x) => x.param === 'particleColor') && has(t, ['anade', 'agrega', 'pon ', 'mas particulas', 'add', 'incluye'])) {
      ops.push({ op: 'scaleNumber', param: 'particleDensity', factor: mod.up });
      notes.push('Más partículas visibles.');
    }
  }

  // 7) Parámetros numéricos
  const syn = findParam(t);
  const touchedByColorOrMood = ops.length > 0;
  if (syn) {
    const value = explicitValue(t, syn.param);
    if (value !== null) {
      ops.push({ op: 'setNumber', param: syn.param, value });
      notes.push(`${capitalize(syn.label)} fijado en ${Math.round(value * 100) / 100}.`);
    } else {
      let dir = direction(t);
      const implied = IMPLIED.find((i) => i.param === syn.param && i.words.some((w) => t.includes(w)));
      if (dir === 0 && implied) dir = implied.dir;
      if (implied && dir !== 0 && implied.dir !== dir && !has(t, ['menos', 'less'])) dir = implied.dir;
      if (implied && has(t, ['menos', 'less'])) dir = (-implied.dir) as 1 | -1;
      // Colores sin verbo ("partículas doradas") no implican cambiar cantidad.
      const colorOnly = colorMatch && syn.param === 'particleDensity' && dir === 0;
      if (dir !== 0 && !colorOnly && !(syn.param === 'particleDensity' && ops.some((o) => o.op === 'scaleNumber' && o.param === 'particleDensity'))) {
        if (syn.param === 'fov') {
          // "más zoom" = cerrar el campo de visión
          const zoomIn = t.includes('zoom') ? -dir : dir;
          ops.push({ op: 'shiftNumber', param: 'fov', delta: zoomIn * 12 * (mod.up / 1.35) });
        } else {
          ops.push({ op: 'scaleNumber', param: syn.param, factor: dir > 0 ? mod.up : mod.down });
        }
        notes.push(`${dir > 0 ? 'Más' : 'Menos'} ${syn.label}.`);
      }
    }
  } else if (!touchedByColorOrMood) {
    // Adjetivos sueltos: "más lento", "más grande", "más oscuro".
    const implied = IMPLIED.filter((i) => i.words.some((w) => t.includes(w)));
    for (const i of implied) {
      const negate = has(t, ['menos', 'less']);
      const dir = negate ? -i.dir : i.dir;
      ops.push({ op: 'scaleNumber', param: i.param, factor: dir > 0 ? mod.up : mod.down });
      notes.push(`${dir > 0 ? 'Más' : 'Menos'} ${PARAM_SYNONYMS.find((s) => s.param === i.param)?.label ?? i.param}.`);
    }
  }

  if (has(t, ['color', 'tono', 'hue']) && has(t, ['gira', 'rota', 'desplaza', 'cambia el tono', 'shift']) && !colorMatch) {
    ops.push({ op: 'shiftNumber', param: 'hueShift', delta: 40 * (mod.up / 1.35) });
    notes.push('Giro de tono global.');
  }

  return ops.length ? { ops, notes } : null;
}

export function interpretLocally(instruction: string, world: WorldId): Interpretation {
  const text = strip(instruction).replace(/[¡!¿?"«»]/g, ' ').replace(/\s+/g, ' ').trim();
  const operations: Operation[] = [];
  const notes: string[] = [];
  const unmatched: string[] = [];
  let currentWorld = world;
  for (const clause of splitClauses(text)) {
    const r = interpretClause(clause, currentWorld);
    if (r) {
      operations.push(...r.ops);
      notes.push(...r.notes);
      const sw = r.ops.find((o) => o.op === 'setWorld');
      if (sw && sw.op === 'setWorld') currentWorld = sw.world;
    } else {
      unmatched.push(clause);
    }
  }
  return { operations, notes, unmatched };
}

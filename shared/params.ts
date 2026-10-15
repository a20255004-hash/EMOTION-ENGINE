/**
 * Registro único de parámetros visuales.
 *
 * Es la fuente de verdad que comparten el motor, el panel de propiedades, el
 * intérprete de lenguaje natural, las vinculaciones de audio, la validación y
 * el contrato que se le entrega a un modelo de IA. Añadir un parámetro aquí lo
 * hace aparecer automáticamente en todos esos lugares.
 */

export const WORLD_IDS = ['ocean', 'cosmos', 'atmosphere'] as const;
export type WorldId = (typeof WORLD_IDS)[number];

export const CAMERA_MODES = ['orbit', 'drift', 'flythrough', 'static'] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];

export type ParamGroup =
  | 'motion'
  | 'form'
  | 'light'
  | 'color'
  | 'particles'
  | 'atmosphere'
  | 'camera'
  | 'post';

export const PARAM_GROUPS: { id: ParamGroup; label: string }[] = [
  { id: 'motion', label: 'Movimiento' },
  { id: 'form', label: 'Forma' },
  { id: 'light', label: 'Iluminación' },
  { id: 'color', label: 'Paleta' },
  { id: 'particles', label: 'Partículas' },
  { id: 'atmosphere', label: 'Atmósfera y profundidad' },
  { id: 'camera', label: 'Cámara' },
  { id: 'post', label: 'Intensidad visual' },
];

interface BaseDef {
  label: string;
  group: ParamGroup;
  description: string;
}
export interface NumberDef extends BaseDef {
  kind: 'number';
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
}
export interface ColorDef extends BaseDef {
  kind: 'color';
  default: string;
}
export interface EnumDef extends BaseDef {
  kind: 'enum';
  options: readonly { value: string; label: string }[];
  default: string;
}
export type ParamDef = NumberDef | ColorDef | EnumDef;

const num = (
  label: string,
  group: ParamGroup,
  min: number,
  max: number,
  step: number,
  def: number,
  description: string,
  unit?: string,
): NumberDef => ({ kind: 'number', label, group, min, max, step, default: def, description, unit });
const color = (label: string, group: ParamGroup, def: string, description: string): ColorDef => ({
  kind: 'color',
  label,
  group,
  default: def,
  description,
});

export const PARAM_DEFS = {
  // Movimiento
  speed: num('Velocidad', 'motion', 0, 3, 0.01, 1, 'Velocidad global de la animación'),
  turbulence: num('Turbulencia', 'motion', 0, 2, 0.01, 0.6, 'Agitación de olas, distorsión del núcleo o rugosidad del relieve'),
  waveAmplitude: num('Ondas', 'motion', 0, 2, 0.01, 0.8, 'Altura de las ondas y pulsaciones de la forma principal'),
  // Forma
  scale: num('Escala', 'form', 0.3, 3, 0.01, 1, 'Tamaño de la forma principal'),
  complexity: num('Complejidad', 'form', 0, 1, 0.01, 0.5, 'Nivel de detalle y número de elementos secundarios'),
  // Luz
  lightIntensity: num('Intensidad de luz', 'light', 0, 3, 0.01, 1.2, 'Potencia de la luz principal'),
  lightColor: color('Color de luz', 'light', '#ffe8c4', 'Color de la luz principal'),
  ambientIntensity: num('Luz ambiente', 'light', 0, 2, 0.01, 0.35, 'Luz de relleno general'),
  lightAngle: num('Azimut de luz', 'light', 0, 360, 1, 45, 'Dirección horizontal de la luz principal', '°'),
  lightElevation: num('Elevación de luz', 'light', 2, 90, 1, 22, 'Altura de la luz principal sobre el horizonte', '°'),
  // Paleta
  primaryColor: color('Color primario', 'color', '#1b6c8f', 'Color dominante de la forma principal'),
  secondaryColor: color('Color secundario', 'color', '#0b1e3a', 'Color de profundidad y sombras'),
  accentColor: color('Acento', 'color', '#7ef0ff', 'Color de brillos, bordes y detalles luminosos'),
  backgroundColor: color('Fondo / cielo', 'color', '#050913', 'Color del cielo y la niebla'),
  saturation: num('Saturación', 'color', 0, 2, 0.01, 1, 'Saturación de la imagen final'),
  hueShift: num('Giro de tono', 'color', -180, 180, 1, 0, 'Rotación global del tono', '°'),
  // Partículas
  particleDensity: num('Densidad', 'particles', 0, 1, 0.01, 0.5, 'Cantidad de partículas visibles'),
  particleSize: num('Tamaño', 'particles', 0.2, 3, 0.01, 1, 'Tamaño de cada partícula'),
  particleSpeed: num('Velocidad de partículas', 'particles', 0, 3, 0.01, 1, 'Velocidad de desplazamiento de las partículas'),
  particleColor: color('Color de partículas', 'particles', '#bfefff', 'Color de las partículas'),
  // Atmósfera
  fogDensity: num('Niebla', 'atmosphere', 0, 1, 0.01, 0.35, 'Densidad de la niebla atmosférica'),
  depth: num('Profundidad', 'atmosphere', 0.5, 2, 0.01, 1, 'Extensión del espacio visible y distancia de cámara'),
  // Cámara
  cameraMode: {
    kind: 'enum',
    label: 'Movimiento de cámara',
    group: 'camera',
    description: 'Comportamiento automático de la cámara',
    options: [
      { value: 'orbit', label: 'Órbita' },
      { value: 'drift', label: 'Deriva' },
      { value: 'flythrough', label: 'Travesía' },
      { value: 'static', label: 'Fija' },
    ],
    default: 'orbit',
  } satisfies EnumDef,
  cameraSpeed: num('Velocidad de cámara', 'camera', 0, 2, 0.01, 0.35, 'Velocidad del movimiento automático de cámara'),
  fov: num('Campo de visión', 'camera', 25, 100, 1, 55, 'Apertura del objetivo', '°'),
  // Post
  intensity: num('Intensidad visual', 'post', 0, 3, 0.01, 1, 'Fuerza del resplandor (bloom)'),
  glowRadius: num('Radio de resplandor', 'post', 0, 1, 0.01, 0.55, 'Amplitud del halo luminoso'),
  exposure: num('Exposición', 'post', 0.2, 3, 0.01, 1, 'Brillo general de la imagen'),
  vignette: num('Viñeta', 'post', 0, 1, 0.01, 0.35, 'Oscurecimiento de los bordes'),
  grain: num('Grano', 'post', 0, 1, 0.01, 0.12, 'Grano fílmico'),
  chromatic: num('Aberración', 'post', 0, 1, 0.01, 0.1, 'Aberración cromática en los bordes'),
} as const satisfies Record<string, ParamDef>;

export type ParamId = keyof typeof PARAM_DEFS;
export const PARAM_IDS = Object.keys(PARAM_DEFS) as ParamId[];

type DefsT = typeof PARAM_DEFS;
export type NumericParamId = { [K in ParamId]: DefsT[K]['kind'] extends 'number' ? K : never }[ParamId];
export type ColorParamId = { [K in ParamId]: DefsT[K]['kind'] extends 'color' ? K : never }[ParamId];

export const NUMERIC_PARAM_IDS = PARAM_IDS.filter((id) => PARAM_DEFS[id].kind === 'number') as NumericParamId[];
export const COLOR_PARAM_IDS = PARAM_IDS.filter((id) => PARAM_DEFS[id].kind === 'color') as ColorParamId[];

export type VisualParams = { [K in NumericParamId]: number } & { [K in ColorParamId]: string } & {
  cameraMode: CameraMode;
};

export function defaultParams(): VisualParams {
  const out: Record<string, unknown> = {};
  for (const id of PARAM_IDS) out[id] = PARAM_DEFS[id].default;
  return out as VisualParams;
}

export function isNumericParam(id: string): id is NumericParamId {
  return (NUMERIC_PARAM_IDS as string[]).includes(id);
}
export function isColorParam(id: string): id is ColorParamId {
  return (COLOR_PARAM_IDS as string[]).includes(id);
}
export function isParamId(id: string): id is ParamId {
  return id in PARAM_DEFS;
}

export function clampParam(id: NumericParamId, value: number): number {
  const d = PARAM_DEFS[id];
  if (!Number.isFinite(value)) return d.default;
  return Math.min(d.max, Math.max(d.min, value));
}

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Parámetros que pueden modularse con audio (numéricos, excluye ángulos y fov). */
export const AUDIO_TARGETS: NumericParamId[] = [
  'scale',
  'speed',
  'waveAmplitude',
  'turbulence',
  'lightIntensity',
  'exposure',
  'intensity',
  'particleDensity',
  'particleSize',
  'particleSpeed',
  'cameraSpeed',
  'fogDensity',
  'hueShift',
  'chromatic',
  'saturation',
  'complexity',
];

import { defaultParams, type VisualParams, type WorldId } from './params';

export interface WorldInfo {
  id: WorldId;
  name: string;
  tagline: string;
  description: string;
  /** Parámetros más expresivos de este mundo; el panel los destaca. */
  highlights: (keyof VisualParams)[];
  keywords: string[];
}

export const WORLDS: Record<WorldId, WorldInfo> = {
  ocean: {
    id: 'ocean',
    name: 'Océano onírico',
    tagline: 'Mar nocturno, bioluminiscencia y una luna imposible',
    description:
      'Una superficie oceánica calculada en GPU con oleaje superpuesto, reflejos de Fresnel, espuma luminosa y plancton bioluminiscente que flota sobre el agua.',
    highlights: ['waveAmplitude', 'turbulence', 'speed', 'accentColor', 'particleDensity', 'fogDensity'],
    keywords: ['mar', 'océano', 'oceano', 'agua', 'ola', 'olas', 'playa', 'marea', 'sumerg', 'ocean', 'sea', 'water', 'wave', 'luna', 'costa'],
  },
  cosmos: {
    id: 'cosmos',
    name: 'Universo abstracto',
    tagline: 'Un núcleo vivo orbitado por geometría y polvo estelar',
    description:
      'Un núcleo que se deforma con ruido 3D, anillos de poliedros instanciados en órbita y una galaxia espiral de partículas que gira alrededor.',
    highlights: ['scale', 'turbulence', 'complexity', 'intensity', 'particleDensity', 'hueShift'],
    keywords: ['espacio', 'estrella', 'estrellas', 'galaxia', 'universo', 'cosmos', 'cósmico', 'cosmico', 'planeta', 'órbita', 'orbita', 'nebulosa', 'space', 'star', 'galaxy', 'abstract', 'abstracto', 'geometr'],
  },
  atmosphere: {
    id: 'atmosphere',
    name: 'Paisaje atmosférico',
    tagline: 'Montañas, niebla viva y luz de hora dorada',
    description:
      'Un relieve generado proceduralmente con capas de montañas, cielo físico con sol, bancos de niebla animados y polvo suspendido en el aire.',
    highlights: ['lightElevation', 'lightAngle', 'fogDensity', 'turbulence', 'depth', 'particleDensity'],
    keywords: ['montaña', 'montana', 'montañas', 'valle', 'bosque', 'niebla', 'bruma', 'amanecer', 'atardecer', 'paisaje', 'cielo', 'tierra', 'desierto', 'colina', 'mountain', 'landscape', 'fog', 'sunset', 'sunrise'],
  },
};

const OCEAN: Partial<VisualParams> = {
  primaryColor: '#14607f',
  secondaryColor: '#03101f',
  accentColor: '#7ef0ff',
  backgroundColor: '#060b1c',
  lightColor: '#d9e6ff',
  particleColor: '#9ffcff',
  lightIntensity: 1.1,
  lightElevation: 17,
  lightAngle: 205,
  ambientIntensity: 0.3,
  waveAmplitude: 0.85,
  turbulence: 0.55,
  speed: 0.8,
  particleDensity: 0.45,
  particleSize: 0.9,
  fogDensity: 0.4,
  cameraMode: 'drift',
  cameraSpeed: 0.3,
  intensity: 1.1,
  fov: 55,
};

const COSMOS: Partial<VisualParams> = {
  primaryColor: '#5a2bd9',
  secondaryColor: '#0a0420',
  accentColor: '#ff5fd2',
  backgroundColor: '#030108',
  lightColor: '#ffd9f4',
  particleColor: '#c9b8ff',
  lightIntensity: 1.4,
  ambientIntensity: 0.25,
  waveAmplitude: 0.7,
  turbulence: 0.8,
  complexity: 0.6,
  speed: 1,
  scale: 1,
  particleDensity: 0.7,
  particleSize: 1,
  fogDensity: 0.15,
  cameraMode: 'orbit',
  cameraSpeed: 0.35,
  intensity: 1.35,
  glowRadius: 0.6,
  fov: 60,
};

const ATMOSPHERE: Partial<VisualParams> = {
  primaryColor: '#3d4f6b',
  secondaryColor: '#141b2b',
  accentColor: '#ffb36b',
  backgroundColor: '#e7a07a',
  lightColor: '#ffd2a1',
  particleColor: '#ffe2c2',
  lightIntensity: 1.3,
  ambientIntensity: 0.45,
  lightElevation: 7,
  lightAngle: 222,
  waveAmplitude: 0.5,
  turbulence: 0.7,
  complexity: 0.6,
  speed: 0.6,
  particleDensity: 0.4,
  particleSize: 0.8,
  fogDensity: 0.5,
  depth: 1.1,
  cameraMode: 'flythrough',
  cameraSpeed: 0.3,
  intensity: 0.7,
  fov: 50,
  vignette: 0.4,
};

const WORLD_PRESETS: Record<WorldId, Partial<VisualParams>> = {
  ocean: OCEAN,
  cosmos: COSMOS,
  atmosphere: ATMOSPHERE,
};

export function worldPreset(world: WorldId): VisualParams {
  return { ...defaultParams(), ...WORLD_PRESETS[world] };
}

export const MOOD_IDS = ['serene', 'mysterious', 'epic', 'melancholic', 'euphoric', 'dreamy', 'ominous', 'warm', 'cold'] as const;
export type MoodId = (typeof MOOD_IDS)[number];

export interface MoodInfo {
  id: MoodId;
  label: string;
  keywords: string[];
  /** Cambios absolutos (colores, enumerados). */
  set?: Partial<VisualParams>;
  /** Multiplicadores relativos sobre parámetros numéricos. */
  scale?: Partial<Record<keyof VisualParams, number>>;
}

export const MOODS: Record<MoodId, MoodInfo> = {
  serene: {
    id: 'serene',
    label: 'Serena',
    keywords: ['seren', 'calma', 'tranquil', 'paz', 'relaj', 'suave', 'calm', 'peaceful'],
    scale: { speed: 0.6, turbulence: 0.6, waveAmplitude: 0.7, cameraSpeed: 0.6, chromatic: 0.5, grain: 0.7 },
    set: { cameraMode: 'drift' },
  },
  mysterious: {
    id: 'mysterious',
    label: 'Misteriosa',
    keywords: ['misteri', 'enigm', 'oscur', 'sombr', 'secret', 'mystery', 'mysterious'],
    set: { accentColor: '#6f5bff', backgroundColor: '#04030c', lightColor: '#8f9bff', particleColor: '#9b8cff' },
    scale: { lightIntensity: 0.65, ambientIntensity: 0.6, exposure: 0.8, fogDensity: 1.6, speed: 0.75, saturation: 0.85, vignette: 1.5 },
  },
  epic: {
    id: 'epic',
    label: 'Épica',
    keywords: ['épic', 'epic', 'grandios', 'heroic', 'majest', 'poderos', 'intens'],
    scale: { scale: 1.3, intensity: 1.5, lightIntensity: 1.35, cameraSpeed: 1.4, turbulence: 1.3, waveAmplitude: 1.3, exposure: 1.1 },
    set: { cameraMode: 'orbit' },
  },
  melancholic: {
    id: 'melancholic',
    label: 'Melancólica',
    keywords: ['melanc', 'triste', 'nostalg', 'lluvi', 'gris', 'sad', 'nostalgic'],
    set: { accentColor: '#8fa7c4', lightColor: '#c3cede', particleColor: '#c9d6e8' },
    scale: { saturation: 0.55, speed: 0.6, lightIntensity: 0.8, fogDensity: 1.4, intensity: 0.7, grain: 1.6 },
  },
  euphoric: {
    id: 'euphoric',
    label: 'Eufórica',
    keywords: ['eufor', 'alegr', 'fiesta', 'energ', 'vibrant', 'feliz', 'happy', 'euphoric', 'vivo', 'viva'],
    set: { accentColor: '#ffe14d', particleColor: '#fff2a8' },
    scale: { speed: 1.5, saturation: 1.35, intensity: 1.4, particleDensity: 1.4, cameraSpeed: 1.5, exposure: 1.1 },
  },
  dreamy: {
    id: 'dreamy',
    label: 'Onírica',
    keywords: ['oníric', 'oniric', 'sueño', 'sueno', 'soñ', 'etére', 'etere', 'dream', 'flot'],
    set: { accentColor: '#ffb3f0', particleColor: '#ffe0fb' },
    scale: { glowRadius: 1.4, intensity: 1.25, speed: 0.75, fogDensity: 1.2, chromatic: 1.6, saturation: 1.1 },
  },
  ominous: {
    id: 'ominous',
    label: 'Amenazante',
    keywords: ['amenaz', 'terror', 'miedo', 'inquiet', 'tormenta', 'ominous', 'dark', 'tenebr', 'apocal'],
    set: { accentColor: '#ff3b2f', lightColor: '#ff8a70', backgroundColor: '#080202', particleColor: '#ff8a70' },
    scale: { turbulence: 1.6, lightIntensity: 0.7, exposure: 0.75, saturation: 0.8, vignette: 1.8, waveAmplitude: 1.4 },
  },
  warm: {
    id: 'warm',
    label: 'Cálida',
    keywords: ['cálid', 'calid', 'caliente', 'atardecer', 'hora dorada', 'warm', 'golden'],
    set: { lightColor: '#ffc27a', accentColor: '#ffb04a', particleColor: '#ffd79a' },
    scale: { lightIntensity: 1.15, saturation: 1.1 },
  },
  cold: {
    id: 'cold',
    label: 'Fría',
    keywords: ['frí', 'fri', 'hiel', 'invern', 'glacial', 'nieve', 'cold', 'ice', 'frozen'],
    set: { lightColor: '#bfe3ff', accentColor: '#9be7ff', particleColor: '#e8f7ff' },
    scale: { saturation: 0.8, speed: 0.85 },
  },
};

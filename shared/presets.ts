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
    keywords: ['montaña', 'montana', 'montañas', 'valle', 'cordillera', 'niebla', 'bruma', 'paisaje', 'colina', 'cumbre', 'mountain', 'landscape', 'valley'],
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora boreal',
    tagline: 'Hielo, nieve y cortinas de luz polar',
    description: 'Cortinas de aurora que ondulan sobre una llanura helada, cordilleras lejanas, cielo estrellado y nieve que cae lentamente.',
    highlights: ['waveAmplitude', 'turbulence', 'accentColor', 'primaryColor', 'intensity', 'particleDensity'],
    keywords: ['aurora', 'boreal', 'polar', 'hielo', 'helad', 'nieve', 'artico', 'ártico', 'glaciar', 'norte', 'snow', 'ice', 'northern lights'],
  },
  forest: {
    id: 'forest',
    name: 'Bosque bioluminiscente',
    tagline: 'Árboles antiguos, hongos que brillan y luciérnagas',
    description: 'Un bosque nocturno de coníferas con hongos que laten de luz, musgo luminoso, niebla baja y enjambres de luciérnagas.',
    highlights: ['complexity', 'particleDensity', 'accentColor', 'fogDensity', 'intensity', 'speed'],
    keywords: ['bosque', 'arbol', 'árbol', 'arboles', 'árboles', 'selva', 'jungla', 'hongo', 'seta', 'luciernaga', 'luciérnaga', 'forest', 'tree', 'woods', 'mushroom'],
  },
  neon: {
    id: 'neon',
    name: 'Ciudad neón',
    tagline: 'Horizonte synthwave, rejilla infinita y sol retro',
    description: 'Una rejilla de neón que avanza hacia el horizonte entre montañas de alambre, bajo un sol retro rayado y figuras geométricas flotantes.',
    highlights: ['speed', 'accentColor', 'primaryColor', 'waveAmplitude', 'intensity', 'complexity'],
    keywords: ['neon', 'neón', 'synthwave', 'retro', 'ochenta', '80', 'cyberpunk', 'ciudad', 'futurista', 'vaporwave', 'arcade', 'rejilla', 'grid', 'city'],
  },
  desert: {
    id: 'desert',
    name: 'Dunas del desierto',
    tagline: 'Mar de arena bajo un sol gigante',
    description: 'Dunas onduladas esculpidas por el viento, arena que vuela, columnas de roca erosionada y un sol enorme sobre la calima.',
    highlights: ['waveAmplitude', 'lightElevation', 'lightAngle', 'turbulence', 'particleDensity', 'fogDensity'],
    keywords: ['desierto', 'duna', 'dunas', 'arena', 'sahara', 'oasis', 'arido', 'árido', 'desert', 'sand', 'dune'],
  },
  abyss: {
    id: 'abyss',
    name: 'Abismo submarino',
    tagline: 'Medusas, rayos de luz y burbujas en la profundidad',
    description: 'El fondo del mar con cáusticas de luz, algas que se mecen, haces que bajan desde la superficie, medusas luminosas y burbujas.',
    highlights: ['complexity', 'accentColor', 'fogDensity', 'speed', 'particleDensity', 'lightIntensity'],
    keywords: ['abismo', 'submarino', 'fondo del mar', 'profundidad', 'medusa', 'medusas', 'arrecife', 'alga', 'algas', 'burbuja', 'underwater', 'deep sea', 'jellyfish', 'bajo el agua'],
  },
  crystal: {
    id: 'crystal',
    name: 'Caverna de cristal',
    tagline: 'Geodas luminosas que refractan la luz',
    description: 'Una cueva de roca con vetas brillantes y racimos de cristales facetados alrededor de un gran cristal flotante que gira.',
    highlights: ['scale', 'complexity', 'accentColor', 'primaryColor', 'intensity', 'hueShift'],
    keywords: ['cristal', 'cristales', 'cueva', 'caverna', 'gema', 'gemas', 'geoda', 'cuarzo', 'diamante', 'mina', 'crystal', 'cave', 'gem'],
  },
  vortex: {
    id: 'vortex',
    name: 'Vórtice cuántico',
    tagline: 'Un túnel infinito de energía y geometría',
    description: 'Un túnel que gira y se retuerce mientras anillos y estelas de luz pasan a toda velocidad hacia un punto de fuga brillante.',
    highlights: ['speed', 'turbulence', 'waveAmplitude', 'hueShift', 'intensity', 'complexity'],
    keywords: ['vortice', 'vórtice', 'tunel', 'túnel', 'portal', 'hiperespacio', 'warp', 'agujero', 'remolino', 'cuantico', 'cuántico', 'tunnel', 'vortex', 'wormhole'],
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

const AURORA: Partial<VisualParams> = {
  primaryColor: '#3dffb0',
  secondaryColor: '#0a1830',
  accentColor: '#b56bff',
  backgroundColor: '#040814',
  lightColor: '#cfe4ff',
  particleColor: '#ffffff',
  lightIntensity: 0.9,
  ambientIntensity: 0.35,
  lightElevation: 12,
  lightAngle: 60,
  waveAmplitude: 0.9,
  turbulence: 0.6,
  speed: 0.6,
  particleDensity: 0.45,
  particleSize: 0.8,
  fogDensity: 0.25,
  cameraMode: 'orbit',
  cameraSpeed: 0.18,
  intensity: 1.2,
  fov: 62,
};

const FOREST: Partial<VisualParams> = {
  primaryColor: '#1d3b2e',
  secondaryColor: '#060d0c',
  accentColor: '#5dffcf',
  backgroundColor: '#07121a',
  lightColor: '#a9c8ff',
  particleColor: '#d8ff7a',
  lightIntensity: 0.8,
  ambientIntensity: 0.3,
  lightElevation: 35,
  lightAngle: 120,
  complexity: 0.6,
  speed: 0.7,
  particleDensity: 0.4,
  particleSize: 0.9,
  fogDensity: 0.45,
  cameraMode: 'drift',
  cameraSpeed: 0.25,
  intensity: 1.2,
  fov: 58,
};

const NEON: Partial<VisualParams> = {
  primaryColor: '#ff2bd6',
  secondaryColor: '#10022a',
  accentColor: '#20f6ff',
  backgroundColor: '#14002e',
  lightColor: '#ffcf4d',
  particleColor: '#ff9df2',
  lightIntensity: 1.3,
  ambientIntensity: 0.3,
  waveAmplitude: 0.8,
  turbulence: 0.4,
  speed: 1,
  complexity: 0.5,
  particleDensity: 0.35,
  fogDensity: 0.3,
  cameraMode: 'drift',
  cameraSpeed: 0.2,
  intensity: 1.4,
  glowRadius: 0.5,
  fov: 60,
  vignette: 0.45,
  grain: 0.18,
  chromatic: 0.25,
};

const DESERT: Partial<VisualParams> = {
  primaryColor: '#d99a5b',
  secondaryColor: '#6b3a22',
  accentColor: '#ffd38a',
  backgroundColor: '#f2b37a',
  lightColor: '#fff0d0',
  particleColor: '#ffe0b0',
  lightIntensity: 1.4,
  ambientIntensity: 0.4,
  lightElevation: 14,
  lightAngle: 200,
  waveAmplitude: 0.7,
  turbulence: 0.5,
  speed: 0.7,
  particleDensity: 0.4,
  particleSize: 0.7,
  fogDensity: 0.35,
  cameraMode: 'flythrough',
  cameraSpeed: 0.25,
  intensity: 0.6,
  fov: 52,
};

const ABYSS: Partial<VisualParams> = {
  primaryColor: '#0d4a63',
  secondaryColor: '#02121c',
  accentColor: '#ff7ae0',
  backgroundColor: '#021826',
  lightColor: '#8fe8ff',
  particleColor: '#cdf6ff',
  lightIntensity: 1,
  ambientIntensity: 0.4,
  lightElevation: 80,
  complexity: 0.55,
  speed: 0.6,
  particleDensity: 0.5,
  particleSize: 1.1,
  fogDensity: 0.55,
  cameraMode: 'drift',
  cameraSpeed: 0.2,
  intensity: 1.2,
  fov: 60,
};

const CRYSTAL: Partial<VisualParams> = {
  primaryColor: '#6a4cff',
  secondaryColor: '#0b0718',
  accentColor: '#4dfff3',
  backgroundColor: '#05030c',
  lightColor: '#ffe6ff',
  particleColor: '#d9c9ff',
  lightIntensity: 1.3,
  ambientIntensity: 0.3,
  scale: 1,
  complexity: 0.6,
  speed: 0.6,
  particleDensity: 0.4,
  fogDensity: 0.3,
  cameraMode: 'orbit',
  cameraSpeed: 0.25,
  intensity: 1.3,
  fov: 60,
};

const VORTEX: Partial<VisualParams> = {
  primaryColor: '#3a2bff',
  secondaryColor: '#05021a',
  accentColor: '#ff4fd8',
  backgroundColor: '#020008',
  lightColor: '#ffffff',
  particleColor: '#bdf3ff',
  lightIntensity: 1.2,
  waveAmplitude: 0.6,
  turbulence: 0.7,
  speed: 1,
  complexity: 0.5,
  particleDensity: 0.6,
  fogDensity: 0.3,
  cameraMode: 'orbit',
  cameraSpeed: 0.3,
  intensity: 1.5,
  fov: 75,
  chromatic: 0.3,
};

const WORLD_PRESETS: Record<WorldId, Partial<VisualParams>> = {
  aurora: AURORA,
  forest: FOREST,
  neon: NEON,
  desert: DESERT,
  abyss: ABYSS,
  crystal: CRYSTAL,
  vortex: VORTEX,
  ocean: OCEAN,
  cosmos: COSMOS,
  atmosphere: ATMOSPHERE,
};

export function worldPreset(world: WorldId): VisualParams {
  return { ...defaultParams(), ...WORLD_PRESETS[world] };
}

export const MOOD_IDS = ['serene', 'mysterious', 'epic', 'melancholic', 'euphoric', 'dreamy', 'ominous', 'warm', 'cold', 'romantic', 'futuristic', 'psychedelic', 'minimal', 'chaotic'] as const;
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
  romantic: {
    id: 'romantic',
    label: 'Romántica',
    keywords: ['romant', 'amor', 'tierna', 'tierno', 'dulce', 'love', 'romantic'],
    set: { accentColor: '#ff7aa8', lightColor: '#ffc2d4', particleColor: '#ffd1e3' },
    scale: { speed: 0.7, glowRadius: 1.3, intensity: 1.15, saturation: 1.05, chromatic: 0.6 },
  },
  futuristic: {
    id: 'futuristic',
    label: 'Futurista',
    keywords: ['futur', 'tecnolog', 'ciber', 'digital', 'sci-fi', 'scifi', 'futuristic'],
    set: { accentColor: '#20f6ff', lightColor: '#d4f7ff', particleColor: '#9ef8ff' },
    scale: { intensity: 1.3, chromatic: 1.6, saturation: 1.15, speed: 1.15, grain: 0.6 },
  },
  psychedelic: {
    id: 'psychedelic',
    label: 'Psicodélica',
    keywords: ['psicodel', 'alucin', 'lisergic', 'trippy', 'psychedelic', 'kaleido'],
    set: { accentColor: '#ff3bd2', particleColor: '#fff36b' },
    scale: { saturation: 1.6, chromatic: 2.5, turbulence: 1.6, speed: 1.3, intensity: 1.4 },
  },
  minimal: {
    id: 'minimal',
    label: 'Minimalista',
    keywords: ['minimal', 'simple', 'sencill', 'limpi', 'sobrio', 'clean'],
    scale: { particleDensity: 0.4, complexity: 0.5, turbulence: 0.5, grain: 0.3, chromatic: 0.2, saturation: 0.75, intensity: 0.8 },
  },
  chaotic: {
    id: 'chaotic',
    label: 'Caótica',
    keywords: ['caos', 'caotic', 'locura', 'loco', 'frenetic', 'chaotic', 'descontrol'],
    scale: { turbulence: 2, speed: 1.8, cameraSpeed: 1.8, waveAmplitude: 1.6, particleSpeed: 1.8, chromatic: 1.8 },
    set: { cameraMode: 'orbit' },
  },
};

/** Paletas con nombre: cada una fija los seis colores de la escena. */
export interface PaletteInfo {
  id: string;
  label: string;
  keywords: string[];
  colors: Pick<VisualParams, 'primaryColor' | 'secondaryColor' | 'accentColor' | 'backgroundColor' | 'lightColor' | 'particleColor'>;
}

export const PALETTES: PaletteInfo[] = [
  { id: 'sunset', label: 'Atardecer', keywords: ['paleta atardecer', 'colores de atardecer', 'tonos de atardecer', 'paleta sunset'], colors: { primaryColor: '#ff7a59', secondaryColor: '#2a0f2e', accentColor: '#ffcf6b', backgroundColor: '#5b1d3c', lightColor: '#ffd2a0', particleColor: '#ffe0b8' } },
  { id: 'neon', label: 'Neón', keywords: ['paleta neon', 'colores neon', 'tonos neon', 'colores fluor', 'fluorescente'], colors: { primaryColor: '#ff2bd6', secondaryColor: '#10022a', accentColor: '#20f6ff', backgroundColor: '#14002e', lightColor: '#ffcf4d', particleColor: '#ff9df2' } },
  { id: 'pastel', label: 'Pastel', keywords: ['pastel', 'colores suaves', 'tonos suaves'], colors: { primaryColor: '#a8d8ff', secondaryColor: '#4b4a6b', accentColor: '#ffb3d9', backgroundColor: '#c9c3f0', lightColor: '#fff4e0', particleColor: '#fff0fa' } },
  { id: 'mono', label: 'Monocromo', keywords: ['monocrom', 'blanco y negro', 'escala de grises', 'black and white'], colors: { primaryColor: '#8a8f99', secondaryColor: '#0c0d10', accentColor: '#f2f4f8', backgroundColor: '#050608', lightColor: '#ffffff', particleColor: '#e6e8ee' } },
  { id: 'fire', label: 'Fuego', keywords: ['fuego', 'llamas', 'lava', 'volcan', 'volcán', 'infierno', 'fire'], colors: { primaryColor: '#ff4b1f', secondaryColor: '#1a0300', accentColor: '#ffb21f', backgroundColor: '#2a0500', lightColor: '#ffb070', particleColor: '#ffd27a' } },
  { id: 'ice', label: 'Hielo', keywords: ['paleta hielo', 'colores de hielo', 'tonos glaciares', 'escarcha'], colors: { primaryColor: '#7fd6ff', secondaryColor: '#08192b', accentColor: '#e0fbff', backgroundColor: '#0b2238', lightColor: '#dff3ff', particleColor: '#ffffff' } },
  { id: 'jungle', label: 'Selva', keywords: ['paleta selva', 'colores de selva', 'tonos verdes', 'paleta verde'], colors: { primaryColor: '#2f9e5a', secondaryColor: '#062014', accentColor: '#c6ff4d', backgroundColor: '#0c2a1c', lightColor: '#eaffc2', particleColor: '#e2ff9e' } },
  { id: 'ocean', label: 'Océano', keywords: ['paleta oceano', 'paleta océano', 'tonos marinos', 'colores del mar'], colors: { primaryColor: '#14607f', secondaryColor: '#03101f', accentColor: '#7ef0ff', backgroundColor: '#060b1c', lightColor: '#d9e6ff', particleColor: '#9ffcff' } },
  { id: 'gold', label: 'Oro', keywords: ['paleta dorada', 'todo dorado', 'oro y negro', 'lujo', 'lujoso'], colors: { primaryColor: '#c9962e', secondaryColor: '#120c03', accentColor: '#ffe29a', backgroundColor: '#1c1405', lightColor: '#fff0c8', particleColor: '#ffd36b' } },
  { id: 'vapor', label: 'Vaporwave', keywords: ['vaporwave', 'vapor', 'aesthetic'], colors: { primaryColor: '#ff71ce', secondaryColor: '#1d0b3a', accentColor: '#01cdfe', backgroundColor: '#2d1b69', lightColor: '#fffb96', particleColor: '#b967ff' } },
];

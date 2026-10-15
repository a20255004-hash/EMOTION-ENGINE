/**
 * Órdenes de aplicación en lenguaje natural: además de cambiar la escena, el
 * editor puede controlar la plataforma (pausar, capturar, sonido, secuencias,
 * navegación…). El intérprete solo devuelve la orden; la interfaz la ejecuta.
 */
import type { Mode } from '../state/uiStore';

export type AppCommand =
  | { kind: 'pause' }
  | { kind: 'play' }
  | { kind: 'reset' }
  | { kind: 'capture' }
  | { kind: 'fullscreen' }
  | { kind: 'ambience'; on: boolean }
  | { kind: 'volume'; delta: number }
  | { kind: 'surprise' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'storyPlay' }
  | { kind: 'storyStop' }
  | { kind: 'demoTrack' }
  | { kind: 'saveVersion' }
  | { kind: 'open'; mode: Mode }
  | { kind: 'help' };

interface Rule {
  re: RegExp;
  cmd: AppCommand;
  label: string;
}

// El texto llega ya en minúsculas y sin tildes.
const RULES: Rule[] = [
  { re: /\b(ayuda|que puedes hacer|que (sabes|puedo) hacer|que entiendes|comandos|help)\b/, cmd: { kind: 'help' }, label: 'Mostrar la ayuda' },
  { re: /\b(sorprendeme|sorpresa|al azar|aleatori[oa]|random|improvisa|algo nuevo|lo que quieras)\b/, cmd: { kind: 'surprise' }, label: 'Escena sorpresa' },
  { re: /\b(rehaz|rehacer|redo)\b/, cmd: { kind: 'redo' }, label: 'Rehacer' },
  { re: /\b(deshaz|deshacer|undo|vuelve atras)\b/, cmd: { kind: 'undo' }, label: 'Deshacer' },
  { re: /\b(reproduce|empieza|inicia|play|ver|mira)\b.*\b(historia|secuencia|story)\b/, cmd: { kind: 'storyPlay' }, label: 'Reproducir la secuencia' },
  { re: /\b(para|deten|detener|termina)\b.*\b(historia|secuencia|story)\b/, cmd: { kind: 'storyStop' }, label: 'Detener la secuencia' },
  { re: /\b(guarda|guardar|crea)\b.*\bversion\b/, cmd: { kind: 'saveVersion' }, label: 'Guardar una versión' },
  { re: /\b(pon|reproduce|toca|quiero)\b.*\b(musica|cancion|pista de demostracion|pista demo|ritmo de prueba)\b/, cmd: { kind: 'demoTrack' }, label: 'Reproducir la pista de demostración' },
  { re: /\b(silencio|silencia|mute|mutea|apaga|quita|sin|desactiva)\b.*\b(sonido|ambiente)\b|^(silencio|mute)$/, cmd: { kind: 'ambience', on: false }, label: 'Apagar el sonido ambiente' },
  { re: /\b(activa|enciende|pon|quiero|activar)\b.*\b(sonido|ambiente|ambientacion)\b|\bsonido ambiente\b/, cmd: { kind: 'ambience', on: true }, label: 'Activar el sonido ambiente' },
  { re: /\b(sube|subir|mas)\b.*\bvolumen\b/, cmd: { kind: 'volume', delta: 0.15 }, label: 'Subir el volumen' },
  { re: /\b(baja|bajar|menos)\b.*\bvolumen\b/, cmd: { kind: 'volume', delta: -0.15 }, label: 'Bajar el volumen' },
  { re: /\b(pantalla completa|fullscreen|maximiza)\b/, cmd: { kind: 'fullscreen' }, label: 'Pantalla completa' },
  { re: /\b(captura|capturar|haz una foto|toma una foto|saca una foto|foto|screenshot)\b/, cmd: { kind: 'capture' }, label: 'Capturar imagen' },
  { re: /\b(reinicia|reiniciar|reset|desde el principio)\b(?!.*\b(parametros|valores|ajustes)\b)/, cmd: { kind: 'reset' }, label: 'Reiniciar animación y cámara' },
  { re: /\b(pausa|pausar|congela|congelar|deten la animacion|para la animacion|pon en pausa)\b/, cmd: { kind: 'pause' }, label: 'Pausar' },
  { re: /\b(reanuda|reanudar|continua|quita la pausa|sigue la animacion|play)\b/, cmd: { kind: 'play' }, label: 'Reanudar' },
  { re: /\b(abre|ve a|ir a|llevame a|muestra|abrir)\b.*\b(sound ?lab|laboratorio de sonido|panel de sonido)\b/, cmd: { kind: 'open', mode: 'sound' }, label: 'Abrir Sound Lab' },
  { re: /\b(abre|ve a|ir a|muestra|abrir)\b.*\b(story|historias?|secuencias?|escenas)\b/, cmd: { kind: 'open', mode: 'story' }, label: 'Abrir Story' },
  { re: /\b(abre|ve a|ir a|muestra|abrir)\b.*\b(export|exportar|exportacion)\b/, cmd: { kind: 'open', mode: 'export' }, label: 'Abrir Export' },
  { re: /\b(abre|ve a|ir a|muestra|abrir)\b.*\b(biblioteca|proyectos)\b/, cmd: { kind: 'open', mode: 'library' }, label: 'Abrir la biblioteca' },
];

export function detectCommands(clause: string): { commands: AppCommand[]; labels: string[] } {
  const commands: AppCommand[] = [];
  const labels: string[] = [];
  for (const r of RULES) {
    if (r.re.test(clause)) {
      commands.push(r.cmd);
      labels.push(r.label);
      // Una cláusula = una orden: evita que «reproduce la historia» dispare también «play».
      break;
    }
  }
  return { commands, labels };
}

export const COMMAND_EXAMPLES = [
  'sorpréndeme',
  'pausa',
  'haz una captura',
  'pantalla completa',
  'activa el sonido ambiente',
  'pon música',
  'reproduce la historia',
  'abre sound lab',
  'guarda una versión',
  'deshaz',
];

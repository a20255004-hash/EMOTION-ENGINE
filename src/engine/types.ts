import type * as THREE from 'three';
import type { VisualParams, WorldId } from '../../shared/params';

/** Señales de audio normalizadas 0..1 que produce el analizador cada fotograma. */
export interface AudioFrame {
  bass: number;
  lowMid: number;
  mid: number;
  high: number;
  volume: number;
  beat: number;
}

export const SILENT_FRAME: AudioFrame = { bass: 0, lowMid: 0, mid: 0, high: 0, volume: 0, beat: 0 };

export interface CameraFraming {
  target: THREE.Vector3;
  /** Distancia base de la cámara al objetivo con depth = 1. */
  distance: number;
  /** Altura mínima de cámara (para no atravesar el suelo/agua). */
  minY: number;
  /** Altura base. */
  height: number;
  /** Para el modo travesía: posición y punto de mira según el avance. */
  fly?: (progress: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }) => void;
}

export interface World {
  readonly id: WorldId;
  readonly scene: THREE.Scene;
  readonly framing: CameraFraming;
  /** Avanza la simulación; `time` es tiempo de animación (ya escalado por velocidad). */
  update(dt: number, time: number, params: VisualParams, camera: THREE.PerspectiveCamera): void;
  dispose(): void;
}

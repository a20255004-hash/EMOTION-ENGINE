import * as THREE from 'three';
import type { VisualParams } from '../../../shared/params';
import { lightDirection } from '../SkyDome';

/** Colores de la escena convertidos una vez por fotograma. */
export class Palette {
  primary = new THREE.Color();
  secondary = new THREE.Color();
  accent = new THREE.Color();
  bg = new THREE.Color();
  light = new THREE.Color();
  particle = new THREE.Color();
  lightDir = new THREE.Vector3();

  update(p: VisualParams) {
    this.primary.set(p.primaryColor);
    this.secondary.set(p.secondaryColor);
    this.accent.set(p.accentColor);
    this.bg.set(p.backgroundColor);
    this.light.set(p.lightColor);
    this.particle.set(p.particleColor);
    lightDirection(p.lightAngle, p.lightElevation, this.lightDir);
    return this;
  }
}

/** Reubica una coordenada fija dentro de una ventana que sigue a la cámara (mundo infinito). */
export function wrapAround(value: number, center: number, size: number) {
  return center + THREE.MathUtils.euclideanModulo(value - center + size / 2, size) - size / 2;
}

/** Generador pseudoaleatorio determinista para colocar elementos siempre igual. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    s ^= s >>> 13;
    return (s >>> 0) / 4294967296;
  };
}

export const setColor = (u: THREE.IUniform, c: THREE.Color) => (u.value as THREE.Color).copy(c);

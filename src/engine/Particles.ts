import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';

export interface ParticleOptions {
  max: number;
  /** Rellena la posición inicial y un vector aleatorio por partícula. */
  seed: (i: number, pos: THREE.Vector3, rand: THREE.Vector4) => void;
  /**
   * GLSL que calcula `vec3 p` a partir de `position`, `aRand`, `uTime`, `uSpeed`.
   * Puede usar `snoise` y `fbm`.
   */
  motion: string;
  baseSize: number;
  /** Mezcla aditiva para brillo; normal para polvo opaco. */
  additive?: boolean;
}

/**
 * Sistema de partículas en GPU. Se reserva el máximo una sola vez y la densidad
 * se controla con `drawRange`, así los cambios son instantáneos.
 */
export class Particles {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private readonly max: number;

  constructor(opts: ParticleOptions) {
    this.max = opts.max;
    const positions = new Float32Array(opts.max * 3);
    const rands = new Float32Array(opts.max * 4);
    const v = new THREE.Vector3();
    const r = new THREE.Vector4();
    for (let i = 0; i < opts.max; i++) {
      opts.seed(i, v, r);
      positions.set([v.x, v.y, v.z], i * 3);
      rands.set([r.x, r.y, r.z, r.w], i * 4);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aRand', new THREE.BufferAttribute(rands, 4));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 1 },
        uSize: { value: opts.baseSize },
        uScale: { value: 1 },
        uColor: { value: new THREE.Color('#ffffff') },
        uAccent: { value: new THREE.Color('#ffffff') },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uOpacity: { value: 1 },
        uFogDensity: { value: 0 },
        uFogColor: { value: new THREE.Color('#000000') },
        uCenter: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uSpeed; uniform float uSize; uniform float uScale; uniform float uPixelRatio; uniform vec3 uCenter;
        attribute vec4 aRand;
        varying float vTwinkle; varying float vDepth; varying float vMix;
        ${NOISE_GLSL}
        void main(){
          vec3 p = position;
          ${opts.motion}
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vDepth = -mv.z;
          vTwinkle = 0.55 + 0.45 * sin(uTime * (1.5 + aRand.y * 3.0) + aRand.x * 40.0);
          vMix = aRand.z;
          gl_PointSize = uSize * uScale * (0.5 + aRand.w) * uPixelRatio * (120.0 / max(vDepth, 0.5));
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform vec3 uAccent; uniform float uOpacity; uniform float uFogDensity; uniform vec3 uFogColor;
        varying float vTwinkle; varying float vDepth; varying float vMix;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float core = smoothstep(0.5, 0.0, d);
          float glow = core * core;
          vec3 col = mix(uColor, uAccent, step(0.82, vMix) * 0.6);
          float fog = exp(-uFogDensity * uFogDensity * vDepth * vDepth);
          gl_FragColor = vec4(col * (0.6 + glow * 1.4), glow * vTwinkle * uOpacity * fog);
        }`,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  update(time: number, p: { particleDensity: number; particleSize: number; particleSpeed: number; particleColor: string; accentColor: string }, fogDensity = 0, fogColor?: THREE.Color, center?: THREE.Vector3) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uSpeed.value = p.particleSpeed;
    u.uScale.value = p.particleSize;
    (u.uColor.value as THREE.Color).set(p.particleColor);
    (u.uAccent.value as THREE.Color).set(p.accentColor);
    u.uFogDensity.value = fogDensity;
    if (fogColor) (u.uFogColor.value as THREE.Color).copy(fogColor);
    if (center) (u.uCenter.value as THREE.Vector3).copy(center);
    const count = Math.round(this.max * Math.min(1, Math.max(0, p.particleDensity)));
    this.geometry.setDrawRange(0, count);
    this.points.visible = count > 0;
  }

  get visibleCount() {
    return this.geometry.drawRange.count;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

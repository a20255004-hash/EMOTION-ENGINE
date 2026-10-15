import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';

export interface SkyOptions {
  stars: number;
  /** Tamaño angular del disco del sol/luna (radianes). */
  sunSize: number;
  clouds: number;
  /** Brillo del disco del astro. */
  sunIntensity?: number;
  /** Fuerza del halo alrededor del astro. */
  halo?: number;
}

/** Cúpula de cielo procedural: degradado, astro, halo, estrellas y velos. */
export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(opts: SkyOptions) {
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uLightDir: { value: new THREE.Vector3(0, 0.3, -1) },
        uLightColor: { value: new THREE.Color() },
        uLight: { value: 1 },
        uSunSize: { value: opts.sunSize },
        uStars: { value: opts.stars },
        uClouds: { value: opts.clouds },
        uCloudColor: { value: new THREE.Color() },
        uTime: { value: 0 },
        uSunIntensity: { value: opts.sunIntensity ?? 2.6 },
        uHalo: { value: opts.halo ?? 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uLightDir; uniform vec3 uLightColor;
        uniform float uLight; uniform float uSunSize; uniform float uSunIntensity; uniform float uHalo; uniform float uStars; uniform float uClouds; uniform vec3 uCloudColor; uniform float uTime;
        varying vec3 vDir;
        ${NOISE_GLSL}
        float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          float up = pow(clamp(h, 0.0, 1.0), 0.45);
          vec3 col = mix(uHorizon, uTop, up);
          col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.25, h));
          float s = max(dot(d, normalize(uLightDir)), 0.0);
          float disk = smoothstep(cos(uSunSize), cos(uSunSize * 0.85), s);
          float halo = (pow(s, 6.0) * 0.35 + pow(s, 48.0) * 0.6) * uHalo;
          col += uLightColor * (disk * uSunIntensity + halo) * uLight;
          // Estrellas
          if (uStars > 0.0) {
            vec3 g = floor(d * 280.0);
            float st = hash(g);
            float tw = 0.6 + 0.4 * sin(uTime * 2.0 + st * 60.0);
            float star = step(1.0 - 0.012 * uStars, st) * tw * smoothstep(-0.05, 0.25, h);
            col += vec3(star) * 1.4 * (1.0 - disk);
          }
          // Velos de nubes altas
          if (uClouds > 0.0 && h > -0.02) {
            vec2 uv = d.xz / (h + 0.18);
            float n = fbm(vec3(uv * 1.3 + uTime * 0.01, uTime * 0.02), 5);
            float c = smoothstep(0.05, 0.6, n) * uClouds * smoothstep(-0.02, 0.15, h);
            vec3 cc = mix(uCloudColor, uLightColor, pow(s, 3.0) * 0.8);
            col = mix(col, cc, c * 0.75);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  update(camera: THREE.Camera, time: number, top: THREE.Color, horizon: THREE.Color, lightDir: THREE.Vector3, lightColor: THREE.Color, light: number, cloudColor?: THREE.Color) {
    this.mesh.position.copy(camera.position);
    const u = this.material.uniforms;
    (u.uTop.value as THREE.Color).copy(top);
    (u.uHorizon.value as THREE.Color).copy(horizon);
    (u.uLightDir.value as THREE.Vector3).copy(lightDir);
    (u.uLightColor.value as THREE.Color).copy(lightColor);
    u.uLight.value = light;
    u.uTime.value = time;
    if (cloudColor) (u.uCloudColor.value as THREE.Color).copy(cloudColor);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

export function lightDirection(azimuthDeg: number, elevationDeg: number, out = new THREE.Vector3()) {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);
  return out.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
}

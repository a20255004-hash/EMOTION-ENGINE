import * as THREE from 'three';
import type { VisualParams } from '../../../shared/params';
import { NOISE_GLSL } from '../glsl';
import { Particles } from '../Particles';
import { SkyDome, lightDirection } from '../SkyDome';
import type { CameraFraming, World } from '../types';

const GRID = 600;
const SEGMENTS = 256;
const WRAP = 160;

/**
 * Océano onírico: superficie infinita desplazada en GPU (suma de ondas + ruido),
 * reflejo de Fresnel del cielo, luna con brillo especular, espuma luminosa,
 * estelas bioluminiscentes, orbes flotantes y un anillo-portal en el horizonte.
 */
export class OceanWorld implements World {
  readonly id = 'ocean' as const;
  readonly scene = new THREE.Scene();
  readonly framing: CameraFraming;

  private water: THREE.Mesh;
  private waterMat: THREE.ShaderMaterial;
  private sky = new SkyDome({ stars: 1, sunSize: 0.04, clouds: 0.3, sunIntensity: 2.2, halo: 0.55 });
  private plankton: Particles;
  private orbs: THREE.InstancedMesh;
  private orbMat: THREE.MeshBasicMaterial;
  private orbSeeds: { x: number; z: number; phase: number; size: number; drift: number }[] = [];
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private tmp = new THREE.Object3D();
  private lightDir = new THREE.Vector3();
  private c = {
    primary: new THREE.Color(),
    secondary: new THREE.Color(),
    accent: new THREE.Color(),
    bg: new THREE.Color(),
    light: new THREE.Color(),
    top: new THREE.Color(),
    horizon: new THREE.Color(),
  };

  constructor() {
    this.framing = {
      target: new THREE.Vector3(0, 1.2, 0),
      distance: 22,
      height: 4.2,
      minY: 2.2,
      fly: (t, out) => {
        out.pos.set(Math.sin(t * 0.045) * 18, 3.6 + Math.sin(t * 0.21) * 0.5, -t * 1.0);
        out.look.set(out.pos.x + Math.sin(t * 0.045 + 0.6) * 6, 2.0, out.pos.z - 30);
      },
    };

    this.waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 1 },
        uChop: { value: 0.5 },
        uScale: { value: 1 },
        uComplex: { value: 0.5 },
        uPrimary: { value: new THREE.Color() },
        uSecondary: { value: new THREE.Color() },
        uAccent: { value: new THREE.Color() },
        uSky: { value: new THREE.Color() },
        uLightColor: { value: new THREE.Color() },
        uLightDir: { value: new THREE.Vector3() },
        uLight: { value: 1 },
        uAmbient: { value: 0.3 },
        uFogDensity: { value: 0.01 },
        uFogColor: { value: new THREE.Color() },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uAmp; uniform float uChop; uniform float uScale; uniform float uComplex;
        varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
        ${NOISE_GLSL}
        float waveH(vec2 p){
          float s = 1.0 / uScale;
          vec2 d1 = normalize(vec2(1.0, 0.3));
          vec2 d2 = normalize(vec2(-0.6, 1.0));
          vec2 d3 = normalize(vec2(0.2, -1.0));
          vec2 d4 = normalize(vec2(-1.0, -0.45));
          float h = 0.0;
          h += (1.0 - abs(sin(dot(d1, p) * 0.10 * s + uTime * 0.8))) * 1.1;
          h += sin(dot(d2, p) * 0.19 * s + uTime * 1.25) * 0.55;
          h += sin(dot(d3, p) * 0.33 * s + uTime * 1.8) * 0.3;
          h += sin(dot(d4, p) * 0.57 * s + uTime * 2.35) * 0.15 * (0.5 + uComplex);
          h *= uAmp;
          h += snoise(vec3(p * 0.07 * s, uTime * 0.22)) * uChop * 1.1;
          h += snoise(vec3(p * 0.23 * s, uTime * 0.45)) * uChop * 0.3 * uComplex;
          return h;
        }
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec2 p = wp.xz;
          float h = waveH(p);
          float e = 0.7;
          float hx = waveH(p + vec2(e, 0.0));
          float hz = waveH(p + vec2(0.0, e));
          vNormal = normalize(vec3(h - hx, e, h - hz));
          wp.y += h;
          vCrest = h / max(uAmp + uChop, 0.25);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uPrimary; uniform vec3 uSecondary; uniform vec3 uAccent; uniform vec3 uSky;
        uniform vec3 uLightColor; uniform vec3 uLightDir; uniform float uLight; uniform float uAmbient;
        uniform float uFogDensity; uniform vec3 uFogColor;
        varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
        ${NOISE_GLSL}
        void main(){
          vec3 N = normalize(vNormal);
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          vec3 R = reflect(-V, N);
          float skyT = clamp(R.y, 0.0, 1.0);
          vec3 refl = mix(uFogColor * 1.1, uSky, pow(skyT, 0.6));
          float diff = max(dot(N, uLightDir), 0.0);
          vec3 base = mix(uSecondary, uPrimary, smoothstep(-0.6, 0.9, vCrest)) * (uAmbient + uLight * diff * 0.7);
          float rl = max(dot(R, uLightDir), 0.0);
          float spec = pow(rl, 300.0) * 1.6 + pow(rl, 40.0) * 0.04;
          float n = snoise(vec3(vWorld.xz * 0.28, uTime * 0.3));
          float crest = smoothstep(0.72, 1.2, vCrest + n * 0.18);
          vec3 col = mix(base, refl, 0.08 + fres * 0.7);
          col += uLightColor * spec * uLight;
          col += uAccent * crest * 0.55;
          float bio = smoothstep(0.5, 0.95, snoise(vec3(vWorld.xz * 0.045, uTime * 0.12)));
          bio *= 0.5 + 0.5 * sin(uTime * 2.0 + vWorld.x * 0.2);
          col += uAccent * bio * 0.22;
          float dist = length(cameraPosition - vWorld);
          float fog = 1.0 - exp(-pow(uFogDensity * dist, 1.6));
          col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const geo = new THREE.PlaneGeometry(GRID, GRID, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.frustumCulled = false;

    this.plankton = new Particles({
      max: 9000,
      baseSize: 1.2,
      seed: (_i, pos, r) => {
        pos.set((Math.random() - 0.5) * WRAP, Math.random() * 14 + 0.3, (Math.random() - 0.5) * WRAP);
        r.set(Math.random(), Math.random(), Math.random(), Math.random());
      },
      motion: /* glsl */ `
        float t = uTime * uSpeed;
        vec3 q = p;
        q.x += snoise(vec3(p.xz * 0.03, t * 0.05 + aRand.x)) * 6.0 + t * 0.6;
        q.z += snoise(vec3(p.zx * 0.03, t * 0.05 + aRand.y)) * 6.0;
        q.y += sin(t * (0.4 + aRand.z) + aRand.x * 6.28) * 0.8;
        float W = ${WRAP.toFixed(1)};
        q.xz = mod(q.xz - uCenter.xz + W * 0.5, W) - W * 0.5 + uCenter.xz;
        p = q;
      `,
    });

    this.orbMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95 });
    this.orbs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 32, 16), this.orbMat, 28);
    this.orbs.frustumCulled = false;
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * 60;
      this.orbSeeds.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, phase: Math.random() * 10, size: 0.2 + Math.random() * 0.55, drift: 0.3 + Math.random() });
    }

    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, fog: false });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(46, 0.55, 16, 200), this.ringMat);

    this.scene.fog = new THREE.FogExp2(0x000000, 0.01);
    this.scene.add(this.sky.mesh, this.water, this.plankton.points, this.orbs, this.ring);
  }

  update(_dt: number, time: number, p: VisualParams, camera: THREE.PerspectiveCamera) {
    const c = this.c;
    c.primary.set(p.primaryColor);
    c.secondary.set(p.secondaryColor);
    c.accent.set(p.accentColor);
    c.bg.set(p.backgroundColor);
    c.light.set(p.lightColor);
    lightDirection(p.lightAngle, p.lightElevation, this.lightDir);

    const fog = (p.fogDensity * 0.011) / p.depth;
    c.top.copy(c.bg).multiplyScalar(0.55);
    c.horizon.copy(c.bg).lerp(c.accent, 0.1).lerp(c.light, 0.05);

    // El océano sigue a la cámara: siempre hay agua hasta el horizonte.
    const step = GRID / SEGMENTS;
    this.water.position.set(Math.round(camera.position.x / step) * step, 0, Math.round(camera.position.z / step) * step);

    const u = this.waterMat.uniforms;
    u.uTime.value = time;
    u.uAmp.value = p.waveAmplitude * 1.2;
    u.uChop.value = p.turbulence;
    u.uScale.value = p.scale;
    u.uComplex.value = p.complexity;
    (u.uPrimary.value as THREE.Color).copy(c.primary);
    (u.uSecondary.value as THREE.Color).copy(c.secondary);
    (u.uAccent.value as THREE.Color).copy(c.accent);
    (u.uSky.value as THREE.Color).copy(c.horizon).lerp(c.top, 0.4);
    (u.uLightColor.value as THREE.Color).copy(c.light);
    (u.uLightDir.value as THREE.Vector3).copy(this.lightDir);
    u.uLight.value = p.lightIntensity;
    u.uAmbient.value = p.ambientIntensity;
    u.uFogDensity.value = fog;
    (u.uFogColor.value as THREE.Color).copy(c.horizon);

    const sf = this.scene.fog as THREE.FogExp2;
    sf.color.copy(c.horizon);
    sf.density = fog * 0.7;

    this.sky.update(camera, time, c.top, c.horizon, this.lightDir, c.light, p.lightIntensity, c.secondary.clone().lerp(c.bg, 0.5));
    this.plankton.update(time, p, fog * 0.9, c.horizon, camera.position);

    // Orbes oníricos: su número depende de la complejidad.
    const visible = Math.round(4 + p.complexity * 24);
    this.orbs.count = visible;
    this.orbMat.color.copy(c.accent).lerp(c.light, 0.25).multiplyScalar(1.15);
    for (let i = 0; i < visible; i++) {
      const s = this.orbSeeds[i];
      const wrap = 150;
      const x = camera.position.x + THREE.MathUtils.euclideanModulo(s.x - camera.position.x + wrap / 2, wrap) - wrap / 2;
      const z = camera.position.z + THREE.MathUtils.euclideanModulo(s.z - camera.position.z + wrap / 2, wrap) - wrap / 2;
      this.tmp.position.set(x + Math.sin(time * 0.1 * s.drift + s.phase) * 3, 3 + p.waveAmplitude + Math.sin(time * 0.6 * s.drift + s.phase) * 1.4, z);
      this.tmp.scale.setScalar(s.size * p.scale * (0.85 + 0.15 * Math.sin(time * 1.3 + s.phase)));
      this.tmp.updateMatrix();
      this.orbs.setMatrixAt(i, this.tmp.matrix);
    }
    this.orbs.instanceMatrix.needsUpdate = true;

    // Anillo-portal en el horizonte, siempre delante.
    this.ring.position.set(camera.position.x, 18 * p.scale, camera.position.z - 230 * p.depth);
    this.ring.scale.setScalar(p.scale);
    this.ring.rotation.set(0, Math.sin(time * 0.05) * 0.4, time * 0.03);
    this.ringMat.color.copy(c.accent).multiplyScalar(1.2 + p.intensity * 0.4);
    this.ringMat.opacity = Math.max(0.1, 1 - p.fogDensity * 0.6);
  }

  dispose() {
    this.water.geometry.dispose();
    this.waterMat.dispose();
    this.sky.dispose();
    this.plankton.dispose();
    this.orbs.geometry.dispose();
    this.orbMat.dispose();
    this.ring.geometry.dispose();
    this.ringMat.dispose();
  }
}

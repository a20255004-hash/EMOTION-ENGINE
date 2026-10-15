import * as THREE from 'three';
import type { VisualParams } from '../../../shared/params';
import { NOISE_GLSL } from '../glsl';
import { Particles } from '../Particles';
import type { CameraFraming, World } from '../types';
import { Palette, seeded, setColor, wrapAround } from './common';

const KELP = 160;
const JELLY = 40;
const RAYS = 9;

/**
 * Abismo submarino: lecho de arena con cáusticas animadas, bosques de algas
 * que se mecen, haces de luz desde la superficie, medusas translúcidas que
 * laten y burbujas que ascienden.
 */
export class AbyssWorld implements World {
  readonly id = 'abyss' as const;
  readonly scene = new THREE.Scene();
  readonly framing: CameraFraming;

  private floor: THREE.Mesh;
  private floorMat: THREE.ShaderMaterial;
  private kelp: THREE.InstancedMesh;
  private kelpMat: THREE.ShaderMaterial;
  private kelpSeeds: { x: number; z: number; h: number; r: number }[] = [];
  private jelly: THREE.InstancedMesh;
  private jellyMat: THREE.ShaderMaterial;
  private jellySeeds: { x: number; y: number; z: number; s: number; ph: number }[] = [];
  private rays: THREE.InstancedMesh;
  private rayMat: THREE.ShaderMaterial;
  private bubbles: Particles;
  private plankton: Particles;
  private water: THREE.Mesh;
  private waterMat: THREE.ShaderMaterial;
  private tmp = new THREE.Object3D();
  private c = new Palette();
  private deep = new THREE.Color();

  constructor() {
    this.framing = {
      target: new THREE.Vector3(0, 6, 0),
      distance: 24,
      height: 3,
      minY: 1.5,
      fly: (t, out) => {
        out.pos.set(Math.sin(t * 0.03) * 10, 5 + Math.sin(t * 0.08) * 2, -t * 0.7);
        out.look.set(Math.sin(t * 0.03 + 0.5) * 6, 6, out.pos.z - 30);
      },
    };

    this.waterMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep; uniform vec3 uShallow; uniform float uTime; varying vec3 vDir;
        ${NOISE_GLSL}
        void main(){
          vec3 d = normalize(vDir);
          vec3 col = mix(uDeep, uShallow, smoothstep(-0.3, 1.0, d.y));
          float surf = smoothstep(0.6, 1.0, d.y) * (snoise(vec3(d.xz * 6.0, uTime * 0.2)) * 0.5 + 0.5);
          col += uShallow * surf * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.water = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.waterMat);
    this.water.frustumCulled = false;
    this.water.renderOrder = -10;

    this.floorMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSand: { value: new THREE.Color() },
        uCaustic: { value: new THREE.Color() },
        uFogColor: { value: new THREE.Color() },
        uFog: { value: 0.03 },
        uLight: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        ${NOISE_GLSL}
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          wp.y = snoise(vec3(wp.xz * 0.04, 0.0)) * 1.5 + snoise(vec3(wp.xz * 0.15, 4.0)) * 0.3;
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uSand; uniform vec3 uCaustic; uniform vec3 uFogColor; uniform float uFog; uniform float uLight;
        varying vec3 vWorld;
        ${NOISE_GLSL}
        float caustic(vec2 p, float t){
          vec2 q = p;
          float c = 0.0;
          for (int i = 0; i < 3; i++) {
            q += vec2(sin(q.y * 1.3 + t), cos(q.x * 1.1 - t * 0.8)) * 0.6;
            c += 0.04 / max(abs(sin(q.x) * cos(q.y)), 0.02);
          }
          return clamp(c * 0.25, 0.0, 1.5);
        }
        void main(){
          vec3 col = uSand * (0.35 + 0.15 * snoise(vec3(vWorld.xz * 0.3, 2.0))) * (0.5 + 0.5 * uLight);
          col += uCaustic * pow(caustic(vWorld.xz * 0.35, uTime * 0.6), 1.5) * 0.35 * uLight;
          float d = length(cameraPosition - vWorld);
          col = mix(col, uFogColor, 1.0 - exp(-pow(d * uFog, 1.2)));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const fg = new THREE.PlaneGeometry(300, 300, 100, 100);
    fg.rotateX(-Math.PI / 2);
    this.floor = new THREE.Mesh(fg, this.floorMat);
    this.floor.frustumCulled = false;

    this.kelpMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uBase: { value: new THREE.Color() }, uTip: { value: new THREE.Color() }, uSway: { value: 1 }, uFogColor: { value: new THREE.Color() }, uFog: { value: 0.03 } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uSway;
        varying float vY; varying vec3 vWorld;
        void main(){
          vec3 p = position;
          float k = p.y;
          vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
          float seed = instanceMatrix[3].x * 0.3 + instanceMatrix[3].z * 0.2;
          wp.x += sin(uTime * 0.9 + seed + k * 0.25) * k * k * 0.012 * uSway;
          wp.z += cos(uTime * 0.7 + seed + k * 0.2) * k * k * 0.008 * uSway;
          vY = uv.y; vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBase; uniform vec3 uTip; uniform vec3 uFogColor; uniform float uFog;
        varying float vY; varying vec3 vWorld;
        void main(){
          vec3 col = mix(uBase, uTip, vY);
          float d = length(cameraPosition - vWorld);
          col = mix(col, uFogColor, 1.0 - exp(-pow(d * uFog, 1.2)));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const kg = new THREE.PlaneGeometry(1.1, 1, 1, 16);
    kg.translate(0, 0.5, 0);
    // Hoja que se estrecha hacia la punta.
    const kp = kg.attributes.position;
    for (let i = 0; i < kp.count; i++) kp.setX(i, kp.getX(i) * (1 - kp.getY(i) * 0.75));
    this.kelp = new THREE.InstancedMesh(kg, this.kelpMat, KELP);
    this.kelp.frustumCulled = false;
    const rnd = seeded(41);
    for (let i = 0; i < KELP; i++) this.kelpSeeds.push({ x: (rnd() - 0.5) * 120, z: (rnd() - 0.5) * 120, h: 4 + rnd() * 12, r: rnd() * 6.28 });

    this.jellyMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uGlow: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){
          float seed = instanceMatrix[3].x + instanceMatrix[3].z * 1.7;
          float pulse = sin(uTime * 2.2 + seed);
          vec3 p = position;
          float squeeze = 1.0 + pulse * 0.18 * (1.0 - p.y);
          p.xz *= squeeze;
          p.y *= 1.0 - pulse * 0.12;
          vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          vY = position.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform vec3 uRim; uniform float uGlow;
        varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){
          float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
          float bands = 0.6 + 0.4 * sin(vY * 30.0);
          vec3 col = uColor * 0.25 + uRim * fres * bands;
          float core = smoothstep(0.0, 0.8, vY) * 0.3;
          col += uRim * core;
          float a = (0.3 + fres * 0.9 + core) * uGlow;
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.jelly = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), this.jellyMat, JELLY);
    this.jelly.frustumCulled = false;
    for (let i = 0; i < JELLY; i++) this.jellySeeds.push({ x: (rnd() - 0.5) * 90, y: 3 + rnd() * 25, z: (rnd() - 0.5) * 90, s: 1 + rnd() * 2.2, ph: rnd() * 6.28 });

    this.rayMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uStrength: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; varying float vSeed; void main(){ vUv = uv; vSeed = instanceMatrix[3].x; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; uniform float uStrength; varying vec2 vUv; varying float vSeed;
        void main(){
          float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
          float fade = smoothstep(0.0, 0.6, vUv.y);
          float flicker = 0.6 + 0.4 * sin(uTime * 0.7 + vSeed);
          float a = edge * fade * flicker * 0.12 * uStrength;
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    const rg = new THREE.PlaneGeometry(1, 1);
    rg.translate(0, 0.5, 0);
    this.rays = new THREE.InstancedMesh(rg, this.rayMat, RAYS);
    this.rays.frustumCulled = false;
    for (let i = 0; i < RAYS; i++) {
      this.tmp.position.set((rnd() - 0.5) * 60, -2, (rnd() - 0.5) * 60);
      this.tmp.rotation.set(0.15 * (rnd() - 0.5), rnd() * 3, 0.25 * (rnd() - 0.5));
      this.tmp.scale.set(4 + rnd() * 8, 60, 1);
      this.tmp.updateMatrix();
      this.rays.setMatrixAt(i, this.tmp.matrix);
    }

    this.bubbles = new Particles({
      max: 3000,
      baseSize: 1.4,
      seed: (_i, p, r) => {
        p.set((Math.random() - 0.5) * 70, Math.random() * 40, (Math.random() - 0.5) * 70);
        r.set(Math.random(), Math.random(), Math.random(), Math.random());
      },
      motion: /* glsl */ `
        float t = uTime * uSpeed;
        vec3 q = p;
        q.y = mod(p.y + t * (2.0 + aRand.y * 4.0), 40.0);
        q.x += sin(t * 3.0 + aRand.x * 20.0) * 0.3;
        q.xz = mod(q.xz - uCenter.xz + 35.0, 70.0) - 35.0 + uCenter.xz;
        p = q;
      `,
    });
    this.plankton = new Particles({
      max: 6000,
      baseSize: 0.5,
      seed: (_i, p, r) => {
        p.set((Math.random() - 0.5) * 80, Math.random() * 30, (Math.random() - 0.5) * 80);
        r.set(Math.random(), Math.random(), Math.random(), Math.random());
      },
      motion: /* glsl */ `
        float t = uTime * uSpeed * 0.3;
        vec3 q = p + vec3(snoise(vec3(p * 0.05 + t)), snoise(vec3(p * 0.05 - t)), snoise(vec3(p.zxy * 0.05 + t))) * 3.0;
        q.xz = mod(q.xz - uCenter.xz + 40.0, 80.0) - 40.0 + uCenter.xz;
        p = q;
      `,
    });

    this.scene.fog = new THREE.FogExp2(0x000000, 0.03);
    this.scene.add(this.water, this.floor, this.rays, this.kelp, this.jelly, this.plankton.points, this.bubbles.points);
  }

  update(_dt: number, time: number, p: VisualParams, camera: THREE.PerspectiveCamera) {
    const c = this.c.update(p);
    this.deep.copy(c.bg).lerp(c.primary, 0.25);
    const fog = (0.008 + p.fogDensity * 0.035) / p.depth;
    setColor(this.waterMat.uniforms.uDeep, c.bg.clone().multiplyScalar(0.6));
    setColor(this.waterMat.uniforms.uShallow, c.primary.clone().lerp(c.light, 0.3));
    this.waterMat.uniforms.uTime.value = time;
    this.water.position.copy(camera.position);

    this.floor.position.set(Math.round(camera.position.x / 3) * 3, 0, Math.round(camera.position.z / 3) * 3);
    const fu = this.floorMat.uniforms;
    fu.uTime.value = time;
    setColor(fu.uSand, c.primary.clone().lerp(c.light, 0.4));
    setColor(fu.uCaustic, c.light);
    setColor(fu.uFogColor, this.deep);
    fu.uFog.value = fog;
    fu.uLight.value = p.lightIntensity;

    const ku = this.kelpMat.uniforms;
    ku.uTime.value = time;
    ku.uSway.value = 0.4 + p.turbulence;
    setColor(ku.uBase, c.secondary.clone().lerp(new THREE.Color('#1d4a32'), 0.6));
    setColor(ku.uTip, c.primary.clone().lerp(new THREE.Color('#4fbf7a'), 0.55));
    setColor(ku.uFogColor, this.deep);
    ku.uFog.value = fog;
    const kn = Math.round(40 + p.complexity * (KELP - 40));
    for (let i = 0; i < kn; i++) {
      const s = this.kelpSeeds[i];
      this.tmp.position.set(wrapAround(s.x, camera.position.x, 120), -0.5, wrapAround(s.z, camera.position.z, 120));
      this.tmp.rotation.set(0, s.r, 0);
      this.tmp.scale.set(p.scale, s.h * p.scale * (0.7 + p.waveAmplitude * 0.4), p.scale);
      this.tmp.updateMatrix();
      this.kelp.setMatrixAt(i, this.tmp.matrix);
    }
    this.kelp.count = kn;
    this.kelp.instanceMatrix.needsUpdate = true;

    const ju = this.jellyMat.uniforms;
    ju.uTime.value = time;
    setColor(ju.uColor, c.primary);
    setColor(ju.uRim, c.accent);
    ju.uGlow.value = 0.6 + p.intensity * 0.5;
    const jn = Math.round(6 + p.complexity * (JELLY - 6));
    for (let i = 0; i < jn; i++) {
      const s = this.jellySeeds[i];
      const y = THREE.MathUtils.euclideanModulo(s.y + time * 0.4 * (0.5 + s.s * 0.3), 30) + 2;
      this.tmp.position.set(wrapAround(s.x + Math.sin(time * 0.2 + s.ph) * 3, camera.position.x, 90), y, wrapAround(s.z, camera.position.z, 90));
      this.tmp.rotation.set(Math.sin(time * 0.3 + s.ph) * 0.2, s.ph, Math.cos(time * 0.25 + s.ph) * 0.2);
      this.tmp.scale.setScalar(s.s * p.scale);
      this.tmp.updateMatrix();
      this.jelly.setMatrixAt(i, this.tmp.matrix);
    }
    this.jelly.count = jn;
    this.jelly.instanceMatrix.needsUpdate = true;

    this.rays.position.set(camera.position.x, 0, camera.position.z);
    this.rayMat.uniforms.uTime.value = time;
    setColor(this.rayMat.uniforms.uColor, c.light);
    this.rayMat.uniforms.uStrength.value = p.lightIntensity * (1 - p.fogDensity * 0.4);

    const sf = this.scene.fog as THREE.FogExp2;
    sf.color.copy(this.deep);
    sf.density = fog;
    this.bubbles.update(time, { ...p, particleColor: p.lightColor, particleDensity: p.particleDensity * 0.6 }, fog, this.deep, camera.position);
    this.plankton.update(time, p, fog, this.deep, camera.position);
  }

  dispose() {
    [this.water, this.floor, this.kelp, this.jelly, this.rays].forEach((m) => m.geometry.dispose());
    [this.waterMat, this.floorMat, this.kelpMat, this.jellyMat, this.rayMat].forEach((m) => m.dispose());
    this.bubbles.dispose();
    this.plankton.dispose();
  }
}

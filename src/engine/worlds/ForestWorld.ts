import * as THREE from 'three';
import type { VisualParams } from '../../../shared/params';
import { NOISE_GLSL } from '../glsl';
import { Particles } from '../Particles';
import { SkyDome } from '../SkyDome';
import type { CameraFraming, World } from '../types';
import { Palette, seeded, setColor, wrapAround } from './common';

const MAX_TREES = 420;
const MAX_SHROOMS = 260;
const WINDOW = 220;
const pathX = (z: number) => Math.sin(z * 0.02) * 12;

/**
 * Bosque bioluminiscente: coníferas instanciadas que rodean a la cámara sin fin,
 * suelo de musgo con manchas luminosas, hongos que laten de luz, niebla baja,
 * luna entre las copas y luciérnagas.
 */
export class ForestWorld implements World {
  readonly id = 'forest' as const;
  readonly scene = new THREE.Scene();
  readonly framing: CameraFraming;

  private sky = new SkyDome({ stars: 0.9, sunSize: 0.04, clouds: 0.08, sunIntensity: 2, halo: 0.5 });
  private ground: THREE.Mesh;
  private groundMat: THREE.ShaderMaterial;
  private trunks: THREE.InstancedMesh;
  private canopies: THREE.InstancedMesh;
  private trunkMat = new THREE.MeshStandardMaterial({ color: '#2a1d16', roughness: 0.95, flatShading: true });
  private canopyMat = new THREE.MeshStandardMaterial({ color: '#16301f', roughness: 0.85, flatShading: true });
  private shrooms: THREE.InstancedMesh;
  private shroomMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: true });
  private flies: Particles;
  private moon = new THREE.DirectionalLight('#ffffff', 1);
  private hemi = new THREE.HemisphereLight('#335577', '#0a120c', 0.6);
  private trees: { x: number; z: number; h: number; r: number; rot: number }[] = [];
  private mush: { x: number; z: number; s: number; phase: number }[] = [];
  private tmp = new THREE.Object3D();
  private tint = new THREE.Color();
  private c = new Palette();
  private horizon = new THREE.Color();
  private top = new THREE.Color();

  constructor() {
    this.framing = {
      target: new THREE.Vector3(0, 3, 0),
      distance: 16,
      height: 2.5,
      minY: 1,
      fly: (t, out) => {
        const z = -t * 1.1;
        out.pos.set(pathX(z), 2.4 + Math.sin(t * 0.2) * 0.3, z);
        out.look.set(pathX(z - 20), 2.6, z - 20);
      },
    };

    this.groundMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMoss: { value: new THREE.Color() },
        uDark: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
        uLightDir: { value: new THREE.Vector3() },
        uLight: { value: 1 },
        uFogColor: { value: new THREE.Color() },
        uFog: { value: 0.02 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld; varying vec3 vN;
        ${NOISE_GLSL}
        float H(vec2 p){ return snoise(vec3(p * 0.03, 0.0)) * 1.2 + snoise(vec3(p * 0.12, 2.0)) * 0.25; }
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float h = H(wp.xz);
          float e = 0.5;
          vN = normalize(vec3(h - H(wp.xz + vec2(e, 0.0)), e, h - H(wp.xz + vec2(0.0, e))));
          wp.y = h; vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uMoss; uniform vec3 uDark; uniform vec3 uGlow; uniform vec3 uLightDir; uniform float uLight; uniform vec3 uFogColor; uniform float uFog;
        varying vec3 vWorld; varying vec3 vN;
        ${NOISE_GLSL}
        void main(){
          float n = snoise(vec3(vWorld.xz * 0.15, 1.0)) * 0.5 + 0.5;
          vec3 col = mix(uDark, uMoss, n) * (0.25 + max(dot(normalize(vN), uLightDir), 0.0) * 0.6 * uLight);
          float spots = smoothstep(0.72, 0.92, snoise(vec3(vWorld.xz * 0.35, 5.0)));
          float pulse = 0.6 + 0.4 * sin(uTime * 1.5 + vWorld.x * 0.3 + vWorld.z * 0.2);
          col += uGlow * spots * pulse * 0.8;
          float d = length(cameraPosition - vWorld);
          col = mix(col, uFogColor, 1.0 - exp(-pow(d * uFog, 1.3)));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const g = new THREE.PlaneGeometry(500, 500, 140, 140);
    g.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(g, this.groundMat);
    this.ground.frustumCulled = false;

    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    // Copa de tres conos apilados en una sola geometría.
    const parts = [0, 1, 2].map((i) => {
      const cone = new THREE.ConeGeometry(1.4 - i * 0.35, 1.6, 7);
      cone.translate(0, 0.9 + i * 0.9, 0);
      return cone;
    });
    const canopyGeo = mergeGeometries(parts);
    this.trunks = new THREE.InstancedMesh(trunkGeo, this.trunkMat, MAX_TREES);
    this.canopies = new THREE.InstancedMesh(canopyGeo, this.canopyMat, MAX_TREES);
    this.trunks.frustumCulled = this.canopies.frustumCulled = false;
    const rnd = seeded(7);
    for (let i = 0; i < MAX_TREES; i++) this.trees.push({ x: (rnd() - 0.5) * WINDOW, z: (rnd() - 0.5) * WINDOW, h: 5 + rnd() * 9, r: 0.8 + rnd() * 0.7, rot: rnd() * 6.28 });

    const stem = new THREE.CylinderGeometry(0.05, 0.07, 0.35, 6);
    stem.translate(0, 0.17, 0);
    const cap = new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.6, 1);
    cap.translate(0, 0.33, 0);
    this.shrooms = new THREE.InstancedMesh(mergeGeometries([stem, cap]), this.shroomMat, MAX_SHROOMS);
    this.shrooms.frustumCulled = false;
    for (let i = 0; i < MAX_SHROOMS; i++) {
      // Agrupados en corros alrededor de los árboles.
      const t = this.trees[i % MAX_TREES];
      const a = rnd() * 6.28;
      const d = 1 + rnd() * 2.5;
      this.mush.push({ x: t.x + Math.cos(a) * d, z: t.z + Math.sin(a) * d, s: 0.6 + rnd() * 1.6, phase: rnd() * 6.28 });
      this.shrooms.setColorAt(i, new THREE.Color('#ffffff'));
    }

    this.flies = new Particles({
      max: 1600,
      baseSize: 1.1,
      seed: (_i, pos, r) => {
        pos.set((Math.random() - 0.5) * 90, 0.4 + Math.random() * 7, (Math.random() - 0.5) * 90);
        r.set(Math.random(), Math.random(), Math.random(), Math.random());
      },
      motion: /* glsl */ `
        float t = uTime * uSpeed;
        vec3 q = p;
        q.x += snoise(vec3(p.xz * 0.08, t * 0.15 + aRand.x * 9.0)) * 4.0;
        q.z += snoise(vec3(p.zx * 0.08, t * 0.15 + aRand.y * 9.0)) * 4.0;
        q.y += sin(t * (0.6 + aRand.z) + aRand.w * 6.28) * 0.8;
        q.xz = mod(q.xz - uCenter.xz + 45.0, 90.0) - 45.0 + uCenter.xz;
        p = q;
      `,
    });

    this.scene.fog = new THREE.FogExp2(0x000000, 0.02);
    this.scene.add(this.sky.mesh, this.ground, this.trunks, this.canopies, this.shrooms, this.flies.points, this.moon, this.hemi);
  }

  update(_dt: number, time: number, p: VisualParams, camera: THREE.PerspectiveCamera) {
    const c = this.c.update(p);
    this.top.copy(c.bg).multiplyScalar(0.7);
    this.horizon.copy(c.bg).lerp(c.primary, 0.25);
    const fog = (0.004 + p.fogDensity * 0.022) / p.depth;
    (this.scene.fog as THREE.FogExp2).color.copy(this.horizon);
    (this.scene.fog as THREE.FogExp2).density = fog;

    this.sky.update(camera, time, this.top, this.horizon, c.lightDir, c.light, p.lightIntensity);
    this.moon.color.copy(c.light);
    this.moon.intensity = p.lightIntensity * 1.2;
    this.moon.position.copy(c.lightDir).multiplyScalar(50);
    this.hemi.color.copy(c.light).lerp(c.bg, 0.5);
    this.hemi.groundColor.copy(c.secondary);
    this.hemi.intensity = p.ambientIntensity * 3.5;

    const step = 500 / 140;
    this.ground.position.set(Math.round(camera.position.x / step) * step, 0, Math.round(camera.position.z / step) * step);
    const gu = this.groundMat.uniforms;
    gu.uTime.value = time;
    setColor(gu.uMoss, c.primary);
    setColor(gu.uDark, c.secondary);
    setColor(gu.uGlow, c.accent);
    (gu.uLightDir.value as THREE.Vector3).copy(c.lightDir);
    gu.uLight.value = p.lightIntensity;
    setColor(gu.uFogColor, this.horizon);
    gu.uFog.value = fog;

    this.canopyMat.color.copy(c.primary).multiplyScalar(1.3);
    this.trunkMat.color.copy(c.secondary).lerp(new THREE.Color('#3a2a1e'), 0.6);
    this.canopyMat.emissive.copy(c.primary).lerp(c.accent, 0.2).multiplyScalar(0.12 * p.intensity);

    const count = Math.round(120 + p.complexity * (MAX_TREES - 120));
    const cx = camera.position.x;
    const cz = camera.position.z;
    for (let i = 0; i < count; i++) {
      const t = this.trees[i];
      const x = wrapAround(t.x, cx, WINDOW);
      const z = wrapAround(t.z, cz, WINDOW);
      const clear = Math.abs(x - pathX(z)) < 5 || Math.hypot(x, z) < 6;
      const s = clear ? 0 : 1;
      const sway = Math.sin(time * 0.8 + t.rot) * 0.02 * (0.5 + p.turbulence);
      this.tmp.position.set(x, 0, z);
      this.tmp.rotation.set(sway, t.rot, sway * 0.5);
      this.tmp.scale.set(t.r * s * p.scale, t.h * 0.35 * s * p.scale, t.r * s * p.scale);
      this.tmp.updateMatrix();
      this.trunks.setMatrixAt(i, this.tmp.matrix);
      this.tmp.position.y = t.h * 0.3 * s * p.scale;
      this.tmp.scale.set(t.r * s * p.scale, t.h * 0.28 * s * p.scale, t.r * s * p.scale);
      this.tmp.updateMatrix();
      this.canopies.setMatrixAt(i, this.tmp.matrix);
    }
    this.trunks.count = this.canopies.count = count;
    this.trunks.instanceMatrix.needsUpdate = this.canopies.instanceMatrix.needsUpdate = true;

    const sc = Math.round(40 + p.complexity * (MAX_SHROOMS - 40));
    for (let i = 0; i < sc; i++) {
      const m = this.mush[i];
      const x = wrapAround(m.x, cx, WINDOW);
      const z = wrapAround(m.z, cz, WINDOW);
      this.tmp.position.set(x, 0.05, z);
      this.tmp.rotation.set(0, m.phase, 0);
      this.tmp.scale.setScalar(m.s * p.scale);
      this.tmp.updateMatrix();
      this.shrooms.setMatrixAt(i, this.tmp.matrix);
      const pulse = 0.55 + 0.45 * Math.sin(time * 2 + m.phase);
      this.tint.copy(c.accent).lerp(c.particle, (i % 5) / 8).multiplyScalar((0.8 + pulse) * (0.6 + p.intensity * 0.5));
      this.shrooms.setColorAt(i, this.tint);
    }
    this.shrooms.count = sc;
    this.shrooms.instanceMatrix.needsUpdate = true;
    if (this.shrooms.instanceColor) this.shrooms.instanceColor.needsUpdate = true;

    this.flies.update(time, p, fog * 0.6, this.horizon, camera.position);
  }

  dispose() {
    this.sky.dispose();
    this.ground.geometry.dispose();
    this.groundMat.dispose();
    this.trunks.geometry.dispose();
    this.canopies.geometry.dispose();
    this.trunkMat.dispose();
    this.canopyMat.dispose();
    this.shrooms.geometry.dispose();
    this.shroomMat.dispose();
    this.flies.dispose();
  }
}

/** Une geometrías no indexadas (sin depender de utilidades externas). */
export function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = flat.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of flat) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

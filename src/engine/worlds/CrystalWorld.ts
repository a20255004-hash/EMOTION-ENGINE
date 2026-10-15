import * as THREE from 'three';
import type { VisualParams } from '../../../shared/params';
import { NOISE_GLSL } from '../glsl';
import { Particles } from '../Particles';
import type { CameraFraming, World } from '../types';
import { Palette, seeded, setColor } from './common';

const CRYSTALS = 320;

const FACET_FRAG = /* glsl */ `
  uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform vec3 uLightColor; uniform vec3 uLightDir; uniform float uLight; uniform float uGlow;
  varying vec3 vN; varying vec3 vWorld; varying float vSeed; varying float vH;
  void main(){
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
    vec3 H = normalize(uLightDir + V);
    float spec = pow(max(dot(N, H), 0.0), 80.0);
    float inner = 0.5 + 0.5 * sin(vH * 6.0 - uTime * 1.5 + vSeed * 10.0);
    vec3 base = mix(uA, uB, fract(vSeed * 3.7)) ;
    vec3 col = base * (0.15 + inner * 0.35) * uGlow;
    col += base * fres * 1.2 * uGlow;
    col += uLightColor * spec * 1.5 * uLight;
    col += mix(uA, uB, 0.5) * smoothstep(0.7, 1.0, vH) * 0.8 * uGlow;
    gl_FragColor = vec4(col, 1.0);
  }`;

/**
 * Caverna de cristal: cueva de roca con vetas luminosas, racimos de cristales
 * facetados que crecen del suelo y del techo, un gran cristal flotante en el
 * centro y polvo brillante en el aire.
 */
export class CrystalWorld implements World {
  readonly id = 'crystal' as const;
  readonly scene = new THREE.Scene();
  readonly framing: CameraFraming;

  private cave: THREE.Mesh;
  private caveMat: THREE.ShaderMaterial;
  private crystals: THREE.InstancedMesh;
  private crystalMat: THREE.ShaderMaterial;
  private core: THREE.Mesh;
  private coreMat: THREE.ShaderMaterial;
  private dust: Particles;
  private seeds: { pos: THREE.Vector3; dir: THREE.Vector3; len: number; w: number }[] = [];
  private tmp = new THREE.Object3D();
  private up = new THREE.Vector3(0, 1, 0);
  private c = new Palette();

  constructor() {
    this.framing = {
      target: new THREE.Vector3(0, 0, 0),
      distance: 20,
      height: 2,
      minY: -14,
      fly: (t, out) => {
        const a = t * 0.015;
        out.pos.set(Math.cos(a) * 18, Math.sin(t * 0.02) * 6, Math.sin(a) * 18);
        out.look.set(0, 0, 0);
      },
    };

    this.caveMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTime: { value: 0 },
        uRock: { value: new THREE.Color() },
        uVein: { value: new THREE.Color() },
        uFogColor: { value: new THREE.Color() },
        uFog: { value: 0.02 },
        uGlow: { value: 1 },
        uRough: { value: 0.5 },
      },
      vertexShader: /* glsl */ `
        uniform float uRough;
        varying vec3 vWorld; varying vec3 vObj;
        ${NOISE_GLSL}
        void main(){
          vec3 n = normalize(position);
          float d = fbm(n * 2.5, 4) * (0.18 + uRough * 0.12);
          vec3 p = position * (1.0 + d);
          vObj = n;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uRock; uniform vec3 uVein; uniform vec3 uFogColor; uniform float uFog; uniform float uGlow;
        varying vec3 vWorld; varying vec3 vObj;
        ${NOISE_GLSL}
        void main(){
          float n = fbm(vObj * 6.0, 4);
          vec3 col = uRock * (0.35 + n * 0.3);
          float r = 1.0 - abs(snoise(vObj * 4.0 + vec3(0.0, uTime * 0.02, 0.0)));
          float vein = pow(r, 42.0) * smoothstep(-0.1, 0.4, snoise(vObj * 1.5 + 9.0));
          col += uVein * vein * (0.5 + 0.3 * sin(uTime * 1.5 + n * 10.0)) * uGlow;
          float d = length(cameraPosition - vWorld);
          col = mix(col, uFogColor, 1.0 - exp(-pow(d * uFog, 1.3)));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.cave = new THREE.Mesh(new THREE.IcosahedronGeometry(42, 24), this.caveMat);
    this.cave.scale.set(1.3, 0.75, 1.3);
    this.cave.frustumCulled = false;

    const facetVert = /* glsl */ `
      varying vec3 vN; varying vec3 vWorld; varying float vSeed; varying float vH;
      void main(){
        mat4 m = modelMatrix * instanceMatrix;
        vec4 wp = m * vec4(position, 1.0);
        vN = normalize(mat3(m) * normal);
        vWorld = wp.xyz;
        vSeed = fract(instanceMatrix[3].x * 0.137 + instanceMatrix[3].y * 0.71 + instanceMatrix[3].z * 0.29);
        vH = position.y + 0.5;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`;
    const uniforms = () => ({
      uTime: { value: 0 },
      uA: { value: new THREE.Color() },
      uB: { value: new THREE.Color() },
      uLightColor: { value: new THREE.Color() },
      uLightDir: { value: new THREE.Vector3() },
      uLight: { value: 1 },
      uGlow: { value: 1 },
    });
    this.crystalMat = new THREE.ShaderMaterial({ uniforms: uniforms(), vertexShader: facetVert, fragmentShader: FACET_FRAG });
    const geo = new THREE.CylinderGeometry(0, 0.5, 1, 6, 1);
    const prism = new THREE.CylinderGeometry(0.5, 0.5, 1.6, 6, 1);
    prism.translate(0, -1.3, 0);
    // Prisma hexagonal con punta: un cristal clásico.
    const merged = mergeFlat([geo.toNonIndexed(), prism.toNonIndexed()]);
    merged.translate(0, 1.6, 0);
    merged.scale(1, 0.4, 1);
    merged.computeVertexNormals();
    this.crystals = new THREE.InstancedMesh(merged, this.crystalMat, CRYSTALS);
    this.crystals.frustumCulled = false;

    const rnd = seeded(77);
    // Racimos: cada uno con un centro en la pared y cristales en abanico.
    for (let i = 0; i < CRYSTALS; i++) {
      const cluster = Math.floor(i / 8);
      const cr = seeded(cluster * 31 + 5);
      const theta = cr() * Math.PI * 2;
      const phi = cluster % 3 === 0 ? 2.6 + cr() * 0.5 : cluster % 3 === 1 ? 0.1 + cr() * 0.6 : 1.2 + cr() * 0.8;
      const base = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
      const pos = base.clone().multiply(new THREE.Vector3(1.3 * 38, 0.75 * 38, 1.3 * 38));
      const dir = base.clone().negate().add(new THREE.Vector3((rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9)).normalize();
      this.seeds.push({ pos, dir, len: 6 + rnd() * 16, w: 1.6 + rnd() * 3 });
    }

    this.coreMat = new THREE.ShaderMaterial({ uniforms: uniforms(), vertexShader: facetVert, fragmentShader: FACET_FRAG });
    const coreGeo = new THREE.OctahedronGeometry(1, 0);
    coreGeo.scale(1, 1.7, 1);
    this.core = new THREE.InstancedMesh(coreGeo.toNonIndexed(), this.coreMat, 1);
    (this.core as THREE.InstancedMesh).setMatrixAt(0, new THREE.Matrix4());
    this.core.frustumCulled = false;

    this.dust = new Particles({
      max: 4000,
      baseSize: 0.7,
      seed: (_i, p, r) => {
        p.copy(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 30));
        p.y *= 0.6;
        r.set(Math.random(), Math.random(), Math.random(), Math.random());
      },
      motion: /* glsl */ `
        float t = uTime * uSpeed * 0.2;
        p += vec3(snoise(vec3(p * 0.08 + t)), snoise(vec3(p * 0.08 - t + 3.0)), snoise(vec3(p.zxy * 0.08 + t))) * 2.5;
      `,
    });

    this.scene.add(this.cave, this.crystals, this.core, this.dust.points);
  }

  update(_dt: number, time: number, p: VisualParams, _camera: THREE.PerspectiveCamera) {
    const c = this.c.update(p);
    const fog = (0.004 + p.fogDensity * 0.03) / p.depth;
    const fogColor = c.bg.clone().lerp(c.primary, 0.15);

    const cu = this.caveMat.uniforms;
    cu.uTime.value = time;
    setColor(cu.uRock, c.secondary.clone().lerp(c.bg, 0.3));
    setColor(cu.uVein, c.accent);
    setColor(cu.uFogColor, fogColor);
    cu.uFog.value = fog;
    cu.uGlow.value = 0.5 + p.intensity * 0.5;
    cu.uRough.value = p.turbulence;

    for (const m of [this.crystalMat, this.coreMat]) {
      const u = m.uniforms;
      u.uTime.value = time;
      setColor(u.uA, c.primary);
      setColor(u.uB, c.accent);
      setColor(u.uLightColor, c.light);
      (u.uLightDir.value as THREE.Vector3).copy(c.lightDir);
      u.uLight.value = p.lightIntensity;
      u.uGlow.value = (0.5 + p.intensity * 0.6) * (m === this.coreMat ? 0.55 : 1);
    }

    const n = Math.round(60 + p.complexity * (CRYSTALS - 60));
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const s = this.seeds[i];
      q.setFromUnitVectors(this.up, s.dir);
      this.tmp.position.copy(s.pos);
      this.tmp.quaternion.copy(q);
      const grow = 1 + Math.sin(time * 0.6 + i) * 0.04 * p.waveAmplitude;
      this.tmp.scale.set(s.w * p.scale, s.len * p.scale * grow, s.w * p.scale);
      this.tmp.updateMatrix();
      this.crystals.setMatrixAt(i, this.tmp.matrix);
    }
    this.crystals.count = n;
    this.crystals.instanceMatrix.needsUpdate = true;

    const core = this.core as THREE.InstancedMesh;
    this.tmp.position.set(0, Math.sin(time * 0.5) * 0.8 * p.waveAmplitude, 0);
    this.tmp.rotation.set(Math.sin(time * 0.2) * 0.2, time * 0.3, 0);
    this.tmp.scale.setScalar(3.2 * p.scale);
    this.tmp.updateMatrix();
    core.setMatrixAt(0, this.tmp.matrix);
    core.instanceMatrix.needsUpdate = true;

    this.dust.update(time, p, fog, fogColor);
  }

  dispose() {
    this.cave.geometry.dispose();
    this.caveMat.dispose();
    this.crystals.geometry.dispose();
    this.crystalMat.dispose();
    this.core.geometry.dispose();
    this.coreMat.dispose();
    this.dust.dispose();
  }
}

function mergeFlat(geos: THREE.BufferGeometry[]) {
  const total = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return out;
}

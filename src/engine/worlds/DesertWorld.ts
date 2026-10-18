import * as THREE from 'three';
import type { VisualParams } from '../../../shared/params';
import { NOISE_GLSL } from '../glsl';
import { Particles } from '../Particles';
import { SkyDome } from '../SkyDome';
import type { CameraFraming, World } from '../types';
import { Palette, seeded, setColor, wrapAround } from './common';

const GRID = 1200;
const SEG = 260;
const ROCKS = 36;

/**
 * Dunas del desierto: campo de dunas infinito con crestas afiladas y rizos de
 * viento, luz rasante con lado en sombra, calima que funde el horizonte,
 * columnas de roca erosionada y arena que vuela.
 */
export class DesertWorld implements World {
  readonly id = 'desert' as const;
  readonly scene = new THREE.Scene();
  readonly framing: CameraFraming;

  private sky = new SkyDome({ stars: 0, sunSize: 0.06, clouds: 0.15, sunIntensity: 2.2, halo: 0.6 });
  private dunes: THREE.Mesh;
  private duneMat: THREE.ShaderMaterial;
  private rocks: THREE.InstancedMesh;
  private rockMat = new THREE.MeshStandardMaterial({ color: '#7a4a30', roughness: 1, flatShading: true });
  private rockSeeds: { x: number; z: number; h: number; w: number; r: number }[] = [];
  private sun = new THREE.DirectionalLight('#ffffff', 2);
  private hemi = new THREE.HemisphereLight('#ffe0b0', '#6b3a22', 0.6);
  private sand: Particles;
  private tmp = new THREE.Object3D();
  private c = new Palette();
  private horizon = new THREE.Color();
  private top = new THREE.Color();
  private H = 20;

  constructor() {
    this.framing = {
      target: new THREE.Vector3(0, 12, 0),
      distance: 45,
      height: 14,
      minY: 4,
      fly: (t, out) => {
        const y = 8 + this.H * 1.05;
        out.pos.set(Math.sin(t * 0.02) * 30, y + Math.sin(t * 0.07) * 2, -t * 1.4);
        out.look.set(Math.sin(t * 0.02 + 0.4) * 30, y - 5, out.pos.z - 60);
      },
    };

    this.duneMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHeight: { value: 20 },
        uWarp: { value: 0.5 },
        uFreq: { value: 1 },
        uSand: { value: new THREE.Color() },
        uShadow: { value: new THREE.Color() },
        uCrest: { value: new THREE.Color() },
        uLightColor: { value: new THREE.Color() },
        uLightDir: { value: new THREE.Vector3() },
        uLight: { value: 1 },
        uAmbient: { value: 0.4 },
        uFogColor: { value: new THREE.Color() },
        uFog: { value: 0.003 },
      },
      vertexShader: /* glsl */ `
        uniform float uHeight; uniform float uWarp; uniform float uFreq;
        varying vec3 vWorld; varying vec3 vN; varying float vH;
        ${NOISE_GLSL}
        float dune(vec2 p){
          vec2 q = p * 0.01 * uFreq;
          q += vec2(snoise(vec3(q * 0.6, 1.0)), snoise(vec3(q * 0.6, 8.0))) * uWarp;
          float d = 1.0 - abs(sin(q.x * 2.4 + q.y * 0.9));
          d = d * d * (0.6 + 0.4 * (snoise(vec3(q * 0.3, 3.0)) * 0.5 + 0.5));
          float big = snoise(vec3(p * 0.002, 5.0)) * 0.5 + 0.5;
          return (d * 0.75 + big * 0.35) * uHeight;
        }
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float h = dune(wp.xz);
          float e = 1.2;
          vN = normalize(vec3(h - dune(wp.xz + vec2(e, 0.0)), e, h - dune(wp.xz + vec2(0.0, e))));
          wp.y = h; vH = h / max(uHeight, 1.0); vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uSand; uniform vec3 uShadow; uniform vec3 uCrest; uniform vec3 uLightColor; uniform vec3 uLightDir;
        uniform float uLight; uniform float uAmbient; uniform vec3 uFogColor; uniform float uFog;
        varying vec3 vWorld; varying vec3 vN; varying float vH;
        ${NOISE_GLSL}
        void main(){
          vec3 N = normalize(vN);
          // Rizos de viento: perturban la normal en líneas finas.
          float ripple = sin(dot(vWorld.xz, vec2(0.9, 0.45)) * 2.2 + snoise(vec3(vWorld.xz * 0.05, 0.0)) * 4.0);
          N = normalize(N + vec3(ripple * 0.06, 0.0, ripple * 0.03));
          float diff = dot(N, uLightDir);
          float lit = smoothstep(-0.05, 0.35, diff);
          vec3 shade = mix(uShadow, uSand, 0.45) * (0.45 + uAmbient);
          vec3 col = mix(shade, uSand * (0.6 + 0.6 * uLight) * uLightColor, lit);
          col += uCrest * smoothstep(0.75, 1.0, vH) * lit * 0.25;
          float grain = fract(sin(dot(floor(vWorld.xz * 8.0), vec2(12.9898, 78.233))) * 43758.5453);
          col *= 0.94 + grain * 0.08;
          vec3 V = normalize(vWorld - cameraPosition);
          float sunAmt = pow(max(dot(V, uLightDir), 0.0), 6.0);
          vec3 fogCol = mix(uFogColor, uLightColor, sunAmt * 0.5);
          float d = length(vWorld - cameraPosition);
          col = mix(col, fogCol, 1.0 - exp(-pow(d * uFog, 1.3)));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const g = new THREE.PlaneGeometry(GRID, GRID, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    this.dunes = new THREE.Mesh(g, this.duneMat);
    this.dunes.frustumCulled = false;

    const rockGeo = new THREE.CylinderGeometry(0.8, 1.2, 1, 7, 3);
    const pos = rockGeo.attributes.position;
    const rnd = seeded(23);
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.85 + rnd() * 0.3), pos.getY(i), pos.getZ(i) * (0.85 + rnd() * 0.3));
    rockGeo.translate(0, 0.5, 0);
    rockGeo.computeVertexNormals();
    this.rocks = new THREE.InstancedMesh(rockGeo, this.rockMat, ROCKS);
    this.rocks.frustumCulled = false;
    for (let i = 0; i < ROCKS; i++) this.rockSeeds.push({ x: (rnd() - 0.5) * 900, z: (rnd() - 0.5) * 900, h: 20 + rnd() * 50, w: 4 + rnd() * 6, r: rnd() * 6 });

    this.sand = new Particles({
      max: 8000,
      baseSize: 0.6,
      additive: false,
      seed: (_i, p, r) => {
        p.set((Math.random() - 0.5) * 120, Math.random() * 14, (Math.random() - 0.5) * 120);
        r.set(Math.random(), Math.random(), Math.random(), Math.random());
      },
      motion: /* glsl */ `
        float t = uTime * uSpeed;
        vec3 q = p;
        q.x += t * (14.0 + aRand.x * 10.0);
        q.y += sin(t * 2.0 + aRand.y * 6.28) * 0.6 + snoise(vec3(p.xz * 0.05, t * 0.2)) * 2.0;
        q.xz = mod(q.xz - uCenter.xz + 60.0, 120.0) - 60.0 + uCenter.xz;
        q.y += uCenter.y - 8.0;
        p = q;
      `,
    });

    this.scene.fog = new THREE.FogExp2(0x000000, 0.003);
    this.scene.add(this.sky.mesh, this.dunes, this.rocks, this.sand.points, this.sun, this.hemi);
  }

  update(_dt: number, time: number, p: VisualParams, camera: THREE.PerspectiveCamera) {
    const c = this.c.update(p);
    const day = THREE.MathUtils.smoothstep(p.lightElevation, 0, 45);
    this.horizon.copy(c.bg).lerp(c.light, 0.2);
    this.top.copy(c.bg).lerp(new THREE.Color('#3f7fd1'), 0.35 + day * 0.35).multiplyScalar(0.7 + day * 0.4);
    const fog = (0.0008 + p.fogDensity * 0.0035) / p.depth;
    this.H = 10 + p.waveAmplitude * 30;
    this.framing.minY = this.H + 3;
    this.framing.target.y = this.H * 0.7;

    this.sky.update(camera, time, this.top, this.horizon, c.lightDir, c.light, p.lightIntensity, this.horizon);
    const step = GRID / SEG;
    this.dunes.position.set(Math.round(camera.position.x / step) * step, 0, Math.round(camera.position.z / step) * step);
    const u = this.duneMat.uniforms;
    u.uTime.value = time;
    u.uHeight.value = this.H;
    u.uWarp.value = 0.2 + p.turbulence * 0.8;
    u.uFreq.value = 1 / Math.max(0.4, p.scale);
    setColor(u.uSand, c.primary);
    setColor(u.uShadow, c.secondary);
    setColor(u.uCrest, c.accent);
    setColor(u.uLightColor, c.light);
    (u.uLightDir.value as THREE.Vector3).copy(c.lightDir);
    u.uLight.value = p.lightIntensity;
    u.uAmbient.value = p.ambientIntensity;
    setColor(u.uFogColor, this.horizon);
    u.uFog.value = fog;

    const sf = this.scene.fog as THREE.FogExp2;
    sf.color.copy(this.horizon);
    sf.density = fog * 0.9;
    this.sun.color.copy(c.light);
    this.sun.intensity = p.lightIntensity * 2.5;
    this.sun.position.copy(c.lightDir).multiplyScalar(100);
    this.hemi.color.copy(this.top);
    this.hemi.groundColor.copy(c.primary);
    this.hemi.intensity = p.ambientIntensity * 1.5;
    this.rockMat.color.copy(c.secondary).lerp(c.primary, 0.35);

    const n = Math.round(4 + p.complexity * 16);
    for (let i = 0; i < n; i++) {
      const s = this.rockSeeds[i];
      const rx = wrapAround(s.x, camera.position.x, 900);
      const rz = wrapAround(s.z, camera.position.z, 900);
      // Las columnas se mantienen lejos: forman el horizonte, no tapan la vista.
      const near = Math.hypot(rx - camera.position.x, rz - camera.position.z) < 180;
      this.tmp.position.set(rx, near ? -500 : -2, rz);
      this.tmp.rotation.set(0, s.r, 0);
      this.tmp.scale.set(s.w * p.scale, (s.h + this.H) * p.scale, s.w * p.scale);
      this.tmp.updateMatrix();
      this.rocks.setMatrixAt(i, this.tmp.matrix);
    }
    this.rocks.count = n;
    this.rocks.instanceMatrix.needsUpdate = true;

    this.sand.update(time, p, fog * 2, this.horizon, camera.position);
  }

  dispose() {
    this.sky.dispose();
    this.dunes.geometry.dispose();
    this.duneMat.dispose();
    this.rocks.geometry.dispose();
    this.rockMat.dispose();
    this.sand.dispose();
  }
}

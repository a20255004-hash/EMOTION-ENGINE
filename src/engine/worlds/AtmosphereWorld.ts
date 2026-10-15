import * as THREE from 'three';
import type { VisualParams } from '../../../shared/params';
import { NOISE_GLSL } from '../glsl';
import { Particles } from '../Particles';
import { SkyDome, lightDirection } from '../SkyDome';
import type { CameraFraming, World } from '../types';

const GRID = 1400;
const SEGMENTS = 300;

/** Recorrido del valle por el que vuela la cámara (idéntico en GLSL). */
const pathX = (z: number) => Math.sin(z * 0.012) * 35 + Math.sin(z * 0.031) * 8;
const PATH_GLSL = /* glsl */ `float pathX(float z){ return sin(z * 0.012) * 35.0 + sin(z * 0.031) * 8.0; }`;

/**
 * Paisaje atmosférico: relieve infinito generado en GPU (ruido fractal con
 * crestas) que deja un valle por el que viaja la cámara, cielo físico con sol y
 * velos de nubes, perspectiva aérea, bancos de niebla animados, polvo en
 * suspensión y bandadas de aves.
 */
export class AtmosphereWorld implements World {
  readonly id = 'atmosphere' as const;
  readonly scene = new THREE.Scene();
  readonly framing: CameraFraming;

  private terrain: THREE.Mesh;
  private terrainMat: THREE.ShaderMaterial;
  private sky = new SkyDome({ stars: 0.25, sunSize: 0.028, clouds: 0.7, sunIntensity: 1.8, halo: 0.45 });
  private fogLayers: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; y: number }[] = [];
  private dust: Particles;
  private birds: THREE.InstancedMesh;
  private birdMat: THREE.MeshBasicMaterial;
  private birdSeeds: { offset: THREE.Vector3; phase: number }[] = [];
  private tmp = new THREE.Object3D();
  /** Altura máxima actual del relieve (la cámara de travesía se adapta). */
  private H = 40;
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
      target: new THREE.Vector3(0, 7, 0),
      distance: 34,
      height: 14,
      minY: 6,
      fly: (t, out) => {
        const z = -t * 1.6;
        const y = 7 + this.H * 0.16;
        out.pos.set(pathX(z), y + Math.sin(t * 0.05) * 2.5, z);
        out.look.set(pathX(z - 45), y - 3, z - 45);
      },
    };

    this.terrainMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHeight: { value: 30 },
        uRough: { value: 0.6 },
        uFreq: { value: 1 },
        uOct: { value: 5 },
        uLow: { value: new THREE.Color() },
        uHigh: { value: new THREE.Color() },
        uPeak: { value: new THREE.Color() },
        uAccent: { value: new THREE.Color() },
        uLightColor: { value: new THREE.Color() },
        uLightDir: { value: new THREE.Vector3() },
        uLight: { value: 1 },
        uAmbient: { value: 0.4 },
        uSkyColor: { value: new THREE.Color() },
        uFogColor: { value: new THREE.Color() },
        uFogDensity: { value: 0.004 },
        uMist: { value: 0.5 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uHeight; uniform float uRough; uniform float uFreq; uniform int uOct;
        varying vec3 vWorld; varying vec3 vNormal; varying float vH;
        ${NOISE_GLSL}
        ${PATH_GLSL}
        float terrainH(vec2 p){
          vec2 q = p * uFreq * 0.011;
          float h = 0.0; float a = 0.5; float f = 1.0;
          for (int i = 0; i < 6; i++) {
            if (i >= uOct) break;
            float n = snoise(vec3(q * f, 7.3 + float(i)));
            float r = 1.0 - abs(n);
            h += a * mix(n * 0.5 + 0.5, r * r, uRough);
            f *= 2.07; a *= 0.5;
          }
          float d = min(abs(p.x - pathX(p.y)), length(p) * 0.9);
          float valley = smoothstep(9.0, 80.0, d);
          return h * uHeight * (0.12 + 0.88 * valley) - 1.5;
        }
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float h = terrainH(wp.xz);
          float e = 1.5;
          float hx = terrainH(wp.xz + vec2(e, 0.0));
          float hz = terrainH(wp.xz + vec2(0.0, e));
          vNormal = normalize(vec3(h - hx, e, h - hz));
          wp.y = h;
          vH = h / max(uHeight, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uLow; uniform vec3 uHigh; uniform vec3 uPeak; uniform vec3 uAccent;
        uniform vec3 uLightColor; uniform vec3 uLightDir; uniform float uLight; uniform float uAmbient; uniform vec3 uSkyColor;
        uniform vec3 uFogColor; uniform float uFogDensity; uniform float uMist;
        varying vec3 vWorld; varying vec3 vNormal; varying float vH;
        ${NOISE_GLSL}
        void main(){
          vec3 N = normalize(vNormal);
          float slope = 1.0 - N.y;
          float grain = snoise(vWorld * 0.15) * 0.06;
          vec3 col = mix(uLow, uHigh, smoothstep(0.08, 0.45, vH + grain));
          col = mix(col, uHigh * 0.7, smoothstep(0.25, 0.6, slope));
          float snow = smoothstep(0.55, 0.75, vH + grain * 2.0) * smoothstep(0.55, 0.2, slope);
          col = mix(col, uPeak, snow);
          float diff = max(dot(N, uLightDir), 0.0);
          float rim = pow(1.0 - max(dot(N, normalize(cameraPosition - vWorld)), 0.0), 3.0);
          vec3 lit = col * (uAmbient * uSkyColor + uLightColor * diff * uLight);
          lit += uAccent * rim * diff * 0.25 * uLight;
          vec3 V = normalize(vWorld - cameraPosition);
          float sunAmt = pow(max(dot(V, uLightDir), 0.0), 8.0);
          vec3 fogCol = mix(uFogColor, uLightColor, sunAmt * 0.65);
          float dist = length(vWorld - cameraPosition);
          float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
          // Niebla de valle: más densa cerca del suelo, viva con ruido.
          float mistN = snoise(vec3(vWorld.xz * 0.02, uTime * 0.05)) * 0.5 + 0.5;
          float mist = exp(-max(vWorld.y + 1.5, 0.0) * 0.22) * uMist * (0.5 + mistN * 0.7);
          lit = mix(lit, fogCol, clamp(max(fog, mist * smoothstep(5.0, 60.0, dist)), 0.0, 1.0));
          gl_FragColor = vec4(lit, 1.0);
        }`,
    });
    const geo = new THREE.PlaneGeometry(GRID, GRID, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    this.terrain = new THREE.Mesh(geo, this.terrainMat);
    this.terrain.frustumCulled = false;

    for (const y of [5, 11, 19]) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color() },
          uSun: { value: new THREE.Color() },
          uLightDir: { value: new THREE.Vector3() },
          uDensity: { value: 0.5 },
          uSeed: { value: y * 1.7 },
          uTurb: { value: 0.5 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uColor; uniform vec3 uSun; uniform vec3 uLightDir; uniform float uDensity; uniform float uSeed; uniform float uTurb;
          varying vec3 vWorld;
          ${NOISE_GLSL}
          void main(){
            vec2 q = vWorld.xz * 0.012 + vec2(uTime * 0.02 * (0.5 + uTurb), uSeed);
            float n = fbm(vec3(q, uTime * 0.015 + uSeed), 4);
            float a = smoothstep(0.0, 0.7, n) * uDensity;
            float dist = length(vWorld - cameraPosition);
            a *= smoothstep(8.0, 40.0, dist) * (1.0 - smoothstep(350.0, 650.0, dist));
            a *= smoothstep(1.0, 7.0, abs(cameraPosition.y - vWorld.y));
            vec3 V = normalize(vWorld - cameraPosition);
            vec3 col = mix(uColor, uSun, pow(max(dot(V, uLightDir), 0.0), 6.0) * 0.7);
            gl_FragColor = vec4(col, a * 0.55);
          }`,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 1, 1), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.frustumCulled = false;
      this.fogLayers.push({ mesh, mat, y });
    }

    this.dust = new Particles({
      max: 7000,
      baseSize: 0.7,
      seed: (_i, pos, r) => {
        pos.set((Math.random() - 0.5) * 90, Math.random() * 30, (Math.random() - 0.5) * 90);
        r.set(Math.random(), Math.random(), Math.random(), Math.random());
      },
      motion: /* glsl */ `
        float t = uTime * uSpeed;
        vec3 q = p;
        q.x += snoise(vec3(p.xz * 0.05, t * 0.04 + aRand.x)) * 5.0 + t * 0.8;
        q.y += mod(t * (0.2 + aRand.y * 0.4), 30.0);
        q.z += snoise(vec3(p.zx * 0.05, t * 0.04 + aRand.z)) * 5.0;
        q.y = mod(q.y, 30.0) + uCenter.y - 12.0;
        q.xz = mod(q.xz - uCenter.xz + 45.0, 90.0) - 45.0 + uCenter.xz;
        p = q;
      `,
    });

    // Aves: dos alas triangulares que baten con la escala vertical.
    const birdGeo = new THREE.BufferGeometry();
    birdGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, -1, 0.35, -0.3, 0, 0, -0.5, 0, 0, 0, 1, 0.35, -0.3, 0, 0, -0.5]), 3));
    birdGeo.computeVertexNormals();
    this.birdMat = new THREE.MeshBasicMaterial({ color: '#111111', side: THREE.DoubleSide });
    this.birds = new THREE.InstancedMesh(birdGeo, this.birdMat, 40);
    this.birds.frustumCulled = false;
    for (let i = 0; i < 40; i++) {
      this.birdSeeds.push({ offset: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 16), phase: Math.random() * 6.28 });
    }

    this.scene.fog = new THREE.FogExp2(0x000000, 0.004);
    this.scene.add(this.sky.mesh, this.terrain, ...this.fogLayers.map((l) => l.mesh), this.dust.points, this.birds);
  }

  update(_dt: number, time: number, p: VisualParams, camera: THREE.PerspectiveCamera) {
    const c = this.c;
    c.primary.set(p.primaryColor);
    c.secondary.set(p.secondaryColor);
    c.accent.set(p.accentColor);
    c.bg.set(p.backgroundColor);
    c.light.set(p.lightColor);
    lightDirection(p.lightAngle, p.lightElevation, this.lightDir);

    // Cielo: el horizonte toma el color de fondo; el cénit se enfría con la altura del sol.
    const dayness = THREE.MathUtils.smoothstep(p.lightElevation, 0, 50);
    c.horizon.copy(c.bg).lerp(c.light, 0.15);
    c.top.copy(c.secondary).lerp(c.primary, 0.35 + dayness * 0.3).multiplyScalar(0.6 + dayness * 0.8);

    const H = 18 + p.waveAmplitude * 46 * Math.min(p.scale, 1.6);
    this.H = H;
    this.framing.minY = 0.42 * H + 4;
    this.framing.height = Math.max(14, 0.42 * H + 6);

    const step = GRID / SEGMENTS;
    this.terrain.position.set(Math.round(camera.position.x / step) * step, 0, Math.round(camera.position.z / step) * step);

    const fogD = (0.0007 + p.fogDensity * 0.0028) / p.depth;
    const u = this.terrainMat.uniforms;
    u.uTime.value = time;
    u.uHeight.value = H;
    u.uRough.value = Math.min(1, p.turbulence * 0.6);
    u.uFreq.value = 1 / Math.max(0.4, p.scale);
    u.uOct.value = 3 + Math.round(p.complexity * 3);
    (u.uLow.value as THREE.Color).copy(c.primary);
    (u.uHigh.value as THREE.Color).copy(c.secondary).lerp(c.primary, 0.2);
    (u.uPeak.value as THREE.Color).set('#f4f2ee').lerp(c.light, 0.3);
    (u.uAccent.value as THREE.Color).copy(c.accent);
    (u.uLightColor.value as THREE.Color).copy(c.light);
    (u.uLightDir.value as THREE.Vector3).copy(this.lightDir);
    u.uLight.value = p.lightIntensity;
    u.uAmbient.value = p.ambientIntensity;
    (u.uSkyColor.value as THREE.Color).copy(c.top).lerp(c.horizon, 0.5);
    (u.uFogColor.value as THREE.Color).copy(c.horizon);
    u.uFogDensity.value = fogD;
    u.uMist.value = p.fogDensity * 0.55;

    const sf = this.scene.fog as THREE.FogExp2;
    sf.color.copy(c.horizon);
    sf.density = fogD;

    this.sky.update(camera, time, c.top, c.horizon, this.lightDir, c.light, p.lightIntensity, c.horizon.clone().lerp(new THREE.Color('#ffffff'), 0.25));

    for (const layer of this.fogLayers) {
      layer.mesh.position.set(camera.position.x, layer.y * (0.6 + H / 60), camera.position.z);
      const m = layer.mat.uniforms;
      m.uTime.value = time;
      (m.uColor.value as THREE.Color).copy(c.horizon).lerp(new THREE.Color('#ffffff'), 0.15);
      (m.uSun.value as THREE.Color).copy(c.light);
      (m.uLightDir.value as THREE.Vector3).copy(this.lightDir);
      m.uDensity.value = p.fogDensity * 1.1;
      m.uTurb.value = p.turbulence;
    }

    this.dust.update(time, p, fogD * 2, c.horizon, camera.position);

    // Bandada que circula frente a la cámara.
    const count = Math.round(6 + p.complexity * 34);
    this.birds.count = count;
    this.birdMat.color.copy(c.secondary).multiplyScalar(0.4);
    const leader = new THREE.Vector3(camera.position.x + Math.sin(time * 0.07) * 60, H * 0.6 + 12 + Math.sin(time * 0.11) * 4, camera.position.z - 80 + Math.cos(time * 0.07) * 30);
    for (let i = 0; i < count; i++) {
      const s = this.birdSeeds[i];
      this.tmp.position.copy(leader).add(s.offset);
      this.tmp.rotation.set(0, Math.PI / 2 + time * 0.07, 0);
      const flap = 0.4 + Math.abs(Math.sin(time * 6 + s.phase)) * 0.9;
      this.tmp.scale.set(1.2, flap, 1.2);
      this.tmp.updateMatrix();
      this.birds.setMatrixAt(i, this.tmp.matrix);
    }
    this.birds.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.terrain.geometry.dispose();
    this.terrainMat.dispose();
    this.sky.dispose();
    for (const l of this.fogLayers) {
      l.mesh.geometry.dispose();
      l.mat.dispose();
    }
    this.dust.dispose();
    this.birds.geometry.dispose();
    this.birdMat.dispose();
  }
}

export { pathX };

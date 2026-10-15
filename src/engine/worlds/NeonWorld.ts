import * as THREE from 'three';
import type { VisualParams } from '../../../shared/params';
import { NOISE_GLSL } from '../glsl';
import { Particles } from '../Particles';
import type { CameraFraming, World } from '../types';
import { Palette, seeded, setColor } from './common';

/**
 * Ciudad neón (synthwave): una rejilla luminosa que fluye hacia la cámara y se
 * levanta en montañas de alambre a los lados, sol retro con franjas, siluetas
 * de rascacielos en el horizonte y poliedros de neón flotando.
 */
export class NeonWorld implements World {
  readonly id = 'neon' as const;
  readonly scene = new THREE.Scene();
  readonly framing: CameraFraming;

  private grid: THREE.Mesh;
  private gridMat: THREE.ShaderMaterial;
  private sun: THREE.Mesh;
  private sunMat: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private city: THREE.InstancedMesh;
  private cityMat: THREE.ShaderMaterial;
  private shapes: THREE.InstancedMesh;
  private shapeMat = new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true });
  private shapeSeeds: { x: number; y: number; z: number; s: number; spin: number }[] = [];
  private dust: Particles;
  private tmp = new THREE.Object3D();
  private c = new Palette();

  constructor() {
    this.framing = {
      target: new THREE.Vector3(0, 5, -40),
      distance: 26,
      height: 2,
      minY: 1.2,
      fly: (t, out) => {
        out.pos.set(Math.sin(t * 0.05) * 6, 3.5 + Math.sin(t * 0.13) * 1.2, 10);
        out.look.set(Math.sin(t * 0.05 + 0.5) * 3, 6, -80);
      },
    };

    this.gridMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 1 },
        uAmp: { value: 1 },
        uRough: { value: 0.5 },
        uLine: { value: new THREE.Color() },
        uLine2: { value: new THREE.Color() },
        uFill: { value: new THREE.Color() },
        uFogColor: { value: new THREE.Color() },
        uFog: { value: 0.004 },
        uGlow: { value: 1 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uSpeed; uniform float uAmp; uniform float uRough;
        varying vec3 vWorld; varying vec2 vGrid; varying float vH;
        ${NOISE_GLSL}
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float scroll = uTime * 12.0 * uSpeed;
          vec2 g = vec2(wp.x, wp.z - scroll);
          float side = smoothstep(14.0, 60.0, abs(wp.x));
          float h = (fbm(vec3(g * 0.018, 0.0), 4) * 0.5 + 0.5);
          h = pow(h, 1.0 + uRough) * side * 55.0 * uAmp;
          wp.y = h;
          vH = h; vWorld = wp.xyz; vGrid = g;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLine; uniform vec3 uLine2; uniform vec3 uFill; uniform vec3 uFogColor; uniform float uFog; uniform float uGlow;
        varying vec3 vWorld; varying vec2 vGrid; varying float vH;
        float gridLine(vec2 p, float size){
          vec2 c = p / size;
          vec2 w = fwidth(c) * 1.2;
          vec2 l = smoothstep(w, vec2(0.0), abs(fract(c - 0.5) - 0.5));
          return max(l.x, l.y);
        }
        void main(){
          float line = gridLine(vGrid, 4.0);
          vec3 lineCol = mix(uLine2, uLine, smoothstep(0.0, 30.0, vH));
          float d = length(vWorld - cameraPosition);
          line *= smoothstep(260.0, 30.0, d);
          vec3 col = uFill + lineCol * line * (0.9 * uGlow);
          float fog = 1.0 - exp(-pow(d * uFog, 1.2));
          col = mix(col, uFogColor, fog);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const gg = new THREE.PlaneGeometry(260, 520, 130, 260);
    gg.rotateX(-Math.PI / 2);
    gg.translate(0, 0, -200);
    this.grid = new THREE.Mesh(gg, this.gridMat);
    this.grid.frustumCulled = false;

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform float uTime; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main(){
          float h = normalize(vDir).y;
          vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
          float st = step(0.996, hash(floor(normalize(vDir) * 260.0))) * smoothstep(0.05, 0.4, h);
          col += vec3(st) * (0.6 + 0.4 * sin(uTime * 3.0 + h * 90.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;

    this.sunMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uTime: { value: 0 }, uLight: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uBottom; uniform float uTime; uniform float uLight; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p);
          float disk = smoothstep(0.5, 0.49, r * 1.6);
          float y = vUv.y;
          float stripes = step(0.5, fract(y * 18.0 - uTime * 0.4)) + step(0.55, y);
          float cut = y < 0.55 ? clamp(stripes, 0.0, 1.0) : 1.0;
          vec3 col = mix(uBottom, uTop, smoothstep(0.15, 0.85, y));
          float halo = smoothstep(0.5, 0.0, r) * 0.35;
          float a = disk * cut + halo;
          gl_FragColor = vec4(col * (disk * cut * 1.6 + halo) * uLight, a);
        }`,
    });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.sunMat);

    this.cityMat = new THREE.ShaderMaterial({
      uniforms: { uBody: { value: new THREE.Color() }, uWin: { value: new THREE.Color() }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying float vSeed;
        void main(){
          vUv = uv;
          vSeed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBody; uniform vec3 uWin; uniform float uTime; varying vec2 vUv; varying float vSeed;
        void main(){
          vec2 cell = floor(vUv * vec2(6.0, 30.0));
          float on = step(0.72, fract(sin(dot(cell + vSeed, vec2(12.9898, 78.233))) * 43758.5453));
          vec2 f = fract(vUv * vec2(6.0, 30.0));
          float win = on * step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.7);
          gl_FragColor = vec4(uBody + uWin * win * 1.4, 1.0);
        }`,
    });
    this.city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.cityMat, 60);
    this.city.frustumCulled = false;
    const rnd = seeded(11);
    for (let i = 0; i < 60; i++) {
      const x = (rnd() - 0.5) * 300;
      const w = 5 + rnd() * 10;
      const h = 15 + rnd() * 60 * (1 - Math.abs(x) / 200);
      this.tmp.position.set(x, h / 2, -330 - rnd() * 60);
      this.tmp.scale.set(w, h, w);
      this.tmp.rotation.set(0, 0, 0);
      this.tmp.updateMatrix();
      this.city.setMatrixAt(i, this.tmp.matrix);
    }

    this.shapes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), this.shapeMat, 24);
    this.shapes.frustumCulled = false;
    for (let i = 0; i < 24; i++) this.shapeSeeds.push({ x: (rnd() - 0.5) * 50, y: 6 + rnd() * 20, z: -20 - rnd() * 120, s: 0.8 + rnd() * 2.5, spin: 0.2 + rnd() });

    this.dust = new Particles({
      max: 4000,
      baseSize: 0.8,
      seed: (_i, pos, r) => {
        pos.set((Math.random() - 0.5) * 100, Math.random() * 30, -Math.random() * 160);
        r.set(Math.random(), Math.random(), Math.random(), Math.random());
      },
      motion: /* glsl */ `
        float t = uTime * uSpeed;
        p.z = mod(p.z + t * 12.0, 160.0) - 150.0;
        p.y += sin(t + aRand.x * 6.28) * 0.5;
      `,
    });

    this.scene.add(this.sky, this.sun, this.city, this.grid, this.shapes, this.dust.points);
  }

  update(_dt: number, time: number, p: VisualParams, camera: THREE.PerspectiveCamera) {
    const c = this.c.update(p);
    const fog = (0.0015 + p.fogDensity * 0.006) / p.depth;
    const horizon = c.primary.clone().lerp(c.bg, 0.55);
    setColor(this.skyMat.uniforms.uTop, c.bg.clone().multiplyScalar(0.5));
    setColor(this.skyMat.uniforms.uHorizon, horizon);
    this.skyMat.uniforms.uTime.value = time;
    this.sky.position.copy(camera.position);

    const gu = this.gridMat.uniforms;
    gu.uTime.value = time;
    gu.uSpeed.value = 1;
    gu.uAmp.value = p.waveAmplitude;
    gu.uRough.value = p.turbulence;
    setColor(gu.uLine, c.primary);
    setColor(gu.uLine2, c.accent);
    setColor(gu.uFill, c.secondary.clone().multiplyScalar(0.6));
    setColor(gu.uFogColor, horizon);
    gu.uFog.value = fog;
    gu.uGlow.value = 0.6 + p.intensity * 0.5;
    this.grid.position.x = Math.round(camera.position.x / 2) * 2;

    const su = this.sunMat.uniforms;
    su.uTime.value = time;
    setColor(su.uTop, c.light);
    setColor(su.uBottom, c.primary);
    su.uLight.value = p.lightIntensity;
    const sunSize = 160 * p.scale;
    this.sun.scale.set(sunSize, sunSize, 1);
    this.sun.position.set(camera.position.x * 0.9, 12 + p.lightElevation * 0.45, -420);

    this.cityMat.uniforms.uTime.value = time;
    setColor(this.cityMat.uniforms.uBody, c.secondary.clone().multiplyScalar(0.5));
    setColor(this.cityMat.uniforms.uWin, c.accent);
    this.city.position.x = camera.position.x * 0.95;

    const n = Math.round(4 + p.complexity * 20);
    this.shapes.count = n;
    this.shapeMat.color.copy(c.accent).lerp(c.primary, 0.3).multiplyScalar(1.3 + p.intensity * 0.3);
    for (let i = 0; i < n; i++) {
      const s = this.shapeSeeds[i];
      const z = -160 + THREE.MathUtils.euclideanModulo(s.z + 160 + time * 4 * s.spin, 150);
      this.tmp.position.set(s.x + camera.position.x, s.y + Math.sin(time * s.spin + i) * 1.5, z);
      this.tmp.rotation.set(time * s.spin, time * s.spin * 0.7, 0);
      this.tmp.scale.setScalar(s.s * p.scale);
      this.tmp.updateMatrix();
      this.shapes.setMatrixAt(i, this.tmp.matrix);
    }
    this.shapes.instanceMatrix.needsUpdate = true;

    this.dust.update(time, p, fog, horizon);
  }

  dispose() {
    this.grid.geometry.dispose();
    this.gridMat.dispose();
    this.sun.geometry.dispose();
    this.sunMat.dispose();
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    this.city.geometry.dispose();
    this.cityMat.dispose();
    this.shapes.geometry.dispose();
    this.shapeMat.dispose();
    this.dust.dispose();
  }
}

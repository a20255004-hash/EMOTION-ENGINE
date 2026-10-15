import * as THREE from 'three';
import type { VisualParams } from '../../../shared/params';
import { NOISE_GLSL } from '../glsl';
import { Particles } from '../Particles';
import type { CameraFraming, World } from '../types';
import { Palette, seeded, setColor } from './common';

const LENGTH = 420;
const RINGS = 40;

/**
 * Vórtice cuántico: túnel infinito cuyas paredes giran y se retuercen con
 * patrones de energía, anillos que pasan a toda velocidad, estelas de luz y un
 * punto de fuga brillante al fondo.
 */
export class VortexWorld implements World {
  readonly id = 'vortex' as const;
  readonly scene = new THREE.Scene();
  readonly framing: CameraFraming;

  private tunnel: THREE.Mesh;
  private tunnelMat: THREE.ShaderMaterial;
  private rings: THREE.InstancedMesh;
  private ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  private ringSeeds: { z: number; r: number; tilt: number; s: number }[] = [];
  private glow: THREE.Mesh;
  private glowMat: THREE.ShaderMaterial;
  private streaks: Particles;
  private tmp = new THREE.Object3D();
  private c = new Palette();
  private travel = 0;

  constructor() {
    this.framing = {
      target: new THREE.Vector3(0, 0, -40),
      distance: 7,
      height: 0.5,
      minY: -100,
      fly: (t, out) => {
        out.pos.set(Math.sin(t * 0.04) * 2.5, Math.cos(t * 0.05) * 2.5, 6);
        out.look.set(Math.sin(t * 0.04 + 0.6) * 1.5, Math.cos(t * 0.05 + 0.6) * 1.5, -60);
      },
    };

    this.tunnelMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTime: { value: 0 },
        uTravel: { value: 0 },
        uTwist: { value: 0.5 },
        uPulse: { value: 0.5 },
        uDetail: { value: 0.5 },
        uA: { value: new THREE.Color() },
        uB: { value: new THREE.Color() },
        uBg: { value: new THREE.Color() },
        uGlow: { value: 1 },
        uFog: { value: 0.01 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uTravel; uniform float uPulse;
        varying vec2 vUv; varying float vDepth; varying vec3 vWorld;
        void main(){
          vUv = uv;
          vec3 p = position;
          float ring = sin(uv.y * 60.0 - uTravel * 0.25) * 0.5 + 0.5;
          p.xz *= 1.0 + ring * 0.12 * uPulse + sin(uTime * 1.5 + uv.y * 20.0) * 0.05 * uPulse;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uTravel; uniform float uTwist; uniform float uDetail; uniform vec3 uA; uniform vec3 uB; uniform vec3 uBg; uniform float uGlow; uniform float uFog;
        varying vec2 vUv; varying float vDepth; varying vec3 vWorld;
        ${NOISE_GLSL}
        void main(){
          float along = vUv.y * ${LENGTH.toFixed(1)} + uTravel;
          float ang = vUv.x * 6.2831 + along * 0.02 * uTwist + uTime * 0.2 * uTwist;
          float segs = 6.0 + floor(uDetail * 10.0);
          float spiral = smoothstep(0.92, 1.0, sin(ang * segs + along * 0.15) * 0.5 + 0.5);
          float rings = smoothstep(0.94, 1.0, sin(along * 0.5) * 0.5 + 0.5);
          vec2 cell = vec2(ang * segs / 6.2831, along * 0.25);
          vec2 f = fract(cell);
          float grid = (1.0 - smoothstep(0.0, 0.06, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)))) * uDetail;
          float energy = snoise(vec3(cos(ang) * 1.5, sin(ang) * 1.5, along * 0.03 - uTime * 0.3)) * 0.5 + 0.5;
          vec3 col = mix(uA, uB, energy) * (0.08 + energy * 0.25);
          col += mix(uB, uA, fract(along * 0.01)) * (spiral * 1.4 + rings * 1.2 + grid * 0.5) * uGlow;
          float fog = 1.0 - exp(-pow(vDepth * uFog, 1.3));
          col = mix(col, uBg, clamp(fog, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const tg = new THREE.CylinderGeometry(9, 9, LENGTH, 96, 300, true);
    tg.rotateX(Math.PI / 2);
    tg.translate(0, 0, -LENGTH / 2 + 30);
    this.tunnel = new THREE.Mesh(tg, this.tunnelMat);
    this.tunnel.frustumCulled = false;

    this.rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.035, 8, 96), this.ringMat, RINGS);
    this.rings.frustumCulled = false;
    const rnd = seeded(91);
    for (let i = 0; i < RINGS; i++) this.ringSeeds.push({ z: rnd() * 300, r: 3 + rnd() * 4.5, tilt: (rnd() - 0.5) * 0.6, s: rnd() });

    this.glowMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color() }, uStrength: { value: 1 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uStrength; uniform float uTime; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p);
          float a = atan(p.y, p.x);
          float rays = 0.6 + 0.4 * sin(a * 12.0 + uTime * 2.0);
          float g = pow(max(0.0, 1.0 - r * 2.0), 3.0) * (0.7 + 0.3 * rays);
          gl_FragColor = vec4(uColor * g * uStrength, g);
        }`,
    });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), this.glowMat);
    this.glow.position.z = -LENGTH + 60;

    this.streaks = new Particles({
      max: 7000,
      baseSize: 1,
      seed: (_i, p, r) => {
        const a = Math.random() * Math.PI * 2;
        const rad = 1 + Math.random() * 7;
        p.set(Math.cos(a) * rad, Math.sin(a) * rad, -Math.random() * 300);
        r.set(Math.random(), Math.random(), Math.random(), Math.random());
      },
      motion: /* glsl */ `
        float t = uTime * uSpeed;
        float ang = atan(p.y, p.x) + t * 0.15 * (0.5 + aRand.x);
        float rad = length(p.xy);
        p.xy = vec2(cos(ang), sin(ang)) * rad;
        p.z = mod(p.z + t * (40.0 + aRand.y * 40.0), 300.0) - 280.0;
      `,
    });

    this.scene.add(this.tunnel, this.glow, this.rings, this.streaks.points);
  }

  update(dt: number, time: number, p: VisualParams, camera: THREE.PerspectiveCamera) {
    const c = this.c.update(p);
    this.travel += dt * 30 * p.speed;
    const fog = (0.004 + p.fogDensity * 0.02) / p.depth;
    const u = this.tunnelMat.uniforms;
    u.uTime.value = time;
    u.uTravel.value = this.travel;
    u.uTwist.value = p.turbulence;
    u.uPulse.value = p.waveAmplitude;
    u.uDetail.value = p.complexity;
    setColor(u.uA, c.primary);
    setColor(u.uB, c.accent);
    setColor(u.uBg, c.bg);
    u.uGlow.value = 0.5 + p.intensity * 0.5;
    u.uFog.value = fog;
    this.tunnel.scale.set(p.scale, p.scale, 1);
    this.tunnel.rotation.z = time * 0.05 * p.turbulence;

    this.glowMat.uniforms.uTime.value = time;
    setColor(this.glowMat.uniforms.uColor, c.light.clone().lerp(c.accent, 0.3));
    this.glowMat.uniforms.uStrength.value = p.lightIntensity * 1.2;
    this.glow.lookAt(camera.position);

    this.ringMat.color.copy(c.accent).lerp(c.light, 0.3).multiplyScalar(0.8 + p.intensity * 0.4);
    const n = Math.round(10 + p.complexity * (RINGS - 10));
    for (let i = 0; i < n; i++) {
      const s = this.ringSeeds[i];
      const z = THREE.MathUtils.euclideanModulo(s.z + time * 25 * (0.6 + s.s * 0.6), 300) - 280;
      this.tmp.position.set(0, 0, z);
      this.tmp.rotation.set(s.tilt, s.tilt * 0.5, time * (0.2 + s.s));
      this.tmp.scale.setScalar(s.r * p.scale);
      this.tmp.updateMatrix();
      this.rings.setMatrixAt(i, this.tmp.matrix);
    }
    this.rings.count = n;
    this.rings.instanceMatrix.needsUpdate = true;

    this.streaks.update(time, p, fog * 0.5, c.bg);
  }

  dispose() {
    this.tunnel.geometry.dispose();
    this.tunnelMat.dispose();
    this.rings.geometry.dispose();
    this.ringMat.dispose();
    this.glow.geometry.dispose();
    this.glowMat.dispose();
    this.streaks.dispose();
  }
}

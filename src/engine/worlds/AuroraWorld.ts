import * as THREE from 'three';
import type { VisualParams } from '../../../shared/params';
import { NOISE_GLSL } from '../glsl';
import { Particles } from '../Particles';
import { SkyDome } from '../SkyDome';
import type { CameraFraming, World } from '../types';
import { Palette, setColor } from './common';

/**
 * Aurora boreal: cortinas de luz polar que ondulan en anillo alrededor del
 * espectador, llanura de hielo que refleja la aurora, cordillera lejana
 * recortada contra el cielo y nieve que cae.
 */
export class AuroraWorld implements World {
  readonly id = 'aurora' as const;
  readonly scene = new THREE.Scene();
  readonly framing: CameraFraming;

  private sky = new SkyDome({ stars: 1.3, sunSize: 0.025, clouds: 0, sunIntensity: 1.6, halo: 0.25 });
  private curtains = new THREE.Group();
  private curtainMat: THREE.ShaderMaterial;
  private ice: THREE.Mesh;
  private iceMat: THREE.ShaderMaterial;
  private ridge: THREE.Mesh;
  private ridgeMat: THREE.ShaderMaterial;
  private snow: Particles;
  private c = new Palette();
  private horizon = new THREE.Color();
  private top = new THREE.Color();

  constructor() {
    this.framing = {
      target: new THREE.Vector3(0, 10, 0),
      distance: 34,
      height: 3,
      minY: 1.5,
      fly: (t, out) => {
        out.pos.set(Math.sin(t * 0.03) * 20, 4 + Math.sin(t * 0.1), -t * 0.8);
        out.look.set(out.pos.x * 0.5, 14, out.pos.z - 60);
      },
    };

    this.curtainMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 1 },
        uTurb: { value: 0.5 },
        uA: { value: new THREE.Color() },
        uB: { value: new THREE.Color() },
        uStrength: { value: 1 },
        uDetail: { value: 0.5 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uAmp; uniform float uTurb;
        varying vec2 vUv; varying float vFold;
        ${NOISE_GLSL}
        void main(){
          vUv = uv;
          vec3 p = position;
          float fold = snoise(vec3(p.x * 0.012, uTime * 0.05 * (0.5 + uTurb), 1.3));
          p.z += fold * 40.0 * uAmp + sin(p.x * 0.03 + uTime * 0.4) * 8.0 * uAmp;
          p.y += snoise(vec3(p.x * 0.02, uTime * 0.08, 4.0)) * 6.0 * uAmp;
          vFold = fold;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uStrength; uniform float uTurb; uniform float uDetail;
        varying vec2 vUv; varying float vFold;
        ${NOISE_GLSL}
        void main(){
          float rays = fbm(vec3(vUv.x * (18.0 + uDetail * 30.0), uTime * 0.15 * (0.5 + uTurb), 0.0), 4) * 0.5 + 0.5;
          rays = pow(rays, 2.0);
          float base = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.08, 1.0, vUv.y));
          float tail = pow(1.0 - vUv.y, 2.5);
          float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          vec3 col = mix(uA, uB, smoothstep(0.15, 0.85, vUv.y + vFold * 0.15));
          float a = (base * 1.4 + tail * 0.5) * rays * edge * uStrength;
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    // Cuatro cortinas en anillo: siempre hay aurora a la vista al orbitar.
    for (let i = 0; i < 4; i++) {
      const g = new THREE.PlaneGeometry(420, 90, 220, 1);
      g.translate(0, 45, 0);
      const m = new THREE.Mesh(g, this.curtainMat);
      const a = (i / 4) * Math.PI * 2 + 0.4;
      m.position.set(Math.sin(a) * 200, 25 + i * 6, Math.cos(a) * 200);
      m.lookAt(0, m.position.y, 0);
      m.frustumCulled = false;
      this.curtains.add(m);
    }

    this.iceMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSnow: { value: new THREE.Color() },
        uTint: { value: new THREE.Color() },
        uAurora: { value: new THREE.Color() },
        uFogColor: { value: new THREE.Color() },
        uFog: { value: 0.003 },
        uLight: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld; varying float vH;
        ${NOISE_GLSL}
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float h = snoise(vec3(wp.xz * 0.01, 0.0)) * 1.6 + snoise(vec3(wp.xz * 0.05, 3.0)) * 0.3;
          wp.y = h; vH = h; vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uSnow; uniform vec3 uTint; uniform vec3 uAurora; uniform vec3 uFogColor; uniform float uFog; uniform float uLight;
        varying vec3 vWorld; varying float vH;
        ${NOISE_GLSL}
        void main(){
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(V.y, 0.0), 3.0);
          float sparkle = step(0.985, fract(sin(dot(floor(vWorld.xz * 6.0), vec2(12.9898, 78.233))) * 43758.5453)) * (0.5 + 0.5 * sin(uTime * 3.0 + vWorld.x));
          float wave = snoise(vec3(vWorld.x * 0.01 + uTime * 0.03, vWorld.z * 0.004, uTime * 0.05)) * 0.5 + 0.5;
          vec3 col = mix(uTint, uSnow, smoothstep(-1.5, 1.5, vH)) * (0.12 + 0.22 * uLight);
          col += uAurora * fres * (0.4 + wave * 0.8);
          col += vec3(sparkle) * 0.6;
          float d = length(cameraPosition - vWorld);
          col = mix(col, uFogColor, 1.0 - exp(-pow(d * uFog, 1.4)));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const iceGeo = new THREE.PlaneGeometry(1400, 1400, 160, 160);
    iceGeo.rotateX(-Math.PI / 2);
    this.ice = new THREE.Mesh(iceGeo, this.iceMat);
    this.ice.frustumCulled = false;

    this.ridgeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      uniforms: { uColor: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uHeight: { value: 0.5 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform vec3 uRim; uniform float uHeight; varying vec2 vUv;
        ${NOISE_GLSL}
        void main(){
          float a = vUv.x * 6.2831;
          float ridge = 0.25 + (fbm(vec3(cos(a) * 3.0, sin(a) * 3.0, 0.5), 5) * 0.5 + 0.5) * uHeight;
          if (vUv.y > ridge) discard;
          float rim = smoothstep(ridge - 0.02, ridge, vUv.y);
          gl_FragColor = vec4(mix(uColor, uRim, rim * 0.6), 1.0);
        }`,
    });
    this.ridge = new THREE.Mesh(new THREE.CylinderGeometry(700, 700, 160, 128, 1, true), this.ridgeMat);
    this.ridge.position.y = 70;
    this.ridge.frustumCulled = false;

    this.snow = new Particles({
      max: 9000,
      baseSize: 0.9,
      additive: false,
      seed: (_i, pos, r) => {
        pos.set((Math.random() - 0.5) * 120, Math.random() * 60, (Math.random() - 0.5) * 120);
        r.set(Math.random(), Math.random(), Math.random(), Math.random());
      },
      motion: /* glsl */ `
        float t = uTime * uSpeed;
        vec3 q = p;
        q.y = mod(p.y - t * (1.5 + aRand.y * 2.0), 60.0) + uCenter.y - 15.0;
        q.x += sin(t * 0.5 + aRand.x * 6.28) * 2.0 + snoise(vec3(p.xz * 0.05, t * 0.1)) * 3.0;
        q.xz = mod(q.xz - uCenter.xz + 60.0, 120.0) - 60.0 + uCenter.xz;
        p = q;
      `,
    });

    this.scene.add(this.sky.mesh, this.ridge, this.ice, this.curtains, this.snow.points);
  }

  update(_dt: number, time: number, p: VisualParams, camera: THREE.PerspectiveCamera) {
    const c = this.c.update(p);
    this.top.copy(c.bg).multiplyScalar(0.6);
    this.horizon.copy(c.bg).lerp(c.primary, 0.12).lerp(c.secondary, 0.3);
    const fog = (0.0008 + p.fogDensity * 0.004) / p.depth;

    this.sky.update(camera, time, this.top, this.horizon, c.lightDir, c.light, p.lightIntensity);
    const u = this.curtainMat.uniforms;
    u.uTime.value = time;
    u.uAmp.value = p.waveAmplitude;
    u.uTurb.value = p.turbulence;
    u.uDetail.value = p.complexity;
    setColor(u.uA, c.primary);
    setColor(u.uB, c.accent);
    u.uStrength.value = 0.5 + p.intensity * 0.5;
    this.curtains.position.set(camera.position.x, 0, camera.position.z);
    this.curtains.scale.setScalar(0.8 + p.scale * 0.2);
    this.curtains.rotation.y = time * 0.01;

    const step = 1400 / 160;
    this.ice.position.set(Math.round(camera.position.x / step) * step, 0, Math.round(camera.position.z / step) * step);
    const iu = this.iceMat.uniforms;
    iu.uTime.value = time;
    setColor(iu.uSnow, c.light);
    setColor(iu.uTint, c.secondary);
    (iu.uAurora.value as THREE.Color).copy(c.primary).lerp(c.accent, 0.4).multiplyScalar(0.35 * p.intensity);
    setColor(iu.uFogColor, this.horizon);
    iu.uFog.value = fog;
    iu.uLight.value = p.lightIntensity;

    this.ridge.position.x = camera.position.x;
    this.ridge.position.z = camera.position.z;
    setColor(this.ridgeMat.uniforms.uColor, this.horizon.clone().multiplyScalar(0.6));
    setColor(this.ridgeMat.uniforms.uRim, c.primary);
    this.ridgeMat.uniforms.uHeight.value = 0.25 + p.waveAmplitude * 0.15;

    this.snow.update(time, p, fog * 2, this.horizon, camera.position);
  }

  dispose() {
    this.sky.dispose();
    this.curtains.children.forEach((m) => (m as THREE.Mesh).geometry.dispose());
    this.curtainMat.dispose();
    this.ice.geometry.dispose();
    this.iceMat.dispose();
    this.ridge.geometry.dispose();
    this.ridgeMat.dispose();
    this.snow.dispose();
  }
}

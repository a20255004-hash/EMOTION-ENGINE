import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VisualParams } from '../../../shared/params';
import { NOISE_GLSL } from '../glsl';
import { Particles } from '../Particles';
import { lightDirection } from '../SkyDome';
import type { CameraFraming, World } from '../types';

interface OrbitRing {
  mesh: THREE.InstancedMesh;
  material: THREE.MeshStandardMaterial;
  seeds: { angle: number; radius: number; y: number; spin: THREE.Vector3; size: number }[];
  tilt: THREE.Euler;
  speed: number;
  max: number;
}

/**
 * Universo abstracto: núcleo deformado por ruido 3D en GPU con borde de Fresnel,
 * anillos orbitales de poliedros instanciados, galaxia espiral de partículas
 * con rotación diferencial y una nebulosa procedural de fondo.
 */
export class CosmosWorld implements World {
  readonly id = 'cosmos' as const;
  readonly scene = new THREE.Scene();
  readonly framing: CameraFraming;

  private core: THREE.Mesh;
  private coreMat: THREE.ShaderMaterial;
  private halo: THREE.Mesh;
  private haloMat: THREE.ShaderMaterial;
  private nebula: THREE.Mesh;
  private nebulaMat: THREE.ShaderMaterial;
  private galaxy: Particles;
  private stars: THREE.Points;
  private rings: OrbitRing[] = [];
  private keyLight = new THREE.DirectionalLight('#ffffff', 1);
  private coreLight = new THREE.PointLight('#ffffff', 40, 80, 1.6);
  private ambient = new THREE.AmbientLight('#ffffff', 0.3);
  private tmp = new THREE.Object3D();
  private q = new THREE.Quaternion();
  private lightDir = new THREE.Vector3();
  private col = { primary: new THREE.Color(), secondary: new THREE.Color(), accent: new THREE.Color(), bg: new THREE.Color(), light: new THREE.Color() };

  constructor() {
    this.framing = {
      target: new THREE.Vector3(0, 0, 0),
      distance: 15,
      height: 3,
      minY: -100,
      fly: (t, out) => {
        const a = t * 0.02;
        const r = 26 + Math.sin(t * 0.013) * 10;
        out.pos.set(Math.cos(a) * r, Math.sin(t * 0.017) * 7, Math.sin(a) * r);
        out.look.set(Math.cos(a + 0.9) * 6, 0, Math.sin(a + 0.9) * 6);
      },
    };

    this.coreMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 0.6 },
        uTurb: { value: 0.6 },
        uFreq: { value: 1.2 },
        uOctaves: { value: 3 },
        uPrimary: { value: new THREE.Color() },
        uSecondary: { value: new THREE.Color() },
        uAccent: { value: new THREE.Color() },
        uLightColor: { value: new THREE.Color() },
        uLightDir: { value: new THREE.Vector3() },
        uLight: { value: 1 },
        uAmbient: { value: 0.3 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uAmp; uniform float uTurb; uniform float uFreq; uniform int uOctaves;
        varying vec3 vNormal; varying vec3 vWorld; varying float vNoise;
        ${NOISE_GLSL}
        float field(vec3 n){
          vec3 q = n * uFreq + vec3(0.0, uTime * 0.18, uTime * 0.07);
          float warp = snoise(q * 0.6 + uTime * 0.05) * uTurb;
          return fbm(q + warp, uOctaves);
        }
        void main(){
          vec3 n = normalize(position);
          float f = field(n);
          vNoise = f;
          float disp = f * uAmp + sin(uTime * 1.5 + n.y * 4.0) * 0.04 * uAmp;
          vec3 pos = position + n * disp * length(position);
          // Normal aproximada por diferencias finitas sobre la esfera.
          vec3 t1 = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          vec3 t2 = cross(n, t1);
          float e = 0.02;
          vec3 n1 = normalize(n + t1 * e); vec3 n2 = normalize(n + t2 * e);
          vec3 p1 = n1 * length(position) * (1.0 + field(n1) * uAmp);
          vec3 p2 = n2 * length(position) * (1.0 + field(n2) * uAmp);
          vec3 nn = normalize(cross(p1 - pos, p2 - pos));
          if (dot(nn, n) < 0.0) nn = -nn;
          vNormal = normalize(mat3(modelMatrix) * nn);
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uPrimary; uniform vec3 uSecondary; uniform vec3 uAccent;
        uniform vec3 uLightColor; uniform vec3 uLightDir; uniform float uLight; uniform float uAmbient;
        varying vec3 vNormal; varying vec3 vWorld; varying float vNoise;
        void main(){
          vec3 N = normalize(vNormal);
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
          float diff = max(dot(N, uLightDir), 0.0);
          float bands = 0.5 + 0.5 * sin(vNoise * 9.0 + uTime * 0.6);
          vec3 base = mix(uSecondary, uPrimary, smoothstep(-0.4, 0.5, vNoise));
          base = mix(base, uAccent, smoothstep(0.75, 1.0, bands) * 0.35);
          vec3 col = base * (uAmbient + diff * uLight);
          vec3 H = normalize(uLightDir + V);
          col += uLightColor * pow(max(dot(N, H), 0.0), 60.0) * uLight * 0.8;
          col += uAccent * fres * (1.2 + 0.4 * sin(uTime));
          col += uAccent * smoothstep(0.35, 0.7, vNoise) * 0.5;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    // Geometría indexada: cada vértice se desplaza una sola vez en GPU.
    const coreGeo = new THREE.IcosahedronGeometry(2.4, 48);
    coreGeo.deleteAttribute('normal');
    coreGeo.deleteAttribute('uv');
    this.core = new THREE.Mesh(mergeVertices(coreGeo), this.coreMat);

    this.haloMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color() }, uStrength: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uStrength; varying vec3 vN; varying vec3 vV;
        void main(){
          float r = pow(max(-dot(normalize(vN), normalize(vV)), 0.0), 3.0);
          gl_FragColor = vec4(uColor * r * uStrength, r);
        }`,
    });
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(4.2, 48, 24), this.haloMat);

    this.nebulaMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uA: { value: new THREE.Color() },
        uB: { value: new THREE.Color() },
        uBg: { value: new THREE.Color() },
        uDensity: { value: 0.5 },
        uHue: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform vec3 uBg; uniform float uDensity;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main(){
          vec3 d = normalize(vDir);
          float n1 = fbm(d * 2.2 + vec3(uTime * 0.004, 0.0, uTime * 0.003), 5);
          float n2 = fbm(d * 4.5 - vec3(0.0, uTime * 0.006, 0.0), 4);
          float cloud = smoothstep(-0.1, 0.8, n1) * uDensity;
          float dust = smoothstep(0.2, 0.9, n2) * uDensity;
          vec3 col = uBg;
          col = mix(col, uA * 0.55, cloud);
          col = mix(col, uB * 0.7, dust * 0.6);
          col *= 1.0 - smoothstep(0.55, 0.95, n2) * 0.5 * uDensity;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.nebula = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), this.nebulaMat);
    this.nebula.frustumCulled = false;
    this.nebula.renderOrder = -10;

    // Campo estelar estático lejano.
    const starGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(4000 * 3);
    for (let i = 0; i < 4000; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(300 + Math.random() * 300);
      sp.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, color: '#ffffff', transparent: true, opacity: 0.85, fog: false }));

    // Galaxia espiral.
    const ARMS = 4;
    this.galaxy = new Particles({
      max: 24000,
      baseSize: 0.9,
      seed: (i, pos, r) => {
        const arm = i % ARMS;
        const radius = 5 + Math.pow(Math.random(), 0.7) * 55;
        const angle = (arm / ARMS) * Math.PI * 2 + radius * 0.16;
        const spread = (Math.random() - 0.5) * (2 + radius * 0.12);
        pos.set(Math.cos(angle) * radius + spread, (Math.random() - 0.5) * (1 + 6 / (radius * 0.2 + 1)), Math.sin(angle) * radius + spread);
        r.set(Math.random(), Math.random(), Math.random(), Math.random());
      },
      motion: /* glsl */ `
        float rad = length(p.xz);
        float ang = atan(p.z, p.x) + uTime * uSpeed * (1.6 / (rad * 0.12 + 1.0)) * 0.25;
        float wob = snoise(vec3(p.xz * 0.05, uTime * 0.05)) * 1.5;
        p = vec3(cos(ang) * (rad + wob), p.y + sin(uTime * 0.5 + aRand.x * 6.28) * 0.3, sin(ang) * (rad + wob));
      `,
    });
    this.galaxy.points.rotation.x = 0.35;

    // Anillos orbitales de poliedros.
    const shapes: [THREE.BufferGeometry, number, number, number, THREE.Euler][] = [
      [new THREE.OctahedronGeometry(0.2), 260, 7.5, 0.35, new THREE.Euler(0.4, 0, 0.1)],
      [new THREE.TetrahedronGeometry(0.24), 200, 11, -0.22, new THREE.Euler(-0.25, 0.3, 0.5)],
      [new THREE.BoxGeometry(0.22, 0.22, 0.22), 160, 15.5, 0.14, new THREE.Euler(0.9, -0.2, -0.3)],
    ];
    for (const [geo, max, radius, speed, tilt] of shapes) {
      const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0.6, emissive: '#000000', flatShading: true });
      const mesh = new THREE.InstancedMesh(geo, material, max);
      mesh.frustumCulled = false;
      const seeds = Array.from({ length: max }, () => ({
        angle: Math.random() * Math.PI * 2,
        radius: radius + (Math.random() - 0.5) * 2.6,
        y: (Math.random() - 0.5) * 1.2,
        spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
        size: 0.5 + Math.random() * 1.2,
      }));
      this.rings.push({ mesh, material, seeds, tilt, speed, max });
      this.scene.add(mesh);
    }

    this.scene.fog = new THREE.FogExp2(0x000000, 0.01);
    this.scene.add(this.nebula, this.stars, this.galaxy.points, this.halo, this.core, this.keyLight, this.coreLight, this.ambient);
  }

  update(_dt: number, time: number, p: VisualParams, camera: THREE.PerspectiveCamera) {
    const c = this.col;
    c.primary.set(p.primaryColor);
    c.secondary.set(p.secondaryColor);
    c.accent.set(p.accentColor);
    c.bg.set(p.backgroundColor);
    c.light.set(p.lightColor);
    lightDirection(p.lightAngle, p.lightElevation, this.lightDir);

    const u = this.coreMat.uniforms;
    u.uTime.value = time;
    u.uAmp.value = 0.12 + p.waveAmplitude * 0.38;
    u.uTurb.value = p.turbulence;
    u.uFreq.value = 0.8 + p.complexity * 1.6;
    u.uOctaves.value = 2 + Math.round(p.complexity * 3);
    (u.uPrimary.value as THREE.Color).copy(c.primary);
    (u.uSecondary.value as THREE.Color).copy(c.secondary);
    (u.uAccent.value as THREE.Color).copy(c.accent);
    (u.uLightColor.value as THREE.Color).copy(c.light);
    (u.uLightDir.value as THREE.Vector3).copy(this.lightDir);
    u.uLight.value = p.lightIntensity;
    u.uAmbient.value = p.ambientIntensity;
    this.core.scale.setScalar(p.scale);
    this.core.rotation.y = time * 0.08;
    this.core.rotation.x = Math.sin(time * 0.05) * 0.3;

    this.halo.scale.setScalar(p.scale * (1 + p.waveAmplitude * 0.15));
    (this.haloMat.uniforms.uColor.value as THREE.Color).copy(c.accent).lerp(c.primary, 0.3);
    this.haloMat.uniforms.uStrength.value = 0.6 + p.intensity * 0.5;

    const nu = this.nebulaMat.uniforms;
    nu.uTime.value = time;
    (nu.uA.value as THREE.Color).copy(c.primary);
    (nu.uB.value as THREE.Color).copy(c.accent);
    (nu.uBg.value as THREE.Color).copy(c.bg);
    nu.uDensity.value = 0.25 + p.fogDensity * 0.9;
    this.nebula.position.copy(camera.position);

    const fog = (p.fogDensity * 0.03) / p.depth;
    const sf = this.scene.fog as THREE.FogExp2;
    sf.color.copy(c.bg);
    sf.density = fog * 0.6;

    this.galaxy.update(time, p, fog * 0.5, c.bg);
    (this.galaxy.material.uniforms.uAccent.value as THREE.Color).copy(c.accent);
    this.galaxy.points.scale.setScalar(0.85 + p.depth * 0.15);

    this.keyLight.color.copy(c.light);
    this.keyLight.intensity = p.lightIntensity * 2;
    this.keyLight.position.copy(this.lightDir).multiplyScalar(40);
    this.coreLight.color.copy(c.accent).lerp(c.light, 0.4);
    this.coreLight.intensity = 30 * p.lightIntensity * p.scale;
    this.ambient.color.copy(c.primary).lerp(c.light, 0.5);
    this.ambient.intensity = p.ambientIntensity * 1.5;

    const ringScale = 0.75 + p.scale * 0.25;
    const fraction = 0.2 + p.complexity * 0.8;
    for (const ring of this.rings) {
      const count = Math.round(ring.max * fraction);
      ring.mesh.count = count;
      ring.material.color.copy(c.secondary).lerp(c.primary, 0.55).lerp(c.light, 0.15);
      ring.material.emissive.copy(c.accent).multiplyScalar(0.06 + p.intensity * 0.06);
      const rot = time * ring.speed;
      for (let i = 0; i < count; i++) {
        const s = ring.seeds[i];
        const a = s.angle + rot * (8 / s.radius);
        const r = s.radius * ringScale;
        this.tmp.position.set(Math.cos(a) * r, s.y + Math.sin(a * 3 + time) * 0.2 * p.waveAmplitude, Math.sin(a) * r);
        this.tmp.position.applyEuler(ring.tilt);
        this.q.setFromAxisAngle(s.spin, time * (0.5 + s.size) + s.angle);
        this.tmp.quaternion.copy(this.q);
        this.tmp.scale.setScalar(s.size * (0.7 + p.scale * 0.3));
        this.tmp.updateMatrix();
        ring.mesh.setMatrixAt(i, this.tmp.matrix);
      }
      ring.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.core.geometry.dispose();
    this.coreMat.dispose();
    this.halo.geometry.dispose();
    this.haloMat.dispose();
    this.nebula.geometry.dispose();
    this.nebulaMat.dispose();
    this.galaxy.dispose();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
    for (const r of this.rings) {
      r.mesh.geometry.dispose();
      r.material.dispose();
    }
  }
}

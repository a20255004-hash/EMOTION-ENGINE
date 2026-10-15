import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { VisualParams, WorldId } from '../../shared/params';
import { CameraRig } from './CameraRig';
import { FinalShader } from './post/FinalPass';
import type { World } from './types';
import { OceanWorld } from './worlds/OceanWorld';
import { CosmosWorld } from './worlds/CosmosWorld';
import { AtmosphereWorld } from './worlds/AtmosphereWorld';
import { AuroraWorld } from './worlds/AuroraWorld';
import { ForestWorld } from './worlds/ForestWorld';
import { NeonWorld } from './worlds/NeonWorld';
import { DesertWorld } from './worlds/DesertWorld';
import { AbyssWorld } from './worlds/AbyssWorld';
import { CrystalWorld } from './worlds/CrystalWorld';
import { VortexWorld } from './worlds/VortexWorld';

export interface EngineStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  width: number;
  height: number;
  pixelRatio: number;
  time: number;
  world: WorldId;
  paused: boolean;
}

export interface CaptureOptions {
  scale: number;
  format: 'png' | 'jpeg' | 'webp';
  quality: number;
}
export interface CaptureResult {
  blob: Blob;
  width: number;
  height: number;
  requestedWidth: number;
  requestedHeight: number;
  clamped: boolean;
}

type Modulator = (base: VisualParams) => VisualParams;

const WORLD_FACTORY: Record<WorldId, () => World> = {
  ocean: () => new OceanWorld(),
  cosmos: () => new CosmosWorld(),
  atmosphere: () => new AtmosphereWorld(),
  aurora: () => new AuroraWorld(),
  forest: () => new ForestWorld(),
  neon: () => new NeonWorld(),
  desert: () => new DesertWorld(),
  abyss: () => new AbyssWorld(),
  crystal: () => new CrystalWorld(),
  vortex: () => new VortexWorld(),
};

export class WebGLUnavailableError extends Error {}

/**
 * Motor visual. Posee el renderizador, la cámara, la composición de
 * postprocesado y los mundos. No conoce React ni el estado de la aplicación:
 * recibe parámetros y devuelve imágenes.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private final: ShaderPass;
  private rig: CameraRig;
  private worlds = new Map<WorldId, World>();
  private world: World;
  private base: VisualParams;
  private effective: VisualParams;
  private modulator: Modulator | null = null;
  private timer = new THREE.Timer();
  private animTime = 0;
  private paused = false;
  private raf = 0;
  private disposed = false;
  private fixedSize: { w: number; h: number } | null = null;
  private resizeObserver: ResizeObserver;
  private fade = { amount: 0, color: new THREE.Color('#000000') };
  private fpsAcc = { frames: 0, time: 0, fps: 0 };
  private autoPixelRatio: number;
  private lowFpsTime = 0;
  private listeners = new Set<(s: EngineStats) => void>();
  private frameHooks = new Set<(dt: number) => void>();
  onContextLost: (() => void) | null = null;

  constructor(private container: HTMLElement, world: WorldId, params: VisualParams) {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance', alpha: false });
    } catch (e) {
      throw new WebGLUnavailableError(e instanceof Error ? e.message : 'WebGL no disponible');
    }
    if (!this.renderer.getContext()) throw new WebGLUnavailableError('WebGL no disponible');
    this.autoPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.autoPixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.objectFit = 'contain';
    canvas.style.touchAction = 'none';
    canvas.setAttribute('data-testid', 'stage-canvas');
    canvas.setAttribute('aria-label', 'Escenario 3D interactivo. Arrastra para orbitar, rueda o pellizco para acercar.');
    canvas.setAttribute('role', 'img');
    container.appendChild(canvas);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      cancelAnimationFrame(this.raf);
      this.onContextLost?.();
    });

    this.camera = new THREE.PerspectiveCamera(params.fov, 1, 0.1, 2500);
    this.rig = new CameraRig(this.camera, canvas);
    this.base = params;
    this.effective = params;
    this.world = this.getWorld(world);

    // Objetivo de render con MSAA: el postprocesado no pierde el antialiasing.
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.world.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 1, 0.5, 0.72);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.final);

    this.rig.frame(this.world.framing, params.depth);
    this.rig.setMode(params.cameraMode);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.timer.connect(document);
    this.loop();
    this.prewarmTimer = setTimeout(() => this.prewarm(), 2500);
  }

  private prewarmTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Prepara en segundo plano los escenarios aún no visitados y compila sus
   * shaders, uno cada poco tiempo, para que el primer cambio sea inmediato.
   */
  private prewarm() {
    if (this.disposed) return;
    const pending = (Object.keys(WORLD_FACTORY) as WorldId[]).find((id) => !this.worlds.has(id));
    if (!pending) return;
    const w = this.getWorld(pending);
    const next = () => {
      if (!this.disposed) this.prewarmTimer = setTimeout(() => this.prewarm(), 700);
    };
    this.renderer.compileAsync(w.scene, this.camera).then(next, next);
  }

  private getWorld(id: WorldId): World {
    let w = this.worlds.get(id);
    if (!w) {
      w = WORLD_FACTORY[id]();
      this.worlds.set(id, w);
    }
    return w;
  }

  get worldId(): WorldId {
    return this.world.id;
  }
  get isPaused() {
    return this.paused;
  }
  get canvas() {
    return this.renderer.domElement;
  }
  get currentParams() {
    return this.effective;
  }

  setScene(world: WorldId, params: VisualParams) {
    if (world !== this.world.id) {
      this.world = this.getWorld(world);
      this.renderPass.scene = this.world.scene;
      this.rig.frame(this.world.framing, params.depth);
    }
    this.setParams(params);
  }

  setParams(params: VisualParams) {
    this.base = params;
    this.rig.setMode(params.cameraMode);
  }

  setModulator(fn: Modulator | null) {
    this.modulator = fn;
  }

  setFade(amount: number, color = '#000000') {
    this.fade.amount = amount;
    this.fade.color.set(color);
  }

  play() {
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }
  /** Reinicia tiempo de animación y encuadre de cámara. */
  reset() {
    this.animTime = 0;
    this.rig.frame(this.world.framing, this.base.depth);
    this.rig.setMode(this.base.cameraMode);
  }

  subscribe(fn: (s: EngineStats) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /** Se ejecuta antes de cada fotograma (p. ej. reproductor de secuencias). */
  addFrameHook(fn: (dt: number) => void) {
    this.frameHooks.add(fn);
    return () => this.frameHooks.delete(fn);
  }

  private resize() {
    if (this.disposed) return;
    let w: number;
    let h: number;
    if (this.fixedSize) {
      ({ w, h } = this.fixedSize);
    } else {
      w = Math.max(1, this.container.clientWidth);
      h = Math.max(1, this.container.clientHeight);
    }
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    (this.final.uniforms.uResolution.value as THREE.Vector2).set(w * pr, h * pr);
  }

  /** Fija una resolución de render (grabación) o vuelve al tamaño del contenedor con null. */
  setFixedSize(size: { w: number; h: number } | null) {
    this.fixedSize = size;
    this.renderer.setPixelRatio(size ? 1 : this.autoPixelRatio);
    this.resize();
  }

  private applyFrameParams(p: VisualParams) {
    if (Math.abs(this.camera.fov - p.fov) > 0.01) {
      this.camera.fov = p.fov;
      this.camera.updateProjectionMatrix();
    }
    this.rig.setDepth(p.depth);
    this.renderer.toneMappingExposure = p.exposure;
    this.bloom.strength = p.intensity * 0.85;
    this.bloom.radius = p.glowRadius;
    const u = this.final.uniforms;
    u.uTime.value = this.animTime;
    u.uVignette.value = p.vignette;
    u.uGrain.value = p.grain;
    u.uChromatic.value = p.chromatic;
    u.uSaturation.value = p.saturation;
    u.uHue.value = THREE.MathUtils.degToRad(p.hueShift);
    u.uFade.value = this.fade.amount;
    (u.uFadeColor.value as THREE.Color).copy(this.fade.color);
  }

  private renderFrame(dt: number) {
    for (const hook of this.frameHooks) hook(dt);
    const p = this.modulator ? this.modulator(this.base) : this.base;
    this.effective = p;
    if (!this.paused) this.animTime += dt * p.speed;
    this.rig.update(dt, p.cameraSpeed, !this.paused);
    this.world.update(dt, this.animTime, p, this.camera);
    this.applyFrameParams(p);
    this.composer.render(dt);
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.renderFrame(dt);
    this.trackPerformance(dt);
  };

  private trackPerformance(dt: number) {
    const a = this.fpsAcc;
    a.frames++;
    a.time += dt;
    if (a.time >= 0.5) {
      a.fps = a.frames / a.time;
      a.frames = 0;
      a.time = 0;
      // Calidad adaptativa: si el rendimiento cae de forma sostenida, baja la resolución interna.
      if (!this.fixedSize) {
        if (a.fps < 32) this.lowFpsTime += 0.5;
        else this.lowFpsTime = 0;
        if (this.lowFpsTime >= 2 && this.autoPixelRatio > 0.75) {
          this.autoPixelRatio = Math.max(0.75, this.autoPixelRatio - 0.25);
          this.renderer.setPixelRatio(this.autoPixelRatio);
          this.resize();
          this.lowFpsTime = 0;
        }
      }
      const info = this.renderer.info.render;
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const stats: EngineStats = {
        fps: Math.round(a.fps),
        drawCalls: info.calls,
        triangles: info.triangles,
        width: size.x,
        height: size.y,
        pixelRatio: this.renderer.getPixelRatio(),
        time: this.animTime,
        world: this.world.id,
        paused: this.paused,
      };
      for (const l of this.listeners) l(stats);
    }
  }

  /** Límite real del dispositivo para un render a resolución aumentada. */
  maxCaptureSize(): number {
    const gl = this.renderer.getContext();
    const maxRb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    return Math.min(maxRb, maxTex, 8192);
  }

  /**
   * Captura una imagen re-renderizando la escena a `scale` veces la resolución
   * del escenario (no es un reescalado). Se limita a lo que admite la GPU.
   */
  async capture(opts: CaptureOptions): Promise<CaptureResult> {
    const cw = this.fixedSize?.w ?? Math.max(1, this.container.clientWidth);
    const ch = this.fixedSize?.h ?? Math.max(1, this.container.clientHeight);
    const requestedWidth = Math.round(cw * opts.scale);
    const requestedHeight = Math.round(ch * opts.scale);
    const max = this.maxCaptureSize();
    const MAX_PIXELS = 36_000_000;
    let k = Math.min(1, max / Math.max(requestedWidth, requestedHeight));
    k = Math.min(k, Math.sqrt(MAX_PIXELS / (requestedWidth * requestedHeight)));
    const w = Math.max(1, Math.floor(requestedWidth * k));
    const h = Math.max(1, Math.floor(requestedHeight * k));

    const prevFixed = this.fixedSize;
    const prevPr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.fixedSize = { w, h };
    this.resize();
    this.renderFrame(0);
    const mime = `image/${opts.format}`;
    const blob = await new Promise<Blob | null>((resolve) => this.renderer.domElement.toBlob(resolve, mime, opts.quality));
    this.fixedSize = prevFixed;
    this.renderer.setPixelRatio(prevFixed ? 1 : prevPr);
    this.resize();
    if (!blob) throw new Error('El navegador no pudo codificar la imagen.');
    return { blob, width: w, height: h, requestedWidth, requestedHeight, clamped: k < 1 };
  }

  /** Miniatura JPEG pequeña para la biblioteca. */
  thumbnail(maxW = 320): string {
    const src = this.renderer.domElement;
    const ratio = src.height / Math.max(1, src.width);
    const c = document.createElement('canvas');
    c.width = maxW;
    c.height = Math.round(maxW * ratio);
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.prewarmTimer);
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.rig.dispose();
    this.timer.dispose();
    for (const w of this.worlds.values()) w.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.listeners.clear();
    this.frameHooks.clear();
  }
}

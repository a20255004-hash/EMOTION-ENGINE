import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraMode } from '../../shared/params';
import type { CameraFraming } from './types';

/**
 * Cámara con cuatro comportamientos automáticos combinables con control manual:
 * - orbit: giro automático alrededor del objetivo (arrastrar para mirar).
 * - drift: deriva suave tipo cámara en mano flotante.
 * - flythrough: recorrido continuo definido por cada mundo.
 * - static: solo control manual.
 * Tras interactuar, el movimiento automático se reanuda a los 2,5 s.
 */
export class CameraRig {
  readonly controls: OrbitControls;
  private mode: CameraMode = 'orbit';
  private framing: CameraFraming | null = null;
  private driftOffset = new THREE.Vector3();
  private flyProgress = 0;
  private flyOut = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private lastInteraction = -Infinity;
  private elapsed = 0;
  private depth = 1;

  constructor(private camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 140;
    this.controls.addEventListener('start', () => {
      this.lastInteraction = this.elapsed;
      this.removeDrift();
    });
    this.controls.addEventListener('end', () => {
      this.lastInteraction = this.elapsed;
    });
  }

  /** Coloca la cámara según el encuadre del mundo (al cambiar de mundo o reiniciar). */
  frame(framing: CameraFraming, depth: number) {
    this.framing = framing;
    this.depth = depth;
    this.driftOffset.set(0, 0, 0);
    this.flyProgress = 0;
    const d = framing.distance * depth;
    this.controls.target.copy(framing.target);
    this.camera.position.set(framing.target.x + d * 0.75, framing.target.y + framing.height, framing.target.z + d * 0.66);
    this.camera.lookAt(framing.target);
    this.controls.update();
  }

  setMode(mode: CameraMode) {
    if (mode === this.mode) return;
    const wasFly = this.mode === 'flythrough';
    this.mode = mode;
    this.removeDrift();
    this.controls.enabled = mode !== 'flythrough';
    if (wasFly && this.framing) this.frame(this.framing, this.depth);
  }

  setDepth(depth: number) {
    if (Math.abs(depth - this.depth) < 1e-4 || !this.framing) return;
    const ratio = depth / this.depth;
    this.depth = depth;
    if (this.mode === 'flythrough') return;
    this.removeDrift();
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(ratio);
    this.camera.position.copy(this.controls.target).add(offset);
  }

  private removeDrift() {
    if (this.driftOffset.lengthSq() > 0) {
      this.camera.position.sub(this.driftOffset);
      this.driftOffset.set(0, 0, 0);
    }
  }

  get userActive() {
    return this.elapsed - this.lastInteraction < 2.5;
  }

  update(dt: number, cameraSpeed: number, animate: boolean) {
    this.elapsed += dt;
    const f = this.framing;
    if (!f) return;
    const auto = animate && !this.userActive;

    if (this.mode === 'flythrough' && f.fly) {
      if (animate) this.flyProgress += dt * cameraSpeed * 14;
      f.fly(this.flyProgress, this.flyOut);
      this.camera.position.lerp(this.flyOut.pos, 1 - Math.exp(-dt * 4));
      const look = this.flyOut.look;
      const m = new THREE.Matrix4().lookAt(this.camera.position, look, this.camera.up);
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      this.camera.quaternion.slerp(q, 1 - Math.exp(-dt * 3));
      return;
    }

    this.removeDrift();
    this.controls.autoRotate = this.mode === 'orbit' && auto;
    this.controls.autoRotateSpeed = cameraSpeed * 2.2;
    this.controls.update(dt);

    if (this.camera.position.y < f.minY) this.camera.position.y = f.minY;

    if (this.mode === 'drift' && auto) {
      const t = this.elapsed * cameraSpeed;
      const d = f.distance * this.depth;
      this.driftOffset.set(Math.sin(t * 0.31) * d * 0.18, Math.sin(t * 0.47 + 1) * 0.06 * d, Math.cos(t * 0.23) * d * 0.14);
      this.camera.position.add(this.driftOffset);
      this.camera.lookAt(this.controls.target);
    }
  }

  dispose() {
    this.controls.dispose();
  }
}

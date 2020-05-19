import * as THREE from 'three';
import { Heightfield } from '../world/heightfield';
import { Collider } from '../world/Trees';

const EYE_HEIGHT = 1.68;
const WALK_SPEED = 4.0;
const SPRINT_MULT = 1.85;
const GRAVITY = 22;
const JUMP_SPEED = 5.2;

/**
 * Controlador en primera persona: pointer lock + WASD, gravedad,
 * colisión con el terreno (muestreo del heightfield) y con árboles/rocas,
 * sprint y head-bob sutil.
 */
export class FirstPersonController {
  readonly position: THREE.Vector3;
  enabled = false;
  /** Velocidad de caída con la que se tocó el suelo este frame (0 si no hubo aterrizaje). */
  landingSpeed = 0;

  private yaw = Math.PI; // mirando hacia -Z... (yaw 0 mira a -Z; PI mira a +Z)
  private pitch = 0;
  private readonly velocity = new THREE.Vector3();
  private grounded = true;
  private readonly keys = new Set<string>();
  private bobTime = 0;
  private bobAmount = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly field: Heightfield,
    private readonly colliders: Collider[],
    spawn: THREE.Vector3
  ) {
    this.position = spawn.clone();
    this.position.y = field.sampleHeight(spawn.x, spawn.z) + EYE_HEIGHT;
    this.yaw = 0; // three: yaw 0 => cámara mira hacia -Z (ladera arriba)
    this.pitch = 0.02;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      this.yaw -= e.movementX * 0.0021;
      this.pitch -= e.movementY * 0.0021;
      const lim = Math.PI / 2 - 0.06;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -lim, lim);
    });

    this.syncCamera(0);
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  update(dt: number): void {
    this.landingSpeed = 0;
    // Dirección de movimiento en el plano XZ según el yaw.
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);

    const input = new THREE.Vector3();
    if (this.enabled) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) input.add(forward);
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) input.sub(forward);
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) input.add(right);
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) input.sub(right);
    }

    const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const targetSpeed = input.lengthSq() > 0 ? WALK_SPEED * (sprinting ? SPRINT_MULT : 1) : 0;
    if (input.lengthSq() > 0) input.normalize();

    // Aceleración/fricción horizontales.
    const accel = this.grounded ? 30 : 8;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, input.x * targetSpeed, accel * 0.35, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, input.z * targetSpeed, accel * 0.35, dt);

    // Gravedad y salto.
    if (this.enabled && this.grounded && this.keys.has('Space')) {
      this.velocity.y = JUMP_SPEED;
      this.grounded = false;
    }
    if (!this.grounded) this.velocity.y -= GRAVITY * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    // Colisión con árboles y rocas: empuje horizontal.
    for (const c of this.colliders) {
      const dx = this.position.x - c.x;
      const dz = this.position.z - c.z;
      const rr = c.r + 0.42;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        this.position.x = c.x + (dx / d) * rr;
        this.position.z = c.z + (dz / d) * rr;
      }
    }

    // Colisión con el terreno.
    const groundY = this.field.sampleHeight(this.position.x, this.position.z) + EYE_HEIGHT;
    if (this.position.y <= groundY) {
      if (!this.grounded && this.velocity.y < -3) this.landingSpeed = -this.velocity.y;
      this.position.y = groundY;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (this.position.y > groundY + 0.05) {
      this.grounded = false;
    }

    // Head-bob proporcional a la velocidad horizontal.
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const target = this.grounded ? THREE.MathUtils.clamp(hSpeed / WALK_SPEED, 0, 1.8) : 0;
    this.bobAmount = THREE.MathUtils.damp(this.bobAmount, target, 6, dt);
    this.bobTime += dt * (4.6 + hSpeed * 0.9);

    this.syncCamera(dt);
  }

  private syncCamera(_dt: number): void {
    const bobY = Math.sin(this.bobTime * 2) * 0.032 * this.bobAmount;
    const bobX = Math.cos(this.bobTime) * 0.02 * this.bobAmount;

    this.camera.position.set(
      this.position.x + bobX * Math.cos(this.yaw),
      this.position.y + bobY,
      this.position.z - bobX * Math.sin(this.yaw)
    );
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }
}

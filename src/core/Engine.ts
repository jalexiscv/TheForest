import * as THREE from 'three';
import { EffectComposer } from 'postprocessing';
import { Heightfield, SPAWN } from '../world/heightfield';
import { createTerrain } from '../world/Terrain';
import { SkyEnv } from '../world/SkyEnv';
import { createGrass } from '../world/Grass';
import { createForest, Collider } from '../world/Trees';
import { createRocks, createLogs, Motes } from '../world/Details';
import { createLandmarks } from '../world/Landmarks';
import { Drone } from '../world/Drone';
import { FirstPersonController } from '../player/FirstPersonController';
import { createComposer } from '../fx/PostProcessing';
import { AudioSystem } from '../audio/AudioSystem';
import { shared } from './uniforms';

type Progress = (fraction: number, label: string) => void;

interface QualityPreset {
  grassCount: number;
  shadowMapSize: number;
  pixelRatioCap: number;
}

const PRESETS: Record<string, QualityPreset> = {
  low: { grassCount: 45000, shadowMapSize: 2048, pixelRatioCap: 1.25 },
  med: { grassCount: 130000, shadowMapSize: 3072, pixelRatioCap: 1.6 },
  high: { grassCount: 220000, shadowMapSize: 4096, pixelRatioCap: 2 }
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();

  private field!: Heightfield;
  private sky!: SkyEnv;
  private controller!: FirstPersonController;
  private composer!: EffectComposer;
  private motes!: Motes;
  private audio!: AudioSystem;
  private drone!: Drone;
  private forestUpdate!: (camPos: THREE.Vector3) => void;
  private readonly quality: QualityPreset;

  constructor(container: HTMLElement) {
    const q = new URLSearchParams(location.search).get('q') ?? 'med';
    this.quality = PRESETS[q] ?? PRESETS.med;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatioCap));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer?.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /** Construye el mundo por pasos, cediendo al DOM para actualizar la barra de carga. */
  async build(progress: Progress): Promise<void> {
    progress(0.05, 'Modelando el terreno…');
    await tick();
    this.field = new Heightfield();

    progress(0.25, 'Iluminando el cielo…');
    await tick();
    this.sky = new SkyEnv(this.renderer, this.scene, this.quality.shadowMapSize);

    progress(0.4, 'Extendiendo la ladera…');
    await tick();
    this.scene.add(await createTerrain(this.field));

    progress(0.55, 'Sembrando el pasto…');
    await tick();
    this.scene.add(createGrass(this.field, this.quality.grassCount));

    progress(0.72, 'Plantando el bosque…');
    await tick();
    const forest = createForest(this.field, this.scene);
    const colliders = forest.colliders;
    this.forestUpdate = forest.update;

    progress(0.85, 'Colocando rocas y troncos…');
    await tick();
    createRocks(this.field, this.scene, colliders);
    createLogs(this.field, this.scene, colliders);
    await createLandmarks(this.field, this.scene, colliders);
    this.drone = new Drone(this.scene, this.field);
    this.motes = new Motes(this.scene);

    progress(0.93, 'Afinando la luz…');
    await tick();
    this.controller = new FirstPersonController(this.camera, this.field, colliders, SPAWN);
    this.audio = new AudioSystem(this.field, this.controller);
    this.composer = createComposer(this.renderer, this.scene, this.camera);

    // Reparto inicial de LOD del bosque y precompilación de shaders.
    this.forestUpdate(this.controller.position);
    this.sky.followPlayer(this.controller.position);
    await this.renderer.compileAsync(this.scene, this.camera);
    this.composer.render(0);

    progress(1, 'Listo');
  }

  setPlaying(playing: boolean): void {
    this.controller.enabled = playing;
    this.audio.setMenu(!playing);
  }

  /** Arranca el audio; debe invocarse desde un gesto del usuario (clic). */
  startAudio(): void {
    this.audio.start();
  }

  start(): void {
    this.clock.getDelta();
    this.renderer.setAnimationLoop(() => this.update());
  }

  private update(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = shared.uTime.value + dt;
    shared.uTime.value = t;

    this.controller.update(dt);
    const p = this.controller.position;
    shared.uPlayer.value.set(p.x, p.z);
    this.sky.followPlayer(p);
    this.forestUpdate(p);
    this.drone.update(dt, t, p);
    this.motes.update(t, p, this.field);
    this.audio.update(dt, t);

    this.composer.render(dt);
  }
}

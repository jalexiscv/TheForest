import { Engine } from './core/Engine';

const overlay = document.getElementById('overlay')!;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const loadFill = document.getElementById('loadfill')!;
const loadText = document.getElementById('loadtext')!;

async function boot(): Promise<void> {
  const engine = new Engine(document.getElementById('app')!);

  await engine.build((fraction, label) => {
    loadFill.style.width = `${Math.round(fraction * 100)}%`;
    loadText.textContent = label;
  });

  playBtn.disabled = false;
  playBtn.textContent = 'ENTRAR AL BOSQUE';
  loadText.textContent = 'Listo para caminar';

  const canvas = engine.renderer.domElement;

  playBtn.addEventListener('click', () => {
    engine.startAudio();
    canvas.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    engine.setPlaying(locked);
    overlay.classList.toggle('hidden', locked);
    document.body.classList.toggle('playing', locked);
    if (!locked) {
      playBtn.textContent = 'VOLVER AL BOSQUE';
    }
  });

  engine.start();

  // Hook de depuración (consola del navegador / pruebas automatizadas).
  (window as unknown as { __engine: Engine }).__engine = engine;
}

boot().catch((err) => {
  loadText.textContent = 'Error al iniciar. Revisa la consola del navegador.';
  console.error(err);
});

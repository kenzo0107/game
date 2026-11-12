import '../../shared/landscape.js';
import * as THREE from 'three';
import { Aircraft } from './aircraft';
import { InputController } from './input';
import { Explosion } from './explosion';
import { Terrain } from './terrain';
import { Rings } from './rings';
import { Sound } from './sound';
import { STAGES } from './stages';

type Phase = 'menu' | 'playing' | 'crashed' | 'cleared';

interface Progress {
  unlocked: number;
  stars: number[];
}

interface OverlayButton {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

const PROGRESS_KEY = 'pilot.progress';

const loadProgress = (): Progress => {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null') as Progress | null;
    if (saved && Number.isInteger(saved.unlocked) && Array.isArray(saved.stars)) return saved;
  } catch {
    // 壊れた値や保存できない環境で例外を投げると遊べなくなるため、最初からの進行に戻す
  }
  return { unlocked: 1, stars: [] };
};

const saveProgress = (progress: Progress): void => {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // 保存できない環境でも例外で止めず、その回のプレイは続けさせる
  }
};

const starText = (count: number): string => '★'.repeat(count) + '☆'.repeat(3 - count);

class Game {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private timer = new THREE.Timer();
  private input = new InputController();
  private sound = new Sound();
  private overlay = document.getElementById('overlay') as HTMLElement;
  private banner = document.getElementById('banner') as HTMLElement;
  private progress = loadProgress();
  private phase: Phase = 'menu';
  private stageIndex = 0;
  private terrain!: Terrain;
  private rings!: Rings;
  private aircraft!: Aircraft;
  private explosion: Explosion | null = null;
  private primaryAction: (() => void) | null = null;
  private bannerTimer = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.timer.connect(document);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x87ceeb);
    document.getElementById('app')?.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(50, 100, 50);
    this.scene.add(sun);
    this.scene.fog = new THREE.Fog(0x87ceeb, 100, 1500);

    window.addEventListener('resize', () => this.onWindowResize());
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.loadStage(Math.min(this.progress.unlocked, STAGES.length) - 1);
    this.showMenu();
    this.animate();
  }

  private loadStage(index: number): void {
    if (this.terrain) {
      this.aircraft.destroy(this.scene);
      this.rings.dispose(this.scene);
      this.terrain.dispose(this.scene);
    }
    const stage = STAGES[index];
    this.stageIndex = index;
    this.explosion = null;
    this.terrain = new Terrain(this.scene, stage);
    this.rings = new Rings(this.scene, stage.rings);
    this.aircraft = new Aircraft(this.scene, this.terrain, stage.start, stage.fuel, stage.wind, (strength) =>
      this.sound.touchdown(strength),
    );
    this.sound.setRolling(0, null);
    this.updateCamera();
  }

  private startStage(index: number): void {
    this.loadStage(index);
    this.phase = 'playing';
    this.hideOverlay();
    const stage = STAGES[index];
    this.banner.replaceChildren(
      Object.assign(document.createElement('strong'), { textContent: `STAGE ${index + 1}  ${stage.name}` }),
      Object.assign(document.createElement('span'), { textContent: stage.description }),
    );
    this.banner.classList.add('show');
    this.bannerTimer = 4;
  }

  private showOverlay(tone: 'menu' | 'clear' | 'crash', title: string, lines: string[], buttons: OverlayButton[]): void {
    const heading = Object.assign(document.createElement('h1'), { textContent: title });
    const texts = lines.map((line) => Object.assign(document.createElement('p'), { textContent: line }));
    const list = document.createElement('div');
    list.className = 'choices';
    for (const { label, onSelect, disabled } of buttons) {
      const button = Object.assign(document.createElement('button'), { type: 'button', textContent: label, disabled });
      button.addEventListener('click', onSelect);
      list.append(button);
    }
    this.primaryAction = buttons.find((b) => !b.disabled)?.onSelect ?? null;
    this.overlay.className = tone;
    this.overlay.replaceChildren(heading, ...texts, list);
    this.overlay.hidden = false;
  }

  private hideOverlay(): void {
    this.overlay.hidden = true;
    this.primaryAction = null;
  }

  private showMenu(): void {
    this.phase = 'menu';
    this.banner.classList.remove('show');
    const buttons = STAGES.map((stage, i) => {
      const locked = i + 1 > this.progress.unlocked;
      const stars = this.progress.stars[i] ?? 0;
      return {
        label: locked ? `🔒 STAGE ${i + 1}` : `STAGE ${i + 1}  ${stage.name}  ${starText(stars)}`,
        onSelect: () => this.startStage(i),
        disabled: locked,
      };
    });
    this.showOverlay('menu', 'PILOT', ['リングをくぐって、滑走路に着陸しよう', 'Enter で最新のステージから'], buttons);
    const latest = Math.min(this.progress.unlocked, STAGES.length) - 1;
    this.primaryAction = () => this.startStage(latest);
  }

  private onCrash(): void {
    this.phase = 'crashed';
    this.explosion = new Explosion(this.scene, this.aircraft.getPosition());
    this.sound.crash();
    this.showOverlay('crash', '墜落！', ['Rキー または「もう一度」でやり直し'], [
      { label: 'もう一度', onSelect: () => this.startStage(this.stageIndex) },
      { label: 'ステージをえらぶ', onSelect: () => this.showMenu() },
    ]);
  }

  private onClear(): void {
    this.phase = 'cleared';
    this.sound.clear();
    const allRings = this.rings.passedCount === this.rings.total;
    const onRunway = this.aircraft.isStoppedOnRunway();
    const stars = 1 + (allRings ? 1 : 0) + (onRunway ? 1 : 0);
    const i = this.stageIndex;
    this.progress.stars[i] = Math.max(this.progress.stars[i] ?? 0, stars);
    this.progress.unlocked = Math.max(this.progress.unlocked, Math.min(i + 2, STAGES.length));
    saveProgress(this.progress);

    const isLast = i === STAGES.length - 1;
    const lines = [
      starText(stars),
      `リング ${this.rings.passedCount}/${this.rings.total}${allRings ? ' ★' : ''}`,
      onRunway ? '滑走路の上でとまれた ★' : '滑走路からはみ出した',
    ];
    if (isLast) lines.push('全ステージクリア！ おめでとう！');
    const buttons: OverlayButton[] = isLast
      ? []
      : [{ label: `次のステージへ（STAGE ${i + 2}）`, onSelect: () => this.startStage(i + 1) }];
    buttons.push(
      { label: 'もう一度', onSelect: () => this.startStage(i) },
      { label: 'ステージをえらぶ', onSelect: () => this.showMenu() },
    );
    this.showOverlay('clear', `STAGE ${i + 1} クリア！`, lines, buttons);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && this.primaryAction) {
      e.preventDefault();
      this.primaryAction();
    } else if (e.key.toLowerCase() === 'r' && (this.phase === 'crashed' || this.phase === 'cleared')) {
      this.startStage(this.stageIndex);
    }
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private updateCamera(): void {
    const offset = new THREE.Vector3(0, 3, -15).applyEuler(this.aircraft.getRotation());
    const position = this.aircraft.getPosition();
    this.camera.position.copy(position).add(offset);
    this.camera.lookAt(position);
  }

  private setText(id: string, text: string, color?: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (color) el.style.color = color;
  }

  private updateHUD(): void {
    const fuel = this.aircraft.getFuel();
    const wind = STAGES[this.stageIndex].wind;
    this.setText('stage', `${this.stageIndex + 1}/${STAGES.length}`);
    this.setText('rings', `${this.rings.passedCount}/${this.rings.total}`);
    this.setText('wind', Math.hypot(wind.x, wind.z) === 0 ? 'なし' : Math.hypot(wind.x, wind.z).toFixed(1));
    this.setText('speed', this.aircraft.getSpeed().toFixed(1));
    this.setText('throttle', (this.aircraft.getThrottle() * 100).toFixed(0));
    this.setText('pitch', ((this.aircraft.getPitchAngle() * 180) / Math.PI).toFixed(1));
    this.setText('roll', ((this.aircraft.getRollAngle() * 180) / Math.PI).toFixed(1));
    this.setText('altitude', this.aircraft.getAltitude().toFixed(1));
    this.setText('fuel', fuel.toFixed(1), fuel <= 0 ? '#ff0000' : fuel < 20 ? '#ff6600' : '#ffff00');
  }

  private animate = (timestamp?: number): void => {
    requestAnimationFrame(this.animate);
    this.timer.update(timestamp);
    const delta = Math.min(this.timer.getDelta(), 0.1);

    if (this.phase === 'playing') {
      this.aircraft.update(delta, this.input.getInputState());
      const contact = this.aircraft.getGroundContact();
      this.sound.setRolling(contact?.speed ?? 0, contact?.surface ?? null);
      if (this.rings.update(this.aircraft.getPosition()) > 0) this.sound.ring();

      if (this.aircraft.isCrashed()) {
        this.sound.setRolling(0, null);
        this.onCrash();
      } else if (this.aircraft.isLanded()) {
        this.sound.setRolling(0, null);
        this.onClear();
      }
      this.updateCamera();
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= delta;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }

    this.explosion?.update(delta);
    this.updateHUD();
    this.renderer.render(this.scene, this.camera);
  };
}

new Game();

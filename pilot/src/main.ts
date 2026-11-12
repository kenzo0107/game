import '../../shared/landscape.js';
import '../../shared/audio-session.js';
import * as THREE from 'three';
import { Aircraft } from './aircraft';
import { InputController } from './input';
import { Explosion } from './explosion';
import { Terrain } from './terrain';
import { Rings } from './rings';
import { Music } from './music';
import { SONGS } from './songs';
import { CrashCause, Skydiver } from './skydiver';
import { Sound } from './sound';
import { STAGES, StageConfig } from './stages';

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
    if (saved && Number.isInteger(saved.unlocked) && Array.isArray(saved.stars)) {
      // ステージを追加する前に最終ステージをクリアした人も、追加したステージへ進めるようにする
      const lastCleared = saved.stars.reduce((last, stars, i) => (stars > 0 ? i : last), -1);
      saved.unlocked = Math.max(saved.unlocked, Math.min(lastCleared + 2, STAGES.length));
      return saved;
    }
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

const SONG_KEY = 'pilot.song';

const loadSongIndex = (): number => {
  try {
    const saved = Number(localStorage.getItem(SONG_KEY));
    if (Number.isInteger(saved) && saved >= 0 && saved < SONGS.length) return saved;
  } catch {
    // 保存できない環境でも最初の曲で遊べるようにする
  }
  return 0;
};

const saveSongIndex = (index: number): void => {
  try {
    localStorage.setItem(SONG_KEY, String(index));
  } catch {
    // 保存できない環境でも例外で止めず、その回の選曲は続けさせる
  }
};

const CLEAR_TAP_DELAY_MS = 800;

const LOW_ALTITUDE = 12;
const LOW_ALTITUDE_ALERT_INTERVAL = 0.9;

const CHUTE_WARNING_ALTITUDE = 150;

const TOUCH_LABELS: Record<StageConfig['kind'], Record<string, string>> = {
  flight: { throttleDown: '減速', throttleUp: '加速', yawLeft: '機首←', yawRight: '機首→' },
  skydive: { throttleDown: 'ゆっくり', throttleUp: '急降下', yawLeft: '向き←', yawRight: '向き→' },
};

const LOW_WARNINGS: Record<StageConfig['kind'], string> = {
  flight: '⚠ 高度が低すぎる！ 機首を上げよう',
  skydive: '⚠ パラシュートを開こう！',
};

const CRASH_MESSAGES: Record<CrashCause, [string, string]> = {
  'no-chute': ['パラシュートが開かなかった…', 'パラシュートボタンで開こう'],
  hard: ['着地が速すぎた…', 'パラシュートはもっと高いところで開こう'],
  ocean: ['海に落ちた…', '島の上に降りよう'],
};

const starText = (count: number): string => '★'.repeat(count) + '☆'.repeat(3 - count);

class Game {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private fog = new THREE.Fog(0x87ceeb, 100, 1500);
  private timer = new THREE.Timer();
  private input = new InputController();
  private sound = new Sound();
  private songIndex = loadSongIndex();
  private music = new Music(() => this.sound.existingContext(), this.songIndex);
  private overlay = document.getElementById('overlay') as HTMLElement;
  private banner = document.getElementById('banner') as HTMLElement;
  private lowAltitudeWarning = document.getElementById('low-altitude') as HTMLElement;
  private lowAltitudeAlertTimer = 0;
  private progress = loadProgress();
  private phase: Phase = 'menu';
  private stageIndex = 0;
  private terrain!: Terrain;
  private rings!: Rings;
  private vehicle!: Aircraft | Skydiver;
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
    this.scene.fog = this.fog;

    window.addEventListener('resize', () => this.onWindowResize());
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointerup', () => {
      if (this.phase === 'cleared') this.primaryAction?.();
    });

    this.loadStage(Math.min(this.progress.unlocked, STAGES.length) - 1);
    this.showMenu();
    this.animate();
  }

  private loadStage(index: number): void {
    if (this.terrain) {
      this.vehicle.destroy(this.scene);
      this.rings.dispose(this.scene);
      this.terrain.dispose(this.scene);
    }
    const stage = STAGES[index];
    this.stageIndex = index;
    this.explosion = null;
    this.terrain = new Terrain(this.scene, stage);
    this.rings = new Rings(this.scene, stage.rings, stage.kind === 'skydive');
    this.vehicle =
      stage.kind === 'flight'
        ? new Aircraft(this.scene, this.terrain, stage.start, stage.fuel, stage.wind, (strength) =>
            this.sound.touchdown(strength),
          )
        : new Skydiver(
            this.scene,
            this.terrain,
            stage,
            () => this.sound.parachute(),
            () => this.sound.thud(),
          );
    this.applyMode(stage.kind);
    this.stopLoops();
    this.updateCamera();
  }

  private applyMode(kind: StageConfig['kind']): void {
    document.body.dataset.mode = kind;
    this.fog.far = kind === 'skydive' ? 3000 : 1500;
    this.lowAltitudeWarning.textContent = LOW_WARNINGS[kind];
    for (const [action, label] of Object.entries(TOUCH_LABELS[kind])) {
      const button = document.querySelector(`[data-action="${action}"]`);
      if (button) button.textContent = label;
    }
  }

  private stopLoops(): void {
    this.sound.setRolling(0, null);
    this.sound.setWind(0);
  }

  private startStage(index: number): void {
    this.loadStage(index);
    this.phase = 'playing';
    this.music.setMode('flight');
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
    this.music.setMode('menu');
    this.banner.classList.remove('show');
    const buttons: OverlayButton[] = STAGES.map((stage, i) => {
      const locked = i + 1 > this.progress.unlocked;
      const stars = this.progress.stars[i] ?? 0;
      return {
        label: locked ? `🔒 STAGE ${i + 1}` : `STAGE ${i + 1}  ${stage.name}  ${starText(stars)}`,
        onSelect: () => this.startStage(i),
        disabled: locked,
      };
    });
    buttons.push({
      label: `♪ BGM: ${SONGS[this.songIndex].title}（${this.songIndex + 1}/${SONGS.length}）`,
      onSelect: () => this.nextSong(),
    });
    this.showOverlay('menu', 'PILOT', ['リングをくぐって、滑走路や的に降りよう', 'Enter で最新のステージから'], buttons);
    const latest = Math.min(this.progress.unlocked, STAGES.length) - 1;
    this.primaryAction = () => this.startStage(latest);
  }

  private nextSong(): void {
    this.songIndex = (this.songIndex + 1) % SONGS.length;
    saveSongIndex(this.songIndex);
    this.music.setSong(this.songIndex);
    this.showMenu();
  }

  private onCrash(): void {
    this.phase = 'crashed';
    this.sound.crash();
    this.music.setMode('off');
    let title = '墜落！';
    const lines = ['Rキー または「もう一度」でやり直し'];
    if (this.vehicle instanceof Aircraft) {
      this.explosion = new Explosion(this.scene, this.vehicle.getPosition());
    } else {
      const [message, hint] = CRASH_MESSAGES[this.vehicle.getCrashCause() ?? 'no-chute'];
      title = message;
      lines.unshift(hint);
    }
    this.showOverlay('crash', title, lines, [
      { label: 'もう一度', onSelect: () => this.startStage(this.stageIndex) },
      { label: 'ステージをえらぶ', onSelect: () => this.showMenu() },
    ]);
  }

  private onClear(): void {
    this.phase = 'cleared';
    this.music.setMode('off');
    this.sound.clear();
    const allRings = this.rings.passedCount === this.rings.total;
    const vehicle = this.vehicle;
    const precise = vehicle instanceof Aircraft ? vehicle.isStoppedOnRunway() : vehicle.isOnBullseye();
    const stars = 1 + (allRings ? 1 : 0) + (precise ? 1 : 0);
    const i = this.stageIndex;
    this.progress.stars[i] = Math.max(this.progress.stars[i] ?? 0, stars);
    this.progress.unlocked = Math.max(this.progress.unlocked, Math.min(i + 2, STAGES.length));
    saveProgress(this.progress);

    const isLast = i === STAGES.length - 1;
    const lines = [
      starText(stars),
      `リング ${this.rings.passedCount}/${this.rings.total}${allRings ? ' ★' : ''}`,
      vehicle instanceof Aircraft
        ? precise
          ? '滑走路の上でとまれた ★'
          : '滑走路からはみ出した'
        : `的の中心から ${vehicle.getTargetDistance().toFixed(1)}${precise ? ' ★' : '（まん中の赤に降りると ★）'}`,
    ];
    if (isLast) lines.push('全ステージクリア！ おめでとう！');
    lines.push(isLast ? '画面をタップしてステージ選択へ' : '画面をタップして次のステージへ');
    this.showOverlay('clear', `STAGE ${i + 1} クリア！`, lines, []);
    // 操縦中に触れていた指がそのまま次のステージ開始にならないよう、少し待ってから受け付ける
    const readyAt = performance.now() + CLEAR_TAP_DELAY_MS;
    this.primaryAction = () => {
      if (performance.now() < readyAt) return;
      if (isLast) this.showMenu();
      else this.startStage(i + 1);
    };
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
    if (this.vehicle instanceof Skydiver) {
      this.vehicle.placeCamera(this.camera);
      return;
    }
    const offset = new THREE.Vector3(0, 3, -15).applyEuler(this.vehicle.getRotation());
    const position = this.vehicle.getPosition();
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
    const vehicle = this.vehicle;
    const wind = STAGES[this.stageIndex].wind;
    this.setText('stage', `${this.stageIndex + 1}/${STAGES.length}`);
    this.setText('rings', `${this.rings.passedCount}/${this.rings.total}`);
    this.setText('wind', Math.hypot(wind.x, wind.z) === 0 ? 'なし' : Math.hypot(wind.x, wind.z).toFixed(1));
    this.setText('altitude', vehicle.getAltitude().toFixed(1));
    if (vehicle instanceof Skydiver) {
      this.setText('fall-speed', vehicle.getFallSpeed().toFixed(1));
      this.setText('target', vehicle.getTargetDistance().toFixed(1));
      this.setText('chute', vehicle.isDeployed() ? 'ひらいた' : 'まだ', vehicle.isDeployed() ? '#ffff00' : '#ff6600');
      return;
    }
    const fuel = vehicle.getFuel();
    this.setText('speed', vehicle.getSpeed().toFixed(1));
    this.setText('throttle', (vehicle.getThrottle() * 100).toFixed(0));
    this.setText('pitch', ((vehicle.getPitchAngle() * 180) / Math.PI).toFixed(1));
    this.setText('roll', ((vehicle.getRollAngle() * 180) / Math.PI).toFixed(1));
    this.setText('fuel', fuel.toFixed(1), fuel <= 0 ? '#ff0000' : fuel < 20 ? '#ff6600' : '#ffff00');
  }

  private isTooLow(): boolean {
    const vehicle = this.vehicle;
    if (this.phase !== 'playing') return false;
    if (vehicle instanceof Skydiver) return vehicle.isFreefalling() && vehicle.getAltitude() < CHUTE_WARNING_ALTITUDE;
    const position = vehicle.getPosition();
    return vehicle.isFlying() && vehicle.getAltitude() < LOW_ALTITUDE && !this.terrain.isOnApproach(position.x, position.z);
  }

  private updateLowAltitudeWarning(delta: number): void {
    const tooLow = this.isTooLow();
    this.lowAltitudeWarning.hidden = !tooLow;
    if (!tooLow) {
      this.lowAltitudeAlertTimer = 0;
      return;
    }
    this.lowAltitudeAlertTimer -= delta;
    if (this.lowAltitudeAlertTimer <= 0) {
      this.sound.lowAltitude();
      this.lowAltitudeAlertTimer = LOW_ALTITUDE_ALERT_INTERVAL;
    }
  }

  private animate = (timestamp?: number): void => {
    requestAnimationFrame(this.animate);
    this.timer.update(timestamp);
    const delta = Math.min(this.timer.getDelta(), 0.1);

    if (this.phase === 'playing') {
      const vehicle = this.vehicle;
      vehicle.update(delta, this.input.getInputState());
      if (vehicle instanceof Aircraft) {
        const contact = vehicle.getGroundContact();
        this.sound.setRolling(contact?.speed ?? 0, contact?.surface ?? null);
      } else {
        this.sound.setWind(vehicle.getWindNoise());
      }
      if (this.rings.update(vehicle.getPosition()) > 0) this.sound.ring();

      if (vehicle.isCrashed()) {
        this.stopLoops();
        this.onCrash();
      } else if (vehicle.isLanded()) {
        this.stopLoops();
        this.onClear();
      }
      this.updateCamera();
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= delta;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }

    this.updateLowAltitudeWarning(delta);
    this.explosion?.update(delta);
    this.updateHUD();
    this.renderer.render(this.scene, this.camera);
  };
}

new Game();

export interface InputState {
  pitch: number;
  roll: number;
  yaw: number;
  throttleUp: boolean;
  throttleDown: boolean;
}

type Action =
  | 'pitchUp'
  | 'pitchDown'
  | 'rollLeft'
  | 'rollRight'
  | 'yawLeft'
  | 'yawRight'
  | 'throttleUp'
  | 'throttleDown';

const KEY_BINDINGS: Record<Action, string> = {
  pitchUp: 'arrowup',
  pitchDown: 'arrowdown',
  rollLeft: 'arrowleft',
  rollRight: 'arrowright',
  yawLeft: 'q',
  yawRight: 'e',
  throttleUp: 'w',
  throttleDown: 's',
};

const STICK_DEAD_ZONE = 0.15;

const clampAxis = (value: number): number => Math.max(-1, Math.min(1, value));

// 不感帯内を 0 にするだけだと、抜けた瞬間に操作量が 0 から 0.15 へ跳ぶため、外側を 0〜1 に引き伸ばす
const applyDeadZone = (value: number): number => {
  const magnitude = Math.abs(value);
  if (magnitude < STICK_DEAD_ZONE) return 0;
  return Math.sign(value) * ((magnitude - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE));
};

export class InputController {
  private keys = new Set<string>();
  private touch = new Set<Action>();
  private stick = { x: 0, y: 0 };

  constructor() {
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.clear();
    });

    this.setupStick();
    this.setupButtons();
  }

  private setupStick(): void {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    if (!stick || !knob) return;

    let activePointer: number | null = null;

    const move = (e: PointerEvent) => {
      const rect = stick.getBoundingClientRect();
      const radius = rect.width / 2;
      let dx = (e.clientX - (rect.left + radius)) / radius;
      let dy = (e.clientY - (rect.top + radius)) / radius;
      const length = Math.hypot(dx, dy);
      if (length > 1) {
        dx /= length;
        dy /= length;
      }
      knob.style.transform = `translate(${dx * radius * 0.6}px, ${dy * radius * 0.6}px)`;
      this.stick = { x: applyDeadZone(dx), y: applyDeadZone(dy) };
    };

    const release = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      knob.style.transform = '';
      this.stick = { x: 0, y: 0 };
    };

    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      activePointer = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      move(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === activePointer) move(e);
    });
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);
  }

  private setupButtons(): void {
    document.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => {
      const action = button.dataset.action as Action;
      const press = (e: PointerEvent) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        this.touch.add(action);
        button.classList.add('pressed');
      };
      const release = () => {
        this.touch.delete(action);
        button.classList.remove('pressed');
      };
      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  private isActive(action: Action): boolean {
    return this.keys.has(KEY_BINDINGS[action]) || this.touch.has(action);
  }

  private digitalAxis(negative: Action, positive: Action): number {
    return (this.isActive(positive) ? 1 : 0) - (this.isActive(negative) ? 1 : 0);
  }

  public getInputState(): InputState {
    return {
      pitch: clampAxis(this.digitalAxis('pitchDown', 'pitchUp') - this.stick.y),
      roll: clampAxis(this.digitalAxis('rollLeft', 'rollRight') + this.stick.x),
      yaw: this.digitalAxis('yawLeft', 'yawRight'),
      throttleUp: this.isActive('throttleUp'),
      throttleDown: this.isActive('throttleDown'),
    };
  }
}

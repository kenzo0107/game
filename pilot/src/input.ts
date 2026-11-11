export interface InputState {
  pitchUp: boolean;
  pitchDown: boolean;
  rollLeft: boolean;
  rollRight: boolean;
  yawLeft: boolean;
  yawRight: boolean;
  throttleUp: boolean;
  throttleDown: boolean;
}

type Action = keyof InputState;

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

const STICK_DEAD_ZONE = 0.3;

export class InputController {
  private keys = new Set<string>();
  private touch = new Set<Action>();

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
      this.setTouch('pitchUp', dy < -STICK_DEAD_ZONE);
      this.setTouch('pitchDown', dy > STICK_DEAD_ZONE);
      this.setTouch('rollLeft', dx < -STICK_DEAD_ZONE);
      this.setTouch('rollRight', dx > STICK_DEAD_ZONE);
    };

    const release = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      knob.style.transform = '';
      (['pitchUp', 'pitchDown', 'rollLeft', 'rollRight'] as const).forEach((a) => this.touch.delete(a));
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

  private setTouch(action: Action, active: boolean): void {
    if (active) this.touch.add(action);
    else this.touch.delete(action);
  }

  public getInputState(): InputState {
    const state = {} as InputState;
    (Object.keys(KEY_BINDINGS) as Action[]).forEach((action) => {
      state[action] = this.keys.has(KEY_BINDINGS[action]) || this.touch.has(action);
    });
    return state;
  }
}

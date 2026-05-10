import { InputState } from '../types';

export class InputController {
  private inputState: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    shoot: false,
    dash: false,
  };

  private keyMap: Map<string, keyof InputState> = new Map([
    ['KeyW', 'forward'],
    ['KeyS', 'backward'],
    ['KeyA', 'left'],
    ['KeyD', 'right'],
    ['Space', 'jump'],
    ['KeyE', 'shoot'],
    ['ShiftLeft', 'dash'],
    ['ShiftRight', 'dash'],
  ]);

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const action = this.keyMap.get(event.code);
    if (action) {
      this.inputState[action] = true;
      event.preventDefault();
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const action = this.keyMap.get(event.code);
    if (action) {
      this.inputState[action] = false;
      event.preventDefault();
    }
  }

  public getInputState(): InputState {
    return { ...this.inputState };
  }

  public resetShoot(): void {
    this.inputState.shoot = false;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    window.removeEventListener('keyup', this.handleKeyUp.bind(this));
  }
}

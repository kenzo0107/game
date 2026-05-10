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

export class InputController {
  private keys: Set<string>;
  private inputState: InputState;

  constructor() {
    this.keys = new Set();
    this.inputState = {
      pitchUp: false,
      pitchDown: false,
      rollLeft: false,
      rollRight: false,
      yawLeft: false,
      yawRight: false,
      throttleUp: false,
      throttleDown: false,
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      this.updateInputState();
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      this.updateInputState();
    });
  }

  private updateInputState(): void {
    // 矢印キーで機体操作
    this.inputState.pitchUp = this.keys.has('arrowup');
    this.inputState.pitchDown = this.keys.has('arrowdown');
    this.inputState.rollLeft = this.keys.has('arrowleft');
    this.inputState.rollRight = this.keys.has('arrowright');
    this.inputState.yawLeft = this.keys.has('q');
    this.inputState.yawRight = this.keys.has('e');
    // W/Sで速度調整
    this.inputState.throttleUp = this.keys.has('w');
    this.inputState.throttleDown = this.keys.has('s');
  }

  public getInputState(): InputState {
    return { ...this.inputState };
  }
}

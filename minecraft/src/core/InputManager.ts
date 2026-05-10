export class InputManager {
  private keys: Map<string, boolean> = new Map()
  private mouseButtons: Map<number, boolean> = new Map()
  private mouseMovement: { x: number; y: number } = { x: 0, y: 0 }
  private isPointerLocked = false

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown.bind(this))
    window.addEventListener('keyup', this.onKeyUp.bind(this))

    canvas.addEventListener('click', () => {
      canvas.requestPointerLock()
    })

    canvas.addEventListener('mousedown', this.onMouseDown.bind(this))
    canvas.addEventListener('mouseup', this.onMouseUp.bind(this))

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === canvas
    })

    document.addEventListener('mousemove', this.onMouseMove.bind(this))
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.keys.set(event.code, true)
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.set(event.code, false)
  }

  private onMouseDown(event: MouseEvent): void {
    if (this.isPointerLocked) {
      this.mouseButtons.set(event.button, true)
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (this.isPointerLocked) {
      this.mouseButtons.set(event.button, false)
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (this.isPointerLocked) {
      this.mouseMovement.x += event.movementX
      this.mouseMovement.y += event.movementY
    }
  }

  isKeyPressed(code: string): boolean {
    return this.keys.get(code) ?? false
  }

  isMouseButtonPressed(button: number): boolean {
    return this.mouseButtons.get(button) ?? false
  }

  consumeMouseButton(button: number): boolean {
    const pressed = this.mouseButtons.get(button) ?? false
    if (pressed) {
      this.mouseButtons.set(button, false)
    }
    return pressed
  }

  consumeKey(code: string): boolean {
    const pressed = this.keys.get(code) ?? false
    if (pressed) {
      this.keys.set(code, false)
    }
    return pressed
  }

  getMouseMovement(): { x: number; y: number } {
    const movement = { ...this.mouseMovement }
    this.mouseMovement.x = 0
    this.mouseMovement.y = 0
    return movement
  }

  isLocked(): boolean {
    return this.isPointerLocked
  }
}

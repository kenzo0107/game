export class TimeController {
  private timeScale: number = 1.0;
  private targetTimeScale: number = 1.0;
  private slowMotionDuration: number = 0;

  public update(): void {
    // スムーズにタイムスケールを変更
    this.timeScale += (this.targetTimeScale - this.timeScale) * 0.1;

    if (this.slowMotionDuration > 0) {
      this.slowMotionDuration--;
      if (this.slowMotionDuration <= 0) {
        this.targetTimeScale = 1.0;
      }
    }
  }

  public triggerSlowMotion(duration: number = 60, scale: number = 0.3): void {
    this.targetTimeScale = scale;
    this.slowMotionDuration = duration;
  }

  public getTimeScale(): number {
    return this.timeScale;
  }

  public getPhysicsStep(): number {
    return (1 / 60) * this.timeScale;
  }

  public reset(): void {
    this.timeScale = 1.0;
    this.targetTimeScale = 1.0;
    this.slowMotionDuration = 0;
  }
}

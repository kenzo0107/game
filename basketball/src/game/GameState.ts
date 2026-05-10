import { GameStatus } from '../types';

export class GameState {
  private status: GameStatus = 'MENU';
  private remainingTime: number = 0; // 秒
  private gameDuration: number; // 秒

  private statusCallbacks: Array<(status: GameStatus) => void> = [];
  private timeCallbacks: Array<(time: number) => void> = [];

  constructor(gameDuration: number) {
    this.gameDuration = gameDuration;
    this.remainingTime = gameDuration;
  }

  public start(): void {
    this.status = 'PLAYING';
    this.remainingTime = this.gameDuration;
    this.notifyStatusChange();
    this.notifyTimeUpdate();
  }

  public pause(): void {
    if (this.status === 'PLAYING') {
      this.status = 'PAUSED';
      this.notifyStatusChange();
    }
  }

  public resume(): void {
    if (this.status === 'PAUSED') {
      this.status = 'PLAYING';
      this.notifyStatusChange();
    }
  }

  public end(): void {
    this.status = 'GAMEOVER';
    this.notifyStatusChange();
  }

  public update(deltaTime: number): void {
    if (this.status !== 'PLAYING') {
      return;
    }

    this.remainingTime -= deltaTime;

    if (this.remainingTime <= 0) {
      this.remainingTime = 0;
      this.end();
    }

    this.notifyTimeUpdate();
  }

  public getStatus(): GameStatus {
    return this.status;
  }

  public getRemainingTime(): number {
    return this.remainingTime;
  }

  public getFormattedTime(): string {
    const minutes = Math.floor(this.remainingTime / 60);
    const seconds = Math.floor(this.remainingTime % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  public onStatusChange(callback: (status: GameStatus) => void): void {
    this.statusCallbacks.push(callback);
  }

  public onTimeUpdate(callback: (time: number) => void): void {
    this.timeCallbacks.push(callback);
  }

  private notifyStatusChange(): void {
    this.statusCallbacks.forEach((callback) => callback(this.status));
  }

  private notifyTimeUpdate(): void {
    this.timeCallbacks.forEach((callback) => callback(this.remainingTime));
  }

  public reset(): void {
    this.status = 'MENU';
    this.remainingTime = this.gameDuration;
    this.notifyStatusChange();
    this.notifyTimeUpdate();
  }
}

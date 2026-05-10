import { Game } from './game/Game';

class App {
  private game: Game;
  private lastTime: number = 0;

  constructor() {
    this.game = new Game();
    this.start();
  }

  private start(): void {
    this.lastTime = performance.now();
    this.animate();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000; // 秒に変換
    this.lastTime = currentTime;

    // 最大デルタタイムを制限（フレームレートが極端に落ちた時の対策）
    const clampedDeltaTime = Math.min(deltaTime, 0.1);

    this.game.update(clampedDeltaTime);
    this.game.render();
  };
}

// アプリケーション起動
new App();

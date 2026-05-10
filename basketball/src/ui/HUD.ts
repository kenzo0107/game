import { GameState } from '../game/GameState';
import { ScoreManager } from '../game/ScoreManager';

export class HUD {
  private timerElement: HTMLElement;
  private statusElement: HTMLElement;
  private teamAScoreElement: HTMLElement;
  private teamBScoreElement: HTMLElement;

  constructor(gameState: GameState, scoreManager: ScoreManager) {
    this.timerElement = document.getElementById('timer')!;
    this.statusElement = document.getElementById('game-status')!;
    this.teamAScoreElement = document.getElementById('team-a-score')!;
    this.teamBScoreElement = document.getElementById('team-b-score')!;

    // コールバック登録
    gameState.onTimeUpdate(() => {
      this.updateTimer(gameState.getFormattedTime());
    });

    gameState.onStatusChange((status) => {
      this.updateStatus(this.getStatusText(status));
    });

    scoreManager.onScoreUpdate((score) => {
      this.updateScore(score.teamA, score.teamB);
    });

    // 初期表示
    this.updateTimer(gameState.getFormattedTime());
    this.updateStatus(this.getStatusText(gameState.getStatus()));
    const score = scoreManager.getScore();
    this.updateScore(score.teamA, score.teamB);
  }

  private updateTimer(time: string): void {
    this.timerElement.textContent = time;
  }

  private updateStatus(status: string): void {
    this.statusElement.textContent = status;
  }

  private updateScore(teamA: number, teamB: number): void {
    this.teamAScoreElement.textContent = teamA.toString();
    this.teamBScoreElement.textContent = teamB.toString();
  }

  private getStatusText(status: string): string {
    switch (status) {
      case 'MENU':
        return '準備中';
      case 'PLAYING':
        return 'プレイ中';
      case 'PAUSED':
        return '一時停止';
      case 'GAMEOVER':
        return 'ゲーム終了';
      default:
        return '';
    }
  }
}

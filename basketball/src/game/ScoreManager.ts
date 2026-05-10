import { Score, TeamType, ShootType } from '../types';
import { SHOOT_POINTS } from '../shooting/ShootTypes';

export class ScoreManager {
  private score: Score = { teamA: 0, teamB: 0 };
  private scoreCallbacks: Array<(score: Score) => void> = [];

  public addScore(team: TeamType, shootType: ShootType): void {
    const points = SHOOT_POINTS[shootType];

    if (team === 'A') {
      this.score.teamA += points;
    } else {
      this.score.teamB += points;
    }

    this.notifyScoreUpdate();
  }

  public getScore(): Score {
    return { ...this.score };
  }

  public reset(): void {
    this.score = { teamA: 0, teamB: 0 };
    this.notifyScoreUpdate();
  }

  public onScoreUpdate(callback: (score: Score) => void): void {
    this.scoreCallbacks.push(callback);
  }

  private notifyScoreUpdate(): void {
    this.scoreCallbacks.forEach((callback) => callback(this.getScore()));
  }

  public getWinner(): TeamType | 'DRAW' {
    if (this.score.teamA > this.score.teamB) {
      return 'A';
    } else if (this.score.teamB > this.score.teamA) {
      return 'B';
    }
    return 'DRAW';
  }
}

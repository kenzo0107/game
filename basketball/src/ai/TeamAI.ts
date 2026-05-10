import { Team } from '../entities/Team';
import { Ball } from '../entities/Ball';
import { Basket } from '../court/Basket';
import { AIController } from './AIController';

export class TeamAI {
  private team: Team;
  private aiControllers: AIController[] = [];

  constructor(team: Team, ball: Ball, targetBasket: Basket) {
    this.team = team;

    // 各プレイヤーにAIコントローラーを割り当て
    this.team.players.forEach((player) => {
      if (!player.isControlled) {
        const aiController = new AIController(player, ball, targetBasket);
        this.aiControllers.push(aiController);
      }
    });
  }

  public update(deltaTime: number): void {
    this.aiControllers.forEach((ai) => {
      ai.update(deltaTime);
    });
  }

  public checkShoots(): AIController[] {
    return this.aiControllers.filter((ai) => ai.shouldShoot());
  }
}

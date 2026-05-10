import * as THREE from 'three';
import { Player } from '../entities/Player';
import { Ball } from '../entities/Ball';
import { Basket } from '../court/Basket';

export class AIController {
  private player: Player;
  private ball: Ball;
  private targetBasket: Basket;
  private attackCooldown: number = 0;

  constructor(player: Player, ball: Ball, targetBasket: Basket) {
    this.player = player;
    this.ball = ball;
    this.targetBasket = targetBasket;
  }

  public update(deltaTime: number): void {
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }

    const playerPos = this.player.getPosition();
    const ballPos = this.ball.getPosition();

    // ボールとの距離を計算
    const distanceToBall = playerPos.distanceTo(ballPos);

    // ボールに近い場合はボールを追いかける
    if (distanceToBall > 2) {
      this.chaseBall(playerPos, ballPos);
    } else {
      // ボールに近い場合はゴールに向かって移動
      this.moveTowardsBasket(playerPos);
    }
  }

  private chaseBall(playerPos: THREE.Vector3, ballPos: THREE.Vector3): void {
    const direction = new THREE.Vector3()
      .subVectors(ballPos, playerPos)
      .normalize();

    this.player.move(direction, false);
    this.player.lookAt(ballPos);
  }

  private moveTowardsBasket(playerPos: THREE.Vector3): void {
    const basketPos = this.targetBasket.getRingPosition();
    const direction = new THREE.Vector3()
      .subVectors(basketPos, playerPos)
      .normalize();

    // ゴールに近づく
    const distanceToBasket = playerPos.distanceTo(basketPos);

    if (distanceToBasket > 5) {
      this.player.move(direction, false);
    } else {
      // ゴールの近くでは停止
      this.player.stop();
    }

    this.player.lookAt(basketPos);
  }

  public shouldShoot(): boolean {
    const playerPos = this.player.getPosition();
    const basketPos = this.targetBasket.getRingPosition();
    const distance = playerPos.distanceTo(basketPos);

    // ゴールから適切な距離（3-8m）にいて、クールダウンが終わっている場合
    if (distance > 3 && distance < 8 && this.attackCooldown <= 0) {
      this.attackCooldown = 3; // 3秒のクールダウン
      return true;
    }

    return false;
  }
}

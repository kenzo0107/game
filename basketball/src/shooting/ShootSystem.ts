import * as THREE from 'three';
import { Player } from '../entities/Player';
import { Ball } from '../entities/Ball';
import { Basket } from '../court/Basket';
import { Collision } from '../physics/Collision';
import { ShootType, ShootResult, GameConfig } from '../types';
import { SHOOT_POINTS, SHOOT_POWER, SHOOT_ANGLE } from './ShootTypes';

export class ShootSystem {
  private config: GameConfig;
  private previousBallPosition: THREE.Vector3;

  constructor(config: GameConfig) {
    this.config = config;
    this.previousBallPosition = new THREE.Vector3();
  }

  /**
   * シュートタイプを判定
   */
  public determineShootType(player: Player, basket: Basket): ShootType {
    const playerPos = player.getPosition();
    const basketPos = basket.getRingPosition();

    // 水平距離を計算（Y軸を無視）
    const horizontalDistance = Math.sqrt(
      Math.pow(playerPos.x - basketPos.x, 2) +
      Math.pow(playerPos.z - basketPos.z, 2)
    );

    const height = playerPos.y;

    // ダンク判定: ゴール直下（1.5m以内） & ジャンプ中（高さ2.5m以上）
    if (horizontalDistance < 1.5 && height > 2.5) {
      return 'DUNK';
    }

    // 3ポイント判定: 3ポイントライン外（6.75m以上）
    if (horizontalDistance > this.config.threePointDistance) {
      return 'THREE_POINT';
    }

    // 通常シュート
    return 'NORMAL';
  }

  /**
   * シュートを実行
   */
  public executeShoot(player: Player, ball: Ball, basket: Basket): ShootType {
    const shootType = this.determineShootType(player, basket);
    const playerPos = player.getPosition();
    const basketPos = basket.getRingPosition();

    // シュート方向を計算
    const direction = new THREE.Vector3()
      .subVectors(basketPos, playerPos)
      .normalize();

    // シュートタイプに応じた角度調整
    const angleRadians = (SHOOT_ANGLE[shootType] * Math.PI) / 180;
    const horizontalDir = new THREE.Vector3(direction.x, 0, direction.z).normalize();

    // 角度を考慮した方向ベクトル
    const shootDirection = new THREE.Vector3(
      horizontalDir.x * Math.cos(angleRadians),
      Math.sin(angleRadians),
      horizontalDir.z * Math.cos(angleRadians)
    ).normalize();

    // シュート実行
    ball.shoot(shootDirection, SHOOT_POWER[shootType]);

    // 前回のボール位置を記録
    this.previousBallPosition.copy(ball.getPosition());

    return shootType;
  }

  /**
   * ゴール判定
   */
  public checkGoal(ball: Ball, basket: Basket): ShootResult | null {
    const currentBallPos = ball.getPosition();
    const ringPos = basket.getRingPosition();

    // ボールがリングを通過したかチェック
    const throughRing = Collision.checkBallThroughRing(
      currentBallPos,
      this.previousBallPosition,
      ringPos,
      basket.ringRadius
    );

    // 前回の位置を更新
    this.previousBallPosition.copy(currentBallPos);

    if (!throughRing) {
      return null;
    }

    // ゴール成功時のロジックは後で実装
    // 今はとりあえず通常シュートとして扱う
    return {
      success: true,
      type: 'NORMAL', // 実際のシュートタイプは別途管理が必要
      points: SHOOT_POINTS['NORMAL'],
    };
  }

  /**
   * ボールをプレイヤーの位置にリセット
   */
  public resetBallToPlayer(ball: Ball, player: Player): void {
    const playerPos = player.getPosition();
    const ballPos = new THREE.Vector3(
      playerPos.x,
      playerPos.y + 1.2, // プレイヤーの少し上
      playerPos.z
    );
    ball.reset(ballPos);
    this.previousBallPosition.copy(ballPos);
  }
}

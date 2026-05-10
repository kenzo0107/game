import * as THREE from 'three';

export class Collision {
  /**
   * 点が円柱の内部にあるかチェック
   */
  public static isPointInCylinder(
    point: THREE.Vector3,
    cylinderCenter: THREE.Vector3,
    radius: number,
    height: number
  ): boolean {
    const dx = point.x - cylinderCenter.x;
    const dz = point.z - cylinderCenter.z;
    const distanceSquared = dx * dx + dz * dz;

    const isInRadius = distanceSquared <= radius * radius;
    const isInHeight =
      point.y >= cylinderCenter.y - height / 2 &&
      point.y <= cylinderCenter.y + height / 2;

    return isInRadius && isInHeight;
  }

  /**
   * ボールがリングを通過したかチェック
   */
  public static checkBallThroughRing(
    ballPosition: THREE.Vector3,
    previousBallPosition: THREE.Vector3,
    ringPosition: THREE.Vector3,
    ringRadius: number
  ): boolean {
    // ボールがリングの高さを上から下に通過したか
    const crossedRingHeight =
      previousBallPosition.y > ringPosition.y &&
      ballPosition.y <= ringPosition.y;

    if (!crossedRingHeight) {
      return false;
    }

    // 通過時のX-Z平面での位置をチェック
    const distanceSquared =
      Math.pow(ballPosition.x - ringPosition.x, 2) +
      Math.pow(ballPosition.z - ringPosition.z, 2);

    return distanceSquared <= ringRadius * ringRadius;
  }

  /**
   * 2点間の距離を計算
   */
  public static distance(a: THREE.Vector3, b: THREE.Vector3): number {
    return a.distanceTo(b);
  }

  /**
   * 球と球の衝突判定
   */
  public static sphereIntersectsSphere(
    center1: THREE.Vector3,
    radius1: number,
    center2: THREE.Vector3,
    radius2: number
  ): boolean {
    const distance = this.distance(center1, center2);
    return distance <= radius1 + radius2;
  }
}

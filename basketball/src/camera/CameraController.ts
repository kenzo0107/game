import * as THREE from 'three';
import { Player } from '../entities/Player';

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private targetPlayer: Player | null = null;
  private offset: THREE.Vector3 = new THREE.Vector3(0, 8, 12);
  private lookAtOffset: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  public setTarget(player: Player): void {
    this.targetPlayer = player;
  }

  public update(_deltaTime: number): void {
    if (!this.targetPlayer) {
      return;
    }

    const playerPos = this.targetPlayer.getPosition();

    // カメラ位置をプレイヤーの後方上空に配置
    const targetPosition = new THREE.Vector3()
      .copy(playerPos)
      .add(this.offset);

    // スムーズにカメラを移動
    this.camera.position.lerp(targetPosition, 0.1);

    // プレイヤーの少し上を見る
    const lookAtPosition = new THREE.Vector3()
      .copy(playerPos)
      .add(this.lookAtOffset);

    this.camera.lookAt(lookAtPosition);
  }

  public setOffsetDistance(distance: number): void {
    this.offset.normalize().multiplyScalar(distance);
  }

  public reset(): void {
    this.camera.position.set(0, 15, 20);
    this.camera.lookAt(0, 0, 0);
  }
}

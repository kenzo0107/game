import * as THREE from 'three';
import { Player } from '../entities/Player';
import { InputState } from '../types';

export class PlayerController {
  private player: Player;
  private camera: THREE.Camera;

  constructor(player: Player, camera: THREE.Camera) {
    this.player = player;
    this.camera = camera;
  }

  public update(inputState: InputState): void {
    // カメラの向きを基準に移動方向を計算
    const direction = new THREE.Vector3();

    // カメラの前方向と右方向を取得
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0; // Y軸成分を無視
    cameraDirection.normalize();

    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));
    cameraRight.normalize();

    // 入力に基づいて移動方向を計算
    if (inputState.forward) {
      direction.add(cameraDirection);
    }
    if (inputState.backward) {
      direction.sub(cameraDirection);
    }
    if (inputState.left) {
      direction.sub(cameraRight);
    }
    if (inputState.right) {
      direction.add(cameraRight);
    }

    // 移動
    if (direction.length() > 0) {
      this.player.move(direction, inputState.dash);

      // プレイヤーを移動方向に向ける
      const targetPosition = this.player.getPosition().clone().add(direction);
      this.player.lookAt(targetPosition);
    } else {
      // 入力がない場合は停止
      this.player.stop();
    }

    // ジャンプ
    if (inputState.jump) {
      this.player.jump();
    }
  }

  public setPlayer(player: Player): void {
    this.player = player;
  }
}

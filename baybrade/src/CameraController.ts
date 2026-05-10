import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CameraMode = 'free' | 'follow' | 'top' | 'side' | 'close';

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private mode: CameraMode = 'free';
  private targetPosition = new THREE.Vector3();
  private currentVelocity = new THREE.Vector3();

  private cameraPresets: Record<CameraMode, { position: THREE.Vector3; lookAt: THREE.Vector3 }> = {
    free: {
      position: new THREE.Vector3(0, 15, 15),
      lookAt: new THREE.Vector3(0, 0, 0),
    },
    follow: {
      position: new THREE.Vector3(0, 10, 10),
      lookAt: new THREE.Vector3(0, 0, 0),
    },
    top: {
      position: new THREE.Vector3(0, 20, 0),
      lookAt: new THREE.Vector3(0, 0, 0),
    },
    side: {
      position: new THREE.Vector3(15, 5, 0),
      lookAt: new THREE.Vector3(0, 0, 0),
    },
    close: {
      position: new THREE.Vector3(0, 5, 8),
      lookAt: new THREE.Vector3(0, 0, 0),
    },
  };

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;
  }

  public setMode(mode: CameraMode): void {
    this.mode = mode;
    if (mode === 'free') {
      this.controls.enabled = true;
    } else {
      this.controls.enabled = false;
      const preset = this.cameraPresets[mode];
      this.targetPosition.copy(preset.position);
    }
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public update(beyblade1Pos?: THREE.Vector3, beyblade2Pos?: THREE.Vector3): void {
    if (this.mode === 'free') {
      return;
    }

    let lookAtTarget = new THREE.Vector3(0, 0, 0);

    if (this.mode === 'follow' && beyblade1Pos && beyblade2Pos) {
      // 2つのベイブレードの中間点を追跡
      const midpoint = new THREE.Vector3().addVectors(beyblade1Pos, beyblade2Pos).multiplyScalar(0.5);
      lookAtTarget.copy(midpoint);

      // 距離に応じてカメラ位置を調整
      const distance = beyblade1Pos.distanceTo(beyblade2Pos);
      const cameraDistance = Math.max(10, distance * 1.5);

      this.targetPosition.set(
        midpoint.x,
        midpoint.y + cameraDistance * 0.7,
        midpoint.z + cameraDistance * 0.7
      );
    } else {
      const preset = this.cameraPresets[this.mode];
      lookAtTarget.copy(preset.lookAt);
    }

    // スムーズにカメラを移動（イージング）
    this.camera.position.lerp(this.targetPosition, 0.05);

    // カメラの向きを更新
    const currentLookAt = new THREE.Vector3();
    this.camera.getWorldDirection(currentLookAt);
    currentLookAt.multiplyScalar(10).add(this.camera.position);
    currentLookAt.lerp(lookAtTarget, 0.05);
    this.camera.lookAt(currentLookAt);
  }

  public shake(intensity: number): void {
    // カメラシェイク効果
    const shakeAmount = intensity * 0.1;
    this.camera.position.x += (Math.random() - 0.5) * shakeAmount;
    this.camera.position.y += (Math.random() - 0.5) * shakeAmount;
    this.camera.position.z += (Math.random() - 0.5) * shakeAmount;
  }
}

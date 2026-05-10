import * as THREE from 'three'

export class Camera {
  public camera: THREE.PerspectiveCamera
  private yaw = 0
  private pitch = 0

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
  }

  setPosition(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z)
  }

  rotate(deltaYaw: number, deltaPitch: number): void {
    this.yaw += deltaYaw
    this.pitch += deltaPitch

    // ピッチ制限（真上・真下を向けないようにする）
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch))

    this.updateRotation()
  }

  private updateRotation(): void {
    const direction = new THREE.Vector3()
    direction.x = Math.cos(this.pitch) * Math.sin(this.yaw)
    direction.y = Math.sin(this.pitch)
    direction.z = Math.cos(this.pitch) * Math.cos(this.yaw)

    this.camera.lookAt(
      this.camera.position.x + direction.x,
      this.camera.position.y + direction.y,
      this.camera.position.z + direction.z
    )
  }

  getDirection(): THREE.Vector3 {
    const direction = new THREE.Vector3()
    this.camera.getWorldDirection(direction)
    return direction
  }

  getForwardVector(): THREE.Vector3 {
    const forward = new THREE.Vector3()
    forward.x = Math.sin(this.yaw)
    forward.y = 0
    forward.z = Math.cos(this.yaw)
    return forward.normalize()
  }

  getRightVector(): THREE.Vector3 {
    const right = new THREE.Vector3()
    right.x = Math.sin(this.yaw + Math.PI / 2)
    right.y = 0
    right.z = Math.cos(this.yaw + Math.PI / 2)
    return right.normalize()
  }

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
  }
}

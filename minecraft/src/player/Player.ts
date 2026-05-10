import { Camera } from '@/player/Camera'
import { InputManager } from '@/core/InputManager'
import { World } from '@/world/World'
import { Collision } from '@/physics/Collision'
import { PLAYER_SPEED, JUMP_SPEED, GRAVITY, PLAYER_HEIGHT } from '@/utils/Constants'

export class Player {
  public camera: Camera
  private position: { x: number; y: number; z: number }
  private velocity: { x: number; y: number; z: number }
  private inputManager: InputManager

  constructor(inputManager: InputManager) {
    this.inputManager = inputManager
    this.camera = new Camera()
    this.position = { x: 8, y: 5, z: 8 }
    this.velocity = { x: 0, y: 0, z: 0 }
    this.updateCamera()
  }

  update(deltaTime: number, world: World): void {
    this.handleInput(deltaTime, world)
    this.applyGravity(deltaTime, world)
    this.updateCamera()
  }

  private handleInput(deltaTime: number, world: World): void {
    if (!this.inputManager.isLocked()) return

    // マウス入力による視点回転
    const mouseMovement = this.inputManager.getMouseMovement()
    const sensitivity = 0.002
    this.camera.rotate(-mouseMovement.x * sensitivity, -mouseMovement.y * sensitivity)

    // 移動入力
    const forward = this.camera.getForwardVector()
    const right = this.camera.getRightVector()

    let moveX = 0
    let moveZ = 0

    if (this.inputManager.isKeyPressed('KeyW')) {
      moveX += forward.x
      moveZ += forward.z
    }
    if (this.inputManager.isKeyPressed('KeyS')) {
      moveX -= forward.x
      moveZ -= forward.z
    }
    if (this.inputManager.isKeyPressed('KeyD')) {
      moveX += right.x
      moveZ += right.z
    }
    if (this.inputManager.isKeyPressed('KeyA')) {
      moveX -= right.x
      moveZ -= right.z
    }

    // 移動ベクトルを正規化
    const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ)
    if (moveLength > 0) {
      moveX = (moveX / moveLength) * PLAYER_SPEED * deltaTime
      moveZ = (moveZ / moveLength) * PLAYER_SPEED * deltaTime

      // X軸の移動と衝突判定
      const newX = this.position.x + moveX
      if (!Collision.checkCollision(world, newX, this.position.y, this.position.z)) {
        this.position.x = newX
      }

      // Z軸の移動と衝突判定
      const newZ = this.position.z + moveZ
      if (!Collision.checkCollision(world, this.position.x, this.position.y, newZ)) {
        this.position.z = newZ
      }
    }

    // ジャンプ
    if (this.inputManager.isKeyPressed('Space') && Collision.isOnGround(world, this.position.x, this.position.y, this.position.z)) {
      this.velocity.y = JUMP_SPEED
    }
  }

  private applyGravity(deltaTime: number, world: World): void {
    this.velocity.y -= GRAVITY * deltaTime

    const newY = this.position.y + this.velocity.y * deltaTime

    // 地面との衝突判定
    if (Collision.checkCollision(world, this.position.x, newY, this.position.z)) {
      // 上昇中に天井に衝突
      if (this.velocity.y > 0) {
        this.velocity.y = 0
      }
      // 落下中に地面に衝突
      else {
        this.velocity.y = 0
        // 地面の上に配置
        this.position.y = Math.floor(newY) + 1
      }
    } else {
      this.position.y = newY
    }
  }

  private updateCamera(): void {
    this.camera.setPosition(
      this.position.x,
      this.position.y + PLAYER_HEIGHT * 0.9,
      this.position.z
    )
  }

  getPosition(): { x: number; y: number; z: number } {
    return { ...this.position }
  }
}

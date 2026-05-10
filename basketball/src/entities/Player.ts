import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig, TeamType, GameObject } from '../types';

export class Player implements GameObject {
  public mesh: THREE.Mesh;
  public body: CANNON.Body;
  public team: TeamType;
  public isControlled: boolean;
  public hasBall: boolean = false;

  private config: PhysicsConfig;
  private playerHeight: number = 1.8;
  private playerRadius: number = 0.3;
  private jumpCooldown: number = 0;
  private isGrounded: boolean = true;

  constructor(
    position: THREE.Vector3,
    team: TeamType,
    config: PhysicsConfig,
    physicsWorld: PhysicsWorld,
    isControlled: boolean = false
  ) {
    this.team = team;
    this.config = config;
    this.isControlled = isControlled;

    // プレイヤーのメッシュ（簡易的な箱型）
    const geometry = new THREE.BoxGeometry(
      this.playerRadius * 2,
      this.playerHeight,
      this.playerRadius * 2
    );

    // チームカラー
    const color = team === 'A' ? 0x0066ff : 0xff0066;
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.7,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.position.copy(position);

    // 物理ボディ（カプセル形状を箱で近似）
    const shape = new CANNON.Box(
      new CANNON.Vec3(this.playerRadius, this.playerHeight / 2, this.playerRadius)
    );
    this.body = new CANNON.Body({
      mass: 80, // 80kg
      shape: shape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      fixedRotation: true, // 回転を固定
      linearDamping: 0.9,
    });

    physicsWorld.addBody(this.body);
  }

  public move(direction: THREE.Vector3, isDashing: boolean = false): void {
    const speed = isDashing ? this.config.playerDashSpeed : this.config.playerMoveSpeed;
    const velocity = direction.normalize().multiplyScalar(speed);

    this.body.velocity.x = velocity.x;
    this.body.velocity.z = velocity.z;
  }

  public jump(): void {
    if (this.isGrounded && this.jumpCooldown <= 0) {
      this.body.velocity.y = this.config.playerJumpForce;
      this.isGrounded = false;
      this.jumpCooldown = 0.5; // 0.5秒のクールダウン
    }
  }

  public update(deltaTime: number): void {
    // 物理エンジンからメッシュの位置を更新
    this.mesh.position.set(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );

    // 接地判定（簡易版）
    if (this.body.velocity.y < 0.1 && this.body.position.y < this.playerHeight / 2 + 0.1) {
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    // ジャンプクールダウン
    if (this.jumpCooldown > 0) {
      this.jumpCooldown -= deltaTime;
    }
  }

  public getPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
  }

  public getForwardDirection(): THREE.Vector3 {
    // メッシュの前方向を取得
    const direction = new THREE.Vector3(0, 0, 1);
    direction.applyQuaternion(this.mesh.quaternion);
    return direction.normalize();
  }

  public lookAt(target: THREE.Vector3): void {
    const direction = new THREE.Vector3()
      .subVectors(target, this.getPosition())
      .normalize();

    const angle = Math.atan2(direction.x, direction.z);
    this.mesh.rotation.y = angle;
  }

  public stop(): void {
    this.body.velocity.x = 0;
    this.body.velocity.z = 0;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

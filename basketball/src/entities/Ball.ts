import * as THREE from 'three';
import { BallPhysics } from '../physics/BallPhysics';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig, GameObject } from '../types';

export class Ball implements GameObject {
  public mesh: THREE.Mesh;
  public physics: BallPhysics;

  constructor(
    position: THREE.Vector3,
    config: PhysicsConfig,
    physicsWorld: PhysicsWorld
  ) {
    // ボールのメッシュ
    const geometry = new THREE.SphereGeometry(config.ballRadius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      roughness: 0.7,
      metalness: 0.1,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.position.copy(position);

    // 物理ボディ
    this.physics = new BallPhysics(position, config);
    physicsWorld.addBody(this.physics.body);
  }

  public update(_deltaTime: number): void {
    // 物理エンジンからメッシュの位置を更新
    this.mesh.position.copy(this.physics.getPosition());
    this.mesh.quaternion.copy(this.physics.body.quaternion as any);
  }

  public reset(position: THREE.Vector3): void {
    this.physics.reset(position);
    this.mesh.position.copy(position);
  }

  public shoot(direction: THREE.Vector3, power: number): void {
    this.physics.applyShootForce(direction, power);
  }

  public getPosition(): THREE.Vector3 {
    return this.physics.getPosition();
  }

  public getVelocity(): THREE.Vector3 {
    return this.physics.getVelocity();
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

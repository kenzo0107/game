import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { PhysicsConfig } from '../types';

export class BallPhysics {
  public body: CANNON.Body;

  constructor(position: THREE.Vector3, config: PhysicsConfig) {

    const shape = new CANNON.Sphere(config.ballRadius);
    this.body = new CANNON.Body({
      mass: config.ballMass,
      shape: shape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      linearDamping: 0.1,
      angularDamping: 0.1,
    });

    // ボールのマテリアル設定
    const ballMaterial = new CANNON.Material('ball');
    this.body.material = ballMaterial;
  }

  public applyShootForce(direction: THREE.Vector3, power: number): void {
    const force = new CANNON.Vec3(
      direction.x * power,
      direction.y * power,
      direction.z * power
    );
    this.body.applyImpulse(force);
  }

  public reset(position: THREE.Vector3): void {
    this.body.position.set(position.x, position.y, position.z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
  }

  public getPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
  }

  public getVelocity(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.velocity.x,
      this.body.velocity.y,
      this.body.velocity.z
    );
  }
}

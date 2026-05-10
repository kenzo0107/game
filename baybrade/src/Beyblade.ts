import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { BeybladeType, BeybladeStats, BEYBLADE_PRESETS } from './types';

export class Beyblade {
  private mesh: THREE.Group;
  private body: CANNON.Body;
  private stats: BeybladeStats;
  private hp: number = 100;
  private rpm: number = 6000; // 初期回転数を大幅に増加

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    type: BeybladeType,
    position: THREE.Vector3,
    color: number
  ) {
    this.stats = { ...BEYBLADE_PRESETS[type] };

    // メッシュ作成
    this.mesh = this.createMesh(color);
    this.mesh.position.copy(position);
    scene.add(this.mesh);

    // 物理ボディ作成
    this.body = this.createBody(position);
    world.addBody(this.body);

    // 初期回転を与える（スタミナタイプはより長く回転）
    const initialSpin = this.rpm * 0.15 * (1 + this.stats.stamina * 0.1);
    this.body.angularVelocity.set(0, initialSpin, 0);
  }

  private createMesh(color: number): THREE.Group {
    const group = new THREE.Group();

    // ベース部分（平たい円盤）
    const baseGeometry = new THREE.CylinderGeometry(1, 1, 0.3, 32);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.8,
      roughness: 0.2,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // アタックリング（攻撃用の突起）
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const spikeGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.5);
      const spikeMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        metalness: 0.9,
        roughness: 0.1,
      });
      const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
      spike.position.set(
        Math.cos(angle) * 1.1,
        0,
        Math.sin(angle) * 1.1
      );
      spike.rotation.y = angle;
      spike.castShadow = true;
      group.add(spike);
    }

    // センター部分
    const centerGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.5, 16);
    const centerMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.7,
      roughness: 0.3,
    });
    const center = new THREE.Mesh(centerGeometry, centerMaterial);
    center.castShadow = true;
    group.add(center);

    return group;
  }

  private createBody(position: THREE.Vector3): CANNON.Body {
    const shape = new CANNON.Cylinder(1, 1, 0.3, 16);
    const body = new CANNON.Body({
      mass: this.stats.weight * 2, // 質量を増やして安定化
      shape: shape,
      material: new CANNON.Material({
        friction: this.stats.friction * 1.5, // 摩擦を増やして滑りにくく
        restitution: 0.1, // 反発を減らして跳ねにくく
      }),
      linearDamping: 0.3,
      angularDamping: 0.001,
    });
    body.position.set(position.x, position.y, position.z);

    // Y軸方向の移動を制限する制約を追加
    body.fixedRotation = false;
    body.updateMassProperties();

    return body;
  }

  public update(): void {
    // 物理ボディの位置・回転をメッシュに反映
    this.mesh.position.copy(this.body.position as any);
    this.mesh.quaternion.copy(this.body.quaternion as any);

    // Y軸の位置を制限してスタジアムに沿って動くようにする
    if (this.body.position.y > 1) {
      this.body.position.y = 1;
      this.body.velocity.y = Math.min(0, this.body.velocity.y); // 下向きの速度のみ許可
    }

    // Y軸の速度を抑制（空中に飛ばないように）
    if (Math.abs(this.body.velocity.y) > 2) {
      this.body.velocity.y *= 0.5;
    }

    // 回転を安定させる（Y軸中心の回転を維持）
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), 0);
    this.body.angularVelocity.x *= 0.9;
    this.body.angularVelocity.z *= 0.9;

    // RPM計算（Y軸の角速度から）
    const angularVelocity = this.body.angularVelocity;
    this.rpm = Math.abs(angularVelocity.y) * 60 / (2 * Math.PI);

    // RPMが極端に低下したらHPを減少（条件を緩和）
    if (this.rpm < 500) {
      this.hp = Math.max(0, this.hp - 0.05);
    }

    // 摩擦によるスピン減衰（減衰を大幅に緩和）
    const damping = 1 - (this.stats.stamina * 0.0001);
    this.body.angularVelocity.y *= damping;

    // 停止判定（閾値を下げる）
    if (this.rpm < 100) {
      this.hp = Math.max(0, this.hp - 0.2);
    }
  }

  public takeDamage(amount: number): void {
    const actualDamage = amount * (1 - this.stats.defense * 0.1);
    this.hp = Math.max(0, this.hp - actualDamage);

    // ダメージを受けたらスピンが少し減少
    this.body.angularVelocity.y *= 0.95;
  }

  public applyImpulse(force: THREE.Vector3): void {
    this.body.applyImpulse(
      new CANNON.Vec3(force.x, force.y, force.z),
      new CANNON.Vec3(0, 0, 0)
    );
  }

  public getHP(): number {
    return this.hp;
  }

  public getRPM(): number {
    return this.rpm;
  }

  public getPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
  }

  public getStats(): BeybladeStats {
    return this.stats;
  }

  public destroy(): void {
    this.mesh.parent?.remove(this.mesh);
    this.body.world?.removeBody(this.body);
  }
}

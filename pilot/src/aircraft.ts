import * as THREE from 'three';
import { InputState } from './input';

type FlightState = 'flying' | 'rolling' | 'stopped' | 'crashed';

export class Aircraft {
  private mesh: THREE.Group;
  private shadow: THREE.Group;
  private shadowMaterial: THREE.MeshBasicMaterial;
  private velocity: THREE.Vector3;
  private angularVelocity: THREE.Vector3;
  private throttle: number;
  private propellerSpin: number;
  private state: FlightState;
  private fuel: number;
  private readonly GROUND_LEVEL = -50;  // 地面・海面の高さ
  private readonly RUNWAY_SURFACE = -49.5;  // 滑走路の表面高さ
  private readonly AIRCRAFT_BOTTOM_OFFSET = 0.25;  // 機体中心から最下点までの距離(主翼底面)
  private readonly RUNWAY_LEVEL = -49.25; // 滑走路の上(機体の底面が-49.5の滑走路表面に接する)
  private readonly CRASH_LEVEL = -49.75;  // 墜落時の高さ(機体の底面が-50の地面に接する)
  private readonly OCEAN_SURFACE = -51;
  private readonly ISLAND_HALF_WIDTH = 150;
  private readonly ISLAND_MIN_Z = 100;
  private readonly ISLAND_MAX_Z = 500;
  private readonly SHADOW_MAX_HEIGHT = 100;
  private readonly SHADOW_LIFT = 0.12;
  private readonly RUNWAY_ROLLING_DECEL = 1.5;
  private readonly GRASS_ROLLING_DECEL = 6;
  private readonly BRAKE_DECEL = 4;
  private readonly GROUND_STEER_SPEED = 0.5;
  private readonly LEVEL_OUT_RATE = 3;
  private readonly RUNWAY_MIN_Z = 200;
  private readonly RUNWAY_MAX_Z = 400;
  private readonly RUNWAY_MIN_X = -15;
  private readonly RUNWAY_MAX_X = 15;

  // 飛行パラメータ
  private readonly MAX_SPEED = 50;
  private readonly MIN_SPEED = 10;
  private readonly ACCELERATION = 5;
  private readonly PITCH_SPEED = 0.15;  // 上下の動きを遅く
  private readonly ROLL_SPEED = 0.2;    // 左右の傾きを遅く
  private readonly YAW_SPEED = 0.12;    // 旋回を遅く
  private readonly LIFT_COEFFICIENT = 0.25;  // 揚力をさらに弱く（降下しやすく）
  private readonly DRAG_COEFFICIENT = 0.1;
  private readonly GRAVITY = 6.0;  // 重力を弱く（ゆっくり降下）

  // 燃料パラメータ
  private readonly MAX_FUEL = 100;
  private readonly FUEL_CONSUMPTION_RATE = 1.5;  // 毎秒の消費率(%、約66秒で空)
  private readonly SAFE_LANDING_SPEED = 12;
  private readonly SAFE_LANDING_PITCH = Math.PI / 12; // 15度
  private readonly SAFE_LANDING_ROLL = Math.PI / 12;  // 15度
  private readonly CRASH_SPEED_THRESHOLD = 20;
  private readonly CRASH_ANGLE_THRESHOLD = Math.PI / 6; // 30度

  constructor(scene: THREE.Scene) {
    this.mesh = this.createAircraft();
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.shadow = this.createShadow();
    this.velocity = new THREE.Vector3(0, -1, this.MIN_SPEED * 1.2);  // 初期速度をやや速く、やや下向きに
    this.angularVelocity = new THREE.Vector3(0, 0, 0);
    this.throttle = 0.4;  // 初期スロットルを少し下げる
    this.propellerSpin = 0;
    this.state = 'flying';
    this.fuel = this.MAX_FUEL;

    scene.add(this.mesh);
    scene.add(this.shadow);
  }

  private createAircraft(): THREE.Group {
    const group = new THREE.Group();

    // 機体
    const bodyGeometry = new THREE.BoxGeometry(1, 0.5, 4);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // 主翼
    const wingGeometry = new THREE.BoxGeometry(12, 0.1, 2);
    const wingMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const wing = new THREE.Mesh(wingGeometry, wingMaterial);
    wing.position.y = -0.2;
    group.add(wing);

    // 尾翼
    const tailGeometry = new THREE.BoxGeometry(3, 0.1, 1);
    const tail = new THREE.Mesh(tailGeometry, wingMaterial);
    tail.position.set(0, 0, -2);
    group.add(tail);

    // 垂直尾翼
    const verticalTailGeometry = new THREE.BoxGeometry(0.1, 2, 1);
    const verticalTail = new THREE.Mesh(verticalTailGeometry, wingMaterial);
    verticalTail.position.set(0, 1, -2);
    group.add(verticalTail);

    // プロペラ
    const propGeometry = new THREE.BoxGeometry(0.2, 3, 0.2);
    const propMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const propeller = new THREE.Mesh(propGeometry, propMaterial);
    propeller.position.set(0, 0, 2.5);
    propeller.name = 'propeller';
    group.add(propeller);

    // タイヤ（車輪）
    const tireRadius = 0.3;
    const tireWidth = 0.2;
    const tireMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });

    // 前輪（ノーズギア）
    const noseTireGeometry = new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 16);
    const noseTire = new THREE.Mesh(noseTireGeometry, tireMaterial);
    noseTire.rotation.z = Math.PI / 2; // 横向きに回転
    noseTire.position.set(0, -0.5, 1.5); // 機首下部
    group.add(noseTire);

    // 主輪（メインギア）左
    const leftTireGeometry = new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 16);
    const leftTire = new THREE.Mesh(leftTireGeometry, tireMaterial);
    leftTire.rotation.z = Math.PI / 2;
    leftTire.position.set(-1.2, -0.5, -0.5); // 左側、主翼の下
    group.add(leftTire);

    // 主輪（メインギア）右
    const rightTireGeometry = new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 16);
    const rightTire = new THREE.Mesh(rightTireGeometry, tireMaterial);
    rightTire.rotation.z = Math.PI / 2;
    rightTire.position.set(1.2, -0.5, -0.5); // 右側、主翼の下
    group.add(rightTire);

    // 初期位置：滑走路手前の上空からスタート
    group.position.set(0, 10, -600);  // 高度60、滑走路から800単位手前
    group.rotation.x = -0.05;  // わずかに機首を下げる

    return group;
  }

  private createShadow(): THREE.Group {
    // 主翼・胴体・尾翼を別々の半透明メッシュにすると重なった部分だけ濃くなるため、外形を1枚のポリゴンにする
    const outline: [number, number][] = [
      [0.5, 2], [0.5, 1], [6, 1], [6, -1], [0.5, -1], [0.5, -1.5], [1.5, -1.5], [1.5, -2.5],
      [-1.5, -2.5], [-1.5, -1.5], [-0.5, -1.5], [-0.5, -1], [-6, -1], [-6, 1], [-0.5, 1], [-0.5, 2],
    ];
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const silhouette = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.shadowMaterial);
    silhouette.rotation.x = -Math.PI / 2;
    silhouette.renderOrder = 1;

    const group = new THREE.Group();
    group.add(silhouette);
    return group;
  }

  private isOverRunway(): boolean {
    const { x, z } = this.mesh.position;
    return z >= this.RUNWAY_MIN_Z && z <= this.RUNWAY_MAX_Z &&
           x >= this.RUNWAY_MIN_X && x <= this.RUNWAY_MAX_X;
  }

  private isOverIsland(): boolean {
    const { x, z } = this.mesh.position;
    return Math.abs(x) <= this.ISLAND_HALF_WIDTH && z >= this.ISLAND_MIN_Z && z <= this.ISLAND_MAX_Z;
  }

  private visibleSurfaceLevel(): number {
    if (this.isOverRunway()) return this.RUNWAY_SURFACE;
    if (this.isOverIsland()) return this.GROUND_LEVEL;
    return this.OCEAN_SURFACE;
  }

  private updateRollout(delta: number, input: InputState): void {
    if (!this.isOverIsland()) {
      this.state = 'crashed';
      return;
    }

    const onRunway = this.isOverRunway();
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const decel = (onRunway ? this.RUNWAY_ROLLING_DECEL : this.GRASS_ROLLING_DECEL) +
                  (input.throttleDown ? this.BRAKE_DECEL : 0);
    const nextSpeed = Math.max(0, speed - decel * delta);

    const steerAuthority = Math.min(1, speed / 5);
    this.mesh.rotation.y += input.yaw * this.GROUND_STEER_SPEED * steerAuthority * delta;
    const levelOut = Math.exp(-this.LEVEL_OUT_RATE * delta);
    this.mesh.rotation.x *= levelOut;
    this.mesh.rotation.z *= levelOut;

    const heading = this.mesh.rotation.y;
    this.velocity.set(Math.sin(heading) * nextSpeed, 0, Math.cos(heading) * nextSpeed);
    this.mesh.position.x += this.velocity.x * delta;
    this.mesh.position.z += this.velocity.z * delta;
    this.mesh.position.y = (onRunway ? this.RUNWAY_SURFACE : this.GROUND_LEVEL) + this.AIRCRAFT_BOTTOM_OFFSET;

    this.propellerSpin *= Math.exp(-0.8 * delta);
    this.spinPropeller(delta);

    if (nextSpeed === 0) {
      this.mesh.rotation.x = 0;
      this.mesh.rotation.z = 0;
      this.state = 'stopped';
    }
  }

  private spinPropeller(delta: number): void {
    const propeller = this.mesh.getObjectByName('propeller');
    if (propeller) {
      propeller.rotation.z += this.propellerSpin * delta;
    }
  }

  private updateShadow(): void {
    const altitude = this.getAltitude();
    if (altitude > this.SHADOW_MAX_HEIGHT) {
      this.shadow.visible = false;
      return;
    }
    this.shadow.visible = true;

    const forward = new THREE.Vector3(0, 0, 1).applyEuler(this.mesh.rotation);
    this.shadow.rotation.y = Math.atan2(forward.x, forward.z);
    this.shadow.position.set(this.mesh.position.x, this.visibleSurfaceLevel() + this.SHADOW_LIFT, this.mesh.position.z);

    const closeness = 1 - Math.max(0, altitude) / this.SHADOW_MAX_HEIGHT;
    const blurSpread = 1 + (1 - closeness) * 0.3;
    this.shadow.scale.set(
      Math.abs(Math.cos(this.mesh.rotation.z)) * blurSpread,
      1,
      Math.abs(Math.cos(this.mesh.rotation.x)) * blurSpread,
    );
    this.shadowMaterial.opacity = 0.15 + 0.5 * closeness * closeness;
  }

  public update(delta: number, input: InputState): void {
    if (this.state === 'crashed' || this.state === 'stopped') {
      return;
    }

    if (this.state === 'rolling') {
      this.updateRollout(delta, input);
      this.updateShadow();
      return;
    }

    // 燃料消費
    if (this.fuel > 0) {
      this.fuel = Math.max(0, this.fuel - this.FUEL_CONSUMPTION_RATE * delta);
    }

    // 燃料切れチェック
    const hasFuel = this.fuel > 0;

    // スロットル調整（燃料がある場合のみ）
    if (hasFuel) {
      if (input.throttleUp) {
        this.throttle = Math.min(1, this.throttle + delta * 0.3);
      }
      if (input.throttleDown) {
        this.throttle = Math.max(0, this.throttle - delta * 0.3);
      }
    } else {
      // 燃料切れ時はスロットルを0に
      this.throttle = Math.max(0, this.throttle - delta * 0.5);
    }

    // 回転入力（燃料がある場合のみ）
    let pitchInput = 0;
    let rollInput = 0;
    let yawInput = 0;

    if (hasFuel) {
      pitchInput = input.pitch;
      rollInput = input.roll;
      yawInput = input.yaw;
    }

    // 角速度更新
    this.angularVelocity.x = pitchInput * this.PITCH_SPEED;
    this.angularVelocity.y = yawInput * this.YAW_SPEED;
    this.angularVelocity.z = rollInput * this.ROLL_SPEED;

    // 回転適用
    this.mesh.rotation.x += this.angularVelocity.x * delta;
    this.mesh.rotation.y += this.angularVelocity.y * delta;
    this.mesh.rotation.z += this.angularVelocity.z * delta;

    // ロール角を制限（-60度〜60度）
    this.mesh.rotation.z = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.mesh.rotation.z));

    // 推力計算（燃料がある場合のみ）
    const currentSpeed = this.velocity.length();
    let acceleration = 0;

    if (hasFuel) {
      const targetSpeed = this.MIN_SPEED + (this.MAX_SPEED - this.MIN_SPEED) * this.throttle;
      const speedDiff = targetSpeed - currentSpeed;
      acceleration = speedDiff * this.ACCELERATION * delta;
    }

    // 前方方向ベクトル
    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyEuler(this.mesh.rotation);

    // 揚力（ピッチ角に基づく、速度に依存、燃料がある場合のみ）
    const lift = hasFuel ? Math.sin(this.mesh.rotation.x) * this.LIFT_COEFFICIENT * currentSpeed : 0;

    // 速度更新
    this.velocity.copy(forward).multiplyScalar(currentSpeed + acceleration);
    this.velocity.y += lift * delta * 10;

    // 重力（弱めて降下をゆっくりに）
    this.velocity.y -= this.GRAVITY * delta;

    // 抗力
    this.velocity.multiplyScalar(1 - this.DRAG_COEFFICIENT * delta);

    // 位置更新
    this.mesh.position.add(this.velocity.clone().multiplyScalar(delta));

    // 地面・海面との衝突判定（機体の底面が地面より下になったら）
    const aircraftBottom = this.mesh.position.y - this.AIRCRAFT_BOTTOM_OFFSET;

    // 滑走路エリア内かチェック
    const isOnRunway = this.isOverRunway();

    // 滑走路上では滑走路表面、それ以外では地面を基準に
    const surfaceLevel = isOnRunway ? this.RUNWAY_SURFACE : this.GROUND_LEVEL;

    if (aircraftBottom <= surfaceLevel) {
      const speed = this.velocity.length();
      const pitchAngle = Math.abs(this.mesh.rotation.x);
      const rollAngle = Math.abs(this.mesh.rotation.z);

      if (!isOnRunway) {
        // 海や陸地（滑走路外）に墜落
        this.mesh.position.y = this.CRASH_LEVEL;
        this.state = 'crashed';
        return;
      }

      // 滑走路上に着陸
      this.mesh.position.y = this.RUNWAY_LEVEL;

      // 滑走路上での着陸判定
      const isSafeLanding = speed < this.SAFE_LANDING_SPEED &&
                            pitchAngle < this.SAFE_LANDING_PITCH &&
                            rollAngle < this.SAFE_LANDING_ROLL;

      if (isSafeLanding) {
        this.state = 'rolling';
        this.throttle = 0;
        this.velocity.y = 0;
        this.updateShadow();
        return;
      } else {
        // 墜落判定：速度が速すぎる、または角度が急すぎる
        const isCrash = speed > this.CRASH_SPEED_THRESHOLD ||
                        pitchAngle > this.CRASH_ANGLE_THRESHOLD ||
                        rollAngle > this.CRASH_ANGLE_THRESHOLD;

        if (isCrash) {
          this.state = 'crashed';
          return;
        } else {
          // 中程度の衝突：バウンド
          this.mesh.position.y = this.RUNWAY_LEVEL;
          this.velocity.y = -this.velocity.y * 0.3;
          this.velocity.x *= 0.7;
          this.velocity.z *= 0.7;
        }
      }
    }

    // プロペラ回転
    this.propellerSpin = this.throttle * 50;
    this.spinPropeller(delta);

    // 安全チェック: 機体が地面や滑走路より下にならないようにする
    if (isOnRunway) {
      // 滑走路エリア内の場合、滑走路レベル以上を保証
      if (this.mesh.position.y < this.RUNWAY_LEVEL) {
        this.mesh.position.y = this.RUNWAY_LEVEL;
      }
    } else {
      // 滑走路外の場合、地面レベル以上を保証
      const minHeight = this.GROUND_LEVEL + this.AIRCRAFT_BOTTOM_OFFSET;
      if (this.mesh.position.y < minHeight) {
        this.mesh.position.y = minHeight;
      }
    }

    // 影の更新
    this.updateShadow();
  }

  public getPosition(): THREE.Vector3 {
    return this.mesh.position.clone();
  }

  public getRotation(): THREE.Euler {
    return this.mesh.rotation.clone();
  }

  public isCrashed(): boolean {
    return this.state === 'crashed';
  }

  public isLanded(): boolean {
    return this.state === 'stopped';
  }

  public getSpeed(): number {
    return this.velocity.length();
  }

  public getPitchAngle(): number {
    return this.mesh.rotation.x;
  }

  public getRollAngle(): number {
    return this.mesh.rotation.z;
  }

  public getThrottle(): number {
    return this.throttle;
  }

  public getFuel(): number {
    return this.fuel;
  }

  public getAltitude(): number {
    const isOnRunway = this.isOverRunway();

    // 機体の底面の位置
    const aircraftBottom = this.mesh.position.y - this.AIRCRAFT_BOTTOM_OFFSET;

    if (isOnRunway) {
      // 滑走路エリア内では、滑走路表面からの高度を返す
      return aircraftBottom - this.RUNWAY_SURFACE;
    } else {
      // 滑走路エリア外では、地面からの高度を返す
      return aircraftBottom - this.GROUND_LEVEL;
    }
  }

  public destroy(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    scene.remove(this.shadow);
  }
}

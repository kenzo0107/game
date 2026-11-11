import * as THREE from 'three';
import { InputState } from './input';

export class Aircraft {
  private mesh: THREE.Group;
  private shadow: THREE.Group;
  private velocity: THREE.Vector3;
  private angularVelocity: THREE.Vector3;
  private throttle: number;
  private crashed: boolean;
  private landed: boolean;
  private fuel: number;
  private readonly GROUND_LEVEL = -50;  // 地面・海面の高さ
  private readonly RUNWAY_SURFACE = -49.5;  // 滑走路の表面高さ
  private readonly AIRCRAFT_BOTTOM_OFFSET = 0.25;  // 機体中心から最下点までの距離(主翼底面)
  private readonly RUNWAY_LEVEL = -49.25; // 滑走路の上(機体の底面が-49.5の滑走路表面に接する)
  private readonly CRASH_LEVEL = -49.75;  // 墜落時の高さ(機体の底面が-50の地面に接する)
  private readonly SHADOW_MAX_HEIGHT = 30;
  private readonly SHADOW_OFFSET = -49.3; // 影の高さ(滑走路表面より少し上)
  private readonly GROUND_FRICTION = 15.0;
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
    this.shadow = this.createShadow();
    this.velocity = new THREE.Vector3(0, -1, this.MIN_SPEED * 1.2);  // 初期速度をやや速く、やや下向きに
    this.angularVelocity = new THREE.Vector3(0, 0, 0);
    this.throttle = 0.4;  // 初期スロットルを少し下げる
    this.crashed = false;
    this.landed = false;
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
    group.position.set(0, -30, 50);  // 高度20、滑走路から150単位手前
    group.rotation.x = -0.05;  // わずかに機首を下げる

    return group;
  }

  private createShadow(): THREE.Group {
    const shadowGroup = new THREE.Group();

    // 外側の黄色い輪郭（より目立つ）
    const outerGeometry = new THREE.RingGeometry(5.5, 7, 32);
    const outerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const outerRing = new THREE.Mesh(outerGeometry, outerMaterial);
    outerRing.rotation.x = -Math.PI / 2;
    shadowGroup.add(outerRing);

    // 中間の赤い輪郭
    const middleGeometry = new THREE.RingGeometry(4.5, 5.5, 32);
    const middleMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const middleRing = new THREE.Mesh(middleGeometry, middleMaterial);
    middleRing.rotation.x = -Math.PI / 2;
    middleRing.position.y = 0.01;
    shadowGroup.add(middleRing);

    // 内側の暗い円
    const innerGeometry = new THREE.CircleGeometry(4.5, 32);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const innerShadow = new THREE.Mesh(innerGeometry, innerMaterial);
    innerShadow.rotation.x = -Math.PI / 2;
    innerShadow.position.y = 0.02;
    shadowGroup.add(innerShadow);

    shadowGroup.position.y = this.SHADOW_OFFSET;
    return shadowGroup;
  }

  private handleLandedState(delta: number): void {
    // 地面摩擦による減速
    const currentSpeed = this.velocity.length();

    if (currentSpeed > 0.01) {
      // まだ動いている場合は減速
      const frictionForce = this.GROUND_FRICTION * delta;
      const speedReduction = Math.min(frictionForce, currentSpeed);

      this.velocity.multiplyScalar((currentSpeed - speedReduction) / currentSpeed);

      // 位置更新（X, Z座標のみ。Y座標は滑走路上に固定）
      const velocityDelta = this.velocity.clone().multiplyScalar(delta);
      this.mesh.position.x += velocityDelta.x;
      this.mesh.position.z += velocityDelta.z;
      // Y座標は滑走路上に固定
      this.mesh.position.y = this.RUNWAY_LEVEL;

      // プロペラの回転を徐々に停止
      const propeller = this.mesh.getObjectByName('propeller');
      if (propeller) {
        propeller.rotation.z += currentSpeed * delta * 2;
      }
    } else {
      // 完全停止
      this.velocity.set(0, 0, 0);
    }

    // 影の更新
    this.updateShadow();
  }

  private updateShadow(): void {
    // 高度を取得（getAltitude()メソッドを使用して統一）
    const altitude = this.getAltitude();

    if (altitude > this.SHADOW_MAX_HEIGHT) {
      // 高度が高すぎる場合は影を非表示
      this.shadow.visible = false;
      return;
    }

    this.shadow.visible = true;

    // 飛行機の真下に影を配置
    this.shadow.position.x = this.mesh.position.x;
    this.shadow.position.z = this.mesh.position.z;

    // 高度に応じて影のサイズと透明度を調整
    const heightRatio = 1 - (altitude / this.SHADOW_MAX_HEIGHT);
    // 地面に近いほど小さく、高いほど大きく（変化を顕著に）
    const scale = 0.5 + (altitude / this.SHADOW_MAX_HEIGHT) * 2.5; // 0.5〜3.0の範囲
    this.shadow.scale.set(scale, scale, 1);

    // 透明度：地面に近いほど濃く
    const outerRing = this.shadow.children[0] as THREE.Mesh;
    const middleRing = this.shadow.children[1] as THREE.Mesh;
    const innerShadow = this.shadow.children[2] as THREE.Mesh;
    const outerMaterial = outerRing.material as THREE.MeshBasicMaterial;
    const middleMaterial = middleRing.material as THREE.MeshBasicMaterial;
    const innerMaterial = innerShadow.material as THREE.MeshBasicMaterial;
    outerMaterial.opacity = 0.9 * heightRatio;
    middleMaterial.opacity = 0.8 * heightRatio;
    innerMaterial.opacity = 0.4 * heightRatio;
  }

  public update(delta: number, input: InputState): void {
    if (this.crashed) {
      return;
    }

    // 着陸後の減速処理
    if (this.landed) {
      this.handleLandedState(delta);
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
    const isOnRunway = this.mesh.position.z >= this.RUNWAY_MIN_Z &&
                       this.mesh.position.z <= this.RUNWAY_MAX_Z &&
                       this.mesh.position.x >= this.RUNWAY_MIN_X &&
                       this.mesh.position.x <= this.RUNWAY_MAX_X;

    // 滑走路上では滑走路表面、それ以外では地面を基準に
    const surfaceLevel = isOnRunway ? this.RUNWAY_SURFACE : this.GROUND_LEVEL;

    if (aircraftBottom <= surfaceLevel) {
      const speed = this.velocity.length();
      const pitchAngle = Math.abs(this.mesh.rotation.x);
      const rollAngle = Math.abs(this.mesh.rotation.z);

      if (!isOnRunway) {
        // 海や陸地（滑走路外）に墜落
        this.mesh.position.y = this.CRASH_LEVEL;
        this.crashed = true;
        return;
      }

      // 滑走路上に着陸
      this.mesh.position.y = this.RUNWAY_LEVEL;

      // 滑走路上での着陸判定
      const isSafeLanding = speed < this.SAFE_LANDING_SPEED &&
                            pitchAngle < this.SAFE_LANDING_PITCH &&
                            rollAngle < this.SAFE_LANDING_ROLL;

      if (isSafeLanding) {
        // 安全に着陸
        if (!this.landed) {
          this.landed = true;
          this.throttle = 0;
          // 機体を水平に戻し、位置を固定
          this.mesh.rotation.x = 0;
          this.mesh.rotation.z = 0;
          this.mesh.position.y = this.RUNWAY_LEVEL;
        }

        // 着陸後は摩擦で徐々に減速
        this.velocity.y = 0; // Y軸方向は地面に接地しているためゼロ
        const frictionFactor = Math.max(0, 1 - this.GROUND_FRICTION * delta);
        this.velocity.x *= frictionFactor;
        this.velocity.z *= frictionFactor;

        // 非常に低速になったら完全停止
        if (this.velocity.length() < 0.1) {
          this.velocity.set(0, 0, 0);
        }
      } else {
        // 墜落判定：速度が速すぎる、または角度が急すぎる
        const isCrash = speed > this.CRASH_SPEED_THRESHOLD ||
                        pitchAngle > this.CRASH_ANGLE_THRESHOLD ||
                        rollAngle > this.CRASH_ANGLE_THRESHOLD;

        if (isCrash) {
          this.crashed = true;
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
    const propeller = this.mesh.getObjectByName('propeller');
    if (propeller) {
      propeller.rotation.z += this.throttle * delta * 50;
    }

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
    return this.crashed;
  }

  public isLanded(): boolean {
    return this.landed;
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
    // 滑走路エリア内かチェック
    const isOnRunway = this.mesh.position.z >= this.RUNWAY_MIN_Z &&
                       this.mesh.position.z <= this.RUNWAY_MAX_Z &&
                       this.mesh.position.x >= this.RUNWAY_MIN_X &&
                       this.mesh.position.x <= this.RUNWAY_MAX_X;

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

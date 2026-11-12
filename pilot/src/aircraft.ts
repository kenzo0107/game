import * as THREE from 'three';
import { InputState } from './input';
import { GROUND_LEVEL, RUNWAY_SURFACE, Surface, Terrain } from './terrain';
import { Placement } from './stages';

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
  private terrain: Terrain;
  private wind: THREE.Vector3;
  private wheels: THREE.Object3D[] = [];
  private airborne = true;
  private onTouchdown: (strength: number) => void;
  private readonly WHEEL_RADIUS = 0.3;
  private readonly WHEEL_CENTER_Y = -0.6;
  private readonly AIRCRAFT_BOTTOM_OFFSET = 0.9;  // 機体中心からタイヤの接地点までの距離
  private readonly SHADOW_MAX_HEIGHT = 100;
  private readonly SHADOW_LIFT = 0.12;
  private readonly RUNWAY_ROLLING_DECEL = 1.5;
  private readonly GRASS_ROLLING_DECEL = 6;
  private readonly BRAKE_DECEL = 4;
  private readonly GROUND_STEER_SPEED = 0.5;
  private readonly LEVEL_OUT_RATE = 3;

  // 飛行パラメータ
  private readonly MAX_SPEED = 50;
  private readonly MIN_SPEED = 10;
  private readonly ACCELERATION = 5;
  private readonly PITCH_SPEED = 0.15;  // 上下の動きを遅く
  private readonly ROLL_SPEED = 0.6;
  private readonly YAW_SPEED = 0.12;    // 旋回を遅く
  private readonly BANK_TURN_RATE = 0.6;
  private readonly ROLL_RECOVERY_RATE = 0.6;
  private readonly LIFT_COEFFICIENT = 0.25;  // 揚力をさらに弱く（降下しやすく）
  private readonly DRAG_COEFFICIENT = 0.1;
  private readonly GRAVITY = 6.0;  // 重力を弱く（ゆっくり降下）

  // 燃料パラメータ
  private readonly FUEL_CONSUMPTION_RATE = 1.2;  // 毎秒の消費率(%、約83秒で空)
  private readonly SAFE_LANDING_SPEED = 12;
  private readonly SAFE_LANDING_PITCH = Math.PI / 12; // 15度
  private readonly SAFE_LANDING_ROLL = Math.PI / 12;  // 15度
  private readonly CRASH_SPEED_THRESHOLD = 20;
  private readonly CRASH_ANGLE_THRESHOLD = Math.PI / 6; // 30度

  constructor(
    scene: THREE.Scene,
    terrain: Terrain,
    start: Placement,
    fuel: number,
    wind: { x: number; z: number },
    onTouchdown: (strength: number) => void,
  ) {
    this.terrain = terrain;
    this.wind = new THREE.Vector3(wind.x, 0, wind.z);
    this.onTouchdown = onTouchdown;
    this.mesh = this.createAircraft();
    this.mesh.position.set(start.x, start.y, start.z);
    this.mesh.rotation.y = start.heading;
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.shadow = this.createShadow();
    this.velocity = new THREE.Vector3(0, -1, this.MIN_SPEED * 1.2)  // 初期速度をやや速く、やや下向きに
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), start.heading);
    this.angularVelocity = new THREE.Vector3(0, 0, 0);
    this.throttle = 0.4;  // 初期スロットルを少し下げる
    this.propellerSpin = 0;
    this.state = 'flying';
    this.fuel = fuel;

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

    const tireMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const hubMaterial = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    const strutMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const tireGeometry = new THREE.CylinderGeometry(this.WHEEL_RADIUS, this.WHEEL_RADIUS, 0.22, 16);
    const hubGeometry = new THREE.BoxGeometry(0.24, this.WHEEL_RADIUS * 1.6, 0.08);
    const gearPositions: [number, number][] = [[0, 1.5], [-1.2, -0.5], [1.2, -0.5]];
    for (const [x, z] of gearPositions) {
      const strutLength = -0.25 - this.WHEEL_CENTER_Y;
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, strutLength, 0.08), strutMaterial);
      strut.position.set(x, -0.25 - strutLength / 2, z);
      group.add(strut);

      const wheel = new THREE.Group();
      wheel.position.set(x, this.WHEEL_CENTER_Y, z);
      const tire = new THREE.Mesh(tireGeometry, tireMaterial);
      tire.rotation.z = Math.PI / 2;
      wheel.add(tire);
      wheel.add(new THREE.Mesh(hubGeometry, hubMaterial));
      group.add(wheel);
      this.wheels.push(wheel);
    }

    // 既定の XYZ 順だと機首が横を向いたときにピッチ操作が機首の上下ではなく横転になるため、機体の姿勢として自然な順にする
    group.rotation.order = 'YXZ';
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

  private surface(): Surface {
    return this.terrain.surfaceAt(this.mesh.position.x, this.mesh.position.z);
  }

  private isOverRunway(): boolean {
    return this.surface() === 'runway';
  }

  private spinWheels(distance: number): void {
    for (const wheel of this.wheels) wheel.rotation.x += distance / this.WHEEL_RADIUS;
  }

  private updateRollout(delta: number, input: InputState): void {
    const surface = this.surface();
    if (surface === 'ocean') {
      this.state = 'crashed';
      return;
    }

    const onRunway = surface === 'runway';
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const decel = (onRunway ? this.RUNWAY_ROLLING_DECEL : this.GRASS_ROLLING_DECEL) +
                  (input.throttleDown ? this.BRAKE_DECEL : 0);
    const nextSpeed = Math.max(0, speed - decel * delta);

    const steerAuthority = Math.min(1, speed / 5);
    this.mesh.rotation.y -= input.yaw * this.GROUND_STEER_SPEED * steerAuthority * delta;
    const levelOut = Math.exp(-this.LEVEL_OUT_RATE * delta);
    this.mesh.rotation.x *= levelOut;
    this.mesh.rotation.z *= levelOut;

    const heading = this.mesh.rotation.y;
    this.velocity.set(Math.sin(heading) * nextSpeed, 0, Math.cos(heading) * nextSpeed);
    this.mesh.position.x += this.velocity.x * delta;
    this.mesh.position.z += this.velocity.z * delta;
    this.mesh.position.y = (onRunway ? RUNWAY_SURFACE : GROUND_LEVEL) + this.AIRCRAFT_BOTTOM_OFFSET;
    this.spinWheels(nextSpeed * delta);

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
    this.shadow.position.set(this.mesh.position.x, this.terrain.levelAt(this.mesh.position.x, this.mesh.position.z) + this.SHADOW_LIFT, this.mesh.position.z);

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

    // 回転適用（画面奥を向く機体では +X が画面の左なので、右への旋回は Y 回転を減らす向き）
    this.mesh.rotation.x += this.angularVelocity.x * delta;
    this.mesh.rotation.y -= (this.angularVelocity.y + Math.sin(this.mesh.rotation.z) * this.BANK_TURN_RATE) * delta;
    this.mesh.rotation.z += this.angularVelocity.z * delta;
    if (rollInput === 0) {
      this.mesh.rotation.z *= Math.exp(-this.ROLL_RECOVERY_RATE * delta);
    }

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
    this.mesh.position.addScaledVector(this.velocity, delta).addScaledVector(this.wind, delta);

    // 地面・海面との衝突判定（機体の底面が地面より下になったら）
    const aircraftBottom = this.mesh.position.y - this.AIRCRAFT_BOTTOM_OFFSET;

    // 滑走路エリア内かチェック
    const isOnRunway = this.isOverRunway();

    // 滑走路上では滑走路表面、それ以外では地面を基準に
    const surfaceLevel = isOnRunway ? RUNWAY_SURFACE : GROUND_LEVEL;

    if (aircraftBottom <= surfaceLevel) {
      const speed = this.velocity.length();
      const pitchAngle = Math.abs(this.mesh.rotation.x);
      const rollAngle = Math.abs(this.mesh.rotation.z);

      if (!isOnRunway) {
        // 海や陸地（滑走路外）に墜落
        this.mesh.position.y = GROUND_LEVEL + this.AIRCRAFT_BOTTOM_OFFSET;
        this.state = 'crashed';
        return;
      }

      // 滑走路上に着陸
      this.mesh.position.y = RUNWAY_SURFACE + this.AIRCRAFT_BOTTOM_OFFSET;
      if (this.airborne) {
        this.onTouchdown(Math.min(1, 0.3 + Math.abs(this.velocity.y) / 4 + speed / 40));
      }
      this.airborne = false;

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
    const minHeight = surfaceLevel + this.AIRCRAFT_BOTTOM_OFFSET;
    if (this.mesh.position.y < minHeight) {
      this.mesh.position.y = minHeight;
    }
    // 接地の判定だけで鳴らすと、滑走路上で小さく跳ねるたびに毎フレーム音が重なるため、一度浮き上がってからの接地だけを数える
    if (this.mesh.position.y > minHeight + 0.3) this.airborne = true;

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
      return aircraftBottom - RUNWAY_SURFACE;
    } else {
      // 滑走路エリア外では、地面からの高度を返す
      return aircraftBottom - GROUND_LEVEL;
    }
  }

  public getGroundContact(): { speed: number; surface: Surface } | null {
    if (this.state !== 'rolling') return null;
    return { speed: Math.hypot(this.velocity.x, this.velocity.z), surface: this.surface() };
  }

  public isStoppedOnRunway(): boolean {
    return this.state === 'stopped' && this.isOverRunway();
  }

  public destroy(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    scene.remove(this.shadow);
  }
}

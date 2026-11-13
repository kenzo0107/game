import * as THREE from 'three';
import { InputState } from './input';
import { approach, buildJumper, disposeTree, FOOT_OFFSET } from './jumper';
import { RocketStage } from './stages';
import { Terrain } from './terrain';

type BeltState = 'grounded' | 'flying' | 'touchdown' | 'landed' | 'crashed';
export type RocketCrashCause = 'hard' | 'ocean' | 'fuel';

const CLIMB_SPEED = 8;
const HOVER_SINK = 1.5;
const DESCEND_SPEED = 7;
const EMPTY_FALL_SPEED = 20;
const VERTICAL_RATE = 1.8;
const EMPTY_FALL_RATE = 0.8;
const MOVE_SPEED = 12;
const STRAFE_SPEED = 9;
const MOVE_RATE = 1.4;
const TURN_SPEED = 1.4;

const FUEL_BURN = { climb: 3, hover: 1.5, descend: 0.8 };
const THRUST = { climb: 1, hover: 0.6, descend: 0.3 };

const HARD_LANDING_SPEED = 5;
const SKID_LANDING_SPEED = 6;
const SETTLE_TIME = 0.6;
const SHADOW_MAX_HEIGHT = 80;

const CAMERA = { back: 12, up: 5, ahead: 8, down: 2 };

export class RocketBelt {
  private root = new THREE.Group();
  private body: THREE.Group;
  private arms: THREE.Mesh[];
  private flames: THREE.Mesh[] = [];
  private shadow: THREE.Mesh;
  private velocity = new THREE.Vector3();
  private wind: THREE.Vector3;
  private heading: number;
  private state: BeltState = 'grounded';
  private crash: RocketCrashCause | null = null;
  private fuel: number;
  private thrust = 0;
  private settleTimer = 0;
  private landingDistance = 0;

  constructor(
    scene: THREE.Scene,
    private readonly terrain: Terrain,
    private readonly stage: RocketStage,
    private readonly onTouchdown: () => void,
  ) {
    const { start, wind } = stage;
    this.heading = start.heading;
    this.wind = new THREE.Vector3(wind.x, 0, wind.z);
    this.fuel = stage.fuel;

    ({ body: this.body, arms: this.arms } = buildJumper());
    this.buildBelt();
    this.arms.forEach((arm) => (arm.rotation.x = -0.7));
    this.root.add(this.body);
    this.root.position.set(start.x, terrain.levelAt(start.x, start.z) + FOOT_OFFSET, start.z);
    this.root.rotation.y = this.heading;
    scene.add(this.root);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);
    this.updateShadow();
  }

  private buildBelt(): void {
    const metal = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const nozzle = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const flame = new THREE.MeshBasicMaterial({ color: 0xff8822, transparent: true, opacity: 0.85 });
    for (const side of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 12), metal);
      tank.position.set(side * 0.13, 0.4, -0.24);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.1, 12), nozzle);
      cone.position.set(side * 0.13, 0.08, -0.24);
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 10).rotateX(Math.PI).translate(0, -0.3, 0), flame);
      fire.position.set(side * 0.13, 0.03, -0.24);
      fire.visible = false;
      this.body.add(tank, cone, fire);
      this.flames.push(fire);
    }
  }

  private forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  // カメラが進行方向の後ろにあると +X が画面の左になるため、画面の右は -X 側になる
  private right(): THREE.Vector3 {
    return new THREE.Vector3(-Math.cos(this.heading), 0, Math.sin(this.heading));
  }

  private groundLevel(): number {
    return this.terrain.levelAt(this.root.position.x, this.root.position.z);
  }

  private updateFlames(target: number, delta: number): void {
    this.thrust = approach(this.thrust, target, 10, delta);
    for (const fire of this.flames) {
      fire.visible = this.thrust > 0.05;
      fire.scale.set(0.6 + this.thrust * 0.4, 0.3 + this.thrust * (1.2 + Math.random() * 0.4), 0.6 + this.thrust * 0.4);
    }
  }

  private fly(delta: number, input: InputState): void {
    const mode = input.throttleUp ? 'climb' : input.throttleDown ? 'descend' : 'hover';
    const hasFuel = this.fuel > 0;
    const targetVy = !hasFuel
      ? -EMPTY_FALL_SPEED
      : mode === 'climb'
        ? CLIMB_SPEED
        : mode === 'descend'
          ? -DESCEND_SPEED
          : -HOVER_SINK;
    if (hasFuel) this.fuel = Math.max(0, this.fuel - FUEL_BURN[mode] * delta);
    this.updateFlames(hasFuel ? THRUST[mode] : 0, delta);

    this.heading -= input.yaw * TURN_SPEED * delta;
    this.velocity.y = approach(this.velocity.y, targetVy, hasFuel ? VERTICAL_RATE : EMPTY_FALL_RATE, delta);
    const target = hasFuel
      ? this.forward().multiplyScalar(input.pitch * MOVE_SPEED).addScaledVector(this.right(), input.roll * STRAFE_SPEED)
      : new THREE.Vector3();
    this.velocity.x = approach(this.velocity.x, target.x, MOVE_RATE, delta);
    this.velocity.z = approach(this.velocity.z, target.z, MOVE_RATE, delta);

    this.body.rotation.x = approach(this.body.rotation.x, input.pitch * 0.3, 4, delta);
    this.root.rotation.z = approach(this.root.rotation.z, input.roll * 0.3, 4, delta);
    this.root.rotation.y = this.heading;
    this.root.position.addScaledVector(this.velocity, delta).addScaledVector(this.wind, delta);
    if (this.velocity.y <= 0 && this.root.position.y - FOOT_OFFSET <= this.groundLevel()) this.touchGround();
  }

  private touchGround(): void {
    const level = this.groundLevel();
    const { x, z } = this.root.position;
    this.root.position.y = level + FOOT_OFFSET;
    const fallSpeed = -this.velocity.y;
    const skidSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.velocity.set(0, 0, 0);
    const { target } = this.stage;
    const distance = Math.hypot(x - target.x, z - target.z);
    if (this.terrain.surfaceAt(x, z) === 'ocean') {
      this.root.position.y = level;
      this.fail('ocean');
    } else if (fallSpeed > HARD_LANDING_SPEED || skidSpeed > SKID_LANDING_SPEED) {
      this.fail(this.fuel === 0 ? 'fuel' : 'hard');
    } else if (distance <= target.radius) {
      this.state = 'touchdown';
      this.landingDistance = distance;
      this.onTouchdown();
    } else if (this.fuel === 0) {
      this.fail('fuel');
    } else {
      // 的の外に降りたら失敗にすると、高度を下げすぎただけで最初からになり難しすぎるため、飛び直せるようにする
      this.state = 'grounded';
      this.onTouchdown();
    }
  }

  private fail(cause: RocketCrashCause): void {
    this.state = 'crashed';
    this.crash = cause;
    this.updateFlames(0, 1);
  }

  private settle(delta: number): void {
    this.settleTimer += delta;
    this.updateFlames(0, delta);
    this.body.rotation.x = approach(this.body.rotation.x, 0, 6, delta);
    this.root.rotation.z = approach(this.root.rotation.z, 0, 6, delta);
    if (this.settleTimer >= SETTLE_TIME) this.state = 'landed';
  }

  private updateShadow(): void {
    const altitude = this.getAltitude();
    this.shadow.visible = altitude < SHADOW_MAX_HEIGHT && this.state !== 'crashed';
    const closeness = 1 - Math.max(0, altitude) / SHADOW_MAX_HEIGHT;
    this.shadow.position.set(this.root.position.x, this.groundLevel() + 0.4, this.root.position.z);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.45 * closeness;
  }

  public update(delta: number, input: InputState): void {
    if (this.state === 'crashed' || this.state === 'landed') return;
    if (this.state === 'touchdown') {
      this.settle(delta);
      return;
    }
    if (this.state === 'grounded') {
      this.heading -= input.yaw * TURN_SPEED * delta;
      this.root.rotation.y = this.heading;
      this.body.rotation.x = approach(this.body.rotation.x, 0, 6, delta);
      this.root.rotation.z = approach(this.root.rotation.z, 0, 6, delta);
      if (input.throttleUp && this.fuel > 0) this.state = 'flying';
      else this.updateFlames(0, delta);
    }
    if (this.state === 'flying') this.fly(delta, input);
    this.updateShadow();
  }

  public placeCamera(camera: THREE.PerspectiveCamera): void {
    const forward = this.forward();
    const position = this.root.position;
    camera.position.copy(position).addScaledVector(forward, -CAMERA.back).add(new THREE.Vector3(0, CAMERA.up, 0));
    camera.lookAt(position.clone().addScaledVector(forward, CAMERA.ahead).add(new THREE.Vector3(0, -CAMERA.down, 0)));
  }

  public getPosition(): THREE.Vector3 {
    return this.root.position.clone();
  }

  public getAltitude(): number {
    return this.root.position.y - FOOT_OFFSET - this.groundLevel();
  }

  public getVerticalSpeed(): number {
    return this.velocity.y;
  }

  public getFuel(): number {
    return this.fuel;
  }

  public getTargetDistance(): number {
    if (this.state === 'touchdown' || this.state === 'landed') return this.landingDistance;
    const { target } = this.stage;
    return Math.hypot(this.root.position.x - target.x, this.root.position.z - target.z);
  }

  public isOnBullseye(): boolean {
    return this.state === 'landed' && this.landingDistance <= this.stage.target.radius / 4;
  }

  public isFlying(): boolean {
    return this.state === 'flying';
  }

  public isCrashed(): boolean {
    return this.state === 'crashed';
  }

  public getCrashCause(): RocketCrashCause | null {
    return this.crash;
  }

  public isLanded(): boolean {
    return this.state === 'landed';
  }

  public getThrustNoise(): number {
    return this.thrust;
  }

  public destroy(scene: THREE.Scene): void {
    scene.remove(this.root, this.shadow);
    disposeTree(this.root);
    disposeTree(this.shadow);
  }
}

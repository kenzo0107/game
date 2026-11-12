import * as THREE from 'three';
import { InputState } from './input';
import { SkydiveStage } from './stages';
import { Terrain } from './terrain';

type DiveState = 'freefall' | 'canopy' | 'touchdown' | 'landed' | 'crashed';
export type CrashCause = 'no-chute' | 'hard' | 'ocean';

const BODY_SCALE = 1.6;
const FOOT_OFFSET = 0.9 * BODY_SCALE;

const FREEFALL_SPEED = 24;
const DIVE_SPEED = 34;
const SPREAD_SPEED = 16;
const FREEFALL_FALL_RATE = 0.6;
const TRACK_SPEED = 12;
const FREEFALL_STEER_RATE = 1.5;
const FREEFALL_TURN_SPEED = 1.2;

const CANOPY_FALL = 5;
const CANOPY_FLARE_FALL = 1.5;
const CANOPY_FALL_RATE = 1.5;
const CANOPY_SPEED = 7;
const CANOPY_BOOST = 3;
const CANOPY_BRAKE = 4.5;
const CANOPY_STEER_RATE = 1.2;
const CANOPY_TURN_SPEED = 0.9;
const CANOPY_OPEN_TIME = 0.8;
const CANOPY_HEIGHT = 7;

const HARD_LANDING_SPEED = 9;
const SETTLE_TIME = 1.2;
const SHADOW_MAX_HEIGHT = 120;

const JUMP_PLANE_SPEED = 22;
const JUMP_PLANE_LIFETIME = 8;
const EXIT_SPEED = 8;

const FREEFALL_CAMERA = { back: 9, up: 12, ahead: 4, down: 30 };
const CANOPY_CAMERA = { back: 18, up: 6, ahead: 12, down: 9 };

const approach = (current: number, target: number, rate: number, delta: number): number =>
  target + (current - target) * Math.exp(-rate * delta);

export class Skydiver {
  private root = new THREE.Group();
  private body = new THREE.Group();
  private arms: THREE.Mesh[] = [];
  private canopy = new THREE.Group();
  private shadow: THREE.Mesh;
  private jumpPlane: THREE.Group | null;
  private jumpPlaneAge = 0;
  private jumpPlaneDirection: THREE.Vector3;
  private velocity: THREE.Vector3;
  private wind: THREE.Vector3;
  private heading: number;
  private state: DiveState = 'freefall';
  private crash: CrashCause | null = null;
  private deployed = false;
  private openness = 0;
  private settleTimer = 0;
  private landingDistance = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly terrain: Terrain,
    private readonly stage: SkydiveStage,
    private readonly onDeploy: () => void,
    private readonly onTouchdown: () => void,
  ) {
    const { start, wind } = stage;
    this.heading = start.heading;
    this.wind = new THREE.Vector3(wind.x, 0, wind.z);
    this.velocity = this.forward().multiplyScalar(EXIT_SPEED);
    this.jumpPlaneDirection = this.forward().setY(0.05);

    this.buildBody();
    this.buildCanopy();
    this.root.add(this.body, this.canopy);
    this.root.position.set(start.x, start.y, start.z);
    this.root.rotation.y = this.heading;
    this.body.rotation.x = Math.PI / 2;
    scene.add(this.root);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);

    this.jumpPlane = this.buildJumpPlane();
    this.jumpPlane.position.set(start.x, start.y + 5, start.z + 4);
    this.jumpPlane.rotation.y = this.heading;
    scene.add(this.jumpPlane);
  }

  private buildBody(): void {
    const suit = new THREE.MeshLambertMaterial({ color: 0x2266ee });
    const skin = new THREE.MeshLambertMaterial({ color: 0xf2c9a0 });
    const helmet = new THREE.MeshLambertMaterial({ color: 0xffdd22 });
    const pack = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      this.body.add(mesh);
      return mesh;
    };

    part(new THREE.BoxGeometry(0.5, 0.65, 0.28), suit, 0, 0.3, 0);
    part(new THREE.SphereGeometry(0.17, 12, 10), skin, 0, 0.82, 0.02);
    part(new THREE.SphereGeometry(0.19, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), helmet, 0, 0.84, 0);
    part(new THREE.BoxGeometry(0.42, 0.5, 0.16), pack, 0, 0.3, -0.21);
    for (const side of [-1, 1]) {
      part(new THREE.BoxGeometry(0.18, 0.9, 0.2), suit, side * 0.13, -0.45, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), suit);
      arm.geometry.translate(0, -0.3, 0);
      arm.position.set(side * 0.32, 0.58, 0);
      this.body.add(arm);
      this.arms.push(arm);
    }
    this.body.scale.setScalar(BODY_SCALE);
  }

  private buildCanopy(): void {
    const colors = [0xff3b30, 0xffffff, 0xff9500, 0xffffff, 0xff3b30];
    const cellWidth = 2.1;
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x444444 });
    const linePoints: THREE.Vector3[] = [];
    colors.forEach((color, i) => {
      const offset = i - (colors.length - 1) / 2;
      const cell = new THREE.Mesh(
        new THREE.BoxGeometry(cellWidth, 0.5, 3.6),
        new THREE.MeshLambertMaterial({ color }),
      );
      cell.position.set(offset * cellWidth * 0.98, CANOPY_HEIGHT - Math.abs(offset) ** 2 * 0.25, 0);
      cell.rotation.z = -offset * 0.12;
      this.canopy.add(cell);
      for (const z of [-1.4, 1.4]) {
        linePoints.push(new THREE.Vector3(cell.position.x, cell.position.y - 0.25, z), new THREE.Vector3(0, 1.1, 0));
      }
    });
    this.canopy.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linePoints), lineMaterial));
    this.canopy.visible = false;
  }

  private buildJumpPlane(): THREE.Group {
    const plane = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
    const accent = new THREE.MeshLambertMaterial({ color: 0x2255aa });
    const add = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      plane.add(mesh);
    };
    add(2.2, 2, 10, white, 0, 0, 0);
    add(20, 0.25, 2.6, accent, 0, 0.9, 0.5);
    add(6, 0.2, 1.6, accent, 0, 0.3, -4.5);
    add(0.2, 2.4, 1.8, accent, 0, 1.6, -4.5);
    return plane;
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

  private updateJumpPlane(delta: number): void {
    if (!this.jumpPlane) return;
    this.jumpPlaneAge += delta;
    this.jumpPlane.position.addScaledVector(this.jumpPlaneDirection, JUMP_PLANE_SPEED * delta);
    if (this.jumpPlaneAge > JUMP_PLANE_LIFETIME) this.removeJumpPlane();
  }

  private removeJumpPlane(): void {
    if (!this.jumpPlane) return;
    this.scene.remove(this.jumpPlane);
    this.disposeTree(this.jumpPlane);
    this.jumpPlane = null;
  }

  private deploy(): void {
    this.state = 'canopy';
    this.deployed = true;
    this.canopy.visible = true;
    this.onDeploy();
  }

  private steer(delta: number, input: InputState): void {
    const freefall = this.state === 'freefall';
    let fallSpeed: number;
    let target: THREE.Vector3;
    if (freefall) {
      this.heading -= input.yaw * FREEFALL_TURN_SPEED * delta;
      fallSpeed = input.throttleUp ? DIVE_SPEED : input.throttleDown ? SPREAD_SPEED : FREEFALL_SPEED;
      target = this.forward().multiplyScalar(input.pitch * TRACK_SPEED).addScaledVector(this.right(), input.roll * TRACK_SPEED);
      this.body.rotation.x = approach(this.body.rotation.x, Math.PI / 2 + (input.throttleUp ? 0.6 : 0) + input.pitch * 0.25, 4, delta);
      this.body.rotation.z = approach(this.body.rotation.z, 0, 4, delta);
      this.root.rotation.z = approach(this.root.rotation.z, -input.roll * 0.35, 4, delta);
      const spread = input.throttleUp ? 0.25 : input.throttleDown ? 1.6 : 1.1;
      this.arms.forEach((arm, i) => (arm.rotation.z = approach(arm.rotation.z, (i === 0 ? -1 : 1) * spread, 6, delta)));
    } else {
      this.openness = Math.min(1, this.openness + delta / CANOPY_OPEN_TIME);
      this.heading -= (input.roll + input.yaw) * CANOPY_TURN_SPEED * delta;
      const brake = Math.max(input.throttleDown ? 1 : 0, -input.pitch);
      const boost = Math.max(0, input.pitch);
      fallSpeed = CANOPY_FALL - brake * CANOPY_FLARE_FALL;
      target = this.forward().multiplyScalar(CANOPY_SPEED + boost * CANOPY_BOOST - brake * CANOPY_BRAKE);
      this.body.rotation.x = approach(this.body.rotation.x, 0, 3, delta);
      this.root.rotation.z = approach(this.root.rotation.z, -input.roll * 0.3, 3, delta);
      this.arms.forEach((arm, i) => (arm.rotation.z = approach(arm.rotation.z, (i === 0 ? -1 : 1) * (2.6 - brake * 0.8), 6, delta)));
      const eased = 1 - (1 - this.openness) ** 3;
      this.canopy.scale.set(0.2 + 0.8 * eased, 0.3 + 0.7 * eased, 0.2 + 0.8 * eased);
    }

    this.velocity.y = approach(this.velocity.y, -fallSpeed, freefall ? FREEFALL_FALL_RATE : CANOPY_FALL_RATE, delta);
    const steerRate = freefall ? FREEFALL_STEER_RATE : CANOPY_STEER_RATE;
    this.velocity.x = approach(this.velocity.x, target.x, steerRate, delta);
    this.velocity.z = approach(this.velocity.z, target.z, steerRate, delta);
    this.root.rotation.y = this.heading;
  }

  private touchGround(): void {
    const level = this.groundLevel();
    this.root.position.y = level + FOOT_OFFSET;
    const fallSpeed = -this.velocity.y;
    this.velocity.set(0, 0, 0);
    if (this.state === 'freefall') {
      this.fail('no-chute');
    } else if (this.terrain.surfaceAt(this.root.position.x, this.root.position.z) === 'ocean') {
      this.root.position.y = level;
      this.fail('ocean');
    } else if (fallSpeed > HARD_LANDING_SPEED) {
      this.fail('hard');
    } else {
      this.state = 'touchdown';
      const { target } = this.stage;
      this.landingDistance = Math.hypot(this.root.position.x - target.x, this.root.position.z - target.z);
      this.onTouchdown();
    }
  }

  private fail(cause: CrashCause): void {
    this.state = 'crashed';
    this.crash = cause;
    this.canopy.visible = false;
  }

  private settle(delta: number): void {
    this.settleTimer += delta;
    const t = Math.min(1, this.settleTimer / SETTLE_TIME);
    this.canopy.position.set(0, -CANOPY_HEIGHT * 0.9 * t, -4 * t);
    this.canopy.rotation.x = -1.3 * t;
    this.root.rotation.z = approach(this.root.rotation.z, 0, 6, delta);
    if (t === 1) this.state = 'landed';
  }

  private updateShadow(): void {
    const altitude = this.getAltitude();
    this.shadow.visible = altitude < SHADOW_MAX_HEIGHT && this.state !== 'crashed';
    const closeness = 1 - Math.max(0, altitude) / SHADOW_MAX_HEIGHT;
    this.shadow.position.set(this.root.position.x, this.groundLevel() + 0.4, this.root.position.z);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.45 * closeness;
    this.shadow.scale.setScalar(this.state === 'freefall' ? 1.3 : 1 + (1 - closeness) * 0.5);
  }

  public update(delta: number, input: InputState): void {
    this.updateJumpPlane(delta);
    if (this.state === 'crashed' || this.state === 'landed') return;
    if (this.state === 'touchdown') {
      this.settle(delta);
      return;
    }

    if (input.deploy && this.state === 'freefall') this.deploy();
    this.steer(delta, input);
    this.root.position.addScaledVector(this.velocity, delta).addScaledVector(this.wind, delta);
    if (this.root.position.y - FOOT_OFFSET <= this.groundLevel()) this.touchGround();
    this.updateShadow();
  }

  public placeCamera(camera: THREE.PerspectiveCamera): void {
    const blend = this.state === 'freefall' ? 0 : 1 - (1 - this.openness) ** 2;
    const mix = (key: keyof typeof FREEFALL_CAMERA) => FREEFALL_CAMERA[key] + (CANOPY_CAMERA[key] - FREEFALL_CAMERA[key]) * blend;
    const forward = this.forward();
    const position = this.root.position;
    camera.position.copy(position).addScaledVector(forward, -mix('back')).add(new THREE.Vector3(0, mix('up'), 0));
    camera.lookAt(position.clone().addScaledVector(forward, mix('ahead')).add(new THREE.Vector3(0, -mix('down'), 0)));
  }

  public getPosition(): THREE.Vector3 {
    return this.root.position.clone();
  }

  public getAltitude(): number {
    return this.root.position.y - FOOT_OFFSET - this.groundLevel();
  }

  public getFallSpeed(): number {
    return Math.max(0, -this.velocity.y);
  }

  public getTargetDistance(): number {
    if (this.state === 'touchdown' || this.state === 'landed') return this.landingDistance;
    const { target } = this.stage;
    return Math.hypot(this.root.position.x - target.x, this.root.position.z - target.z);
  }

  public isOnBullseye(): boolean {
    return this.state === 'landed' && this.landingDistance <= this.stage.target.radius / 4;
  }

  public isFreefalling(): boolean {
    return this.state === 'freefall';
  }

  public isDeployed(): boolean {
    return this.deployed;
  }

  public isCrashed(): boolean {
    return this.state === 'crashed';
  }

  public getCrashCause(): CrashCause | null {
    return this.crash;
  }

  public isLanded(): boolean {
    return this.state === 'landed';
  }

  public getWindNoise(): number {
    if (this.state === 'freefall') return Math.min(1, this.getFallSpeed() / DIVE_SPEED);
    if (this.state === 'canopy') return 0.15;
    return 0;
  }

  private disposeTree(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }

  public destroy(scene: THREE.Scene): void {
    this.removeJumpPlane();
    scene.remove(this.root, this.shadow);
    this.disposeTree(this.root);
    this.disposeTree(this.shadow);
  }
}

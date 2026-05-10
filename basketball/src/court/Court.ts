import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GameConfig } from '../types';
import { CourtLines } from './CourtLines';
import { PhysicsWorld } from '../physics/PhysicsWorld';

export class Court {
  public group: THREE.Group;
  private config: GameConfig;
  private floor!: THREE.Mesh;
  private floorBody!: CANNON.Body;
  private courtLines!: CourtLines;

  constructor(config: GameConfig, physicsWorld: PhysicsWorld) {
    this.config = config;
    this.group = new THREE.Group();

    this.createFloor(physicsWorld);
    this.createWalls();
    this.courtLines = new CourtLines(config);
    this.group.add(this.courtLines.group);
  }

  private createFloor(physicsWorld: PhysicsWorld): void {
    // 床のメッシュ
    const geometry = new THREE.BoxGeometry(
      this.config.courtLength,
      0.1,
      this.config.courtWidth
    );
    const material = new THREE.MeshStandardMaterial({
      color: 0xd4a574, // 木製コートの色
      roughness: 0.8,
      metalness: 0.2,
    });
    this.floor = new THREE.Mesh(geometry, material);
    this.floor.receiveShadow = true;
    this.group.add(this.floor);

    // 床の物理ボディ
    const shape = new CANNON.Box(
      new CANNON.Vec3(this.config.courtLength / 2, 0.05, this.config.courtWidth / 2)
    );
    this.floorBody = new CANNON.Body({
      mass: 0, // 静止オブジェクト
      shape: shape,
      position: new CANNON.Vec3(0, -0.05, 0),
    });
    physicsWorld.addBody(this.floorBody);
  }

  private createWalls(): void {
    const wallHeight = 5;
    const wallThickness = 0.2;
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x808080,
      transparent: true,
      opacity: 0.3,
    });

    // 長辺の壁（2つ）
    const longWallGeometry = new THREE.BoxGeometry(
      this.config.courtLength,
      wallHeight,
      wallThickness
    );

    const wall1 = new THREE.Mesh(longWallGeometry, wallMaterial);
    wall1.position.set(0, wallHeight / 2, this.config.courtWidth / 2);
    this.group.add(wall1);

    const wall2 = new THREE.Mesh(longWallGeometry, wallMaterial);
    wall2.position.set(0, wallHeight / 2, -this.config.courtWidth / 2);
    this.group.add(wall2);

    // 短辺の壁（2つ）
    const shortWallGeometry = new THREE.BoxGeometry(
      wallThickness,
      wallHeight,
      this.config.courtWidth
    );

    const wall3 = new THREE.Mesh(shortWallGeometry, wallMaterial);
    wall3.position.set(this.config.courtLength / 2, wallHeight / 2, 0);
    this.group.add(wall3);

    const wall4 = new THREE.Mesh(shortWallGeometry, wallMaterial);
    wall4.position.set(-this.config.courtLength / 2, wallHeight / 2, 0);
    this.group.add(wall4);
  }

  public dispose(): void {
    this.group.clear();
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
  }
}

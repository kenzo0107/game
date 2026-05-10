import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Stadium {
  constructor(scene: THREE.Scene, world: CANNON.World) {
    this.createStadium(scene, world);
  }

  private createStadium(scene: THREE.Scene, world: CANNON.World): void {
    // スタジアムの床（すり鉢状）
    const floorGeometry = new THREE.CylinderGeometry(8, 6, 1, 32);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x6c9bd1, // 明るい青色に変更
      metalness: 0.3,
      roughness: 0.4,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    scene.add(floor);

    // 物理ボディ（床）
    const floorShape = new CANNON.Cylinder(8, 6, 1, 16);
    const floorBody = new CANNON.Body({
      mass: 0, // 静的
      shape: floorShape,
      material: new CANNON.Material({
        friction: 0.4,
        restitution: 0.3,
      }),
    });
    floorBody.position.y = -0.5;
    world.addBody(floorBody);

    // 外壁（円形）
    const wallHeight = 3;
    const wallGeometry = new THREE.CylinderGeometry(8, 8, wallHeight, 32, 1, true);
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x8ab4d6, // 明るい水色に変更
      metalness: 0.4,
      roughness: 0.4,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8, // 少し透明にして見やすく
    });
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.y = wallHeight / 2;
    wall.receiveShadow = true;
    scene.add(wall);

    // 物理ボディ（外壁）
    const wallShape = new CANNON.Cylinder(8, 8, wallHeight, 16);
    const wallBody = new CANNON.Body({
      mass: 0,
      shape: wallShape,
      material: new CANNON.Material({
        friction: 0.3,
        restitution: 0.8,
      }),
    });
    wallBody.position.y = wallHeight / 2;
    world.addBody(wallBody);

    // デコレーション（スタジアムのライン）
    const lineGeometry = new THREE.TorusGeometry(7, 0.05, 8, 32);
    const lineMaterial = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0xffff00,
      emissiveIntensity: 0.5,
    });
    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    line.rotation.x = Math.PI / 2;
    line.position.y = 0.01;
    scene.add(line);

    // グリッド追加（視覚的な参考）
    const gridHelper = new THREE.GridHelper(20, 20, 0xaaaaaa, 0x888888);
    gridHelper.position.y = -1;
    scene.add(gridHelper);
  }
}

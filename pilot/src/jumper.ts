import * as THREE from 'three';

const BODY_SCALE = 1.6;
export const FOOT_OFFSET = 0.9 * BODY_SCALE;

export const approach = (current: number, target: number, rate: number, delta: number): number =>
  target + (current - target) * Math.exp(-rate * delta);

export interface Jumper {
  body: THREE.Group;
  arms: THREE.Mesh[];
}

export const buildJumper = (): Jumper => {
  const body = new THREE.Group();
  const arms: THREE.Mesh[] = [];
  const suit = new THREE.MeshLambertMaterial({ color: 0x2266ee });
  const skin = new THREE.MeshLambertMaterial({ color: 0xf2c9a0 });
  const helmet = new THREE.MeshLambertMaterial({ color: 0xffdd22 });
  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    body.add(mesh);
  };

  part(new THREE.BoxGeometry(0.5, 0.65, 0.28), suit, 0, 0.3, 0);
  part(new THREE.SphereGeometry(0.17, 12, 10), skin, 0, 0.82, 0.02);
  part(new THREE.SphereGeometry(0.19, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), helmet, 0, 0.84, 0);
  for (const side of [-1, 1]) {
    part(new THREE.BoxGeometry(0.18, 0.9, 0.2), suit, side * 0.13, -0.45, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), suit);
    arm.geometry.translate(0, -0.3, 0);
    arm.position.set(side * 0.32, 0.58, 0);
    body.add(arm);
    arms.push(arm);
  }
  body.scale.setScalar(BODY_SCALE);
  return { body, arms };
};

export const disposeTree = (object: THREE.Object3D): void => {
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      materials.add(child.material as THREE.Material);
    }
  });
  materials.forEach((material) => material.dispose());
};

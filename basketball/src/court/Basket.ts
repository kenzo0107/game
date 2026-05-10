import * as THREE from 'three';
import { GameConfig, TeamType } from '../types';

export class Basket {
  public group: THREE.Group;
  public position: THREE.Vector3;
  public ringRadius: number = 0.225; // 規格サイズ
  public team: TeamType;
  private config: GameConfig;

  constructor(position: THREE.Vector3, team: TeamType, config: GameConfig) {
    this.position = position;
    this.team = team;
    this.config = config;
    this.group = new THREE.Group();
    this.group.position.copy(position);

    this.createBasket();
  }

  private createBasket(): void {
    // バックボード
    const backboardGeometry = new THREE.BoxGeometry(1.8, 1.05, 0.05);
    const backboardMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
    });
    const backboard = new THREE.Mesh(backboardGeometry, backboardMaterial);
    backboard.position.set(0, this.config.basketHeight - 0.5, 0);
    this.group.add(backboard);

    // リング
    const ringGeometry = new THREE.TorusGeometry(this.ringRadius, 0.02, 16, 32);
    const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xff6600 });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(0, this.config.basketHeight, 0.15);
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);

    // ネット（簡易版）
    const netGeometry = new THREE.CylinderGeometry(
      this.ringRadius,
      this.ringRadius * 0.8,
      0.4,
      16,
      1,
      true
    );
    const netMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      wireframe: true,
    });
    const net = new THREE.Mesh(netGeometry, netMaterial);
    net.position.set(0, this.config.basketHeight - 0.2, 0.15);
    this.group.add(net);

    // ポール
    const poleGeometry = new THREE.CylinderGeometry(0.05, 0.05, this.config.basketHeight, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(0, this.config.basketHeight / 2, -0.5);
    this.group.add(pole);
  }

  public getRingPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.position.x,
      this.position.y + this.config.basketHeight,
      this.position.z + 0.15
    );
  }

  public dispose(): void {
    this.group.children.forEach((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
    this.group.clear();
  }
}

import * as THREE from 'three';
import { GameConfig } from '../types';

export class CourtLines {
  public group: THREE.Group;
  private config: GameConfig;

  constructor(config: GameConfig) {
    this.config = config;
    this.group = new THREE.Group();
    this.group.position.y = 0.06; // 床の上に少し浮かせる

    this.createLines();
  }

  private createLines(): void {
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

    // センターライン
    this.createLine(
      [
        new THREE.Vector3(0, 0, -this.config.courtWidth / 2),
        new THREE.Vector3(0, 0, this.config.courtWidth / 2),
      ],
      lineMaterial
    );

    // 3ポイントライン（両サイド）
    this.createThreePointLine(this.config.courtLength / 2 - 1.5, lineMaterial);
    this.createThreePointLine(-this.config.courtLength / 2 + 1.5, lineMaterial);

    // フリースローライン（両サイド）
    this.createFreeThrowLine(this.config.courtLength / 2 - this.config.freeThrowDistance, lineMaterial);
    this.createFreeThrowLine(-this.config.courtLength / 2 + this.config.freeThrowDistance, lineMaterial);

    // ペイントエリア（両サイド）
    this.createPaintArea(this.config.courtLength / 2 - this.config.freeThrowDistance, lineMaterial);
    this.createPaintArea(-this.config.courtLength / 2 + this.config.freeThrowDistance, lineMaterial);
  }

  private createLine(points: THREE.Vector3[], material: THREE.LineBasicMaterial): void {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    this.group.add(line);
  }

  private createThreePointLine(x: number, material: THREE.LineBasicMaterial): void {
    const points: THREE.Vector3[] = [];
    const radius = this.config.threePointDistance;
    const segments = 32;

    // 半円を描く
    for (let i = 0; i <= segments; i++) {
      const angle = (Math.PI / segments) * i - Math.PI / 2;
      const z = Math.sin(angle) * radius;
      const offsetX = Math.cos(angle) * radius;

      // バスケットの方向に半円を描く
      points.push(new THREE.Vector3(x - offsetX, 0, z));
    }

    this.createLine(points, material);

    // 直線部分（サイドライン）
    const straightLength = 0.9; // サイドからの距離
    this.createLine(
      [
        new THREE.Vector3(x - radius, 0, -this.config.courtWidth / 2 + straightLength),
        new THREE.Vector3(x - radius, 0, -radius),
      ],
      material
    );
    this.createLine(
      [
        new THREE.Vector3(x - radius, 0, radius),
        new THREE.Vector3(x - radius, 0, this.config.courtWidth / 2 - straightLength),
      ],
      material
    );
  }

  private createFreeThrowLine(x: number, material: THREE.LineBasicMaterial): void {
    const width = 3.6; // フリースローレーンの幅
    this.createLine(
      [
        new THREE.Vector3(x, 0, -width / 2),
        new THREE.Vector3(x, 0, width / 2),
      ],
      material
    );
  }

  private createPaintArea(x: number, material: THREE.LineBasicMaterial): void {
    const width = 3.6;
    const length = this.config.freeThrowDistance;

    // ペイントエリアの矩形
    this.createLine(
      [
        new THREE.Vector3(x, 0, -width / 2),
        new THREE.Vector3(x + length, 0, -width / 2),
        new THREE.Vector3(x + length, 0, width / 2),
        new THREE.Vector3(x, 0, width / 2),
      ],
      material
    );
  }

  public dispose(): void {
    this.group.clear();
  }
}

import * as THREE from 'three';
import { FlightStage, LandingTarget, StageConfig } from './stages';

export type Surface = 'runway' | 'grass' | 'ocean';

export const GROUND_LEVEL = -50;
export const RUNWAY_SURFACE = -49.5;
export const OCEAN_SURFACE = -51;
const TARGET_COLORS = [0xffffff, 0xe03030];
const APPROACH_LENGTH = 300;
const APPROACH_SPREAD = 0.3;

export class Terrain {
  private group = new THREE.Group();
  private stage: StageConfig;

  constructor(scene: THREE.Scene, stage: StageConfig) {
    this.stage = stage;
    this.build();
    scene.add(this.group);
  }

  private build(): void {
    const { island } = this.stage;

    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshLambertMaterial({ color: 0x1e90ff }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = OCEAN_SURFACE;
    this.group.add(ocean);

    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(island.width + 16, island.depth + 16),
      new THREE.MeshLambertMaterial({ color: 0xe8d38a }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(island.x, GROUND_LEVEL - 0.3, island.z);
    this.group.add(sand);

    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(island.width, island.depth),
      new THREE.MeshLambertMaterial({ color: 0x3a9d23 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(island.x, GROUND_LEVEL, island.z);
    this.group.add(grass);

    if (this.stage.kind === 'flight') this.buildRunway(this.stage.runway);
    else this.buildTarget(this.stage.target);
    if (this.stage.kind === 'rocket') this.buildLaunchPad(this.stage.start.x, this.stage.start.z);
  }

  private buildLaunchPad(x: number, z: number): void {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshLambertMaterial({ color: 0x777777 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, GROUND_LEVEL + 0.05, z);
    this.group.add(pad);
  }

  private buildTarget(target: LandingTarget): void {
    const bands = 4;
    for (let i = 0; i < bands; i++) {
      const outer = target.radius * (1 - i / bands);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(outer, 48),
        new THREE.MeshLambertMaterial({ color: TARGET_COLORS[(bands - i) % 2] }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(target.x, GROUND_LEVEL + 0.05 * (i + 1), target.z);
      this.group.add(disc);
    }
  }

  private buildRunway(runway: FlightStage['runway']): void {
    const strip = new THREE.Group();
    strip.position.set(runway.x, RUNWAY_SURFACE, runway.z);
    strip.rotation.y = runway.heading;
    this.group.add(strip);

    const flat = (w: number, l: number, color: number, z: number, lift: number) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshLambertMaterial({ color }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, lift, z);
      strip.add(mesh);
      return mesh;
    };

    flat(runway.width, runway.length, 0x555555, 0, 0);
    const half = runway.length / 2;
    for (let z = -half + 20; z < half - 14; z += 14) {
      flat(1, 7, 0xffffff, z, 0.1);
    }
    for (const end of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * (runway.width / 5);
        const bar = flat(runway.width / 9, 10, 0xffffff, end * (half - 8), 0.1);
        bar.position.x = x;
      }
    }

    const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd55 });
    const lightGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    for (let z = -half; z <= half; z += 20) {
      for (const side of [-1, 1]) {
        const light = new THREE.Mesh(lightGeometry, lightMaterial);
        light.position.set(side * (runway.width / 2 + 1.5), 0.3, z);
        strip.add(light);
      }
    }
  }

  public surfaceAt(x: number, z: number): Surface {
    const { island } = this.stage;
    if (this.stage.kind === 'flight') {
      const { runway } = this.stage;
      const dx = x - runway.x;
      const dz = z - runway.z;
      const along = dx * Math.sin(runway.heading) + dz * Math.cos(runway.heading);
      const across = dx * Math.cos(runway.heading) - dz * Math.sin(runway.heading);
      if (Math.abs(along) <= runway.length / 2 && Math.abs(across) <= runway.width / 2) return 'runway';
    }
    if (Math.abs(x - island.x) <= island.width / 2 && Math.abs(z - island.z) <= island.depth / 2) return 'grass';
    return 'ocean';
  }

  public isOnApproach(x: number, z: number): boolean {
    if (this.stage.kind !== 'flight') return false;
    const { runway } = this.stage;
    const dx = x - runway.x;
    const dz = z - runway.z;
    const along = dx * Math.sin(runway.heading) + dz * Math.cos(runway.heading);
    const across = dx * Math.cos(runway.heading) - dz * Math.sin(runway.heading);
    const beforeThreshold = -runway.length / 2 - along;
    if (beforeThreshold > APPROACH_LENGTH || along > runway.length / 2) return false;
    return Math.abs(across) <= runway.width / 2 + 10 + Math.max(0, beforeThreshold) * APPROACH_SPREAD;
  }

  public levelAt(x: number, z: number): number {
    const surface = this.surfaceAt(x, z);
    if (surface === 'runway') return RUNWAY_SURFACE;
    if (surface === 'grass') return GROUND_LEVEL;
    return OCEAN_SURFACE;
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }
}

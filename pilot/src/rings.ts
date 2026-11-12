import * as THREE from 'three';
import { Placement } from './stages';

const RING_RADIUS = 9;

interface Ring {
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  passed: boolean;
  prevSide: number | null;
}

export class Rings {
  private rings: Ring[];
  private geometry = new THREE.TorusGeometry(RING_RADIUS, 0.7, 10, 40);
  private idleMaterial = new THREE.MeshLambertMaterial({ color: 0xffcc00, emissive: 0x664400 });
  private nextMaterial = new THREE.MeshLambertMaterial({ color: 0xff7700, emissive: 0xaa3300 });

  constructor(scene: THREE.Scene, placements: Placement[]) {
    this.rings = placements.map((p) => {
      const mesh = new THREE.Mesh(this.geometry, this.idleMaterial);
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.y = p.heading;
      scene.add(mesh);
      return {
        mesh,
        center: mesh.position.clone(),
        normal: new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading)),
        passed: false,
        prevSide: null,
      };
    });
    this.highlightNext();
  }

  private highlightNext(): void {
    const next = this.rings.find((r) => !r.passed);
    for (const ring of this.rings) {
      ring.mesh.material = ring === next ? this.nextMaterial : this.idleMaterial;
    }
  }

  public update(position: THREE.Vector3): number {
    let newlyPassed = 0;
    const offset = new THREE.Vector3();
    for (const ring of this.rings) {
      if (ring.passed) continue;
      offset.subVectors(position, ring.center);
      const side = offset.dot(ring.normal);
      const lateral = offset.addScaledVector(ring.normal, -side).length();
      if (ring.prevSide !== null && ring.prevSide < 0 && side >= 0 && lateral < RING_RADIUS) {
        ring.passed = true;
        ring.mesh.visible = false;
        newlyPassed++;
      }
      ring.prevSide = side;
    }
    if (newlyPassed > 0) this.highlightNext();
    return newlyPassed;
  }

  public get passedCount(): number {
    return this.rings.filter((r) => r.passed).length;
  }

  public get total(): number {
    return this.rings.length;
  }

  public dispose(scene: THREE.Scene): void {
    for (const ring of this.rings) scene.remove(ring.mesh);
    this.geometry.dispose();
    this.idleMaterial.dispose();
    this.nextMaterial.dispose();
  }
}

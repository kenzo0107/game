import * as THREE from 'three';

export class Explosion {
  private particles: THREE.Points;
  private velocities: THREE.Vector3[];
  private lifetimes: number[];
  private scene: THREE.Scene;
  private isActive: boolean;
  private maxLifetime: number;

  constructor(scene: THREE.Scene, position: THREE.Vector3) {
    this.scene = scene;
    this.isActive = true;
    this.maxLifetime = 2.0;
    this.velocities = [];
    this.lifetimes = [];

    const particleCount = 100;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      // 初期位置
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      // ランダムな速度ベクトル
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        Math.random() * 15,
        (Math.random() - 0.5) * 20
      );
      this.velocities.push(velocity);

      // ランダムなライフタイム
      this.lifetimes.push(Math.random() * this.maxLifetime);

      // 色（オレンジから赤）
      const color = new THREE.Color();
      const hue = Math.random() * 0.1; // 0-0.1（赤〜オレンジ）
      color.setHSL(hue, 1, 0.5);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);

    // 煙エフェクトを追加
    this.createSmoke(position);
  }

  private createSmoke(position: THREE.Vector3): void {
    const smokeCount = 20;
    for (let i = 0; i < smokeCount; i++) {
      setTimeout(() => {
        const smokeGeometry = new THREE.SphereGeometry(2, 8, 8);
        const smokeMaterial = new THREE.MeshBasicMaterial({
          color: 0x333333,
          transparent: true,
          opacity: 0.5,
        });
        const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
        smoke.position.copy(position);
        smoke.position.x += (Math.random() - 0.5) * 5;
        smoke.position.y += Math.random() * 3;
        smoke.position.z += (Math.random() - 0.5) * 5;
        this.scene.add(smoke);

        // 煙の上昇とフェードアウト
        const smokeRise = () => {
          smoke.position.y += 0.1;
          smoke.scale.multiplyScalar(1.02);
          smokeMaterial.opacity -= 0.01;

          if (smokeMaterial.opacity > 0) {
            requestAnimationFrame(smokeRise);
          } else {
            this.scene.remove(smoke);
          }
        };
        smokeRise();
      }, i * 50);
    }
  }

  public update(delta: number): boolean {
    if (!this.isActive) return false;

    const positions = this.particles.geometry.attributes.position.array as Float32Array;
    const material = this.particles.material as THREE.PointsMaterial;

    let allExpired = true;

    for (let i = 0; i < this.velocities.length; i++) {
      this.lifetimes[i] -= delta;

      if (this.lifetimes[i] > 0) {
        allExpired = false;

        // 重力の影響
        this.velocities[i].y -= 9.8 * delta;

        // 位置更新
        positions[i * 3] += this.velocities[i].x * delta;
        positions[i * 3 + 1] += this.velocities[i].y * delta;
        positions[i * 3 + 2] += this.velocities[i].z * delta;

        // 速度減衰
        this.velocities[i].multiplyScalar(0.98);
      }
    }

    // 全体の透明度を下げる
    material.opacity = Math.max(0, material.opacity - delta * 0.5);

    this.particles.geometry.attributes.position.needsUpdate = true;

    if (allExpired || material.opacity <= 0) {
      this.cleanup();
      return false;
    }

    return true;
  }

  private cleanup(): void {
    this.scene.remove(this.particles);
    this.particles.geometry.dispose();
    (this.particles.material as THREE.Material).dispose();
    this.isActive = false;
  }
}

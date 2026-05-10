import * as THREE from 'three';

export class ParticleSystem {
  private particles: THREE.Points[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // 衝突時のパーティクルエフェクト
  public createCollisionEffect(position: THREE.Vector3, color1: number, color2: number): void {
    const particleCount = 50;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      // ランダムな方向に飛び散る速度
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 2,
        (Math.random() - 0.5) * 2
      ));
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      size: 0.2,
      color: Math.random() > 0.5 ? color1 : color2,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    });

    const particleSystem = new THREE.Points(geometry, material);
    this.scene.add(particleSystem);

    this.particles.push(particleSystem);

    // パーティクルのアニメーション
    let life = 1.0;
    const animate = () => {
      if (life <= 0) {
        this.scene.remove(particleSystem);
        geometry.dispose();
        material.dispose();
        const index = this.particles.indexOf(particleSystem);
        if (index > -1) this.particles.splice(index, 1);
        return;
      }

      const positions = geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] += velocities[i].x * 0.1;
        positions[i * 3 + 1] += velocities[i].y * 0.1;
        positions[i * 3 + 2] += velocities[i].z * 0.1;

        // 重力効果
        velocities[i].y -= 0.05;
      }

      geometry.attributes.position.needsUpdate = true;
      material.opacity = life;
      life -= 0.02;

      requestAnimationFrame(animate);
    };

    animate();
  }

  // 輝きエフェクト（衝突地点）
  public createSparkEffect(position: THREE.Vector3): void {
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 1,
    });

    const spark = new THREE.Mesh(geometry, material);
    spark.position.copy(position);
    this.scene.add(spark);

    let scale = 0.1;
    let opacity = 1;

    const animate = () => {
      if (opacity <= 0) {
        this.scene.remove(spark);
        geometry.dispose();
        material.dispose();
        return;
      }

      scale += 0.3;
      opacity -= 0.05;

      spark.scale.set(scale, scale, scale);
      material.opacity = opacity;

      requestAnimationFrame(animate);
    };

    animate();
  }

  // 光の波紋エフェクト
  public createShockwaveEffect(position: THREE.Vector3, color: number): void {
    const geometry = new THREE.RingGeometry(0.1, 0.3, 32);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });

    const shockwave = new THREE.Mesh(geometry, material);
    shockwave.position.copy(position);
    shockwave.rotation.x = Math.PI / 2;
    this.scene.add(shockwave);

    let scale = 1;
    let opacity = 0.8;

    const animate = () => {
      if (opacity <= 0) {
        this.scene.remove(shockwave);
        geometry.dispose();
        material.dispose();
        return;
      }

      scale += 0.5;
      opacity -= 0.05;

      shockwave.scale.set(scale, scale, 1);
      material.opacity = opacity;

      requestAnimationFrame(animate);
    };

    animate();
  }

  public cleanup(): void {
    this.particles.forEach(particle => {
      this.scene.remove(particle);
      particle.geometry.dispose();
      (particle.material as THREE.Material).dispose();
    });
    this.particles = [];
  }
}

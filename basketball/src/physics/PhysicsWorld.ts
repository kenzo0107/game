import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  public world: CANNON.World;
  private readonly fixedTimeStep: number = 1 / 60; // 60 FPS
  private readonly maxSubSteps: number = 3;

  constructor(gravity: number = 9.8) {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -gravity, 0),
    });

    // 衝突検出の最適化
    this.world.broadphase = new CANNON.NaiveBroadphase();

    // デフォルトのマテリアル設定
    this.setupDefaultMaterial();
  }

  private setupDefaultMaterial(): void {
    const defaultMaterial = new CANNON.Material('default');
    const defaultContactMaterial = new CANNON.ContactMaterial(
      defaultMaterial,
      defaultMaterial,
      {
        friction: 0.3,
        restitution: 0.3,
      }
    );
    this.world.addContactMaterial(defaultContactMaterial);
    this.world.defaultContactMaterial = defaultContactMaterial;
  }

  public step(deltaTime: number): void {
    this.world.step(this.fixedTimeStep, deltaTime, this.maxSubSteps);
  }

  public addBody(body: CANNON.Body): void {
    this.world.addBody(body);
  }

  public removeBody(body: CANNON.Body): void {
    this.world.removeBody(body);
  }

  public dispose(): void {
    // すべてのボディを削除
    while (this.world.bodies.length > 0) {
      this.world.removeBody(this.world.bodies[0]);
    }
  }
}

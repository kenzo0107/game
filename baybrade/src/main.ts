import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BeybladeType } from './types';
import { Beyblade } from './Beyblade';
import { Stadium } from './Stadium';
import { ParticleSystem } from './ParticleSystem';
import { CameraController } from './CameraController';
import { TimeController } from './TimeController';

class BeybladeGame {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private world: CANNON.World;
  private controls: OrbitControls;

  private beyblade1: Beyblade | null = null;
  private beyblade2: Beyblade | null = null;

  private particleSystem: ParticleSystem;
  private cameraController: CameraController;
  private timeController: TimeController;

  private selectedType: BeybladeType = 'attack';
  private isRunning = false;
  private lastCollisionTime = 0;

  constructor() {
    // Three.js シーン設定
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // 明るい空色に変更

    // カメラ設定
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 15, 15);
    this.camera.lookAt(0, 0, 0);

    // レンダラー設定
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const container = document.getElementById('canvas-container')!;
    container.appendChild(this.renderer.domElement);

    // カメラコントロール
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // 物理エンジン設定
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -20, 0), // 重力を強化してスタジアムに張り付きやすく
    });
    this.world.broadphase = new CANNON.NaiveBroadphase();

    // 新機能の初期化
    this.particleSystem = new ParticleSystem(this.scene);
    this.cameraController = new CameraController(this.camera, this.controls);
    this.timeController = new TimeController();

    // ライティング
    this.setupLights();

    // イベントリスナー
    this.setupEventListeners();

    // スタジアム作成
    new Stadium(this.scene, this.world);

    // アニメーションループ開始
    this.animate();
  }

  private setupLights(): void {
    // 環境光（明るさを大幅に増加）
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    // メインの指向性ライト（太陽光のような明るいライト）
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    this.scene.add(directionalLight);

    // サブの指向性ライト（影を柔らかく）
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight2.position.set(-10, 15, -10);
    this.scene.add(directionalLight2);

    // 上からのポイントライト（スタジアム照明）
    const pointLight1 = new THREE.PointLight(0xffffff, 2, 100);
    pointLight1.position.set(0, 15, 0);
    this.scene.add(pointLight1);

    // 複数のスポットライト（演出用）
    const spotLight1 = new THREE.SpotLight(0xffd700, 1.5);
    spotLight1.position.set(8, 12, 8);
    spotLight1.angle = Math.PI / 6;
    spotLight1.penumbra = 0.3;
    spotLight1.castShadow = true;
    this.scene.add(spotLight1);

    const spotLight2 = new THREE.SpotLight(0xffd700, 1.5);
    spotLight2.position.set(-8, 12, -8);
    spotLight2.angle = Math.PI / 6;
    spotLight2.penumbra = 0.3;
    this.scene.add(spotLight2);
  }

  private setupEventListeners(): void {
    // ベイブレード選択
    const options = document.querySelectorAll('.beyblade-option');
    options.forEach(option => {
      option.addEventListener('click', () => {
        options.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        this.selectedType = option.getAttribute('data-type') as BeybladeType;
      });
    });

    // バトル開始ボタン
    document.getElementById('start-button')?.addEventListener('click', () => {
      this.startBattle();
    });

    // リセットボタン
    document.getElementById('reset-button')?.addEventListener('click', () => {
      this.reset();
    });

    // カメラアングル切り替え
    document.getElementById('camera-free')?.addEventListener('click', () => {
      this.cameraController.setMode('free');
    });
    document.getElementById('camera-follow')?.addEventListener('click', () => {
      this.cameraController.setMode('follow');
    });
    document.getElementById('camera-top')?.addEventListener('click', () => {
      this.cameraController.setMode('top');
    });
    document.getElementById('camera-side')?.addEventListener('click', () => {
      this.cameraController.setMode('side');
    });
    document.getElementById('camera-close')?.addEventListener('click', () => {
      this.cameraController.setMode('close');
    });

    // ウィンドウリサイズ
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private startBattle(): void {
    if (this.isRunning) return;

    this.reset();

    // Player 1 (選択されたタイプ) - Y座標を低く設定
    this.beyblade1 = new Beyblade(
      this.scene,
      this.world,
      this.selectedType,
      new THREE.Vector3(-2, 0.5, -1.5),
      0xff0000
    );

    // Player 2 (ランダム) - Y座標を低く設定
    const types: BeybladeType[] = ['attack', 'defense', 'stamina', 'balance'];
    const randomType = types[Math.floor(Math.random() * types.length)];
    this.beyblade2 = new Beyblade(
      this.scene,
      this.world,
      randomType,
      new THREE.Vector3(2, 0.5, 1.5),
      0x0000ff
    );

    // 中央に向かう初期速度を与える（Y成分を0に）
    const impulse1 = new THREE.Vector3(4, 0, 3);
    const impulse2 = new THREE.Vector3(-4, 0, -3);

    this.beyblade1.applyImpulse(impulse1);
    this.beyblade2.applyImpulse(impulse2);

    this.isRunning = true;
  }

  private reset(): void {
    if (this.beyblade1) {
      this.beyblade1.destroy();
      this.beyblade1 = null;
    }
    if (this.beyblade2) {
      this.beyblade2.destroy();
      this.beyblade2 = null;
    }
    this.particleSystem.cleanup();
    this.timeController.reset();
    this.isRunning = false;
    this.lastCollisionTime = 0;

    // スローモーション表示を非表示
    const slowMoIndicator = document.getElementById('slow-motion-indicator');
    if (slowMoIndicator) {
      slowMoIndicator.classList.remove('active');
    }
  }

  private updateUI(): void {
    const p1HP = this.beyblade1?.getHP() ?? 100;
    const p2HP = this.beyblade2?.getHP() ?? 100;
    const rpm = this.beyblade1?.getRPM() ?? 0;

    document.getElementById('p1-hp')!.textContent = p1HP.toFixed(0);
    document.getElementById('p2-hp')!.textContent = p2HP.toFixed(0);
    document.getElementById('rpm')!.textContent = rpm.toFixed(0);

    // ゲームオーバー判定
    if (p1HP <= 0 || p2HP <= 0) {
      const winner = p1HP > p2HP ? 'Player 1' : 'Player 2';
      alert(`${winner} の勝利！`);
      this.reset();
    }
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    if (this.isRunning) {
      // タイムコントローラー更新
      this.timeController.update();
      const timeScale = this.timeController.getTimeScale();

      // スローモーション表示
      const slowMoIndicator = document.getElementById('slow-motion-indicator');
      if (slowMoIndicator) {
        if (timeScale < 0.9) {
          slowMoIndicator.classList.add('active');
        } else {
          slowMoIndicator.classList.remove('active');
        }
      }

      // 物理演算更新（タイムスケール適用）
      this.world.step(this.timeController.getPhysicsStep());

      // ベイブレード更新
      this.beyblade1?.update();
      this.beyblade2?.update();

      // 衝突検出
      if (this.beyblade1 && this.beyblade2) {
        this.checkCollision(this.beyblade1, this.beyblade2);
      }

      // カメラコントローラー更新
      const pos1 = this.beyblade1?.getPosition();
      const pos2 = this.beyblade2?.getPosition();
      this.cameraController.update(pos1, pos2);

      // UI更新
      this.updateUI();
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private checkCollision(b1: Beyblade, b2: Beyblade): void {
    const pos1 = b1.getPosition();
    const pos2 = b2.getPosition();
    const distance = pos1.distanceTo(pos2);

    if (distance < 1.5) {
      const currentTime = Date.now();
      const timeSinceLastCollision = currentTime - this.lastCollisionTime;

      // 連続衝突を防ぐ（100ms以内は無視）
      if (timeSinceLastCollision < 100) {
        return;
      }

      this.lastCollisionTime = currentTime;

      const rpm1 = b1.getRPM();
      const rpm2 = b2.getRPM();

      // 衝突ダメージ計算
      const damage1 = (rpm2 / 1000) * b2.getStats().attack * 0.5;
      const damage2 = (rpm1 / 1000) * b1.getStats().attack * 0.5;

      b1.takeDamage(damage1);
      b2.takeDamage(damage2);

      // 衝突による反発（水平方向のみ、Y成分を0に）
      const direction = new THREE.Vector3().subVectors(pos1, pos2);
      direction.y = 0; // Y成分を無視して水平方向のみ
      direction.normalize();

      b1.applyImpulse(direction.multiplyScalar(3));
      b2.applyImpulse(direction.multiplyScalar(-3));

      // 衝突エフェクト
      const collisionPoint = new THREE.Vector3().addVectors(pos1, pos2).multiplyScalar(0.5);
      this.particleSystem.createCollisionEffect(collisionPoint, 0xff0000, 0x0000ff);
      this.particleSystem.createSparkEffect(collisionPoint);
      this.particleSystem.createShockwaveEffect(collisionPoint, 0xffff00);

      // カメラシェイク
      const shakeIntensity = Math.max(damage1, damage2);
      this.cameraController.shake(shakeIntensity);

      // 大きな衝突の場合はスローモーション発動
      if (shakeIntensity > 2.0) {
        this.timeController.triggerSlowMotion(30, 0.3);
      }
    }
  }
}

// ゲーム開始
new BeybladeGame();

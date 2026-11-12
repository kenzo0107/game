import * as THREE from 'three';
import { Aircraft } from './aircraft';
import { InputController } from './input';
import { Explosion } from './explosion';

class Game {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private aircraft: Aircraft;
  private input: InputController;
  private timer: THREE.Timer;
  private explosion: Explosion | null;
  private gameOver: boolean;
  private landingSuccess: boolean;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.explosion = null;
    this.gameOver = false;
    this.landingSuccess = false;

    this.init();

    this.input = new InputController();
    this.aircraft = new Aircraft(this.scene);

    this.setupEnvironment();
    this.setupRestartHandler();
    this.animate();
  }

  private init(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x87ceeb);
    document.getElementById('app')?.appendChild(this.renderer.domElement);

    // カメラの初期位置
    this.camera.position.set(0, 5, -20);

    // ライティング
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    this.scene.add(directionalLight);

    // リサイズ対応
    window.addEventListener('resize', () => this.onWindowResize());
  }

  private setupEnvironment(): void {
    // 海
    const oceanGeometry = new THREE.PlaneGeometry(2000, 2000, 50, 50);
    const oceanMaterial = new THREE.MeshLambertMaterial({
      color: 0x1e90ff,
      wireframe: false
    });
    const ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -51;
    this.scene.add(ocean);

    // 島/陸地（奥側に配置）
    const islandGeometry = new THREE.PlaneGeometry(300, 400);
    const islandMaterial = new THREE.MeshLambertMaterial({
      color: 0x3a9d23,
    });
    const island = new THREE.Mesh(islandGeometry, islandMaterial);
    island.rotation.x = -Math.PI / 2;
    island.position.set(0, -50, 300); // Z=300の位置に配置（奥側）
    this.scene.add(island);

    // 滑走路
    const runwayGeometry = new THREE.PlaneGeometry(30, 200);
    const runwayMaterial = new THREE.MeshLambertMaterial({
      color: 0x555555,
    });
    const runway = new THREE.Mesh(runwayGeometry, runwayMaterial);
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(0, -49.5, 300); // 陸地より少し上
    this.scene.add(runway);

    // 滑走路のライン
    const lineGeometry = new THREE.PlaneGeometry(2, 180);
    const lineMaterial = new THREE.MeshLambertMaterial({
      color: 0xffffff,
    });
    const centerLine = new THREE.Mesh(lineGeometry, lineMaterial);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(0, -49.4, 300);
    this.scene.add(centerLine);

    // 滑走路の両端にマーカー
    for (let i = 0; i < 5; i++) {
      const markerGeometry = new THREE.PlaneGeometry(8, 3);
      const marker = new THREE.Mesh(markerGeometry, lineMaterial);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(0, -49.4, 220 + i * 15);
      this.scene.add(marker);
    }

    // 空
    this.scene.fog = new THREE.Fog(0x87ceeb, 100, 1500);
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private updateCamera(): void {
    const aircraftPosition = this.aircraft.getPosition();
    const aircraftRotation = this.aircraft.getRotation();

    // 飛行機の後方からカメラを配置
    const offset = new THREE.Vector3(0, 3, -15);
    offset.applyEuler(aircraftRotation);

    this.camera.position.copy(aircraftPosition).add(offset);
    this.camera.lookAt(aircraftPosition);
  }

  private setupRestartHandler(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' && (this.gameOver || this.landingSuccess)) {
        this.restart();
      }
    });
  }

  private restart(): void {
    // 既存の飛行機を削除
    this.aircraft.destroy(this.scene);

    // 新しい飛行機を作成
    this.aircraft = new Aircraft(this.scene);

    // 爆発エフェクトをクリア
    this.explosion = null;
    this.gameOver = false;
    this.landingSuccess = false;

    // メッセージ表示を非表示
    const gameOverDiv = document.getElementById('game-over');
    if (gameOverDiv) {
      gameOverDiv.style.display = 'none';
    }
    const landingDiv = document.getElementById('landing-success');
    if (landingDiv) {
      landingDiv.style.display = 'none';
    }
  }

  private showGameOver(): void {
    let gameOverDiv = document.getElementById('game-over');
    if (!gameOverDiv) {
      gameOverDiv = document.createElement('div');
      gameOverDiv.id = 'game-over';
      gameOverDiv.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        background: rgba(0, 0, 0, 0.8);
        padding: 30px;
        border-radius: 10px;
        text-align: center;
        font-size: 24px;
        cursor: pointer;
      `;
      gameOverDiv.addEventListener('click', () => this.restart());

      const title = document.createElement('div');
      title.style.cssText = 'font-size: 48px; margin-bottom: 20px;';
      title.textContent = '墜落！';

      const instruction = document.createElement('div');
      instruction.style.cssText = 'font-size: 18px;';
      instruction.textContent = 'Rキー または タップでリスタート';

      gameOverDiv.appendChild(title);
      gameOverDiv.appendChild(instruction);
      document.body.appendChild(gameOverDiv);
    }
    gameOverDiv.style.display = 'block';
  }

  private showLandingSuccess(): void {
    let landingDiv = document.getElementById('landing-success');
    if (!landingDiv) {
      landingDiv = document.createElement('div');
      landingDiv.id = 'landing-success';
      landingDiv.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        background: rgba(0, 128, 0, 0.8);
        padding: 30px;
        border-radius: 10px;
        text-align: center;
        font-size: 24px;
        cursor: pointer;
      `;
      landingDiv.addEventListener('click', () => this.restart());

      const title = document.createElement('div');
      title.style.cssText = 'font-size: 48px; margin-bottom: 20px;';
      title.textContent = '着陸成功！';

      const instruction = document.createElement('div');
      instruction.style.cssText = 'font-size: 18px;';
      instruction.textContent = 'Rキー または タップでリスタート';

      landingDiv.appendChild(title);
      landingDiv.appendChild(instruction);
      document.body.appendChild(landingDiv);
    }
    landingDiv.style.display = 'block';
  }

  private updateHUD(): void {
    const speed = this.aircraft.getSpeed();
    const throttle = this.aircraft.getThrottle();
    const pitchAngle = this.aircraft.getPitchAngle();
    const rollAngle = this.aircraft.getRollAngle();
    const altitude = this.aircraft.getAltitude(); // 機体の底面から地面までの高度
    const fuel = this.aircraft.getFuel();

    const speedElement = document.getElementById('speed');
    const throttleElement = document.getElementById('throttle');
    const pitchElement = document.getElementById('pitch');
    const rollElement = document.getElementById('roll');
    const altitudeElement = document.getElementById('altitude');
    const fuelElement = document.getElementById('fuel');

    if (speedElement) speedElement.textContent = speed.toFixed(1);
    if (throttleElement) throttleElement.textContent = (throttle * 100).toFixed(0);
    if (pitchElement) pitchElement.textContent = ((pitchAngle * 180) / Math.PI).toFixed(1);
    if (rollElement) rollElement.textContent = ((rollAngle * 180) / Math.PI).toFixed(1);
    if (altitudeElement) altitudeElement.textContent = altitude.toFixed(1);

    if (fuelElement) {
      fuelElement.textContent = fuel.toFixed(1);
      // 燃料残量に応じて色を変更
      if (fuel <= 0) {
        fuelElement.style.color = '#ff0000'; // 赤色（燃料切れ）
      } else if (fuel < 20) {
        fuelElement.style.color = '#ff6600'; // オレンジ色（警告）
      } else {
        fuelElement.style.color = '#ffff00'; // 黄色（通常）
      }
    }
  }

  private animate = (timestamp?: number): void => {
    requestAnimationFrame(this.animate);

    this.timer.update(timestamp);
    const delta = this.timer.getDelta();

    // 墜落チェック
    if (!this.gameOver && this.aircraft.isCrashed()) {
      this.gameOver = true;
      this.explosion = new Explosion(this.scene, this.aircraft.getPosition());
      this.showGameOver();
    }

    // 着陸成功チェック
    if (!this.landingSuccess && this.aircraft.isLanded()) {
      this.landingSuccess = true;
      this.showLandingSuccess();
    }

    this.aircraft.update(delta, this.input.getInputState());

    // HUD更新
    this.updateHUD();

    // 爆発エフェクトの更新
    if (this.explosion) {
      this.explosion.update(delta);
    }

    if (!this.gameOver && !this.landingSuccess) {
      this.updateCamera();
    } else if (this.landingSuccess) {
      // 着陸後もカメラを更新（機体の移動に追従）
      this.updateCamera();
    }

    this.renderer.render(this.scene, this.camera);
  };
}

new Game();

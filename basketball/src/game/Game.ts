import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Court } from '../court/Court';
import { Basket } from '../court/Basket';
import { Team } from '../entities/Team';
import { Ball } from '../entities/Ball';
import { GameState } from './GameState';
import { ScoreManager } from './ScoreManager';
import { InputController } from '../controls/InputController';
import { PlayerController } from '../controls/PlayerController';
import { ShootSystem } from '../shooting/ShootSystem';
import { CameraController } from '../camera/CameraController';
import { TeamAI } from '../ai/TeamAI';
import { HUD } from '../ui/HUD';
import { GameConfig, PhysicsConfig, ShootType } from '../types';

export class Game {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  // Game configuration
  private gameConfig: GameConfig = {
    courtWidth: 15,
    courtLength: 28,
    basketHeight: 3.05,
    threePointDistance: 6.75,
    freeThrowDistance: 5.8,
    gameDuration: 300, // 5分
    playersPerTeam: 4,
  };

  private physicsConfig: PhysicsConfig = {
    gravity: 9.8,
    ballRadius: 0.12,
    ballMass: 0.6,
    ballRestitution: 0.75,
    playerMoveSpeed: 5,
    playerDashSpeed: 8,
    playerJumpForce: 5,
  };

  // Game objects
  private physicsWorld!: PhysicsWorld;
  private court!: Court;
  private basketA!: Basket;
  private basketB!: Basket;
  private teamA!: Team;
  private teamB!: Team;
  private ball!: Ball;

  // Game systems
  private gameState!: GameState;
  private scoreManager!: ScoreManager;
  private inputController!: InputController;
  private playerController!: PlayerController;
  private shootSystem!: ShootSystem;
  private cameraController!: CameraController;
  private teamAI_A!: TeamAI;
  private teamAI_B!: TeamAI;

  // Game state
  private lastShootType: ShootType | null = null;
  private lastShooterTeam: 'A' | 'B' | null = null;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // 空色

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 15, 20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const container = document.getElementById('game-container');
    container?.appendChild(this.renderer.domElement);

    this.setupLights();
    this.initialize();
    this.setupEventListeners();
  }

  private setupLights(): void {
    // 環境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // ディレクショナルライト
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    this.scene.add(directionalLight);
  }

  private initialize(): void {
    // 物理エンジン
    this.physicsWorld = new PhysicsWorld(this.physicsConfig.gravity);

    // コート
    this.court = new Court(this.gameConfig, this.physicsWorld);
    this.scene.add(this.court.group);

    // バスケットゴール
    const basketOffsetX = this.gameConfig.courtLength / 2 - 1.5;
    this.basketA = new Basket(
      new THREE.Vector3(basketOffsetX, 0, 0),
      'A',
      this.gameConfig
    );
    this.basketB = new Basket(
      new THREE.Vector3(-basketOffsetX, 0, 0),
      'B',
      this.gameConfig
    );
    this.scene.add(this.basketA.group);
    this.scene.add(this.basketB.group);

    // チーム
    this.teamA = new Team('A', this.gameConfig, this.physicsConfig, this.physicsWorld);
    this.teamB = new Team('B', this.gameConfig, this.physicsConfig, this.physicsWorld);
    this.teamA.players.forEach((p) => this.scene.add(p.mesh));
    this.teamB.players.forEach((p) => this.scene.add(p.mesh));

    // ボール
    this.ball = new Ball(
      new THREE.Vector3(0, 2, 0),
      this.physicsConfig,
      this.physicsWorld
    );
    this.scene.add(this.ball.mesh);

    // ゲームシステム
    this.gameState = new GameState(this.gameConfig.gameDuration);
    this.scoreManager = new ScoreManager();
    this.inputController = new InputController();
    this.shootSystem = new ShootSystem(this.gameConfig);

    // プレイヤーコントローラー
    const controlledPlayer = this.teamA.getControlledPlayer();
    if (controlledPlayer) {
      this.playerController = new PlayerController(controlledPlayer, this.camera);
      this.cameraController = new CameraController(this.camera);
      this.cameraController.setTarget(controlledPlayer);
    }

    // AI
    this.teamAI_A = new TeamAI(this.teamA, this.ball, this.basketB);
    this.teamAI_B = new TeamAI(this.teamB, this.ball, this.basketA);

    // UI
    new HUD(this.gameState, this.scoreManager);

    // ゲーム開始
    this.gameState.start();
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public update(deltaTime: number): void {
    // ゲーム状態更新
    this.gameState.update(deltaTime);

    if (this.gameState.getStatus() !== 'PLAYING') {
      return;
    }

    // 物理エンジン更新
    this.physicsWorld.step(deltaTime);

    // 入力処理
    const inputState = this.inputController.getInputState();
    const controlledPlayer = this.teamA.getControlledPlayer();

    if (controlledPlayer) {
      this.playerController.update(inputState);

      // シュート処理
      if (inputState.shoot) {
        const shootType = this.shootSystem.executeShoot(
          controlledPlayer,
          this.ball,
          this.basketB
        );
        this.lastShootType = shootType;
        this.lastShooterTeam = 'A';
        this.inputController.resetShoot();
      }
    }

    // AI更新
    this.teamAI_A.update(deltaTime);
    this.teamAI_B.update(deltaTime);

    // AIのシュート判定
    const aiShootsA = this.teamAI_A.checkShoots();
    const aiShootsB = this.teamAI_B.checkShoots();

    // チームAのAIプレイヤーがシュート
    if (aiShootsA.length > 0 && controlledPlayer) {
      const aiPlayer = this.teamA.players.find((p) => !p.isControlled);
      if (aiPlayer) {
        const shootType = this.shootSystem.executeShoot(aiPlayer, this.ball, this.basketB);
        this.lastShootType = shootType;
        this.lastShooterTeam = 'A';
      }
    }

    // チームBのAIプレイヤーがシュート
    if (aiShootsB.length > 0) {
      const aiPlayer = this.teamB.players[0];
      if (aiPlayer) {
        const shootType = this.shootSystem.executeShoot(aiPlayer, this.ball, this.basketA);
        this.lastShootType = shootType;
        this.lastShooterTeam = 'B';
      }
    }

    // ゴール判定
    const goalResultA = this.shootSystem.checkGoal(this.ball, this.basketA);
    const goalResultB = this.shootSystem.checkGoal(this.ball, this.basketB);

    if (goalResultA && this.lastShootType && this.lastShooterTeam === 'B') {
      this.scoreManager.addScore('B', this.lastShootType);
      this.resetBall();
    }

    if (goalResultB && this.lastShootType && this.lastShooterTeam === 'A') {
      this.scoreManager.addScore('A', this.lastShootType);
      this.resetBall();
    }

    // エンティティ更新
    this.teamA.update(deltaTime);
    this.teamB.update(deltaTime);
    this.ball.update(deltaTime);

    // カメラ更新
    this.cameraController.update(deltaTime);
  }

  private resetBall(): void {
    // ボールをコート中央にリセット
    this.ball.reset(new THREE.Vector3(0, 2, 0));
    this.lastShootType = null;
    this.lastShooterTeam = null;
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.court.dispose();
    this.basketA.dispose();
    this.basketB.dispose();
    this.teamA.dispose();
    this.teamB.dispose();
    this.ball.dispose();
    this.physicsWorld.dispose();
    this.inputController.dispose();

    window.removeEventListener('resize', this.onWindowResize.bind(this));
  }
}

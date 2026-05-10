import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export type GameStatus = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';

export type ShootType = 'THREE_POINT' | 'DUNK' | 'NORMAL';

export type TeamType = 'A' | 'B';

export interface ShootResult {
  success: boolean;
  type: ShootType;
  points: number;
}

export interface PlayerState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  isJumping: boolean;
  hasBall: boolean;
  team: TeamType;
}

export interface GameConfig {
  courtWidth: number;
  courtLength: number;
  basketHeight: number;
  threePointDistance: number;
  freeThrowDistance: number;
  gameDuration: number; // 秒
  playersPerTeam: number;
}

export interface PhysicsConfig {
  gravity: number;
  ballRadius: number;
  ballMass: number;
  ballRestitution: number;
  playerMoveSpeed: number;
  playerDashSpeed: number;
  playerJumpForce: number;
}

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  shoot: boolean;
  dash: boolean;
}

export interface Score {
  teamA: number;
  teamB: number;
}

export interface GameObject {
  mesh: THREE.Mesh;
  body?: CANNON.Body;
  update(deltaTime: number): void;
  dispose(): void;
}

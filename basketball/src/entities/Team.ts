import * as THREE from 'three';
import { Player } from './Player';
import { TeamType, PhysicsConfig, GameConfig } from '../types';
import { PhysicsWorld } from '../physics/PhysicsWorld';

export class Team {
  public players: Player[] = [];
  public team: TeamType;
  private config: GameConfig;
  private physicsConfig: PhysicsConfig;

  constructor(
    team: TeamType,
    config: GameConfig,
    physicsConfig: PhysicsConfig,
    physicsWorld: PhysicsWorld
  ) {
    this.team = team;
    this.config = config;
    this.physicsConfig = physicsConfig;

    this.createPlayers(physicsWorld);
  }

  private createPlayers(physicsWorld: PhysicsWorld): void {
    const startX = this.team === 'A' ? -this.config.courtLength / 4 : this.config.courtLength / 4;
    const spacing = 3;

    for (let i = 0; i < this.config.playersPerTeam; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;

      const position = new THREE.Vector3(
        startX,
        1,
        (col - 0.5) * spacing + (row % 2 === 0 ? 0 : spacing / 2)
      );

      const isControlled = this.team === 'A' && i === 0; // チームAの最初のプレイヤーのみ操作可能
      const player = new Player(position, this.team, this.physicsConfig, physicsWorld, isControlled);
      this.players.push(player);
    }
  }

  public update(deltaTime: number): void {
    this.players.forEach((player) => player.update(deltaTime));
  }

  public getControlledPlayer(): Player | undefined {
    return this.players.find((p) => p.isControlled);
  }

  public dispose(): void {
    this.players.forEach((player) => player.dispose());
    this.players = [];
  }
}

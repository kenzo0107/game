import { World } from '@/world/World'
import { BlockRegistry } from '@/data/BlockRegistry'
import { CHUNK_SIZE, PLAYER_WIDTH, PLAYER_HEIGHT } from '@/utils/Constants'

export class Collision {
  static checkCollision(
    world: World,
    x: number,
    y: number,
    z: number,
    width = PLAYER_WIDTH,
    height = PLAYER_HEIGHT
  ): boolean {
    const halfWidth = width / 2

    // プレイヤーのAABBの8つの角をチェック
    const corners = [
      [x - halfWidth, y, z - halfWidth],
      [x + halfWidth, y, z - halfWidth],
      [x - halfWidth, y, z + halfWidth],
      [x + halfWidth, y, z + halfWidth],
      [x - halfWidth, y + height, z - halfWidth],
      [x + halfWidth, y + height, z - halfWidth],
      [x - halfWidth, y + height, z + halfWidth],
      [x + halfWidth, y + height, z + halfWidth]
    ]

    for (const [cx, cy, cz] of corners) {
      const blockType = this.getBlockAt(world, cx, cy, cz)
      if (BlockRegistry.isSolid(blockType)) {
        return true
      }
    }

    return false
  }

  static isOnGround(world: World, x: number, y: number, z: number): boolean {
    return this.checkCollision(world, x, y - 0.01, z)
  }

  private static getBlockAt(world: World, x: number, y: number, z: number): number {
    const blockX = Math.floor(x)
    const blockY = Math.floor(y)
    const blockZ = Math.floor(z)

    const chunkX = Math.floor(blockX / CHUNK_SIZE)
    const chunkZ = Math.floor(blockZ / CHUNK_SIZE)

    const chunk = world.getChunk(chunkX, chunkZ)
    if (!chunk) {
      return 0
    }

    const localX = ((blockX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const localZ = ((blockZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE

    return chunk.getBlockLocal(localX, blockY, localZ)
  }
}

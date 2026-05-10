import * as THREE from 'three'
import { World } from '@/world/World'
import { BlockRegistry } from '@/data/BlockRegistry'
import { CHUNK_SIZE } from '@/utils/Constants'

export interface RaycastResult {
  hit: boolean
  blockPos?: { x: number; y: number; z: number }
  placePos?: { x: number; y: number; z: number }
  normal?: { x: number; y: number; z: number }
}

export class RayCaster {
  static cast(world: World, origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 5): RaycastResult {
    const step = 0.1
    let distance = 0

    let prevX = Math.floor(origin.x)
    let prevY = Math.floor(origin.y)
    let prevZ = Math.floor(origin.z)

    while (distance < maxDistance) {
      const x = origin.x + direction.x * distance
      const y = origin.y + direction.y * distance
      const z = origin.z + direction.z * distance

      const blockX = Math.floor(x)
      const blockY = Math.floor(y)
      const blockZ = Math.floor(z)

      const blockType = this.getBlockAt(world, blockX, blockY, blockZ)

      if (BlockRegistry.isSolid(blockType)) {
        const normalX = prevX !== blockX ? (prevX > blockX ? 1 : -1) : 0
        const normalY = prevY !== blockY ? (prevY > blockY ? 1 : -1) : 0
        const normalZ = prevZ !== blockZ ? (prevZ > blockZ ? 1 : -1) : 0

        return {
          hit: true,
          blockPos: { x: blockX, y: blockY, z: blockZ },
          placePos: { x: prevX, y: prevY, z: prevZ },
          normal: { x: normalX, y: normalY, z: normalZ }
        }
      }

      prevX = blockX
      prevY = blockY
      prevZ = blockZ

      distance += step
    }

    return { hit: false }
  }

  private static getBlockAt(world: World, x: number, y: number, z: number): number {
    if (y < 0 || y >= 256) return 0

    const chunkX = Math.floor(x / CHUNK_SIZE)
    const chunkZ = Math.floor(z / CHUNK_SIZE)

    const chunk = world.getChunk(chunkX, chunkZ)
    if (!chunk) return 0

    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE

    return chunk.getBlockLocal(localX, y, localZ)
  }
}

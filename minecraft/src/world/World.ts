import * as THREE from 'three'
import { Chunk } from '@/world/Chunk'
import { ChunkMesh } from '@/world/ChunkMesh'
import { BlockType } from '@/world/Block'
import { CHUNK_SIZE } from '@/utils/Constants'

export class World {
  private chunks: Map<string, Chunk> = new Map()
  private meshes: Map<string, THREE.Mesh> = new Map()
  private scene: THREE.Scene

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.generateInitialChunk()
  }

  private generateInitialChunk(): void {
    // 原点に単一チャンクを生成
    const chunk = new Chunk(0, 0)
    const key = this.getChunkKey(0, 0)
    this.chunks.set(key, chunk)

    const mesh = ChunkMesh.generate(chunk)
    this.meshes.set(key, mesh)
    this.scene.add(mesh)
  }

  private getChunkKey(x: number, z: number): string {
    return `${x},${z}`
  }

  getChunk(x: number, z: number): Chunk | undefined {
    return this.chunks.get(this.getChunkKey(x, z))
  }

  setBlock(x: number, y: number, z: number, blockType: BlockType): void {
    const chunkX = Math.floor(x / CHUNK_SIZE)
    const chunkZ = Math.floor(z / CHUNK_SIZE)

    const chunk = this.getChunk(chunkX, chunkZ)
    if (!chunk) return

    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE

    chunk.setBlockLocal(localX, y, localZ, blockType)
    this.updateChunkMesh(chunkX, chunkZ)
  }

  private updateChunkMesh(x: number, z: number): void {
    const key = this.getChunkKey(x, z)
    const chunk = this.chunks.get(key)
    if (!chunk) return

    const oldMesh = this.meshes.get(key)
    if (oldMesh) {
      this.scene.remove(oldMesh)
      oldMesh.geometry.dispose()
      if (Array.isArray(oldMesh.material)) {
        oldMesh.material.forEach(m => m.dispose())
      } else {
        oldMesh.material.dispose()
      }
    }

    const newMesh = ChunkMesh.generate(chunk)
    this.meshes.set(key, newMesh)
    this.scene.add(newMesh)
  }
}

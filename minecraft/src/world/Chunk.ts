import { BlockType } from '@/world/Block'
import { CHUNK_SIZE, CHUNK_HEIGHT } from '@/utils/Constants'

export class Chunk {
  private blocks: Uint8Array
  public readonly x: number
  public readonly z: number

  constructor(x: number, z: number) {
    this.x = x
    this.z = z
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE)
    this.generate()
  }

  private generate(): void {
    // 初期データ: 平面の草ブロック
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        // y=0に草ブロック
        this.setBlockLocal(x, 0, z, BlockType.GRASS)

        // y=1以上は空気
        for (let y = 1; y < CHUNK_HEIGHT; y++) {
          this.setBlockLocal(x, y, z, BlockType.AIR)
        }
      }
    }
  }

  getBlockLocal(x: number, y: number, z: number): BlockType {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return BlockType.AIR
    }
    const index = x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE
    return this.blocks[index] as BlockType
  }

  setBlockLocal(x: number, y: number, z: number, type: BlockType): void {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return
    }
    const index = x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE
    this.blocks[index] = type
  }
}

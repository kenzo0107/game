import { BlockType, BlockDefinition } from '@/world/Block'

export class BlockRegistry {
  private static blocks: Map<BlockType, BlockDefinition> = new Map()

  static {
    this.register({
      type: BlockType.AIR,
      name: 'Air',
      color: 0x000000,
      isSolid: false,
      isTransparent: true
    })

    this.register({
      type: BlockType.GRASS,
      name: 'Grass',
      color: 0x3a9d23,
      isSolid: true,
      isTransparent: false
    })

    this.register({
      type: BlockType.DIRT,
      name: 'Dirt',
      color: 0x8b6914,
      isSolid: true,
      isTransparent: false
    })

    this.register({
      type: BlockType.STONE,
      name: 'Stone',
      color: 0x808080,
      isSolid: true,
      isTransparent: false
    })
  }

  static register(definition: BlockDefinition): void {
    this.blocks.set(definition.type, definition)
  }

  static get(type: BlockType): BlockDefinition | undefined {
    return this.blocks.get(type)
  }

  static isSolid(type: BlockType): boolean {
    return this.blocks.get(type)?.isSolid ?? false
  }

  static isTransparent(type: BlockType): boolean {
    return this.blocks.get(type)?.isTransparent ?? true
  }
}

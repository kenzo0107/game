export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3
}

export interface BlockDefinition {
  type: BlockType
  name: string
  color: number
  isSolid: boolean
  isTransparent: boolean
}

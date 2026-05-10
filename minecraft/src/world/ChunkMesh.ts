import * as THREE from 'three'
import { Chunk } from '@/world/Chunk'
import { BlockType } from '@/world/Block'
import { BlockRegistry } from '@/data/BlockRegistry'
import { CHUNK_SIZE, CHUNK_HEIGHT, BLOCK_SIZE } from '@/utils/Constants'

interface Face {
  dir: [number, number, number]
  vertices: number[][]
  normal: [number, number, number]
}

const FACES: Face[] = [
  // 前面 (+Z)
  {
    dir: [0, 0, 1],
    vertices: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1]
    ],
    normal: [0, 0, 1]
  },
  // 背面 (-Z)
  {
    dir: [0, 0, -1],
    vertices: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0]
    ],
    normal: [0, 0, -1]
  },
  // 上面 (+Y)
  {
    dir: [0, 1, 0],
    vertices: [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0]
    ],
    normal: [0, 1, 0]
  },
  // 下面 (-Y)
  {
    dir: [0, -1, 0],
    vertices: [
      [0, 0, 1],
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1]
    ],
    normal: [0, -1, 0]
  },
  // 右面 (+X)
  {
    dir: [1, 0, 0],
    vertices: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1]
    ],
    normal: [1, 0, 0]
  },
  // 左面 (-X)
  {
    dir: [-1, 0, 0],
    vertices: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0]
    ],
    normal: [-1, 0, 0]
  }
]

export class ChunkMesh {
  static generate(chunk: Chunk): THREE.Mesh {
    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    let vertexCount = 0

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const blockType = chunk.getBlockLocal(x, y, z)

          if (blockType === BlockType.AIR) continue

          const blockDef = BlockRegistry.get(blockType)
          if (!blockDef) continue

          const color = new THREE.Color(blockDef.color)

          // 各面をチェック
          for (const face of FACES) {
            const [dx, dy, dz] = face.dir
            const neighbor = chunk.getBlockLocal(x + dx, y + dy, z + dz)

            // 隣接ブロックが空気または透明の場合のみ面を追加
            if (neighbor === BlockType.AIR || BlockRegistry.isTransparent(neighbor)) {
              // 頂点追加
              for (const vertex of face.vertices) {
                positions.push(
                  (x + vertex[0]) * BLOCK_SIZE,
                  (y + vertex[1]) * BLOCK_SIZE,
                  (z + vertex[2]) * BLOCK_SIZE
                )
                normals.push(face.normal[0], face.normal[1], face.normal[2])
                colors.push(color.r, color.g, color.b)
              }

              // インデックス追加（2つの三角形で四角形を構成）
              indices.push(
                vertexCount,
                vertexCount + 1,
                vertexCount + 2,
                vertexCount,
                vertexCount + 2,
                vertexCount + 3
              )

              vertexCount += 4
            }
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.FrontSide
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(chunk.x * CHUNK_SIZE, 0, chunk.z * CHUNK_SIZE)

    return mesh
  }
}

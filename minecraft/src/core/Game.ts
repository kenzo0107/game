import * as THREE from 'three'
import { World } from '@/world/World'
import { Player } from '@/player/Player'
import { InputManager } from '@/core/InputManager'
import { RayCaster } from '@/physics/RayCaster'
import { Crosshair } from '@/ui/Crosshair'
import { HUD } from '@/ui/HUD'
import { BlockType } from '@/world/Block'

export class Game {
  private scene: THREE.Scene
  private renderer: THREE.WebGLRenderer
  private world: World
  private player: Player
  private inputManager: InputManager
  private crosshair: Crosshair
  private hud: HUD
  private animationId: number | null = null
  private lastTime = performance.now()

  constructor() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x87ceeb)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio)

    const container = document.getElementById('game-container')
    if (container) {
      container.appendChild(this.renderer.domElement)
    }

    // 入力管理
    this.inputManager = new InputManager(this.renderer.domElement as HTMLCanvasElement)

    // ライト追加
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 20, 10)
    this.scene.add(directionalLight)

    // ワールド生成
    this.world = new World(this.scene)

    // プレイヤー生成
    this.player = new Player(this.inputManager)

    // UI生成
    this.crosshair = new Crosshair()
    this.hud = new HUD()

    window.addEventListener('resize', this.onWindowResize.bind(this))
  }

  start(): void {
    this.animate()
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(this.animate.bind(this))

    const currentTime = performance.now()
    const deltaTime = (currentTime - this.lastTime) / 1000
    this.lastTime = currentTime

    this.player.update(deltaTime, this.world)
    this.handleBlockInteraction()
    this.renderer.render(this.scene, this.player.camera.camera)
  }

  private handleBlockInteraction(): void {
    // Hキー: ヘルプ表示切り替え
    if (this.inputManager.consumeKey('KeyH')) {
      this.hud.toggleHelp()
    }

    if (!this.inputManager.isLocked()) return

    const cameraPos = this.player.camera.camera.position
    const direction = this.player.camera.getDirection()

    const raycastResult = RayCaster.cast(this.world, cameraPos, direction, 5)

    // 左クリック: ブロック破壊
    if (this.inputManager.consumeMouseButton(0) && raycastResult.hit && raycastResult.blockPos) {
      const { x, y, z } = raycastResult.blockPos
      this.world.setBlock(x, y, z, BlockType.AIR)
    }

    // Eキー: ブロック配置
    if (this.inputManager.consumeKey('KeyE') && raycastResult.hit && raycastResult.placePos) {
      const { x, y, z } = raycastResult.placePos
      const selectedBlock = this.hud.getSelectedBlock()
      this.world.setBlock(x, y, z, selectedBlock)
    }

    // 数字キー: ブロックタイプ選択
    if (this.inputManager.isKeyPressed('Digit1')) {
      this.hud.setSelectedBlock(BlockType.GRASS)
    } else if (this.inputManager.isKeyPressed('Digit2')) {
      this.hud.setSelectedBlock(BlockType.DIRT)
    } else if (this.inputManager.isKeyPressed('Digit3')) {
      this.hud.setSelectedBlock(BlockType.STONE)
    }
  }

  private onWindowResize(): void {
    this.player.camera.onResize()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }
}

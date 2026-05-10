import { BlockType } from '@/world/Block'
import { BlockRegistry } from '@/data/BlockRegistry'

export class HUD {
  private element: HTMLDivElement
  private helpElement: HTMLDivElement
  private selectedBlockType: BlockType = BlockType.GRASS
  private isHelpVisible = false

  constructor() {
    this.element = document.createElement('div')
    this.element.style.position = 'fixed'
    this.element.style.bottom = '20px'
    this.element.style.left = '50%'
    this.element.style.transform = 'translateX(-50%)'
    this.element.style.padding = '10px 20px'
    this.element.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
    this.element.style.color = 'white'
    this.element.style.fontFamily = 'monospace'
    this.element.style.fontSize = '14px'
    this.element.style.borderRadius = '5px'
    this.element.style.pointerEvents = 'none'
    this.element.style.zIndex = '1000'

    document.body.appendChild(this.element)

    // ヘルプ画面の作成
    this.helpElement = this.createHelpElement()
    document.body.appendChild(this.helpElement)

    this.update()
  }

  private createHelpElement(): HTMLDivElement {
    const overlay = document.createElement('div')
    overlay.className = 'help-overlay'
    overlay.style.display = 'none'

    const content = document.createElement('div')
    content.className = 'help-content'

    const title = document.createElement('h2')
    title.textContent = '操作方法'
    content.appendChild(title)

    // 移動セクション
    this.addHelpSection(content, '移動', [
      'W: 前進',
      'S: 後退',
      'A: 左移動',
      'D: 右移動',
      'Space: ジャンプ',
    ])

    // 視点操作セクション
    this.addHelpSection(content, '視点操作', [
      'マウス移動: 視点変更',
      'Esc: ポインターロック解除',
    ])

    // ブロック操作セクション
    this.addHelpSection(content, 'ブロック操作', [
      '左クリック: ブロック破壊',
      'Eキー: ブロック配置',
    ])

    // ブロック選択セクション
    this.addHelpSection(content, 'ブロック選択', [
      '1: 草ブロック',
      '2: 土ブロック',
      '3: 石ブロック',
    ])

    // その他セクション
    this.addHelpSection(content, 'その他', ['H: このヘルプを開閉'])

    const closeText = document.createElement('p')
    closeText.className = 'help-close'
    closeText.textContent = 'Hキーで閉じる'
    content.appendChild(closeText)

    overlay.appendChild(content)
    return overlay
  }

  private addHelpSection(parent: HTMLElement, title: string, items: string[]): void {
    const section = document.createElement('div')
    section.className = 'help-section'

    const heading = document.createElement('h3')
    heading.textContent = title
    section.appendChild(heading)

    items.forEach((item) => {
      const p = document.createElement('p')
      p.textContent = item
      section.appendChild(p)
    })

    parent.appendChild(section)
  }

  setSelectedBlock(blockType: BlockType): void {
    this.selectedBlockType = blockType
    this.update()
  }

  getSelectedBlock(): BlockType {
    return this.selectedBlockType
  }

  toggleHelp(): void {
    this.isHelpVisible = !this.isHelpVisible
    this.helpElement.style.display = this.isHelpVisible ? 'flex' : 'none'
  }

  private update(): void {
    const blockDef = BlockRegistry.get(this.selectedBlockType)
    this.element.textContent = `選択中: ${blockDef?.name || 'Unknown'}`
  }

  destroy(): void {
    this.element.remove()
    this.helpElement.remove()
  }
}

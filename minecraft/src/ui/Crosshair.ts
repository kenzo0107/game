export class Crosshair {
  private element: HTMLDivElement

  constructor() {
    this.element = document.createElement('div')
    this.element.style.position = 'fixed'
    this.element.style.top = '50%'
    this.element.style.left = '50%'
    this.element.style.width = '20px'
    this.element.style.height = '20px'
    this.element.style.transform = 'translate(-50%, -50%)'
    this.element.style.pointerEvents = 'none'
    this.element.style.zIndex = '1000'

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '20')
    svg.setAttribute('height', '20')
    svg.setAttribute('viewBox', '0 0 20 20')

    const lines = [
      { x1: '10', y1: '0', x2: '10', y2: '8' },
      { x1: '10', y1: '12', x2: '10', y2: '20' },
      { x1: '0', y1: '10', x2: '8', y2: '10' },
      { x1: '12', y1: '10', x2: '20', y2: '10' }
    ]

    lines.forEach(({ x1, y1, x2, y2 }) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', x1)
      line.setAttribute('y1', y1)
      line.setAttribute('x2', x2)
      line.setAttribute('y2', y2)
      line.setAttribute('stroke', 'white')
      line.setAttribute('stroke-width', '2')
      svg.appendChild(line)
    })

    this.element.appendChild(svg)
    document.body.appendChild(this.element)
  }

  destroy(): void {
    this.element.remove()
  }
}

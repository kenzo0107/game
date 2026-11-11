import * as THREE from 'three'
import { BALL_RADIUS, LANE, type Ball, type Obstacle, type Pin } from './physics'

const PIN_HEIGHT = 0.38
const UP = new THREE.Vector3(0, 1, 0)

export const toWorld = (x: number, y: number, height = 0) => new THREE.Vector3(x, height, -y)

function createPinMesh(): THREE.Group {
  const profile = [
    [0, 0], [0.03, 0], [0.045, 0.04], [0.06, 0.12], [0.055, 0.18], [0.04, 0.23],
    [0.024, 0.27], [0.024, 0.29], [0.03, 0.33], [0.026, 0.37], [0, PIN_HEIGHT],
  ].map(([r, h]) => new THREE.Vector2(r, h))
  const group = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  )
  body.castShadow = true
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0255, 0.0255, 0.02, 16),
    new THREE.MeshStandardMaterial({ color: 0xd32f2f }),
  )
  stripe.position.y = 0.28
  group.add(body, stripe)
  return group
}

function createBallMesh(): THREE.Mesh {
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0x1e5bd8, roughness: 0.15, metalness: 0.3 }),
  )
  ball.castShadow = true
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x111111 })
  const holes: [number, number][] = [[-0.3, 0.9], [0.3, 0.9], [0, 0.5]]
  holes.forEach(([theta, phi]) => {
    const hole = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), holeMat)
    hole.position.setFromSphericalCoords(BALL_RADIUS * 0.97, phi, theta)
    ball.add(hole)
  })
  return ball
}

function createLane(scene: THREE.Scene) {
  const laneLength = LANE.length + 1
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(LANE.halfWidth * 2, laneLength),
    new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.25 }),
  )
  lane.rotation.x = -Math.PI / 2
  lane.position.set(0, 0, -(laneLength / 2 - 1))
  lane.receiveShadow = true
  scene.add(lane)

  const gutterMat = new THREE.MeshStandardMaterial({ color: 0x444a55 })
  for (const side of [-1, 1]) {
    const gutter = new THREE.Mesh(new THREE.PlaneGeometry(LANE.gutterWidth, laneLength), gutterMat)
    gutter.rotation.x = -Math.PI / 2
    gutter.position.set(side * (LANE.halfWidth + LANE.gutterWidth / 2), -0.08, lane.position.z)
    scene.add(gutter)
  }

  const markMat = new THREE.MeshBasicMaterial({ color: 0x8d4b1e })
  const foul = new THREE.Mesh(new THREE.PlaneGeometry(LANE.halfWidth * 2, 0.03), markMat)
  foul.rotation.x = -Math.PI / 2
  foul.position.set(0, 0.001, -1.2)
  scene.add(foul)
  for (let i = -3; i <= 3; i++) {
    const arrow = new THREE.Mesh(new THREE.CircleGeometry(0.07, 3), markMat)
    arrow.rotation.set(-Math.PI / 2, 0, Math.PI / 2)
    arrow.position.set(i * 0.35, 0.001, -(5 + Math.abs(i) * 0.3))
    scene.add(arrow)
  }

  const pit = new THREE.Mesh(
    new THREE.PlaneGeometry(LANE.halfWidth * 2 + 1, 3),
    new THREE.MeshBasicMaterial({ color: 0x050505 }),
  )
  pit.rotation.x = -Math.PI / 2
  pit.position.set(0, -0.3, -(LANE.length + 1.5))
  scene.add(pit)
}

function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

function drawStar(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45
    const angle = (Math.PI / 5) * i - Math.PI / 2
    g.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
  }
  g.closePath()
  g.fill()
}

function drawTop(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  g.strokeStyle = 'rgba(255, 255, 255, 0.6)'
  g.lineWidth = 3
  for (let i = 0; i < 3; i++) {
    g.beginPath()
    g.arc(cx, cy, r + 6 + i * 6, Math.PI * (0.9 + i * 0.1), Math.PI * (1.4 + i * 0.1))
    g.stroke()
  }
  g.fillStyle = color
  for (let i = 0; i < 3; i++) {
    const a = (Math.PI * 2 * i) / 3
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * r * 0.4, cy + Math.sin(a) * r * 0.4)
    g.lineTo(cx + Math.cos(a + 0.5) * r, cy + Math.sin(a + 0.5) * r)
    g.lineTo(cx + Math.cos(a + 1.3) * r * 0.75, cy + Math.sin(a + 1.3) * r * 0.75)
    g.closePath()
    g.fill()
  }
  g.fillStyle = '#cfd8dc'
  g.beginPath()
  g.arc(cx, cy, r * 0.45, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#ffd54a'
  drawStar(g, cx, cy, r * 0.32)
}

const DECOR_COLORS = ['#ff5c8a', '#ffd54a', '#4fc3f7', '#81c784', '#b388ff']

function createTopMesh(color: string): THREE.Group {
  const top = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.8, roughness: 0.3 })
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.4 })
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.12, 16), metal)
  tip.rotation.x = Math.PI
  tip.position.y = 0.06
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.06, 24), metal)
  disc.position.y = 0.15
  top.add(tip, disc)
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.1), paint)
    const a = (Math.PI * 2 * i) / 3
    blade.position.set(Math.cos(a) * 0.2, 0.17, Math.sin(a) * 0.2)
    blade.rotation.y = -a + 0.5
    top.add(blade)
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 16), paint)
  hub.position.y = 0.21
  top.add(hub)
  top.traverse((o) => (o.castShadow = true))
  return top
}

interface CheererStyle {
  kimono: number
  obi: number
  hair: number
  band: number
  flag: number
}

const CHEERER_STYLES: CheererStyle[] = [
  { kimono: 0xe53935, obi: 0xffd54a, hair: 0x3e2723, band: 0xffffff, flag: 0xffd54a },
  { kimono: 0x1e88e5, obi: 0xffffff, hair: 0x212121, band: 0xff5c8a, flag: 0x4fc3f7 },
  { kimono: 0x8e24aa, obi: 0x81c784, hair: 0x6d4c41, band: 0xffd54a, flag: 0xb388ff },
  { kimono: 0x43a047, obi: 0xff7043, hair: 0x263238, band: 0xffffff, flag: 0x81c784 },
  { kimono: 0xfb8c00, obi: 0x3949ab, hair: 0x4e342e, band: 0xe53935, flag: 0xff7043 },
  { kimono: 0x00897b, obi: 0xf06292, hair: 0x1b1b1b, band: 0x4fc3f7, flag: 0xf06292 },
]

function createCheerer(style: CheererStyle, facing: number): THREE.Group {
  const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
  const person = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.6, 16), mat(style.kimono))
  body.position.y = 0.3
  const obi = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.1, 16), mat(style.obi))
  obi.position.y = 0.36
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), mat(0xffcc99))
  head.position.y = 0.8
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(style.hair))
  hair.position.y = 0.82
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.025, 8, 24), mat(style.band))
  band.rotation.x = Math.PI / 2
  band.position.y = 0.88
  const eyeMat = mat(0x111111)
  const eyes = [-0.07, 0.07].map((dx) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), eyeMat)
    eye.position.set(dx, 0.82, 0.18)
    return eye
  })
  const armGeo = new THREE.BoxGeometry(0.07, 0.35, 0.07)
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Mesh(armGeo, mat(style.kimono))
    arm.position.set(side * 0.24, 0.62, 0)
    arm.rotation.z = side * -0.5
    return arm
  })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), mat(0x8d6e63))
  pole.position.set(0.36, 0.95, 0)
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.2),
    new THREE.MeshStandardMaterial({ color: style.flag, side: THREE.DoubleSide }),
  )
  flag.position.set(0.52, 1.15, 0)
  person.add(body, obi, head, hair, band, ...eyes, ...arms, pole, flag)
  person.traverse((o) => (o.castShadow = true))
  person.rotation.y = facing
  return person
}

function createCheerers(scene: THREE.Scene): THREE.Group[] {
  const cheerers: THREE.Group[] = []
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const style = CHEERER_STYLES[(i + (side > 0 ? 3 : 0)) % CHEERER_STYLES.length]
      const person = createCheerer(style, (side * -Math.PI) / 2)
      person.position.set(side * (2.3 + (i % 2) * 0.35), -0.12, -(2 + i * 3.4))
      person.userData.phase = i * 1.3 + side
      scene.add(person)
      cheerers.push(person)
    }
  }
  return cheerers
}

function createDecor(scene: THREE.Scene): THREE.Group[] {
  scene.background = canvasTexture(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#4fa8f0')
    grad.addColorStop(1, '#bfe6ff')
    g.fillStyle = grad
    g.fillRect(0, 0, 4, 256)
  })

  const length = LANE.length + 6
  const centerZ = -(length / 2 - 2)
  const floorTex = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#e3f4ff'
    g.fillRect(0, 0, 64, 64)
    g.fillStyle = '#8ab4d6'
    g.fillRect(0, 0, 32, 32)
    g.fillRect(32, 32, 32, 32)
  })
  floorTex.repeat.set(40, length)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, length), new THREE.MeshStandardMaterial({ map: floorTex }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, -0.12, centerZ)
  floor.receiveShadow = true
  scene.add(floor)

  const wallHeight = 0.7
  const wallTex = canvasTexture(256, 128, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, 128)
    bg.addColorStop(0, '#1a1f6b')
    bg.addColorStop(1, '#3a0d5c')
    g.fillStyle = bg
    g.fillRect(0, 0, 256, 128)
    g.strokeStyle = '#00e5ff'
    g.lineWidth = 3
    for (const y of [10, 118]) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(256, y)
      g.stroke()
    }
    drawTop(g, 64, 64, 38, DECOR_COLORS[0])
    drawTop(g, 192, 64, 38, DECOR_COLORS[2])
  })
  wallTex.repeat.set(length / 1.5, 1)
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex })
  const railMat = new THREE.MeshStandardMaterial({ color: 0xffff00 })

  const tops: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const x = side * (LANE.halfWidth + LANE.gutterWidth + 0.08)
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.16, wallHeight, length), wallMat)
    wall.position.set(x, wallHeight / 2 - 0.12, centerZ)
    wall.receiveShadow = true
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, length), railMat)
    rail.position.set(x, wallHeight - 0.09, centerZ)
    scene.add(wall, rail)

    for (let i = 0; i * 3 < length; i++) {
      const top = createTopMesh(DECOR_COLORS[(i + (side > 0 ? 2 : 0)) % DECOR_COLORS.length])
      top.position.set(x, wallHeight - 0.06, 1 - i * 3)
      top.userData.speed = (8 + (i % 3) * 3) * side
      scene.add(top)
      tops.push(top)
    }
  }
  return tops
}

export class BowlingScene {
  readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 100)
  private readonly deckCamera = new THREE.OrthographicCamera(-1.6, 1.6, 2.4, -2.4, 0.1, 20)
  private readonly ballMesh = createBallMesh()
  private readonly pinMeshes: THREE.Group[] = []
  private readonly pinTilts: number[] = []
  private readonly aimArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1, 0xffd54a, 0.3, 0.18)
  private readonly camTarget = new THREE.Vector3()
  private tops: THREE.Group[] = []
  private cheerers: THREE.Group[] = []
  private cheerTime = 0
  private celebrateUntil = 0
  private prevBall = { x: 0, y: 0 }
  private obstacleMeshes: THREE.Mesh[] = []
  private readonly obstacleMaterial = new THREE.MeshStandardMaterial({ color: 0xe040fb, roughness: 0.4 })

  constructor(pinCount: number) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.autoClear = false
    document.body.appendChild(this.renderer.domElement)

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 1.2))
    const light = new THREE.DirectionalLight(0xffffff, 1.6)
    light.position.set(2, 8, -(LANE.headPinY - 3))
    light.target.position.set(0, 0, -(LANE.headPinY + 2))
    light.castShadow = true
    light.shadow.mapSize.set(2048, 2048)
    Object.assign(light.shadow.camera, { left: -3, right: 3, top: 4, bottom: -4 })
    this.scene.add(light, light.target)

    createLane(this.scene)
    this.tops = createDecor(this.scene)
    this.cheerers = createCheerers(this.scene)
    this.scene.add(this.ballMesh, this.aimArrow)
    for (let i = 0; i < pinCount; i++) {
      const mesh = createPinMesh()
      this.pinMeshes.push(mesh)
      this.pinTilts.push(0)
      this.scene.add(mesh)
    }

    const deckCenter = LANE.headPinY + 2
    this.deckCamera.position.set(0, 10, -deckCenter)
    this.deckCamera.up.set(0, 0, -1)
    this.deckCamera.lookAt(0, 0, -deckCenter)

    this.aimArrow.visible = false
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  private resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
  }

  resetPins() {
    this.pinTilts.fill(0)
  }

  showAim(ball: Ball, angle: number, power: number) {
    this.aimArrow.visible = power > 0
    this.aimArrow.position.copy(toWorld(ball.x, ball.y, 0.05))
    this.aimArrow.setDirection(new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle)))
    this.aimArrow.setLength(1 + power * 5, 0.3, 0.18)
    this.aimArrow.setColor(new THREE.Color().setHSL(0.33 * (1 - power), 0.9, 0.55))
  }

  hideAim() {
    this.aimArrow.visible = false
  }

  celebrate() {
    this.celebrateUntil = this.cheerTime + 2.5
  }

  private updateCheerers(dt: number) {
    this.cheerTime += dt
    const party = this.cheerTime < this.celebrateUntil
    this.cheerers.forEach((p) => {
      const wave = Math.abs(Math.sin(this.cheerTime * (party ? 9 : 4) + p.userData.phase))
      p.position.y = -0.12 + wave * (party ? 0.6 : 0.08)
      p.rotation.z = party ? Math.sin(this.cheerTime * 6 + p.userData.phase) * 0.2 : 0
    })
  }

  setObstacles(obstacles: Obstacle[]) {
    this.obstacleMeshes.forEach((m) => {
      this.scene.remove(m)
      m.geometry.dispose()
    })
    this.obstacleMeshes = obstacles.map((o) => {
      const len = Math.hypot(o.bx - o.ax, o.by - o.ay)
      const geometry =
        len === 0
          ? new THREE.CylinderGeometry(o.r, o.r, 0.4, 20)
          : new THREE.BoxGeometry(len + o.r * 2, 0.3, o.r * 2)
      const mesh = new THREE.Mesh(geometry, this.obstacleMaterial)
      mesh.castShadow = true
      this.scene.add(mesh)
      return mesh
    })
  }

  private updateObstacles(obstacles: Obstacle[]) {
    obstacles.forEach((o, i) => {
      const mesh = this.obstacleMeshes[i]
      if (!mesh) return
      mesh.position.copy(toWorld((o.ax + o.bx) / 2, (o.ay + o.by) / 2, 0.18))
      mesh.rotation.y = Math.atan2(o.by - o.ay, o.bx - o.ax)
    })
  }

  update(ball: Ball, pins: Pin[], obstacles: Obstacle[], dt: number, snapCamera = false) {
    this.updateObstacles(obstacles)
    this.tops.forEach((t) => (t.rotation.y += t.userData.speed * dt))
    this.updateCheerers(dt)
    this.updateBall(ball)
    pins.forEach((pin, i) => this.updatePin(pin, i, dt))
    this.updateCamera(ball, snapCamera ? 1 : Math.min(1, dt * 4))
    this.render()
  }

  private updateBall(ball: Ball) {
    const height = ball.inGutter ? BALL_RADIUS - 0.08 : BALL_RADIUS
    this.ballMesh.visible = !ball.out
    this.ballMesh.position.copy(toWorld(ball.x, ball.y, height))
    const dx = ball.x - this.prevBall.x
    const dy = ball.y - this.prevBall.y
    const dist = Math.hypot(dx, dy)
    if (dist > 0 && dist < 1) {
      const axis = new THREE.Vector3(-dy, 0, -dx).normalize()
      this.ballMesh.rotateOnWorldAxis(axis, dist / BALL_RADIUS)
    }
    this.prevBall = { x: ball.x, y: ball.y }
  }

  private updatePin(pin: Pin, i: number, dt: number) {
    const mesh = this.pinMeshes[i]
    mesh.visible = !pin.out
    if (pin.out) return
    if (pin.fallen) this.pinTilts[i] = Math.min(Math.PI / 2, this.pinTilts[i] + dt * 7)
    const tilt = this.pinTilts[i]
    const fallDir = toWorld(pin.fallDirX, pin.fallDirY)
    const axis = new THREE.Vector3().crossVectors(UP, fallDir).normalize()
    mesh.quaternion.setFromAxisAngle(axis, tilt)
    mesh.position.copy(toWorld(pin.x, pin.y, Math.sin(tilt) * 0.05))
  }

  private updateCamera(ball: Ball, lerp: number) {
    const followY = Math.min(Math.max(ball.y, 0), LANE.headPinY - 4)
    const desired = toWorld(ball.x * 0.3, followY - 2.6, 1.5)
    this.camera.position.lerp(desired, lerp)
    this.camTarget.lerp(toWorld(0, followY + 8, 0), lerp)
    this.camera.lookAt(this.camTarget)
  }

  private render() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, w, h)
    this.renderer.clear()
    this.renderer.render(this.scene, this.camera)

    const insetH = Math.min(220, h * 0.3)
    const insetW = insetH * (3.2 / 4.8)
    const left = w - insetW - 10
    const bottom = h - insetH - 80
    this.renderer.setScissorTest(true)
    this.renderer.setScissor(left, bottom, insetW, insetH)
    this.renderer.setViewport(left, bottom, insetW, insetH)
    this.renderer.clear()
    this.renderer.render(this.scene, this.deckCamera)
    this.renderer.setScissorTest(false)
  }
}

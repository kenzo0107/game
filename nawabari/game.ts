// ゲーム定数
const ARENA_AREA = 800 * 600; // 盤面の向きを画面に合わせても、塗る総面積（難易度）は変えない
const GRID_SIZE = 10;
const GAME_DURATION = 30; // 秒
const PLAYER_SPEED = 1.5; // それ以外のエリアでは少し遅く
const PLAYER_SPEED_BOOST = 4; // 自分の色の上では速く移動
const ITEM_SIZE = 20;
const ITEM_SPAWN_INTERVAL = 5000; // アイテム生成間隔（ミリ秒）
const SPECIAL_DURATION = 5000; // 必殺技持続時間（ミリ秒）
const SPECIAL_GAUGE_PER_ITEM = 50; // 1つのアイテムで増加するゲージ量
const FRAME_MS = 1000 / 60; // 速度定数は 60fps の1フレームあたりの移動量で定義している
const MAX_FRAME_STEP = 3; // タブ復帰直後などに一気にワープしないよう上限を設ける
const STICK_RADIUS = 50; // CSS px
const STICK_DEAD_ZONE = 0.12;
const BRUSH_RADIUS = 25;
const SPECIAL_BRUSH_RADIUS = 45;
const EDGE_MARGIN = 8;
const STRIDE_PER_PX = 0.09; // 走りの1周期 ≒ 70px
const FIGURE_HEIGHT = 74;
// 足元より上にキャラを描くため、盤面上端にいても頭が切れないよう奥の壁として余白を取る
const BACK_WALL = 80;
// 横向きに走るとマフラーと影が足元から左右へはみ出すため、左右にも壁の余白を取る
const SIDE_WALL = 24;
const MAX_RENDER_SCALE = 1.5; // 高DPI端末で全画面合成を毎フレーム行っても重くならない上限

const MAX_CPU_LEVEL = 20;
const CPU_LEVEL_STORAGE_KEY = 'nawabariCpuLevel';
const CPU_ITEM_CHASE_RANGE = 350;

interface CpuSkill {
    speed: number;
    boost: number;
    retargetMs: number;
    candidates: number;
    retargetOnArrival: boolean;
    collectsItems: boolean;
}

// Lv.1 は従来どおりの「ランダムに歩き回るだけ」の強さに保ち、勝つたびに速さと賢さを少しずつ上げる
const cpuSkillFor = (level: number): CpuSkill => {
    const step = level - 1;
    return {
        speed: Math.min(1.5 + 0.08 * step, 2.3),
        boost: Math.min(2.5 + 0.15 * step, 4.2),
        retargetMs: Math.max(700, 2000 - 120 * step),
        candidates: Math.min(1 + 2 * step, 16),
        retargetOnArrival: level >= 2,
        collectsItems: level >= 3
    };
};

const formatPlayedAt = (time: number): string => {
    const d = new Date(time);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 色定義
enum CellOwner {
    NONE = 0,
    PLAYER = 1,
    CPU = 2
}

interface Position {
    x: number;
    y: number;
}

interface Hsl {
    h: number;
    s: number;
    l: number;
}

// 体の中心ではなく足元を座標にするのは、塗る位置と影を地面に接する点に揃えるため
interface Fighter {
    x: number;
    y: number;
    color: string;
    paint: Hsl;
    owner: CellOwner;
    facing: 1 | -1;
    runPhase: number;
    runBlend: number;
    lastStep: Position;
    splatDistance: number;
}

interface Item {
    x: number;
    y: number;
    active: boolean;
}

const hsl = ({ h, s, l }: Hsl, dl = 0, alpha = 1): string =>
    `hsla(${h}, ${s}%, ${Math.max(0, Math.min(100, l + dl))}%, ${alpha})`;

const createLayer = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const canvas = document.createElement('canvas');
    return [canvas, canvas.getContext('2d')!];
};

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width = 800;
    private height = 600;
    private cols = 80;
    private rows = 60;
    private scale = 1;
    private ground: HTMLCanvasElement;
    private groundCtx: CanvasRenderingContext2D;
    private paintLayer: HTMLCanvasElement;
    private paintCtx: CanvasRenderingContext2D;
    private fxLayer: HTMLCanvasElement;
    private fxCtx: CanvasRenderingContext2D;
    private grid: CellOwner[][];
    private player: Fighter;
    private cpu: Fighter;
    private keys: Set<string>;
    private gameRunning: boolean;
    private timeLeft: number;
    private timerInterval: number | null;
    private animationId: number | null;
    private items: Item[];
    private itemSpawnTimer: number | null;
    private specialGauge: number;
    private specialActive: boolean;
    private specialEndTime: number;
    private stick: Position = { x: 0, y: 0 };
    private sound = new Sound();
    private lastFrameTime = 0;
    private cpuTarget: Position | null = null;
    private cpuTargetTimer = 0;
    private cpuLevel = this.loadCpuLevel();
    private cpuSkill = cpuSkillFor(this.cpuLevel);
    private cpuGauge = 0;
    private cpuSpecialEndTime = 0;
    private history = new MatchHistory();
    private historyReturnTo: HTMLElement | null = null;

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        [this.ground, this.groundCtx] = createLayer();
        [this.paintLayer, this.paintCtx] = createLayer();
        [this.fxLayer, this.fxCtx] = createLayer();
        this.grid = [];
        this.keys = new Set();
        this.gameRunning = false;
        this.timeLeft = GAME_DURATION;
        this.timerInterval = null;
        this.animationId = null;
        this.items = [];
        this.itemSpawnTimer = null;
        this.specialGauge = 0;
        this.specialActive = false;
        this.specialEndTime = 0;

        this.player = this.createFighter('#3b82f6', { h: 217, s: 90, l: 55 }, CellOwner.PLAYER, 1);
        this.cpu = this.createFighter('#ef4444', { h: 2, s: 85, l: 56 }, CellOwner.CPU, -1);

        this.setupEventListeners();
        this.resetGame();
    }

    private createFighter(color: string, paint: Hsl, owner: CellOwner, facing: 1 | -1): Fighter {
        return {
            x: 0,
            y: 0,
            color,
            paint,
            owner,
            facing,
            runPhase: 0,
            runBlend: 0,
            lastStep: { x: 0, y: 0 },
            splatDistance: 0
        };
    }

    // 縦長のスマホでは横長固定の盤面だと上下が大きく余るため、盤面の縦横比を表示領域に合わせる
    private fitArena(): void {
        const field = document.querySelector('.field') as HTMLElement;
        const aspect = Math.max(0.5, Math.min(2, (field.clientWidth || 4) / (field.clientHeight || 3)));
        const b = aspect * BACK_WALL - 2 * SIDE_WALL;
        const arenaHeight = (-b + Math.sqrt(b * b + 4 * aspect * ARENA_AREA)) / (2 * aspect);
        this.height = Math.round(arenaHeight / GRID_SIZE) * GRID_SIZE;
        this.width = Math.round((aspect * (this.height + BACK_WALL) - 2 * SIDE_WALL) / GRID_SIZE) * GRID_SIZE;
        this.cols = this.width / GRID_SIZE;
        this.rows = this.height / GRID_SIZE;
        const boardWidth = this.width + SIDE_WALL * 2;
        const boardAspect = boardWidth / (this.height + BACK_WALL);
        (document.querySelector('.board') as HTMLElement).style.setProperty('--aspect', `${boardAspect}`);

        const cssWidth = Math.min(field.clientWidth, field.clientHeight * boardAspect) || boardWidth;
        this.scale = Math.max(1, Math.min(MAX_RENDER_SCALE, (cssWidth * devicePixelRatio) / boardWidth));
        this.canvas.width = Math.round(boardWidth * this.scale);
        this.canvas.height = Math.round((this.height + BACK_WALL) * this.scale);
        for (const layer of [this.ground, this.paintLayer, this.fxLayer]) {
            layer.width = Math.round(this.width * this.scale);
            layer.height = Math.round(this.height * this.scale);
        }
        for (const ctx of [this.groundCtx, this.paintCtx]) {
            ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
        }
        this.drawGround();
    }

    private drawGround(): void {
        const g = this.groundCtx;
        g.fillStyle = '#d9d6cf';
        g.fillRect(0, 0, this.width, this.height);

        for (let i = 0; i < (this.width * this.height) / 60; i++) {
            const shade = Math.random() < 0.5 ? 0 : 255;
            g.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${Math.random() * 0.08})`;
            g.fillRect(Math.random() * this.width, Math.random() * this.height, 1.5, 1.5);
        }

        const slab = 100;
        g.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        g.lineWidth = 2;
        g.beginPath();
        for (let x = slab; x < this.width; x += slab) {
            g.moveTo(x, 0);
            g.lineTo(x, this.height);
        }
        for (let y = slab; y < this.height; y += slab) {
            g.moveTo(0, y);
            g.lineTo(this.width, y);
        }
        g.stroke();
    }

    private initGrid(): void {
        this.grid = [];
        for (let row = 0; row < this.rows; row++) {
            this.grid[row] = [];
            for (let col = 0; col < this.cols; col++) {
                this.grid[row][col] = CellOwner.NONE;
            }
        }
    }

    private setupEventListeners(): void {
        // キーボードイベント
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys.add(key);

            // スペースキーの処理
            if (key === ' ') {
                e.preventDefault(); // ページスクロール防止

                if (!this.gameRunning) {
                    // ゲーム開始前ならゲームを開始
                    this.resetGame();
                    this.startGame();
                } else {
                    // ゲーム中なら必殺技発動
                    this.activateSpecial();
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys.delete(e.key.toLowerCase());
        });

        // 指を離したイベントを取りこぼすと押しっぱなしになるため、フォーカスを失ったら入力を捨てる
        window.addEventListener('blur', () => {
            this.keys.clear();
            this.releaseStick();
        });

        // 試合中や結果表示中に作り直すと塗った跡が消えるため、開始前だけ画面の向きに追従する
        window.addEventListener('resize', () => {
            if (document.getElementById('startOverlay')!.classList.contains('show')) this.resetGame();
        });

        this.setupStick();

        const specialBtn = document.getElementById('specialBtn')!;
        specialBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.activateSpecial();
        });
        specialBtn.addEventListener('contextmenu', (e) => e.preventDefault());

        // ボタンイベント
        const muteBtn = document.getElementById('muteBtn')!;
        const renderMute = () => {
            muteBtn.textContent = this.sound.muted ? '🔇' : '🔊';
            muteBtn.setAttribute('aria-label', this.sound.muted ? '音を出す' : '音を消す');
        };
        renderMute();
        muteBtn.addEventListener('click', () => {
            this.sound.unlock();
            this.sound.toggleMute();
            renderMute();
        });

        document.getElementById('resetLevelBtn')!.addEventListener('click', () => {
            this.saveCpuLevel(1);
            this.resetGame();
        });

        document.querySelectorAll('.history-btn').forEach((btn) => {
            btn.addEventListener('click', () => this.openHistory(btn.closest('.overlay') as HTMLElement));
        });
        document.getElementById('closeHistoryBtn')!.addEventListener('click', () => this.closeHistory());

        document.getElementById('startBtn')?.addEventListener('click', () => {
            this.startGame();
        });

        document.getElementById('playAgainBtn')?.addEventListener('click', () => {
            this.resetGame();
            this.startGame();
        });
    }

    private setupStick(): void {
        const field = document.querySelector('.field') as HTMLElement;
        let activePointer: number | null = null;
        let origin: Position = { x: 0, y: 0 };

        const move = (e: PointerEvent) => {
            let dx = (e.clientX - origin.x) / STICK_RADIUS;
            let dy = (e.clientY - origin.y) / STICK_RADIUS;
            const length = Math.hypot(dx, dy);
            if (length > 1) {
                dx /= length;
                dy /= length;
            }
            this.setStickKnob(dx * STICK_RADIUS * 0.6, dy * STICK_RADIUS * 0.6);
            this.stick = Math.hypot(dx, dy) < STICK_DEAD_ZONE ? { x: 0, y: 0 } : { x: dx, y: dy };
        };

        const release = (e: PointerEvent) => {
            if (e.pointerId !== activePointer) return;
            activePointer = null;
            this.releaseStick();
        };

        // 固定位置のスティックだと親指の置き場所がずれて誤操作しやすいため、触れた位置をスティックの中心にする
        field.addEventListener('pointerdown', (e) => {
            if (activePointer !== null || (e.target as Element).closest('button, a, .overlay.show')) return;
            e.preventDefault();
            activePointer = e.pointerId;
            origin = { x: e.clientX, y: e.clientY };
            this.showStickBase(e.clientX, e.clientY);
            move(e);
            field.setPointerCapture(e.pointerId);
        });
        field.addEventListener('pointermove', (e) => {
            if (e.pointerId === activePointer) move(e);
        });
        field.addEventListener('pointerup', release);
        field.addEventListener('pointercancel', release);
    }

    private showStickBase(x: number, y: number): void {
        const base = document.getElementById('stickBase')!;
        base.style.left = `${x}px`;
        base.style.top = `${y}px`;
        base.classList.add('active');
    }

    private setStickKnob(dx: number, dy: number): void {
        document.getElementById('stickKnob')!.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    private releaseStick(): void {
        this.stick = { x: 0, y: 0 };
        this.setStickKnob(0, 0);
        document.getElementById('stickBase')!.classList.remove('active');
    }

    public startGame(): void {
        if (this.gameRunning) return;

        this.gameRunning = true;
        this.timeLeft = GAME_DURATION;
        this.updateTimer();

        this.sound.unlock();
        this.sound.setHurry(false);
        this.sound.whistle();
        this.sound.startBgm();

        document.getElementById('startOverlay')!.classList.remove('show');
        document.getElementById('historyOverlay')!.classList.remove('show');
        this.hideGameOver();

        // タイマー開始
        this.timerInterval = window.setInterval(() => {
            this.timeLeft--;
            this.updateTimer();
            if (this.timeLeft === 10) this.sound.setHurry(true);
            if (this.timeLeft > 0 && this.timeLeft <= 5) this.sound.tick();

            if (this.timeLeft <= 0) {
                this.endGame();
            }
        }, 1000);

        // アイテムスポーンタイマー開始
        this.spawnItem(); // 最初のアイテムをすぐに生成
        this.itemSpawnTimer = window.setInterval(() => {
            this.spawnItem();
        }, ITEM_SPAWN_INTERVAL);

        // ゲームループ開始
        this.lastFrameTime = performance.now();
        this.animationId = requestAnimationFrame(this.gameLoop);
    }

    private resetGame(): void {
        // タイマーとアニメーション停止
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        if (this.itemSpawnTimer) {
            clearInterval(this.itemSpawnTimer);
        }
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        this.gameRunning = false;
        this.timeLeft = GAME_DURATION;
        this.keys.clear();
        this.releaseStick();
        this.cpuTarget = null;
        this.sound.stopBgm();

        this.fitArena();
        this.paintCtx.clearRect(0, 0, this.width, this.height);

        // プレイヤー位置リセット
        const portrait = this.height > this.width;
        this.placeFighter(this.player, portrait ? 0.5 : 0.25, portrait ? 0.75 : 0.5, 1);
        this.placeFighter(this.cpu, portrait ? 0.5 : 0.75, portrait ? 0.25 : 0.5, -1);

        // グリッドリセット
        this.initGrid();

        // アイテムと必殺技リセット
        this.items = [];
        this.specialGauge = 0;
        this.specialActive = false;
        this.specialEndTime = 0;
        this.cpuSkill = cpuSkillFor(this.cpuLevel);
        this.cpuGauge = 0;
        this.cpuSpecialEndTime = 0;
        this.renderCpuLevel();

        // UI更新
        this.updateTimer();
        this.updateScores();
        this.updateSpecialGaugeUI();

        this.draw();
    }

    private placeFighter(fighter: Fighter, rx: number, ry: number, facing: 1 | -1): void {
        fighter.x = this.width * rx;
        fighter.y = this.height * ry;
        fighter.facing = facing;
        fighter.runPhase = 0;
        fighter.runBlend = 0;
        fighter.lastStep = { x: fighter.x, y: fighter.y };
        fighter.splatDistance = 0;
    }

    private gameLoop = (now: number): void => {
        if (!this.gameRunning) return;

        const frames = Math.min((now - this.lastFrameTime) / FRAME_MS, MAX_FRAME_STEP);
        this.lastFrameTime = now;

        this.update(frames);
        this.draw();

        this.animationId = requestAnimationFrame(this.gameLoop);
    };

    private update(frames: number): void {
        // プレイヤー移動
        this.updatePlayerPosition(frames);

        // CPU移動（簡易AI）
        this.updateCPUPosition(frames);

        // アイテム取得判定
        this.checkItemCollision();

        // 必殺技の時間チェック
        if (this.specialActive && Date.now() >= this.specialEndTime) {
            this.specialActive = false;
            this.updateSpecialGaugeUI();
        }

        this.paintTrail(this.cpu);
        this.paintTrail(this.player);
        this.animateRun(this.player, frames);
        this.animateRun(this.cpu, frames);

        // スコア更新
        this.updateScores();
    }

    private readMoveInput(): Position {
        let x = this.stick.x;
        let y = this.stick.y;

        // WASD または 矢印キー
        if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
        if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
        if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
        if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;

        // 斜め移動の速度調整
        const length = Math.hypot(x, y);
        return length > 1 ? { x: x / length, y: y / length } : { x, y };
    }

    private ownerAt(fighter: Fighter): CellOwner {
        return this.grid[Math.floor(fighter.y / GRID_SIZE)]?.[Math.floor(fighter.x / GRID_SIZE)] ?? CellOwner.NONE;
    }

    private moveFighter(fighter: Fighter, dx: number, dy: number): void {
        fighter.x = Math.max(EDGE_MARGIN, Math.min(this.width - EDGE_MARGIN, fighter.x + dx));
        fighter.y = Math.max(EDGE_MARGIN, Math.min(this.height - EDGE_MARGIN, fighter.y + dy));
    }

    private updatePlayerPosition(frames: number): void {
        // 自分の色の上なら速度アップ
        const isOnOwnColor = this.ownerAt(this.player) === CellOwner.PLAYER;
        const speed = (isOnOwnColor ? PLAYER_SPEED_BOOST : PLAYER_SPEED) * frames;

        const input = this.readMoveInput();
        this.moveFighter(this.player, input.x * speed, input.y * speed);
    }

    private updateCPUPosition(frames: number): void {
        // 一定時間ごとにランダムな目標地点を設定
        this.cpuTargetTimer += frames * FRAME_MS;
        const arrived =
            this.cpuTarget !== null && Math.hypot(this.cpuTarget.x - this.cpu.x, this.cpuTarget.y - this.cpu.y) < 6;
        if (
            !this.cpuTarget ||
            this.cpuTargetTimer > this.cpuSkill.retargetMs ||
            (arrived && this.cpuSkill.retargetOnArrival)
        ) {
            this.cpuTarget = this.chooseCpuTarget();
            this.cpuTargetTimer = 0;
        }

        // 自分の色の上なら速度アップ
        const isOnOwnColor = this.ownerAt(this.cpu) === CellOwner.CPU;
        const speed = (isOnOwnColor ? this.cpuSkill.boost : this.cpuSkill.speed) * frames;

        // 目標地点に向かって移動
        const dx = this.cpuTarget.x - this.cpu.x;
        const dy = this.cpuTarget.y - this.cpu.y;
        const distance = Math.hypot(dx, dy);

        if (distance > speed) {
            this.moveFighter(this.cpu, (dx / distance) * speed, (dy / distance) * speed);
        }
    }

    private chooseCpuTarget(): Position {
        if (this.cpuSkill.collectsItems) {
            const nearest = this.items
                .map((item) => ({ x: item.x + ITEM_SIZE / 2, y: item.y + ITEM_SIZE / 2 }))
                .sort((a, b) => this.distanceFromCpu(a) - this.distanceFromCpu(b))[0];
            if (nearest && this.distanceFromCpu(nearest) < CPU_ITEM_CHASE_RANGE) return nearest;
        }

        let best: Position | null = null;
        let bestScore = -Infinity;
        for (let i = 0; i < this.cpuSkill.candidates; i++) {
            const candidate = {
                x: EDGE_MARGIN + Math.random() * (this.width - EDGE_MARGIN * 2),
                y: EDGE_MARGIN + Math.random() * (this.height - EDGE_MARGIN * 2)
            };
            const score = this.cpuPaintGain(candidate) / (1 + this.distanceFromCpu(candidate) / 250);
            if (score > bestScore) {
                best = candidate;
                bestScore = score;
            }
        }
        return best!;
    }

    private distanceFromCpu(point: Position): number {
        return Math.hypot(point.x - this.cpu.x, point.y - this.cpu.y);
    }

    // 相手の色を塗り替えると自分が増えて相手が減るため、未塗りより高く評価する
    private cpuPaintGain(point: Position): number {
        const col = Math.floor(point.x / GRID_SIZE);
        const row = Math.floor(point.y / GRID_SIZE);
        let gain = 0;
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const owner = this.grid[row + dy]?.[col + dx];
                if (owner === CellOwner.NONE) gain += 1;
                else if (owner === CellOwner.PLAYER) gain += 1.5;
            }
        }
        return gain;
    }

    private animateRun(fighter: Fighter, frames: number): void {
        const dx = fighter.x - fighter.lastStep.x;
        const dy = fighter.y - fighter.lastStep.y;
        const distance = Math.hypot(dx, dy);
        fighter.lastStep = { x: fighter.x, y: fighter.y };

        if (Math.abs(dx) > 0.05 * frames) fighter.facing = dx > 0 ? 1 : -1;
        fighter.runPhase += distance * STRIDE_PER_PX;
        const target = distance > 0.2 * frames ? 1 : 0;
        fighter.runBlend += (target - fighter.runBlend) * Math.min(1, 0.2 * frames);
    }

    private brushRadius(fighter: Fighter): number {
        return this.isSpecialActive(fighter) ? SPECIAL_BRUSH_RADIUS : BRUSH_RADIUS;
    }

    private isSpecialActive(fighter: Fighter): boolean {
        return fighter === this.player ? this.specialActive : Date.now() < this.cpuSpecialEndTime;
    }

    private paintTrail(fighter: Fighter): void {
        const radius = this.brushRadius(fighter);
        const from = fighter.lastStep;
        const to = { x: fighter.x, y: fighter.y };
        const distance = Math.hypot(to.x - from.x, to.y - from.y);

        const p = this.paintCtx;
        p.lineCap = 'round';
        p.strokeStyle = hsl(fighter.paint);
        p.lineWidth = radius * 2;
        p.beginPath();
        p.moveTo(from.x, from.y);
        p.lineTo(to.x + 0.01, to.y);
        p.stroke();

        fighter.splatDistance += distance;
        while (fighter.splatDistance > 7) {
            fighter.splatDistance -= 7;
            this.edgeSplat(fighter, to, radius);
        }
        if (distance > 0 && Math.random() < 0.025) {
            this.burstSplat(fighter, to, radius * 0.9, 6);
        }

        this.paintGrid(fighter.owner, to, radius);
        if (fighter === this.player && distance > 0.5) this.sound.paint();
    }

    // 円形のストロークだけだと輪郭が機械的になるため、縁に飛沫を散らしてペンキらしいギザつきを出す
    private edgeSplat(fighter: Fighter, center: Position, radius: number): void {
        const p = this.paintCtx;
        const angle = Math.random() * Math.PI * 2;
        const reach = radius * (0.8 + Math.random() * 0.45);
        const size = 2 + Math.random() * radius * 0.3;
        p.fillStyle = hsl(fighter.paint);
        p.beginPath();
        const splat = { x: center.x + Math.cos(angle) * reach, y: center.y + Math.sin(angle) * reach };
        p.arc(splat.x, splat.y, size, 0, Math.PI * 2);
        p.fill();
        this.paintSplatGrid(fighter.owner, splat, size);
    }

    private burstSplat(fighter: Fighter, center: Position, radius: number, droplets: number): void {
        const p = this.paintCtx;
        p.fillStyle = hsl(fighter.paint);
        p.beginPath();
        p.arc(center.x, center.y, radius, 0, Math.PI * 2);
        p.fill();

        for (let i = 0; i < droplets; i++) {
            const angle = Math.random() * Math.PI * 2;
            const reach = radius * (1.1 + Math.random() * 1.2);
            const x = center.x + Math.cos(angle) * reach;
            const y = center.y + Math.sin(angle) * reach;
            const size = 2 + Math.random() * radius * 0.25;

            p.strokeStyle = hsl(fighter.paint);
            p.lineWidth = size;
            p.lineCap = 'round';
            p.beginPath();
            p.moveTo(center.x + Math.cos(angle) * radius * 0.8, center.y + Math.sin(angle) * radius * 0.8);
            p.lineTo(x, y);
            p.stroke();

            p.beginPath();
            p.arc(x, y, size * 0.9, 0, Math.PI * 2);
            p.fill();
            this.paintSplatGrid(fighter.owner, { x, y }, size * 0.9);
        }
        this.paintGrid(fighter.owner, center, radius);
    }

    // セル中心だけで判定すると小さな飛沫はほぼ登録されず、見た目は塗れているのに得点にならないため、半セル分広げて判定する
    private paintSplatGrid(owner: CellOwner, center: Position, size: number): void {
        this.paintGrid(owner, center, size + GRID_SIZE / 2);
    }

    private paintGrid(owner: CellOwner, center: Position, radius: number): void {
        const minCol = Math.max(0, Math.floor((center.x - radius) / GRID_SIZE));
        const maxCol = Math.min(this.cols - 1, Math.floor((center.x + radius) / GRID_SIZE));
        const minRow = Math.max(0, Math.floor((center.y - radius) / GRID_SIZE));
        const maxRow = Math.min(this.rows - 1, Math.floor((center.y + radius) / GRID_SIZE));

        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const cx = (col + 0.5) * GRID_SIZE - center.x;
                const cy = (row + 0.5) * GRID_SIZE - center.y;
                if (cx * cx + cy * cy <= radius * radius) {
                    this.grid[row][col] = owner;
                }
            }
        }
    }

    private draw(): void {
        const ctx = this.ctx;
        ctx.setTransform(this.scale, 0, 0, this.scale, this.sideWallOffset(), this.wallOffset());
        this.drawBackWall();
        ctx.drawImage(this.ground, 0, 0, this.width, this.height);
        this.drawPaint();
        const wallShadow = ctx.createLinearGradient(0, 0, 0, 14);
        wallShadow.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
        wallShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = wallShadow;
        ctx.fillRect(0, 0, this.width, 14);

        // アイテム描画
        this.drawItems();

        // 必殺技発動中のエフェクト
        for (const fighter of [this.player, this.cpu]) {
            if (this.isSpecialActive(fighter)) this.drawSpecialEffect(fighter);
        }

        const fighters = [this.player, this.cpu].sort((a, b) => a.y - b.y);
        for (const fighter of fighters) {
            this.drawShadow(fighter);
        }
        for (const fighter of fighters) {
            this.drawFighter(fighter);
        }
    }

    // 平らな塗りでは色紙のように見えるため、塗り跡の輪郭に影とハイライトを付けてペンキの厚みを出す
    private drawPaint(): void {
        const ctx = this.ctx;
        const fx = this.fxCtx;
        const w = this.fxLayer.width;
        const h = this.fxLayer.height;
        const offset = Math.max(1, Math.round(2 * this.scale));

        const silhouette = (fill: string, cutX: number, cutY: number) => {
            fx.globalCompositeOperation = 'source-over';
            fx.clearRect(0, 0, w, h);
            fx.drawImage(this.paintLayer, 0, 0);
            fx.globalCompositeOperation = 'source-in';
            fx.fillStyle = fill;
            fx.fillRect(0, 0, w, h);
            if (cutX || cutY) {
                fx.globalCompositeOperation = 'destination-out';
                fx.drawImage(this.paintLayer, cutX, cutY);
            }
        };

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, this.sideWallOffset(), this.wallOffset());

        silhouette('rgba(0, 0, 0, 0.22)', 0, 0);
        ctx.drawImage(this.fxLayer, offset, offset * 1.5);

        ctx.drawImage(this.paintLayer, 0, 0);

        silhouette('rgba(0, 0, 0, 0.22)', -offset, -offset);
        ctx.drawImage(this.fxLayer, 0, 0);

        silhouette('rgba(255, 255, 255, 0.55)', offset, offset);
        ctx.drawImage(this.fxLayer, 0, 0);

        ctx.restore();
    }

    // 塗り層を端数のピクセル位置に重ねると毎フレーム補間されて縁がぼけるため、整数に揃える
    private wallOffset(): number {
        return Math.round(BACK_WALL * this.scale);
    }

    private sideWallOffset(): number {
        return Math.round(SIDE_WALL * this.scale);
    }

    private drawBackWall(): void {
        const ctx = this.ctx;
        const wall = ctx.createLinearGradient(0, -BACK_WALL, 0, 0);
        wall.addColorStop(0, '#1e293b');
        wall.addColorStop(1, '#475569');
        ctx.fillStyle = wall;
        ctx.fillRect(-SIDE_WALL, -BACK_WALL, this.width + SIDE_WALL * 2, BACK_WALL);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        for (let x = 0; x < this.width; x += 40) {
            ctx.fillRect(x, -BACK_WALL, 20, BACK_WALL);
        }

        for (const [x, edge] of [[-SIDE_WALL, 0], [this.width, SIDE_WALL]]) {
            const side = ctx.createLinearGradient(x, 0, x + SIDE_WALL, 0);
            side.addColorStop(edge ? 1 : 0, '#1e293b');
            side.addColorStop(edge ? 0 : 1, '#475569');
            ctx.fillStyle = side;
            ctx.fillRect(x, 0, SIDE_WALL, this.height);
        }

        ctx.fillStyle = '#facc15';
        ctx.fillRect(-6, -6, this.width + 12, 6);
        ctx.fillRect(-6, 0, 6, this.height);
        ctx.fillRect(this.width, 0, 6, this.height);
    }

    private drawShadow(fighter: Fighter): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.ellipse(fighter.x, fighter.y, 19, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    private drawFighter(fighter: Fighter): void {
        const ctx = this.ctx;
        const run = fighter.runBlend;
        const phase = fighter.runPhase;
        const breathe = Math.sin(Date.now() / 300) * (1 - run);
        const unit = FIGURE_HEIGHT / 58;

        const thigh = 13 * unit;
        const shin = 13 * unit;
        const torso = 18 * unit;
        const upperArm = 10 * unit;
        const forearm = 10 * unit;
        const headRadius = 7.5 * unit;

        const angledFromDown = (from: Position, angle: number, length: number): Position => ({
            x: from.x + Math.sin(angle) * length * fighter.facing,
            y: from.y + Math.cos(angle) * length
        });

        const bob = Math.abs(Math.cos(phase)) * 3 * unit * run;
        const hip = { x: fighter.x, y: fighter.y - (thigh + shin) * (1 - 0.12 * run) - bob + breathe };
        const lean = 0.32 * run;
        const neck = angledFromDown(hip, Math.PI - lean, torso);
        const head = angledFromDown(neck, Math.PI - lean * 1.2, headRadius + 2 * unit);
        const shoulder = angledFromDown(hip, Math.PI - lean, torso * 0.92);

        const leg = (offset: number): Position[] => {
            const swing = phase + offset;
            const thighAngle = Math.sin(swing) * 0.85 * run;
            const kneeBend = (0.15 + Math.max(0, Math.cos(swing)) * 1.5) * run + 0.05;
            const knee = angledFromDown(hip, thighAngle, thigh);
            const foot = angledFromDown(knee, thighAngle - kneeBend, shin);
            return [hip, knee, foot];
        };

        const arm = (offset: number): Position[] => {
            const swing = phase + offset;
            const upperAngle = -Math.sin(swing) * 0.95 * run + 0.1;
            const elbow = angledFromDown(shoulder, upperAngle, upperArm);
            const hand = angledFromDown(elbow, upperAngle + 0.3 + 1.3 * run, forearm);
            return [shoulder, elbow, hand];
        };

        const outline = '#111827';
        const near = fighter.color;
        const far = hsl(fighter.paint, -18);

        const limb = (points: Position[], color: string, width: number) => {
            ctx.strokeStyle = outline;
            ctx.lineWidth = width + 3.5;
            ctx.beginPath();
            points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.stroke();
        };

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        limb(arm(0), far, 4 * unit);
        limb(leg(Math.PI), far, 5 * unit);

        this.drawScarf(fighter, neck, run);
        limb([hip, neck], near, 6.5 * unit);

        limb(leg(0), near, 5 * unit);

        ctx.fillStyle = near;
        ctx.strokeStyle = outline;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(head.x, head.y, headRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.moveTo(head.x + headRadius * 0.15 * fighter.facing, head.y - headRadius * 0.35);
        ctx.lineTo(head.x + headRadius * 0.95 * fighter.facing, head.y - headRadius * 0.15);
        ctx.lineTo(head.x + headRadius * 0.85 * fighter.facing, head.y + headRadius * 0.2);
        ctx.lineTo(head.x + headRadius * 0.1 * fighter.facing, head.y + headRadius * 0.05);
        ctx.closePath();
        ctx.fill();

        limb(arm(Math.PI), near, 4 * unit);

        ctx.restore();
    }

    private drawScarf(fighter: Fighter, neck: Position, run: number): void {
        const ctx = this.ctx;
        const t = Date.now() / 90;
        const unit = FIGURE_HEIGHT / 58;
        const length = (16 + 10 * run) * unit;
        const points: Position[] = [];
        for (let i = 0; i <= 4; i++) {
            const k = i / 4;
            points.push({
                x: neck.x - fighter.facing * length * k,
                y: neck.y + (2 + k * (6 - 5 * run) + Math.sin(t - i * 1.2) * 3 * k) * unit
            });
        }

        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 7 * unit;
        ctx.beginPath();
        points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.stroke();
        ctx.strokeStyle = hsl(fighter.paint, 22);
        ctx.lineWidth = 4 * unit;
        ctx.stroke();
    }

    private updateScores(): void {
        let playerCells = 0;
        let cpuCells = 0;
        let totalCells = 0;

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const owner = this.grid[row][col];
                if (owner === CellOwner.PLAYER) playerCells++;
                else if (owner === CellOwner.CPU) cpuCells++;
                if (owner !== CellOwner.NONE) totalCells++;
            }
        }

        const total = totalCells || 1;
        const playerPercent = ((playerCells / total) * 100).toFixed(1);
        const cpuPercent = ((cpuCells / total) * 100).toFixed(1);

        document.getElementById('playerScore')!.textContent = playerPercent;
        document.getElementById('cpuScore')!.textContent = cpuPercent;

        const playerShare = totalCells ? (playerCells / total) * 100 : 50;
        const cpuShare = totalCells ? (cpuCells / total) * 100 : 50;
        document.getElementById('playerTurf')!.style.width = `${playerShare}%`;
        document.getElementById('cpuTurf')!.style.width = `${cpuShare}%`;
    }

    private updateTimer(): void {
        document.getElementById('timer')!.textContent = this.timeLeft.toString();
        document.getElementById('timerBox')!.classList.toggle('hurry', this.timeLeft <= 10);
    }

    private endGame(): void {
        this.gameRunning = false;

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        // 最終スコア計算
        let playerCells = 0;
        let cpuCells = 0;

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const owner = this.grid[row][col];
                if (owner === CellOwner.PLAYER) playerCells++;
                else if (owner === CellOwner.CPU) cpuCells++;
            }
        }

        // 結果表示
        this.sound.stopBgm();
        this.sound.whistle(true);
        this.showGameOver(playerCells, cpuCells);
    }

    private showGameOver(playerCells: number, cpuCells: number): void {
        const gameOverDiv = document.getElementById('gameOver')!;
        const resultText = document.getElementById('resultText')!;
        const resultDetail = document.getElementById('resultDetail')!;

        const resultLevel = document.getElementById('resultLevel')!;
        const playedLevel = this.cpuLevel;
        this.recordMatch(playerCells, cpuCells, playedLevel);

        if (playerCells > cpuCells) {
            this.saveCpuLevel(Math.min(MAX_CPU_LEVEL, playedLevel + 1));
            resultLevel.textContent =
                playedLevel >= MAX_CPU_LEVEL
                    ? `最強の CPU Lv.${MAX_CPU_LEVEL} に勝利！`
                    : `CPU Lv.${playedLevel} を撃破！ 次は Lv.${this.cpuLevel}`;
            resultText.textContent = '🎉 勝利！';
            resultText.className = 'win';
            this.playResultLater('win');
            resultDetail.textContent = `あなた: ${playerCells}マス vs コンピュータ: ${cpuCells}マス`;
        } else if (playerCells < cpuCells) {
            resultLevel.textContent = `CPU Lv.${playedLevel} にもう一度挑戦！`;
            resultText.textContent = '😢 敗北...';
            resultText.className = 'lose';
            this.playResultLater('lose');
            resultDetail.textContent = `あなた: ${playerCells}マス vs コンピュータ: ${cpuCells}マス`;
        } else {
            resultLevel.textContent = `CPU Lv.${playedLevel} にもう一度挑戦！`;
            resultText.textContent = '🤝 引き分け';
            resultText.className = 'draw';
            this.playResultLater('draw');
            resultDetail.textContent = `両者: ${playerCells}マス`;
        }

        gameOverDiv.classList.add('show');
    }

    private recordMatch(playerCells: number, cpuCells: number, cpuLevel: number): void {
        const total = playerCells + cpuCells || 1;
        const toPercent = (cells: number) => Math.round((cells / total) * 1000) / 10;
        this.history.add({
            playedAt: Date.now(),
            outcome: playerCells > cpuCells ? 'win' : playerCells < cpuCells ? 'lose' : 'draw',
            cpuLevel,
            playerPercent: toPercent(playerCells),
            cpuPercent: toPercent(cpuCells)
        });
    }

    private openHistory(from: HTMLElement): void {
        this.historyReturnTo = from;
        from.classList.remove('show');
        this.renderHistory();
        document.getElementById('historyOverlay')!.classList.add('show');
    }

    private closeHistory(): void {
        document.getElementById('historyOverlay')!.classList.remove('show');
        // 履歴を見ている間は resize で盤面を作り直さないため、開始前の画面に戻るときに向きを合わせ直す
        if (this.historyReturnTo?.id === 'startOverlay') this.resetGame();
        this.historyReturnTo?.classList.add('show');
        this.historyReturnTo = null;
    }

    private renderHistory(): void {
        const { win, lose, draw } = this.history.totals;
        document.getElementById('historyTotals')!.textContent = `通算 ${win}勝 ${lose}敗 ${draw}分`;

        const list = document.getElementById('historyList')!;
        const records = this.history.records;
        list.replaceChildren(
            ...records.map((record) => {
                const item = document.createElement('li');
                item.className = 'history-item';
                item.dataset.outcome = record.outcome;
                const cells = [
                    formatPlayedAt(record.playedAt),
                    OUTCOME_LABELS[record.outcome],
                    `Lv.${record.cpuLevel}`,
                    `${record.playerPercent.toFixed(1)}% - ${record.cpuPercent.toFixed(1)}%`
                ];
                item.replaceChildren(
                    ...cells.map((text) => {
                        const span = document.createElement('span');
                        span.textContent = text;
                        return span;
                    })
                );
                return item;
            })
        );
        document.getElementById('historyEmpty')!.hidden = records.length > 0;
    }

    private loadCpuLevel(): number {
        try {
            const saved = Number(localStorage.getItem(CPU_LEVEL_STORAGE_KEY));
            return Number.isInteger(saved) && saved >= 1 ? Math.min(saved, MAX_CPU_LEVEL) : 1;
        } catch {
            return 1;
        }
    }

    private saveCpuLevel(level: number): void {
        this.cpuLevel = level;
        try {
            localStorage.setItem(CPU_LEVEL_STORAGE_KEY, String(level));
        } catch {
            // 保存できない環境でも、このページを開いている間はレベルを引き継ぐ
        }
        this.renderCpuLevel();
    }

    private renderCpuLevel(): void {
        const label = `Lv.${this.cpuLevel}`;
        document.getElementById('cpuLevel')!.textContent = label;
        document.getElementById('startLevel')!.textContent = label;
        document.getElementById('resetLevelBtn')!.hidden = this.cpuLevel <= 1;
    }

    // 終了の笛と重なると聞き取れないため、笛が鳴り終わってから流す
    private playResultLater(outcome: 'win' | 'lose' | 'draw'): void {
        window.setTimeout(() => {
            if (!this.gameRunning) this.sound.result(outcome);
        }, 900);
    }

    private hideGameOver(): void {
        document.getElementById('gameOver')!.classList.remove('show');
    }

    private spawnItem(): void {
        // ランダムな位置にアイテムを生成
        const item: Item = {
            x: Math.random() * (this.width - ITEM_SIZE),
            y: Math.random() * (this.height - ITEM_SIZE),
            active: true
        };
        this.items.push(item);
    }

    private checkItemCollision(): void {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            if (!item.active) continue;

            // プレイヤーとの距離を計算
            const dx = this.player.x - (item.x + ITEM_SIZE / 2);
            const dy = this.player.y - (item.y + ITEM_SIZE / 2);
            const distance = Math.hypot(dx, dy);

            // 衝突判定
            if (distance < GRID_SIZE + ITEM_SIZE) {
                item.active = false;
                this.items.splice(i, 1);

                // 必殺技ゲージを増加
                const wasReady = this.specialGauge >= 100;
                this.specialGauge = Math.min(100, this.specialGauge + SPECIAL_GAUGE_PER_ITEM);
                this.sound.pickup();
                if (!wasReady && this.specialGauge >= 100) this.sound.ready();
                this.updateSpecialGaugeUI();
                continue;
            }

            if (this.cpuSkill.collectsItems) {
                const cpuDistance = Math.hypot(this.cpu.x - (item.x + ITEM_SIZE / 2), this.cpu.y - (item.y + ITEM_SIZE / 2));
                if (cpuDistance < GRID_SIZE + ITEM_SIZE) {
                    item.active = false;
                    this.items.splice(i, 1);
                    this.cpuGauge = Math.min(100, this.cpuGauge + SPECIAL_GAUGE_PER_ITEM);
                    if (this.cpuGauge >= 100) this.activateCpuSpecial();
                }
            }
        }
    }

    private activateCpuSpecial(): void {
        if (Date.now() < this.cpuSpecialEndTime) return;
        this.cpuGauge = 0;
        this.cpuSpecialEndTime = Date.now() + SPECIAL_DURATION;
        this.burstSplat(this.cpu, { x: this.cpu.x, y: this.cpu.y }, SPECIAL_BRUSH_RADIUS * 1.6, 14);
        this.sound.special();
    }

    private activateSpecial(): void {
        if (this.specialGauge >= 100 && !this.specialActive) {
            this.specialActive = true;
            this.specialEndTime = Date.now() + SPECIAL_DURATION;
            this.specialGauge = 0;
            this.burstSplat(this.player, { x: this.player.x, y: this.player.y }, SPECIAL_BRUSH_RADIUS * 1.6, 14);
            this.sound.special();
            this.updateSpecialGaugeUI();
        }
    }

    private updateSpecialGaugeUI(): void {
        const button = document.getElementById('specialBtn')!;
        const label = document.getElementById('specialLabel')!;
        const ready = !this.specialActive && this.specialGauge >= 100;

        button.style.setProperty('--gauge', `${this.specialGauge}`);
        button.classList.toggle('ready', ready);
        button.classList.toggle('special-active', this.specialActive);

        if (this.specialActive) {
            label.textContent = '発動中';
        } else if (ready) {
            label.textContent = 'タップ！';
        } else {
            label.innerHTML = `SP<br>${this.specialGauge}%`;
        }
    }

    private drawItems(): void {
        const t = Date.now() / 1000;
        for (const item of this.items) {
            if (!item.active) continue;

            const cx = item.x + ITEM_SIZE / 2;
            const cy = item.y + ITEM_SIZE / 2;
            const seed = item.x * 0.37 + item.y * 0.11;
            const hover = 18 + Math.sin(t * 3 + seed) * 5;
            this.drawItemShadow(cx, cy, hover);
            this.drawItemGlow(cx, cy - hover, t + seed);
            this.drawSpinningStar(cx, cy - hover, t * 4 + seed);
            this.drawSparkles(cx, cy - hover, t + seed);
        }
    }

    private drawItemShadow(cx: number, cy: number, hover: number): void {
        const ctx = this.ctx;
        const spread = 1 - (hover - 13) / 30;
        ctx.fillStyle = `rgba(0, 0, 0, ${0.18 + spread * 0.12})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 13 * spread + 4, 4.5 * spread + 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    private drawItemGlow(cx: number, cy: number, t: number): void {
        const ctx = this.ctx;
        const radius = 30 + Math.sin(t * 5) * 4;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        glow.addColorStop(0, 'rgba(255, 236, 140, 0.75)');
        glow.addColorStop(1, 'rgba(255, 200, 40, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    private starPath(ctx: CanvasRenderingContext2D, outer: number): void {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? outer : outer * 0.48;
            const angle = (i * Math.PI) / 5 - Math.PI / 2;
            if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
            else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
    }

    // canvas 2D には 3D 回転がないため、横幅を cos で縮めて縦軸回転に見せ、ずらした重ね描きで厚みを出す
    private drawSpinningStar(cx: number, cy: number, spin: number): void {
        const ctx = this.ctx;
        const outer = 21;
        const depth = 7;
        const facing = Math.cos(spin);
        const widthScale = Math.sign(facing || 1) * Math.max(0.08, Math.abs(facing));
        const sideShift = Math.sin(spin);

        ctx.save();
        ctx.lineJoin = 'round';

        for (let k = depth; k >= 1; k--) {
            ctx.save();
            ctx.translate(cx - sideShift * k, cy);
            ctx.scale(widthScale, 1);
            this.starPath(ctx, outer);
            ctx.fillStyle = k === depth ? '#78350f' : '#b45309';
            ctx.fill();
            ctx.restore();
        }

        ctx.translate(cx, cy);
        ctx.scale(widthScale, 1);
        const face = ctx.createLinearGradient(-outer, -outer, outer, outer);
        const light = 0.55 + 0.45 * Math.abs(facing);
        face.addColorStop(0, `rgba(255, 250, 200, ${light})`);
        face.addColorStop(0.45, '#fde047');
        face.addColorStop(1, '#f59e0b');
        this.starPath(ctx, outer);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.fillStyle = face;
        ctx.fill();
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2 / Math.max(0.3, Math.abs(widthScale));
        ctx.stroke();

        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * Math.abs(facing)})`;
        ctx.beginPath();
        ctx.ellipse(-outer * 0.22, -outer * 0.38, outer * 0.18, outer * 0.1, -0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    private drawSparkles(cx: number, cy: number, t: number): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = 'white';
        for (let i = 0; i < 3; i++) {
            const angle = t * 1.8 + (i * Math.PI * 2) / 3;
            const size = Math.max(0, Math.sin(t * 6 + i * 2)) * 5;
            if (size < 0.5) continue;
            const x = cx + Math.cos(angle) * 26;
            const y = cy + Math.sin(angle) * 16;
            ctx.beginPath();
            ctx.moveTo(x, y - size);
            ctx.lineTo(x + size * 0.3, y - size * 0.3);
            ctx.lineTo(x + size, y);
            ctx.lineTo(x + size * 0.3, y + size * 0.3);
            ctx.lineTo(x, y + size);
            ctx.lineTo(x - size * 0.3, y + size * 0.3);
            ctx.lineTo(x - size, y);
            ctx.lineTo(x - size * 0.3, y - size * 0.3);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    private drawSpecialEffect(fighter: Fighter): void {
        // プレイヤーの周りに光るエフェクト
        const time = Date.now() / 200;
        const radius = SPECIAL_BRUSH_RADIUS + Math.sin(time) * 5;

        this.ctx.save();
        this.ctx.globalAlpha = 0.35;
        this.ctx.strokeStyle = '#fbbf24';
        this.ctx.lineWidth = 6;
        this.ctx.beginPath();
        this.ctx.ellipse(fighter.x, fighter.y, radius, radius * 0.45, 0, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
    }
}

// ゲーム初期化
window.addEventListener('load', () => {
    new Game();
});

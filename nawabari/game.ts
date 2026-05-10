// ゲーム定数
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const GRID_SIZE = 10;
const COLS = CANVAS_WIDTH / GRID_SIZE;
const ROWS = CANVAS_HEIGHT / GRID_SIZE;
const PLAYER_SIZE = GRID_SIZE;
const GAME_DURATION = 60; // 秒
const PLAYER_SPEED = 1.5; // それ以外のエリアでは少し遅く
const PLAYER_SPEED_BOOST = 4; // 自分の色の上では速く移動
const CPU_SPEED = 1.5;
const CPU_SPEED_BOOST = 2.5; // CPUの色の上での移動速度
const ITEM_SIZE = 20;
const ITEM_SPAWN_INTERVAL = 5000; // アイテム生成間隔（ミリ秒）
const SPECIAL_DURATION = 5000; // 必殺技持続時間（ミリ秒）
const SPECIAL_GAUGE_PER_ITEM = 50; // 1つのアイテムで増加するゲージ量

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

interface Player {
    x: number;
    y: number;
    color: string;
    owner: CellOwner;
}

interface Item {
    x: number;
    y: number;
    active: boolean;
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private grid: CellOwner[][];
    private player: Player;
    private cpu: Player;
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

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
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

        // プレイヤー初期化
        this.player = {
            x: CANVAS_WIDTH * 0.25,
            y: CANVAS_HEIGHT * 0.5,
            color: '#3b82f6',
            owner: CellOwner.PLAYER
        };

        // CPU初期化
        this.cpu = {
            x: CANVAS_WIDTH * 0.75,
            y: CANVAS_HEIGHT * 0.5,
            color: '#ef4444',
            owner: CellOwner.CPU
        };

        this.initGrid();
        this.setupEventListeners();
        this.updateSpecialGaugeUI();
        this.draw();
    }

    private initGrid(): void {
        this.grid = [];
        for (let row = 0; row < ROWS; row++) {
            this.grid[row] = [];
            for (let col = 0; col < COLS; col++) {
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

        // ボタンイベント
        document.getElementById('startBtn')?.addEventListener('click', () => {
            this.startGame();
        });

        document.getElementById('resetBtn')?.addEventListener('click', () => {
            this.resetGame();
        });

        document.getElementById('playAgainBtn')?.addEventListener('click', () => {
            this.resetGame();
            this.hideGameOver();
        });
    }

    public startGame(): void {
        if (this.gameRunning) return;

        this.gameRunning = true;
        this.timeLeft = GAME_DURATION;
        this.updateTimer();

        // ボタン状態更新
        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
        startBtn.disabled = true;
        resetBtn.disabled = false;

        // タイマー開始
        this.timerInterval = window.setInterval(() => {
            this.timeLeft--;
            this.updateTimer();

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
        this.gameLoop();
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

        // プレイヤー位置リセット
        this.player.x = CANVAS_WIDTH * 0.25;
        this.player.y = CANVAS_HEIGHT * 0.5;
        this.cpu.x = CANVAS_WIDTH * 0.75;
        this.cpu.y = CANVAS_HEIGHT * 0.5;

        // グリッドリセット
        this.initGrid();

        // アイテムと必殺技リセット
        this.items = [];
        this.specialGauge = 0;
        this.specialActive = false;
        this.specialEndTime = 0;

        // UI更新
        this.updateTimer();
        this.updateScores();
        this.updateSpecialGaugeUI();
        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
        startBtn.disabled = false;
        resetBtn.disabled = true;

        this.draw();
    }

    private gameLoop = (): void => {
        if (!this.gameRunning) return;

        this.update();
        this.draw();

        this.animationId = requestAnimationFrame(this.gameLoop);
    };

    private update(): void {
        // プレイヤー移動
        this.updatePlayerPosition();

        // CPU移動（簡易AI）
        this.updateCPUPosition();

        // アイテム取得判定
        this.checkItemCollision();

        // 必殺技の時間チェック
        if (this.specialActive && Date.now() >= this.specialEndTime) {
            this.specialActive = false;
            this.updateSpecialGaugeUI();
        }

        // グリッド更新
        this.paintCell(this.player);
        this.paintCell(this.cpu);

        // スコア更新
        this.updateScores();
    }

    private updatePlayerPosition(): void {
        let dx = 0;
        let dy = 0;

        // 現在のグリッド位置を確認
        const gridX = Math.floor(this.player.x / GRID_SIZE);
        const gridY = Math.floor(this.player.y / GRID_SIZE);
        const isOnOwnColor = this.grid[gridY]?.[gridX] === CellOwner.PLAYER;

        // 自分の色の上なら速度アップ
        const speed = isOnOwnColor ? PLAYER_SPEED_BOOST : PLAYER_SPEED;

        // WASD または 矢印キー
        if (this.keys.has('w') || this.keys.has('arrowup')) dy -= speed;
        if (this.keys.has('s') || this.keys.has('arrowdown')) dy += speed;
        if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= speed;
        if (this.keys.has('d') || this.keys.has('arrowright')) dx += speed;

        // 斜め移動の速度調整
        if (dx !== 0 && dy !== 0) {
            dx *= 0.707;
            dy *= 0.707;
        }

        this.player.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_SIZE, this.player.x + dx));
        this.player.y = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_SIZE, this.player.y + dy));
    }

    private cpuTarget: Position | null = null;
    private cpuTargetTimer = 0;

    private updateCPUPosition(): void {
        // 一定時間ごとにランダムな目標地点を設定
        this.cpuTargetTimer++;
        if (!this.cpuTarget || this.cpuTargetTimer > 120) {
            this.cpuTarget = {
                x: Math.random() * (CANVAS_WIDTH - PLAYER_SIZE),
                y: Math.random() * (CANVAS_HEIGHT - PLAYER_SIZE)
            };
            this.cpuTargetTimer = 0;
        }

        // 現在のグリッド位置を確認
        const gridX = Math.floor(this.cpu.x / GRID_SIZE);
        const gridY = Math.floor(this.cpu.y / GRID_SIZE);
        const isOnOwnColor = this.grid[gridY]?.[gridX] === CellOwner.CPU;

        // 自分の色の上なら速度アップ
        const speed = isOnOwnColor ? CPU_SPEED_BOOST : CPU_SPEED;

        // 目標地点に向かって移動
        const dx = this.cpuTarget.x - this.cpu.x;
        const dy = this.cpuTarget.y - this.cpu.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > speed) {
            this.cpu.x += (dx / distance) * speed;
            this.cpu.y += (dy / distance) * speed;
        }

        this.cpu.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_SIZE, this.cpu.x));
        this.cpu.y = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_SIZE, this.cpu.y));
    }

    private paintCell(player: Player): void {
        const gridX = Math.floor(player.x / GRID_SIZE);
        const gridY = Math.floor(player.y / GRID_SIZE);

        // 塗る範囲の半径（必殺技発動中はプレイヤーのみ2倍）
        let paintRadius = 2;
        if (player.owner === CellOwner.PLAYER && this.specialActive) {
            paintRadius = 4; // 必殺技中は9x9の範囲
        }

        // プレイヤーの位置を中心に周囲も塗る
        for (let dy = -paintRadius; dy <= paintRadius; dy++) {
            for (let dx = -paintRadius; dx <= paintRadius; dx++) {
                const targetX = gridX + dx;
                const targetY = gridY + dy;

                // グリッド範囲内かチェック
                if (targetX >= 0 && targetX < COLS && targetY >= 0 && targetY < ROWS) {
                    this.grid[targetY][targetX] = player.owner;
                }
            }
        }
    }

    private draw(): void {
        // 背景クリア
        this.ctx.fillStyle = '#e0e0e0';
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // グリッド描画
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const owner = this.grid[row][col];
                if (owner === CellOwner.PLAYER) {
                    this.ctx.fillStyle = 'rgba(59, 130, 246, 0.5)';
                    this.ctx.fillRect(col * GRID_SIZE, row * GRID_SIZE, GRID_SIZE, GRID_SIZE);
                } else if (owner === CellOwner.CPU) {
                    this.ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
                    this.ctx.fillRect(col * GRID_SIZE, row * GRID_SIZE, GRID_SIZE, GRID_SIZE);
                }
            }
        }

        // アイテム描画
        this.drawItems();

        // プレイヤー描画
        this.drawPlayer(this.player);
        this.drawPlayer(this.cpu);

        // 必殺技発動中のエフェクト
        if (this.specialActive) {
            this.drawSpecialEffect();
        }
    }

    private drawPlayer(player: Player): void {
        const centerX = player.x + PLAYER_SIZE / 2;
        const centerY = player.y + PLAYER_SIZE / 2;
        const scale = PLAYER_SIZE * 1.5; // 人型のサイズを大きく

        this.ctx.strokeStyle = player.color;
        this.ctx.fillStyle = player.color;
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // 頭
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY - scale * 3, scale * 1.2, 0, Math.PI * 2);
        this.ctx.fill();

        // 白い縁取り（頭）
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // 体の線に戻す
        this.ctx.strokeStyle = player.color;
        this.ctx.lineWidth = 3;

        // 体
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY - scale * 1.5);
        this.ctx.lineTo(centerX, centerY + scale * 1);
        this.ctx.stroke();

        // 腕（左）
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY - scale * 1);
        this.ctx.lineTo(centerX - scale * 1.5, centerY);
        this.ctx.stroke();

        // 腕（右）
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY - scale * 1);
        this.ctx.lineTo(centerX + scale * 1.5, centerY);
        this.ctx.stroke();

        // 脚（左）
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY + scale * 1);
        this.ctx.lineTo(centerX - scale * 1, centerY + scale * 3);
        this.ctx.stroke();

        // 脚（右）
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY + scale * 1);
        this.ctx.lineTo(centerX + scale * 1, centerY + scale * 3);
        this.ctx.stroke();

        // 白い縁取り（全体）
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 1;

        // 体の縁取り
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY - scale * 1.5);
        this.ctx.lineTo(centerX, centerY + scale * 1);
        this.ctx.stroke();

        // 腕の縁取り
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY - scale * 1);
        this.ctx.lineTo(centerX - scale * 1.5, centerY);
        this.ctx.moveTo(centerX, centerY - scale * 1);
        this.ctx.lineTo(centerX + scale * 1.5, centerY);
        this.ctx.stroke();

        // 脚の縁取り
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY + scale * 1);
        this.ctx.lineTo(centerX - scale * 1, centerY + scale * 3);
        this.ctx.moveTo(centerX, centerY + scale * 1);
        this.ctx.lineTo(centerX + scale * 1, centerY + scale * 3);
        this.ctx.stroke();
    }

    private updateScores(): void {
        let playerCells = 0;
        let cpuCells = 0;
        let totalCells = 0;

        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
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
    }

    private updateTimer(): void {
        document.getElementById('timer')!.textContent = this.timeLeft.toString();
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

        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const owner = this.grid[row][col];
                if (owner === CellOwner.PLAYER) playerCells++;
                else if (owner === CellOwner.CPU) cpuCells++;
            }
        }

        // 結果表示
        this.showGameOver(playerCells, cpuCells);

        // ボタン状態更新
        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
        startBtn.disabled = false;
        resetBtn.disabled = false;
    }

    private showGameOver(playerCells: number, cpuCells: number): void {
        const gameOverDiv = document.getElementById('gameOver')!;
        const resultText = document.getElementById('resultText')!;
        const resultDetail = document.getElementById('resultDetail')!;

        if (playerCells > cpuCells) {
            resultText.textContent = '🎉 勝利！';
            resultText.className = 'win';
            resultDetail.textContent = `あなた: ${playerCells}マス vs コンピュータ: ${cpuCells}マス`;
        } else if (playerCells < cpuCells) {
            resultText.textContent = '😢 敗北...';
            resultText.className = 'lose';
            resultDetail.textContent = `あなた: ${playerCells}マス vs コンピュータ: ${cpuCells}マス`;
        } else {
            resultText.textContent = '🤝 引き分け';
            resultText.className = 'draw';
            resultDetail.textContent = `両者: ${playerCells}マス`;
        }

        gameOverDiv.classList.add('show');
    }

    private hideGameOver(): void {
        document.getElementById('gameOver')!.classList.remove('show');
    }

    private spawnItem(): void {
        // ランダムな位置にアイテムを生成
        const item: Item = {
            x: Math.random() * (CANVAS_WIDTH - ITEM_SIZE),
            y: Math.random() * (CANVAS_HEIGHT - ITEM_SIZE),
            active: true
        };
        this.items.push(item);
    }

    private checkItemCollision(): void {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            if (!item.active) continue;

            // プレイヤーとの距離を計算
            const dx = (this.player.x + PLAYER_SIZE / 2) - (item.x + ITEM_SIZE / 2);
            const dy = (this.player.y + PLAYER_SIZE / 2) - (item.y + ITEM_SIZE / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 衝突判定
            if (distance < PLAYER_SIZE + ITEM_SIZE / 2) {
                item.active = false;
                this.items.splice(i, 1);

                // 必殺技ゲージを増加
                this.specialGauge = Math.min(100, this.specialGauge + SPECIAL_GAUGE_PER_ITEM);
                this.updateSpecialGaugeUI();
            }
        }
    }

    private activateSpecial(): void {
        if (this.specialGauge >= 100 && !this.specialActive) {
            this.specialActive = true;
            this.specialEndTime = Date.now() + SPECIAL_DURATION;
            this.specialGauge = 0;
            this.updateSpecialGaugeUI();
        }
    }

    private updateSpecialGaugeUI(): void {
        const gaugeFill = document.getElementById('specialGauge')!;
        const hint = document.getElementById('specialHint')!;

        gaugeFill.style.width = `${this.specialGauge}%`;
        gaugeFill.textContent = `${this.specialGauge}%`;

        if (this.specialActive) {
            gaugeFill.classList.remove('ready');
            gaugeFill.classList.add('special-active');
            hint.textContent = '⚡ 必殺技発動中！';
            hint.classList.remove('ready');
        } else if (this.specialGauge >= 100) {
            gaugeFill.classList.add('ready');
            gaugeFill.classList.remove('special-active');
            hint.textContent = '✨ スペースキーで必殺技発動！';
            hint.classList.add('ready');
        } else {
            gaugeFill.classList.remove('ready', 'special-active');
            hint.textContent = 'アイテムを集めてゲージを貯めよう！';
            hint.classList.remove('ready');
        }
    }

    private drawItems(): void {
        for (const item of this.items) {
            if (!item.active) continue;

            // 星形アイテムを描画
            this.ctx.save();
            this.ctx.translate(item.x + ITEM_SIZE / 2, item.y + ITEM_SIZE / 2);

            // 回転アニメーション
            const rotation = (Date.now() / 1000) * Math.PI;
            this.ctx.rotate(rotation);

            // 星の描画
            this.ctx.fillStyle = '#fbbf24';
            this.ctx.strokeStyle = '#f59e0b';
            this.ctx.lineWidth = 2;

            this.ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
                const x = Math.cos(angle) * ITEM_SIZE / 2;
                const y = Math.sin(angle) * ITEM_SIZE / 2;
                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.restore();
        }
    }

    private drawSpecialEffect(): void {
        // プレイヤーの周りに光るエフェクト
        const time = Date.now() / 200;
        const radius = PLAYER_SIZE * 2 + Math.sin(time) * 5;

        this.ctx.save();
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillStyle = '#fbbf24';
        this.ctx.beginPath();
        this.ctx.arc(
            this.player.x + PLAYER_SIZE / 2,
            this.player.y + PLAYER_SIZE / 2,
            radius,
            0,
            Math.PI * 2
        );
        this.ctx.fill();
        this.ctx.restore();
    }
}

// ゲーム初期化
window.addEventListener('load', () => {
    new Game();
});

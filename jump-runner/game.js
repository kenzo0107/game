// キャンバス設定
const canvas = document.getElementById('gameCanvas');
const screenCtx = canvas.getContext('2d');
// 処理落ちの追いつき分の進行では描画を捨てる。更新と描画が絡み合ったコードを分離する大改修を避けるため、描画先を差し替える
const nullCtx = new Proxy({}, { get: () => () => {}, set: () => true });
let ctx = screenCtx;

const WORLD_HEIGHT = 400;
const GROUND_Y = 360;
// 縦持ちでもキャラが小さくなりすぎないよう、横方向に見える範囲はこの幅まで狭める
const MIN_VIEW_WIDTH = 512;
// キャラを大きく見せるため、雲しかない空の上端は横持ちで見切れてよいことにして拡大率を上げる
const VISIBLE_WORLD_TOP = 80;
// 縦持ちで余る縦方向の領域のうち、地面より下に回す割合
const BELOW_GROUND_RATIO = 0.3;

// 画面全体を使うため、ゲーム内座標（高さ 400）を画面サイズに合わせて拡大し、余った領域に空と地面を広げる
const view = { width: 850, top: 0, bottom: WORLD_HEIGHT, scale: 1, cssWidth: 0, cssHeight: 0, dpr: 1 };

function resizeCanvas() {
    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    const visibleHeight = WORLD_HEIGHT - VISIBLE_WORLD_TOP;
    const scale = Math.min(cssHeight / visibleHeight, cssWidth / MIN_VIEW_WIDTH);
    const extra = cssHeight / scale - visibleHeight;
    Object.assign(view, {
        width: cssWidth / scale,
        top: VISIBLE_WORLD_TOP - extra * (1 - BELOW_GROUND_RATIO),
        bottom: WORLD_HEIGHT + extra * BELOW_GROUND_RATIO,
        scale,
        cssWidth,
        cssHeight,
        dpr,
    });
}

function applyWorldTransform() {
    const k = view.scale * view.dpr;
    ctx.setTransform(k, 0, 0, k, shake.x * k, (shake.y - view.top) * k);
}

resizeCanvas();

// ゲーム状態
let gameState = 'ready'; // ready, playing, gameover
let score = 0;
let highScore = 0;
let gameSpeed = 2; // 3から2に変更（難易度を下げる）
let obstacleTimer = 0;
let gameOverAt = 0;

// ハイスコアの読み込み
function loadHighScore() {
    const saved = localStorage.getItem('jumpRunnerHighScore');
    return saved ? parseInt(saved, 10) : 0;
}

// ハイスコアの保存
function saveHighScore(score) {
    localStorage.setItem('jumpRunnerHighScore', score.toString());
}

// ハイスコアの更新
function updateHighScore() {
    if (score > highScore) {
        highScore = score;
        saveHighScore(highScore);
    }
}

// プレイヤークラス
class Player {
    constructor(x, y, isPlayer = false, team = 'ally') {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.velocityY = 0;
        this.gravity = 0.6;
        this.jumpPower = -15;
        this.isJumping = false;
        this.isPlayer = isPlayer;
        this.team = team; // 'ally' or 'enemy'
        this.groundY = 350;
        this.alive = true;
        this.aiJumpCooldown = 0;
        // 二段ジャンプ関連
        this.hasDoubleJump = false;
        this.doubleJumpUsed = false;
        this.doubleJumpTimer = 0; // 30秒 = 1800フレーム
        // シールド関連
        this.hasShield = false;
        // スターパワー関連
        this.hasStarPower = false;
        this.starPowerTimer = 0; // 10秒 = 600フレーム
        // アニメーション用
        this.animationFrame = 0;
        this.runPhase = 0;
        this.scaleX = 1;
        this.scaleY = 1;
        this.stompCombo = 0;
    }

    stretch(scaleX, scaleY) {
        this.scaleX = scaleX;
        this.scaleY = scaleY;
    }

    get feetY() {
        return this.y + this.height + 8;
    }

    jump() {
        if (!this.alive) return;

        // 地上からのジャンプ
        if (!this.isJumping) {
            this.velocityY = this.jumpPower;
            this.isJumping = true;
            this.doubleJumpUsed = false;
            this.stretch(0.75, 1.3);
            landingDust(this.x + this.width / 2, this.feetY);
            playJumpSound();
        }
        // 空中での二段ジャンプ
        else if (this.hasDoubleJump && !this.doubleJumpUsed) {
            this.velocityY = this.jumpPower;
            this.doubleJumpUsed = true;
            this.stretch(0.75, 1.3);
            jumpRing(this.x + this.width / 2, this.feetY);
            playJumpSound();
        }
    }

    update(obstacles = []) {
        if (!this.alive) return;

        // アニメーションフレームを更新
        this.animationFrame++;

        // 重力適用
        this.velocityY += this.gravity;
        this.y += this.velocityY;

        // 坂道や段差の上に乗れるかチェック
        let currentGroundY = this.groundY;
        for (const obstacle of obstacles) {
            const result = obstacle.canStandOn(this.x, this.y, this.width, this.height);
            if (result.canStand) {
                currentGroundY = result.groundY;
                break;
            }
        }

        // 地面判定
        const grounded = this.y > currentGroundY;
        if (grounded) {
            if (this.isJumping) {
                this.stretch(1.35, 0.7);
                landingDust(this.x + this.width / 2, this.feetY);
            }
            this.stompCombo = 0;
            this.y = currentGroundY;
            this.velocityY = 0;
            this.isJumping = false;
        }

        this.scaleX += (1 - this.scaleX) * 0.2;
        this.scaleY += (1 - this.scaleY) * 0.2;

        if (!grounded) {
            this.stretch(this.scaleX, Math.max(this.scaleY, 1 + Math.min(Math.abs(this.velocityY) * 0.012, 0.15)));
        } else {
            this.runPhase += 0.18 + gameSpeed * 0.04;
            if (this.isPlayer && this.animationFrame % 6 === 0) {
                runDust(this.x + 4, this.feetY);
            }
        }

        // 二段ジャンプタイマー処理
        if (this.hasDoubleJump && this.doubleJumpTimer > 0) {
            this.doubleJumpTimer--;
            if (this.doubleJumpTimer <= 0) {
                this.hasDoubleJump = false;
                if (currentBgmType === 'happy') {
                    switchBgm('normal');
                }
            }
        }

        // スターパワータイマー処理
        if (this.hasStarPower && this.starPowerTimer > 0) {
            this.starPowerTimer--;
            if (this.starPowerTimer <= 0) {
                this.hasStarPower = false;
            }
        }

        // AI判断
        if (!this.isPlayer && this.aiJumpCooldown > 0) {
            this.aiJumpCooldown--;
        }
    }

    draw() {
        if (!this.alive) return;

        // シールドエフェクト
        if (this.isPlayer && this.hasShield) {
            ctx.strokeStyle = '#00BFFF';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height / 2, 25, 0, Math.PI * 2);
            ctx.stroke();

            // 内側の円
            ctx.strokeStyle = '#87CEEB';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height / 2, 20, 0, Math.PI * 2);
            ctx.stroke();
        }

        // スターパワーエフェクト
        if (this.isPlayer && this.hasStarPower) {
            // 虹色のオーラ
            const time = Date.now() / 100;
            const colors = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'];
            const colorIndex = Math.floor(time) % colors.length;

            ctx.strokeStyle = colors[colorIndex];
            ctx.lineWidth = 4;
            ctx.shadowBlur = 15;
            ctx.shadowColor = colors[colorIndex];
            ctx.strokeRect(this.x - 5, this.y - 5, this.width + 10, this.height + 10);
            ctx.shadowBlur = 0;
        }

        // 二段ジャンプ可能な場合は翼を表示
        if (this.isPlayer && this.hasDoubleJump) {
            ctx.fillStyle = '#FFD700';
            // 左の翼
            ctx.beginPath();
            ctx.moveTo(this.x, this.y + 15);
            ctx.lineTo(this.x - 10, this.y + 5);
            ctx.lineTo(this.x - 10, this.y + 25);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#FFA500';
            ctx.lineWidth = 1;
            ctx.stroke();
            // 右の翼
            ctx.beginPath();
            ctx.moveTo(this.x + this.width, this.y + 15);
            ctx.lineTo(this.x + this.width + 10, this.y + 5);
            ctx.lineTo(this.x + this.width + 10, this.y + 25);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        const cx = this.x + this.width / 2;
        const bob = this.isJumping ? 0 : -Math.abs(Math.sin(this.runPhase)) * 3;
        const lean = this.isJumping ? Math.max(Math.min(this.velocityY * 0.02, 0.25), -0.25) : 0.12;
        ctx.save();
        ctx.translate(cx, this.feetY + bob);
        ctx.rotate(lean);
        ctx.scale(this.scaleX, this.scaleY);
        ctx.translate(-cx, -this.feetY);

        const limbColor = this.team === 'ally' ? '#006400' : '#8B0000';
        const swing = Math.sin(this.runPhase);
        ctx.strokeStyle = limbColor;
        ctx.lineCap = 'round';
        ctx.lineWidth = 5;
        const hipY = this.y + this.height - 2;
        for (const [hipX, phase] of [[this.x + 9, swing], [this.x + 21, -swing]]) {
            ctx.beginPath();
            ctx.moveTo(hipX, hipY);
            if (this.isJumping) {
                ctx.lineTo(hipX - 6, hipY + 5);
                ctx.lineTo(hipX - 2, hipY + 10);
            } else {
                const footX = hipX + phase * 9;
                const kneeLift = Math.max(phase, 0) * 5;
                ctx.lineTo(hipX + phase * 5, hipY + 6 - kneeLift);
                ctx.lineTo(footX, hipY + 10 - kneeLift);
            }
            ctx.stroke();
        }

        // キャラクター本体
        if (this.team === 'ally') {
            ctx.fillStyle = this.isPlayer ? '#00ff00' : '#90EE90';
        } else {
            ctx.fillStyle = '#ff4444';
        }
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);

        ctx.fillStyle = '#fff';
        ctx.fillRect(this.x + 9, this.y + 7, 7, 7);
        ctx.fillRect(this.x + 19, this.y + 7, 7, 7);
        ctx.fillStyle = '#000';
        const pupilY = this.isJumping && this.velocityY < 0 ? this.y + 8 : this.y + 10;
        ctx.fillRect(this.x + 12, pupilY, 3, 3);
        ctx.fillRect(this.x + 22, pupilY, 3, 3);

        ctx.fillStyle = '#000';
        if (this.isJumping) {
            ctx.beginPath();
            ctx.arc(this.x + 20, this.y + 21, 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(this.x + 16, this.y + 20, 8, 2);
        }

        ctx.strokeStyle = limbColor;
        ctx.lineWidth = 4;
        const shoulderY = this.y + 14;
        if (this.isJumping) {
            for (const shoulderX of [this.x + 2, this.x + 28]) {
                ctx.beginPath();
                ctx.moveTo(shoulderX, shoulderY);
                ctx.lineTo(shoulderX + (shoulderX < cx ? -6 : 6), shoulderY - 12);
                ctx.stroke();
            }
        } else {
            for (const [shoulderX, phase] of [[this.x + 2, -swing], [this.x + 28, swing]]) {
                ctx.beginPath();
                ctx.moveTo(shoulderX, shoulderY);
                ctx.lineTo(shoulderX + phase * 8, shoulderY + 9 - Math.abs(phase) * 3);
                ctx.stroke();
            }
        }
        ctx.lineCap = 'butt';
        ctx.restore();

        // プレイヤー表示
        if (this.isPlayer) {
            ctx.fillStyle = '#000';
            ctx.font = '12px Arial';
            ctx.fillText('YOU', this.x + 3, this.y - 5);
        }
    }
}

// 障害物クラス
class Obstacle {
    constructor(type) {
        this.type = type; // 'hole', 'block', 'slope_up', 'slope_down', 'step'
        this.x = view.width;

        if (type === 'hole') {
            this.width = 80;
            this.height = 60;
            this.y = 360;
        } else if (type === 'block') {
            this.width = 40;
            this.height = 40;
            this.y = 310;
        } else if (type === 'slope_up' || type === 'slope_down') {
            this.width = 180;
            this.height = 90;
            this.y = 270;
        } else if (type === 'step') {
            this.width = 60;
            this.height = 80;
            this.y = 280;
        }
    }

    update() {
        this.x -= gameSpeed;
    }

    draw() {
        if (this.type === 'hole') {
            ctx.fillStyle = '#333';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        } else if (this.type === 'block') {
            // より明るく目立つオレンジ色
            ctx.fillStyle = '#FF8C00';
            ctx.fillRect(this.x, this.y, this.width, this.height);

            // 白い内側の枠で立体感を出す
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x + 2, this.y + 2, this.width - 4, this.height - 4);

            // 黒い外枠
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
        } else if (this.type === 'slope_up') {
            // 登り坂
            ctx.fillStyle = '#4169E1';
            ctx.beginPath();
            ctx.moveTo(this.x, 360);
            ctx.lineTo(this.x + this.width, this.y);
            ctx.lineTo(this.x + this.width, 360);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else if (this.type === 'slope_down') {
            // 下り坂
            ctx.fillStyle = '#4169E1';
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x + this.width, 360);
            ctx.lineTo(this.x, 360);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else if (this.type === 'step') {
            // 段差
            ctx.fillStyle = '#CD853F';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);

            // 段差の線
            for (let i = 1; i < 4; i++) {
                const lineY = this.y + (this.height / 4) * i;
                ctx.strokeStyle = '#8B4513';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(this.x, lineY);
                ctx.lineTo(this.x + this.width, lineY);
                ctx.stroke();
            }
        }
    }

    isOffScreen() {
        return this.x + this.width < 0;
    }

    // 坂道や段差の上に乗れるかチェック
    canStandOn(playerX, playerY, playerWidth, playerHeight) {
        if (this.type === 'slope_up' || this.type === 'slope_down' || this.type === 'step') {
            const playerBottom = playerY + playerHeight;
            const playerCenterX = playerX + playerWidth / 2;

            if (playerCenterX >= this.x && playerCenterX <= this.x + this.width) {
                if (this.type === 'slope_up') {
                    // 登り坂の高さ計算
                    const progress = (playerCenterX - this.x) / this.width;
                    const slopeTop = 360 - (this.height * progress);
                    return { canStand: true, groundY: slopeTop };
                } else if (this.type === 'slope_down') {
                    // 下り坂の高さ計算
                    const progress = (playerCenterX - this.x) / this.width;
                    const slopeTop = this.y + (this.height * progress);
                    return { canStand: true, groundY: slopeTop };
                } else if (this.type === 'step') {
                    // 段差の上
                    return { canStand: true, groundY: this.y };
                }
            }
        }
        return { canStand: false };
    }
}

// 敵クラス
class Enemy {
    constructor(type) {
        this.type = type; // 'walker', 'flyer', 'shooter'
        this.x = view.width;
        this.width = 30;
        this.height = 30;
        this.alive = true;
        this.animationFrame = 0;

        if (type === 'walker') {
            this.y = 330; // 地面の上
            this.speed = gameSpeed + 1;
            this.color = '#8B0000'; // ダークレッド
        } else if (type === 'flyer') {
            this.y = 200; // 空中
            this.speed = gameSpeed + 0.5;
            this.amplitude = 40; // 上下の振れ幅
            this.frequency = 0.05; // 上下の速さ
            this.offset = 0;
            this.baseY = 200; // 基準Y座標
            this.color = '#4B0082'; // インディゴ（空中敵）
            this.width = 35;
            this.height = 25;
        } else if (type === 'shooter') {
            this.y = 330; // 地面の上
            this.speed = gameSpeed * 0.8;
            this.shootCooldown = 0;
            this.shootInterval = 100; // フレーム数
            this.color = '#8B008B'; // ダークマゼンタ
            this.width = 35;
        }
    }

    update() {
        this.x -= this.speed;
        this.animationFrame++;

        if (this.type === 'flyer') {
            // 上下に波打つ動き
            this.offset += this.frequency;
            this.y = this.baseY + Math.sin(this.offset) * this.amplitude;
        } else if (this.type === 'shooter') {
            // 射撃のクールダウン
            if (this.shootCooldown > 0) {
                this.shootCooldown--;
            } else if (this.x < 700 && this.x > 100) {
                // プレイヤーが射程内にいる場合のみ発射
                this.shoot();
                this.shootCooldown = this.shootInterval;
            }
        }
    }

    shoot() {
        // プレイヤーに向かって弾を発射
        const bullet = new Bullet(this.x, this.y + this.height / 2);
        bullet.setTargetVelocity(player.x + player.width / 2, player.y + player.height / 2);
        bullets.push(bullet);
    }

    draw() {
        if (!this.alive) return;

        if (this.type === 'walker') {
            // 地上を歩く敵 - トゲトゲの怪物風
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);

            // 枠線
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);

            // トゲを追加
            ctx.fillStyle = '#FF0000';
            for (let i = 0; i < 4; i++) {
                const spikeX = this.x + i * 8 + 3;
                ctx.beginPath();
                ctx.moveTo(spikeX, this.y);
                ctx.lineTo(spikeX + 3, this.y - 5);
                ctx.lineTo(spikeX + 6, this.y);
                ctx.closePath();
                ctx.fill();
            }

            // 怖い目
            ctx.fillStyle = '#ffff00';
            ctx.fillRect(this.x + 6, this.y + 10, 6, 6);
            ctx.fillRect(this.x + 18, this.y + 10, 6, 6);
            ctx.fillStyle = '#000';
            ctx.fillRect(this.x + 8, this.y + 12, 3, 3);
            ctx.fillRect(this.x + 20, this.y + 12, 3, 3);

            // 歩行アニメーション用の足
            const legOffset = Math.floor(this.animationFrame / 8) % 2 === 0 ? 3 : -3;
            ctx.fillStyle = '#8B0000';
            ctx.fillRect(this.x + 5 + legOffset, this.y + this.height, 6, 8);
            ctx.fillRect(this.x + 19 - legOffset, this.y + this.height, 6, 8);

        } else if (this.type === 'flyer') {
            // 空飛ぶ敵 - コウモリ風
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x + 7, this.y + 7, 21, 18);

            // 枠線
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x + 7, this.y + 7, 21, 18);

            // 羽（アニメーション）
            const wingFlap = Math.sin(this.animationFrame * 0.3) * 8;
            ctx.fillStyle = '#9370DB';

            // 左の羽
            ctx.beginPath();
            ctx.moveTo(this.x + 7, this.y + 12);
            ctx.lineTo(this.x - 5, this.y + 5 - wingFlap);
            ctx.lineTo(this.x, this.y + 20);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();

            // 右の羽
            ctx.fillStyle = '#9370DB';
            ctx.beginPath();
            ctx.moveTo(this.x + 28, this.y + 12);
            ctx.lineTo(this.x + 40, this.y + 5 - wingFlap);
            ctx.lineTo(this.x + 35, this.y + 20);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 赤い目
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(this.x + 12, this.y + 12, 4, 4);
            ctx.fillRect(this.x + 19, this.y + 12, 4, 4);

        } else if (this.type === 'shooter') {
            // 射撃敵 - ロボット風
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);

            // 枠線
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);

            // ロボットのアンテナ
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.x + this.width / 2, this.y);
            ctx.lineTo(this.x + this.width / 2, this.y - 8);
            ctx.stroke();
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y - 8, 3, 0, Math.PI * 2);
            ctx.fill();

            // デジタルな目（点滅）
            const blinkOn = Math.floor(this.animationFrame / 15) % 2 === 0;
            ctx.fillStyle = blinkOn ? '#00ff00' : '#003300';
            ctx.fillRect(this.x + 7, this.y + 10, 8, 8);
            ctx.fillRect(this.x + 20, this.y + 10, 8, 8);

            // 銃口
            ctx.fillStyle = '#333';
            ctx.fillRect(this.x - 10, this.y + this.height / 2 - 3, 12, 6);
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(this.x - 10, this.y + this.height / 2 - 1, 12, 2);
        }
    }

    isOffScreen() {
        return this.x + this.width < 0;
    }
}

// 弾クラス
class Bullet {
    constructor(x, y, direction = -1, useGravity = false) {
        this.x = x;
        this.y = y;
        this.width = 12; // 8から12に拡大（視認性向上）
        this.height = 12; // 8から12に拡大（視認性向上）
        this.speed = 6;
        this.alive = true;
        this.useGravity = useGravity;
        this.gravity = 0.4;

        // direction: -1 = 左, 1 = 右
        this.velocityX = this.speed * direction;
        this.velocityY = 0;
    }

    // プレイヤーに向かって飛ぶ弾を作成
    setTargetVelocity(targetX, targetY) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 正規化して速度を設定
        this.velocityX = (dx / distance) * this.speed;
        this.velocityY = (dy / distance) * this.speed;
    }

    // 放物線を描く弾（上向きの初速を設定）
    setArcVelocity(horizontalSpeed, verticalSpeed) {
        this.velocityX = horizontalSpeed;
        this.velocityY = verticalSpeed;
        this.useGravity = true;
    }

    update() {
        this.x += this.velocityX;
        this.y += this.velocityY;

        // 重力を適用
        if (this.useGravity) {
            this.velocityY += this.gravity;
        }
    }

    draw() {
        if (!this.alive) return;

        // 外側のグロー効果（視認性向上）
        ctx.fillStyle = 'rgba(255, 255, 0, 0.5)'; // 黄色のグロー
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2 + 4, 0, Math.PI * 2);
        ctx.fill();

        // 外側の影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.arc(this.x + 2, this.y + 2, this.width / 2 + 1, 0, Math.PI * 2);
        ctx.fill();

        // 弾本体（オレンジ色で目立つように）
        ctx.fillStyle = '#FF4500';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
        ctx.fill();

        // 白いハイライト（立体感）
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(this.x - 2, this.y - 2, this.width / 3, 0, Math.PI * 2);
        ctx.fill();

        // 太い黒い縁取り
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3; // 2から3に拡大
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    isOffScreen() {
        return this.x < 0 || this.x > view.width || this.y < view.top || this.y > view.bottom;
    }
}

// 爆弾クラス
class Bomb {
    constructor(x, y, direction = -1) {
        this.width = 28;
        this.height = 28;
        // checkCollision は x, y を左上として扱うため、中心座標で受け取った位置を左上に直す
        this.x = x - this.width / 2;
        this.y = y - this.height / 2;
        this.speed = 2.5;
        this.alive = true;
        this.reflected = false; // ボスに向かっているか

        // direction: -1 = 左, 1 = 右
        this.velocityX = this.speed * direction;
        this.velocityY = 0;
        this.animationOffset = 0;
    }

    update() {
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.animationOffset += 0.2;
    }

    // ボスに向かって飛ぶ
    reflectToBoss(boss) {
        this.reflected = true;
        // ボスの中心に向かう速度を計算
        const dx = (boss.x + boss.width / 2) - (this.x + this.width / 2);
        const dy = (boss.y + boss.height / 2) - (this.y + this.height / 2);
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 正規化して速度を設定（より速く）
        this.velocityX = (dx / distance) * 8;
        this.velocityY = (dy / distance) * 8;
    }

    draw() {
        if (!this.alive) return;

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const r = this.width / 2;

        // 爆弾本体（黒い球）
        ctx.fillStyle = this.reflected ? '#ff8800' : '#333';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // 枠線
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(cx - r / 3, cy - r / 3, r / 3, 0, Math.PI * 2);
        ctx.fill();

        // 導火線
        const fuseX = cx + Math.sin(this.animationOffset) * 6;
        const fuseY = this.y - 10;
        ctx.strokeStyle = this.reflected ? '#00ff00' : '#ff0000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, this.y);
        ctx.lineTo(fuseX, fuseY);
        ctx.stroke();

        // 火花
        if (Math.floor(this.animationOffset) % 2 === 0) {
            ctx.fillStyle = this.reflected ? '#00ff00' : '#ffff00';
            ctx.beginPath();
            ctx.arc(fuseX, fuseY, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    isOffScreen() {
        return this.x < -50 || this.x > view.width + 50 || this.y < view.top - 50 || this.y > view.bottom + 50;
    }
}

// ボスクラス
class Boss {
    constructor(level) {
        this.level = level;
        this.y = 280;
        this.width = 80;
        this.height = 80;
        this.alive = true;
        // 固定の中心±200 だと狭い画面で右端からはみ出すため、画面幅から移動範囲を決める
        const minX = 180;
        const maxX = Math.max(view.width - this.width - 20, minX);
        this.x = (minX + maxX) / 2;

        // HPは常に3（爆弾3発で倒せる）
        this.maxHp = 3;
        this.hp = this.maxHp;
        this.speed = 1 + level * 0.3; // 1.3, 1.6, 1.9...

        this.direction = 1; // 1: 右, -1: 左
        this.moveRange = Math.min(200, (maxX - minX) / 2);
        this.centerX = this.x;

        // 攻撃関連
        this.attackCooldown = 0;
        this.attackInterval = Math.max(100 - level * 10, 60); // レベルが上がると攻撃頻度増加（難易度調整）

        // アニメーション用
        this.animationOffset = 0;

        // 無敵時間（爆弾を当てた直後）
        this.invincibleTimer = 0;
    }

    update() {
        // 左右に移動
        this.x += this.speed * this.direction;

        // 移動範囲を超えたら反転
        if (this.x > this.centerX + this.moveRange) {
            this.direction = -1;
        } else if (this.x < this.centerX - this.moveRange) {
            this.direction = 1;
        }

        // 地面判定
        if (this.y < 280) {
            this.y = 280;
        }

        // アニメーション
        this.animationOffset += 0.1;

        // 無敵時間の更新
        if (this.invincibleTimer > 0) {
            this.invincibleTimer--;
        }

        // 攻撃のクールダウン
        if (this.attackCooldown > 0) {
            this.attackCooldown--;
        } else if (Math.random() < 0.015) {
            // ランダムで弾または爆弾を発射（難易度調整：0.02→0.015）
            this.shoot();
            this.attackCooldown = this.attackInterval;
        }
    }

    shoot() {
        const attackType = Math.random();

        if (attackType < 0.2) {
            // 20%: 爆弾を投げる（プレイヤーの方向に）
            bombs.push(new Bomb(this.x, this.y + this.height / 2));
        } else if (attackType < 0.5 && this.level > 3) {
            // 30%: プレイヤーに向かって直線的に飛ぶ弾（レベル4以降のみ）
            const bullet = new Bullet(this.x, this.y + this.height / 2);
            bullet.speed = 3;
            bullet.setTargetVelocity(player.x + player.width / 2, player.y + player.height / 2);
            bullets.push(bullet);
        } else if (attackType < 0.7) {
            // 20%: 放物線を描く弾（1発）
            const bullet = new Bullet(this.x, this.y + this.height / 2);
            bullet.speed = 3;
            // 左向き、上向きの初速を設定
            const horizontalSpeed = -3.5;
            const verticalSpeed = -8;
            bullet.setArcVelocity(horizontalSpeed, verticalSpeed);
            bullets.push(bullet);
        } else {
            // 30%: 扇状に広がる弾幕（2発、隙間をさらに広く）
            const baseAngle = Math.PI; // 左向き（180度）
            const spreadAngle = Math.PI * 0.6; // 108度の広がり

            for (let i = 0; i < 2; i++) {
                const bullet = new Bullet(this.x, this.y + this.height / 2);
                bullet.speed = 3;
                // 扇状に角度を付けて発射
                const angle = baseAngle - spreadAngle / 2 + spreadAngle * i;
                bullet.velocityX = Math.cos(angle) * bullet.speed;
                bullet.velocityY = Math.sin(angle) * bullet.speed;
                bullets.push(bullet);
            }
        }
    }

    takeDamage() {
        if (this.invincibleTimer > 0) return false;

        this.hp--;
        this.invincibleTimer = 30; // 0.5秒の無敵時間

        if (this.hp <= 0) {
            this.alive = false;
            return true; // ボス撃破
        }
        return false;
    }

    draw() {
        if (!this.alive) return;

        // 無敵時間中は点滅
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 5) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // レベルごとに異なる見た目
        if (this.level === 1) {
            // レベル1: 赤い悪魔風
            ctx.fillStyle = '#8B0000';
            ctx.fillRect(this.x, this.y, this.width, this.height);

            // 枠線
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeRect(this.x, this.y, this.width, this.height);

            // 角（悪魔風）
            ctx.fillStyle = '#FF0000';
            // 左角
            ctx.beginPath();
            ctx.moveTo(this.x + 15, this.y);
            ctx.lineTo(this.x + 10, this.y - 15);
            ctx.lineTo(this.x + 20, this.y);
            ctx.closePath();
            ctx.fill();
            // 右角
            ctx.beginPath();
            ctx.moveTo(this.x + 65, this.y);
            ctx.lineTo(this.x + 60, this.y - 15);
            ctx.lineTo(this.x + 70, this.y);
            ctx.closePath();
            ctx.fill();

            // 燃えるような目
            ctx.fillStyle = '#ffff00';
            const eyeSize = 12;
            ctx.fillRect(this.x + 15, this.y + 25, eyeSize, eyeSize);
            ctx.fillRect(this.x + 53, this.y + 25, eyeSize, eyeSize);
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(this.x + 19, this.y + 29, 4, 4);
            ctx.fillRect(this.x + 57, this.y + 29, 4, 4);

            // 牙
            ctx.fillStyle = '#fff';
            for (let i = 0; i < 5; i++) {
                const fangX = this.x + 10 + i * 15;
                ctx.beginPath();
                ctx.moveTo(fangX, this.y + 55);
                ctx.lineTo(fangX + 4, this.y + 68);
                ctx.lineTo(fangX + 8, this.y + 55);
                ctx.closePath();
                ctx.fill();
            }

        } else if (this.level === 2) {
            // レベル2: 紫の機械風ボス
            ctx.fillStyle = '#4B0082';
            ctx.fillRect(this.x, this.y, this.width, this.height);

            // 枠線
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeRect(this.x, this.y, this.width, this.height);

            // メカニカルな装飾
            ctx.fillStyle = '#9370DB';
            ctx.fillRect(this.x + 5, this.y + 5, 10, 70);
            ctx.fillRect(this.x + 65, this.y + 5, 10, 70);

            // レーザー砲
            ctx.fillStyle = '#333';
            ctx.fillRect(this.x - 15, this.y + 20, 15, 8);
            ctx.fillRect(this.x - 15, this.y + 52, 15, 8);
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(this.x - 13, this.y + 22, 10, 4);
            ctx.fillRect(this.x - 13, this.y + 54, 10, 4);

            // デジタルな目
            ctx.fillStyle = '#00ff00';
            const eyeSize = 14;
            ctx.fillRect(this.x + 20, this.y + 25, eyeSize, eyeSize);
            ctx.fillRect(this.x + 46, this.y + 25, eyeSize, eyeSize);
            ctx.fillStyle = '#003300';
            ctx.fillRect(this.x + 23, this.y + 28, 8, 8);
            ctx.fillRect(this.x + 49, this.y + 28, 8, 8);

            // アンテナ
            ctx.strokeStyle = '#9370DB';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(this.x + 30, this.y);
            ctx.lineTo(this.x + 25, this.y - 20);
            ctx.moveTo(this.x + 50, this.y);
            ctx.lineTo(this.x + 55, this.y - 20);
            ctx.stroke();
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(this.x + 25, this.y - 20, 4, 0, Math.PI * 2);
            ctx.arc(this.x + 55, this.y - 20, 4, 0, Math.PI * 2);
            ctx.fill();

        } else {
            // レベル3以上: 黒い影風の最強ボス
            ctx.fillStyle = '#000000';
            ctx.fillRect(this.x, this.y, this.width, this.height);

            // 紫のオーラ
            ctx.strokeStyle = '#8B00FF';
            ctx.lineWidth = 4;
            ctx.strokeRect(this.x - 5, this.y - 5, this.width + 10, this.height + 10);

            // 枠線
            ctx.strokeStyle = '#8B00FF';
            ctx.lineWidth = 3;
            ctx.strokeRect(this.x, this.y, this.width, this.height);

            // 暗黒のオーラエフェクト
            const time = Date.now() / 100;
            const auraOffset = Math.sin(time) * 3;
            ctx.strokeStyle = '#8B00FF';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x - auraOffset, this.y - auraOffset, this.width + auraOffset * 2, this.height + auraOffset * 2);

            // 不気味な赤い目
            ctx.fillStyle = '#ff0000';
            const eyeSize = 16;
            ctx.fillRect(this.x + 18, this.y + 25, eyeSize, eyeSize);
            ctx.fillRect(this.x + 46, this.y + 25, eyeSize, eyeSize);

            // 瞳孔
            ctx.fillStyle = '#000';
            ctx.fillRect(this.x + 22, this.y + 29, 8, 8);
            ctx.fillRect(this.x + 50, this.y + 29, 8, 8);

            // 暗黒の炎
            ctx.fillStyle = '#8B00FF';
            for (let i = 0; i < 6; i++) {
                const flameX = this.x + 10 + i * 12;
                const flameHeight = 15 + Math.sin(time + i) * 5;
                ctx.beginPath();
                ctx.moveTo(flameX, this.y);
                ctx.lineTo(flameX + 5, this.y - flameHeight);
                ctx.lineTo(flameX + 10, this.y);
                ctx.closePath();
                ctx.fill();
            }

            // 鋭い牙
            ctx.fillStyle = '#fff';
            for (let i = 0; i < 6; i++) {
                const fangX = this.x + 8 + i * 13;
                ctx.beginPath();
                ctx.moveTo(fangX, this.y + 58);
                ctx.lineTo(fangX + 4, this.y + 73);
                ctx.lineTo(fangX + 8, this.y + 58);
                ctx.closePath();
                ctx.fill();
            }
        }

        // ボスレベル表示
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText('BOSS Lv.' + this.level, this.x + 5, this.y - 35);
        ctx.fillText('BOSS Lv.' + this.level, this.x + 5, this.y - 35);

        // HPゲージの背景
        const hpBarWidth = this.width;
        const hpBarHeight = 10;
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x, this.y - 20, hpBarWidth, hpBarHeight);

        // HPゲージ
        const hpPercentage = this.hp / this.maxHp;
        const currentHpWidth = hpBarWidth * hpPercentage;

        // HPの残量に応じて色を変更
        if (hpPercentage > 0.6) {
            ctx.fillStyle = '#00ff00';
        } else if (hpPercentage > 0.3) {
            ctx.fillStyle = '#ffff00';
        } else {
            ctx.fillStyle = '#ff0000';
        }
        ctx.fillRect(this.x, this.y - 20, currentHpWidth, hpBarHeight);

        // HPゲージの枠
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y - 20, hpBarWidth, hpBarHeight);

        ctx.globalAlpha = 1.0;
    }
}

// アイテムクラス
class Item {
    constructor(type) {
        this.type = type; // 'wing', 'shield', 'star'
        this.x = view.width;
        this.width = 30;
        this.height = 30;
        this.y = 250; // 空中に浮かぶ
        this.speed = gameSpeed;
        this.alive = true;
        this.bobOffset = 0; // 上下に揺れる動き用
    }

    update() {
        this.x -= this.speed;
        // ふわふわと上下に揺れる
        this.bobOffset += 0.1;
        this.y = 250 + Math.sin(this.bobOffset) * 10;
    }

    draw() {
        if (!this.alive) return;

        if (this.type === 'wing') {
            // 翼のアイテム
            ctx.fillStyle = '#FFD700'; // 金色
            ctx.fillRect(this.x, this.y, this.width, this.height);

            // キラキラ効果
            ctx.strokeStyle = '#FFA500';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);

            // 翼の絵
            ctx.fillStyle = '#fff';
            // 左の翼
            ctx.beginPath();
            ctx.moveTo(this.x + 8, this.y + 15);
            ctx.lineTo(this.x + 2, this.y + 8);
            ctx.lineTo(this.x + 2, this.y + 22);
            ctx.closePath();
            ctx.fill();
            // 右の翼
            ctx.beginPath();
            ctx.moveTo(this.x + 22, this.y + 15);
            ctx.lineTo(this.x + 28, this.y + 8);
            ctx.lineTo(this.x + 28, this.y + 22);
            ctx.closePath();
            ctx.fill();

            // 中央の丸
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(this.x + 15, this.y + 15, 5, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'shield') {
            // シールドのアイテム
            ctx.fillStyle = '#00BFFF'; // 青色
            ctx.fillRect(this.x, this.y, this.width, this.height);

            // 枠線
            ctx.strokeStyle = '#0000CD';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);

            // シールドの絵
            ctx.fillStyle = '#87CEEB';
            ctx.beginPath();
            ctx.arc(this.x + 15, this.y + 15, 10, 0, Math.PI * 2);
            ctx.fill();

            // シールドの線
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x + 15, this.y + 15, 10, 0, Math.PI * 2);
            ctx.stroke();

            // 十字マーク
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.x + 15, this.y + 8);
            ctx.lineTo(this.x + 15, this.y + 22);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(this.x + 8, this.y + 15);
            ctx.lineTo(this.x + 22, this.y + 15);
            ctx.stroke();
        } else if (this.type === 'star') {
            // スターパワーのアイテム
            ctx.fillStyle = '#FFD700'; // 金色
            ctx.fillRect(this.x, this.y, this.width, this.height);

            // 虹色の枠線
            const time = Date.now() / 100;
            const colors = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'];
            const colorIndex = Math.floor(time) % colors.length;
            ctx.strokeStyle = colors[colorIndex];
            ctx.lineWidth = 3;
            ctx.strokeRect(this.x, this.y, this.width, this.height);

            // 星の絵
            ctx.fillStyle = '#fff';
            const centerX = this.x + 15;
            const centerY = this.y + 15;
            const spikes = 5;
            const outerRadius = 12;
            const innerRadius = 5;

            ctx.beginPath();
            for (let i = 0; i < spikes * 2; i++) {
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                const angle = (i * Math.PI) / spikes - Math.PI / 2;
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    isOffScreen() {
        return this.x + this.width < 0;
    }
}

// 背景要素クラス
class Cloud {
    constructor(x = view.width) {
        this.x = x;
        this.y = 50 + Math.random() * 100; // 50-150の高さにランダム配置
        this.width = 60 + Math.random() * 40; // 60-100のランダムな幅
        this.height = 30 + Math.random() * 20; // 30-50のランダムな高さ
        this.speedMultiplier = 0.2; // 速度倍率
    }

    update() {
        this.x -= gameSpeed * this.speedMultiplier;
    }

    draw() {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        // 雲を3つの円で描画
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.height / 2, 0, Math.PI * 2);
        ctx.arc(this.x + this.width / 3, this.y - this.height / 4, this.height / 1.5, 0, Math.PI * 2);
        ctx.arc(this.x + this.width / 1.5, this.y, this.height / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    isOffScreen() {
        return this.x + this.width < 0;
    }
}

class Mountain {
    constructor(x = view.width) {
        this.x = x;
        this.width = 150 + Math.random() * 100; // 150-250のランダムな幅
        this.height = 120 + Math.random() * 80; // 120-200のランダムな高さ
        this.y = 360 - this.height; // 地面から上に伸びる
        this.speedMultiplier = 0.3; // 速度倍率
        this.color = '#8B7355'; // 茶色っぽい山
    }

    update() {
        this.x -= gameSpeed * this.speedMultiplier;
    }

    draw() {
        // 山を三角形で描画
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(this.x, 360);
        ctx.lineTo(this.x + this.width / 2, this.y);
        ctx.lineTo(this.x + this.width, 360);
        ctx.closePath();
        ctx.fill();

        // 山頂に雪を追加
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y);
        ctx.lineTo(this.x + this.width / 2 - 20, this.y + 30);
        ctx.lineTo(this.x + this.width / 2 + 20, this.y + 30);
        ctx.closePath();
        ctx.fill();
    }

    isOffScreen() {
        return this.x + this.width < 0;
    }
}

class Tree {
    constructor(x = view.width) {
        this.x = x;
        this.y = 310; // 地面の少し上
        this.width = 40;
        this.height = 50;
        this.speedMultiplier = 0.8; // 速度倍率
    }

    update() {
        this.x -= gameSpeed * this.speedMultiplier;
    }

    draw() {
        // 木の幹
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(this.x + 15, this.y + 20, 10, 30);

        // 木の葉（3段の三角形）
        ctx.fillStyle = '#228B22';
        // 下段
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + 30);
        ctx.lineTo(this.x + 20, this.y + 10);
        ctx.lineTo(this.x + 40, this.y + 30);
        ctx.closePath();
        ctx.fill();
        // 中段
        ctx.beginPath();
        ctx.moveTo(this.x + 5, this.y + 20);
        ctx.lineTo(this.x + 20, this.y + 5);
        ctx.lineTo(this.x + 35, this.y + 20);
        ctx.closePath();
        ctx.fill();
        // 上段
        ctx.beginPath();
        ctx.moveTo(this.x + 10, this.y + 10);
        ctx.lineTo(this.x + 20, this.y);
        ctx.lineTo(this.x + 30, this.y + 10);
        ctx.closePath();
        ctx.fill();
    }

    isOffScreen() {
        return this.x + this.width < 0;
    }
}

class Coin {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 16;
        this.height = 16;
        this.spin = Math.random() * Math.PI;
    }

    update() {
        this.x -= gameSpeed;
        this.spin += 0.12;
    }

    draw() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const rx = Math.max(Math.abs(Math.cos(this.spin)) * 8, 1.5);
        ctx.fillStyle = '#FFC107';
        ctx.strokeStyle = '#8D6E00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (rx > 4) {
            ctx.fillStyle = '#FFF59D';
            ctx.fillRect(cx - rx / 3, cy - 4, Math.max(rx / 3, 1), 8);
        }
    }

    isOffScreen() {
        return this.x + this.width < 0;
    }
}

function spawnCoinArc(startX, width) {
    for (let i = 0; i < 5; i++) {
        const t = i / 4;
        coins.push(new Coin(startX - 30 + t * (width + 60), 320 - Math.sin(t * Math.PI) * 110));
    }
}

function spawnCoinRow() {
    for (let i = 0; i < 5; i++) {
        coins.push(new Coin(view.width + i * 28, 355));
    }
}

function hitBoss(x, y) {
    const defeated = boss.takeDamage();
    if (defeated) {
        const bossX = boss.x + boss.width / 2;
        const bossY = boss.y + boss.height / 2;
        explosionEffect(bossX, bossY, 2);
        starBurst(bossX, bossY, 14);
        addBanner('BOSS げきは!!');
        addScore(500, bossX, boss.y - 20);
        playBossDefeatSound();
        boss = null;
        switchBgm(bgmAfterBoss());
    } else {
        explosionEffect(x, y);
        addPopup(x, y - 30, 'HIT!', '#FF5252', 22);
        playStompSound();
    }
}

// ゲームオブジェクト
let player = null;
let coins = [];
let coinTimer = 0;
let nextMilestone = 1000;
let obstacles = [];
let enemies = [];
let bullets = [];
let bombs = [];
let items = [];
let boss = null;
let bossLevel = 0;
let nextBossScore = 3000; // 次にボスが出現するスコア

// 地面の模様クラス（スピード感を出すため）
class GroundLine {
    constructor(x = view.width) {
        this.x = x;
        this.y = 365 + Math.random() * 30; // 地面の上にランダムに配置
        this.width = 20 + Math.random() * 30;
        this.speedMultiplier = 1.0; // 地面と同じ速度
    }

    update() {
        this.x -= gameSpeed * this.speedMultiplier;
    }

    draw() {
        // 草の線を描画
        ctx.strokeStyle = '#7CFC00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.width / 4, this.y - 5);
        ctx.lineTo(this.x + this.width / 2, this.y);
        ctx.lineTo(this.x + this.width * 3 / 4, this.y - 5);
        ctx.lineTo(this.x + this.width, this.y);
        ctx.stroke();
    }

    isOffScreen() {
        return this.x + this.width < 0;
    }
}

// 背景要素
let clouds = [];
let mountains = [];
let trees = [];
let groundLines = [];
let backgroundTimer = 0;

// 音楽関連
let audioContext = null;
let masterGain = null;
let musicInterval = null;
let currentBgmType = 'normal'; // 'normal' または 'happy'

// 音楽の初期化
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.3; // 音量調整
        masterGain.connect(audioContext.destination);
    }
}

// 音を鳴らす関数
function playTone(frequency, duration, startTime, type = 'square') {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(0.1, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(masterGain);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
}

// ジャンプ音
function playJumpSound() {
    if (!audioContext) return;

    const currentTime = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(300, currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(600, currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.2, currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.15);

    oscillator.connect(gainNode);
    gainNode.connect(masterGain);

    oscillator.start(currentTime);
    oscillator.stop(currentTime + 0.15);
}

// 死亡音
function playDeathSound() {
    if (!audioContext) return;

    const currentTime = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(400, currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(100, currentTime + 0.5);

    gainNode.gain.setValueAtTime(0.3, currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.5);

    oscillator.connect(gainNode);
    gainNode.connect(masterGain);

    oscillator.start(currentTime);
    oscillator.stop(currentTime + 0.5);
}

// ゲーム開始音
function playStartSound() {
    if (!audioContext) return;

    const currentTime = audioContext.currentTime;

    // ファンファーレ風の3音階
    const notes = [
        { freq: 523.25, time: 0 },      // C5
        { freq: 659.25, time: 0.1 },    // E5
        { freq: 783.99, time: 0.2 }     // G5
    ];

    notes.forEach(note => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'square';
        oscillator.frequency.value = note.freq;

        const startTime = currentTime + note.time;
        gainNode.gain.setValueAtTime(0.2, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);

        oscillator.connect(gainNode);
        gainNode.connect(masterGain);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.3);
    });
}

// アイテム取得音
function playItemSound() {
    if (!audioContext) return;

    const currentTime = audioContext.currentTime;

    // キラキラした音
    const notes = [
        { freq: 1046.50, time: 0 },     // C6
        { freq: 1318.51, time: 0.05 },  // E6
        { freq: 1567.98, time: 0.1 }    // G6
    ];

    notes.forEach(note => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = note.freq;

        const startTime = currentTime + note.time;
        gainNode.gain.setValueAtTime(0.15, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);

        oscillator.connect(gainNode);
        gainNode.connect(masterGain);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.2);
    });
}

// 敵を踏んづけた時の効果音
function playStompSound(combo = 1) {
    if (!audioContext) return;

    const currentTime = audioContext.currentTime;
    const pitch = 1 + Math.min(combo - 1, 6) * 0.15;

    // ピコピコと弾むような音
    const notes = [
        { freq: 800 * pitch, time: 0 },
        { freq: 600 * pitch, time: 0.05 },
        { freq: 400 * pitch, time: 0.1 }
    ];

    notes.forEach(note => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'square';
        oscillator.frequency.value = note.freq;

        const startTime = currentTime + note.time;
        gainNode.gain.setValueAtTime(0.2, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.08);

        oscillator.connect(gainNode);
        gainNode.connect(masterGain);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.08);
    });
}

function playCoinSound() {
    if (!audioContext) return;
    const t = audioContext.currentTime;
    playTone(987.77, 0.07, t, 'square');
    playTone(1318.51, 0.2, t + 0.07, 'square');
}

// ボス撃破音
function playBossDefeatSound() {
    if (!audioContext) return;

    const currentTime = audioContext.currentTime;

    // 勝利のファンファーレ
    const notes = [
        { freq: 523.25, time: 0 },      // C5
        { freq: 659.25, time: 0.15 },   // E5
        { freq: 783.99, time: 0.3 },    // G5
        { freq: 1046.50, time: 0.45 }   // C6
    ];

    notes.forEach(note => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'square';
        oscillator.frequency.value = note.freq;

        const startTime = currentTime + note.time;
        gainNode.gain.setValueAtTime(0.3, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);

        oscillator.connect(gainNode);
        gainNode.connect(masterGain);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.3);
    });
}

// ボス出現音
function playBossAppearSound() {
    if (!audioContext) return;

    const currentTime = audioContext.currentTime;

    // 不気味な低い音
    const notes = [
        { freq: 100, time: 0 },
        { freq: 80, time: 0.2 },
        { freq: 120, time: 0.4 },
        { freq: 90, time: 0.6 }
    ];

    notes.forEach(note => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sawtooth';
        oscillator.frequency.value = note.freq;

        const startTime = currentTime + note.time;
        gainNode.gain.setValueAtTime(0.3, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);

        oscillator.connect(gainNode);
        gainNode.connect(masterGain);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.2);
    });
}

// 軽快なメロディーパターン（周波数配列）
const melodyPattern = [
    // C5, E5, G5, E5, C5, G4, C5, E5
    [523.25, 0.15], [659.25, 0.15], [783.99, 0.15], [659.25, 0.15],
    [523.25, 0.15], [392.00, 0.15], [523.25, 0.15], [659.25, 0.15],
    // D5, F5, A5, F5, D5, A4, D5, F5
    [587.33, 0.15], [698.46, 0.15], [880.00, 0.15], [698.46, 0.15],
    [587.33, 0.15], [440.00, 0.15], [587.33, 0.15], [698.46, 0.15]
];

// ベースラインパターン
const bassPattern = [
    [130.81, 0.3], [130.81, 0.3], [146.83, 0.3], [146.83, 0.3],
    [130.81, 0.3], [130.81, 0.3], [146.83, 0.3], [146.83, 0.3]
];

// BGM再生
function playMusic() {
    if (!audioContext) return;

    let noteIndex = 0;
    const beatDuration = 0.15; // 1音の長さ

    function playNextNote() {
        const currentTime = audioContext.currentTime;

        // メロディー
        const [melodyFreq, melodyDur] = melodyPattern[noteIndex % melodyPattern.length];
        playTone(melodyFreq, melodyDur, currentTime, 'square');

        // ベース（2拍ごと）
        if (noteIndex % 2 === 0) {
            const [bassFreq, bassDur] = bassPattern[Math.floor(noteIndex / 2) % bassPattern.length];
            playTone(bassFreq, bassDur, currentTime, 'triangle');
        }

        // リズム（ハイハット風）
        playTone(8000, 0.05, currentTime, 'square');

        noteIndex++;
    }

    // 定期的に音を鳴らす
    musicInterval = setInterval(playNextNote, beatDuration * 1000);
}

// BGM停止
function stopMusic() {
    if (musicInterval) {
        clearInterval(musicInterval);
        musicInterval = null;
    }
}

// ご機嫌なメロディーパターン（より明るくアップテンポ）
const happyMelodyPattern = [
    // C5, E5, G5, C6, G5, E5, C5, G5
    [523.25, 0.12], [659.25, 0.12], [783.99, 0.12], [1046.50, 0.12],
    [783.99, 0.12], [659.25, 0.12], [523.25, 0.12], [783.99, 0.12],
    // D5, F5, A5, D6, A5, F5, D5, A5
    [587.33, 0.12], [698.46, 0.12], [880.00, 0.12], [1174.66, 0.12],
    [880.00, 0.12], [698.46, 0.12], [587.33, 0.12], [880.00, 0.12]
];

// ご機嫌なベースパターン
const happyBassPattern = [
    [130.81, 0.24], [146.83, 0.24], [164.81, 0.24], [146.83, 0.24],
    [130.81, 0.24], [146.83, 0.24], [164.81, 0.24], [146.83, 0.24]
];

// ご機嫌なBGM再生
function playHappyMusic() {
    if (!audioContext) return;

    let noteIndex = 0;
    const beatDuration = 0.12; // より速いテンポ

    function playNextNote() {
        const currentTime = audioContext.currentTime;

        // メロディー（明るい音色）
        const [melodyFreq, melodyDur] = happyMelodyPattern[noteIndex % happyMelodyPattern.length];
        playTone(melodyFreq, melodyDur, currentTime, 'sine');

        // ベース（2拍ごと）
        if (noteIndex % 2 === 0) {
            const [bassFreq, bassDur] = happyBassPattern[Math.floor(noteIndex / 2) % happyBassPattern.length];
            playTone(bassFreq, bassDur, currentTime, 'triangle');
        }

        // リズム（より高い音でキラキラ感）
        playTone(10000, 0.04, currentTime, 'square');

        noteIndex++;
    }

    // 定期的に音を鳴らす
    musicInterval = setInterval(playNextNote, beatDuration * 1000);
}

const battleMelodyPattern = [
    440.00, 440.00, 523.25, 440.00, 587.33, 440.00, 659.25, 587.33,
    440.00, 440.00, 523.25, 440.00, 783.99, 698.46, 659.25, 587.33,
    440.00, 659.25, 880.00, 659.25, 698.46, 659.25, 587.33, 523.25,
    587.33, 523.25, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99,
];

const battleBassRoots = [110.00, 87.31, 98.00, 82.41];

function playBattleMusic() {
    if (!audioContext) return;

    let noteIndex = 0;
    const beatDuration = 0.11;

    function playNextNote() {
        const currentTime = audioContext.currentTime;

        playTone(battleMelodyPattern[noteIndex % battleMelodyPattern.length], beatDuration, currentTime, 'sawtooth');

        const root = battleBassRoots[Math.floor(noteIndex / 8) % battleBassRoots.length];
        playTone(noteIndex % 2 === 0 ? root : root * 2, beatDuration, currentTime, 'square');

        if (noteIndex % 4 === 0) {
            playTone(55, 0.12, currentTime, 'sine');
        } else if (noteIndex % 4 === 2) {
            playTone(6000, 0.04, currentTime, 'square');
        }

        noteIndex++;
    }

    musicInterval = setInterval(playNextNote, beatDuration * 1000);
}

const bgmPlayers = { normal: playMusic, happy: playHappyMusic, battle: playBattleMusic };

function switchBgm(type) {
    stopMusic();
    currentBgmType = type;
    bgmPlayers[type]();
}

function bgmAfterBoss() {
    return player.hasDoubleJump ? 'happy' : 'normal';
}

// 初期化
function init() {
    obstacles = [];
    enemies = [];
    bullets = [];
    bombs = [];
    items = [];
    coins = [];
    coinTimer = 0;
    nextMilestone = 1000;
    clearEffects();
    boss = null;
    bossLevel = 0;
    nextBossScore = 3000;
    score = 0;
    highScore = loadHighScore();
    gameSpeed = 2; // 3から2に変更（難易度を下げる）
    obstacleTimer = 0;
    backgroundTimer = 0;

    // プレイヤー1人
    player = new Player(100, 350, true, 'ally');

    // 背景要素の初期化
    clouds = [];
    mountains = [];
    trees = [];
    groundLines = [];

    // 初期の背景要素を配置
    for (let i = 0; i < 3; i++) {
        clouds.push(new Cloud(i * 300));
        mountains.push(new Mountain(i * 400));
        trees.push(new Tree(i * 200 + 50));
    }

    // 地面の模様を初期配置
    for (let i = 0; i < 10; i++) {
        groundLines.push(new GroundLine(i * 85));
    }

    // 音楽停止
    stopMusic();
    currentBgmType = 'normal';

    updateUI();
}

// UI更新
const scoreElement = document.getElementById('score');

function updateUI() {
    scoreElement.textContent = score;
    scoreElement.hidden = gameState !== 'playing';
}

function addScore(points, x, y, color = '#FFD700') {
    score += points;
    addPopup(x, y, `+${points}`, color);
    scoreElement.classList.remove('bump');
    // クラスを付け直すだけではアニメーションが再生されないため、リフローを挟む
    void scoreElement.offsetWidth;
    scoreElement.classList.add('bump');
    updateUI();
}

function rewardJumpOver(target) {
    if (target.passed || target.x + target.width >= player.x) return;
    target.passed = true;
    if (player.alive && player.isJumping) {
        addScore(10, target.x + target.width / 2, target.y - 10, '#FFFFFF');
    }
}

// 衝突判定
function checkCollision(player, obstacle) {
    return player.x < obstacle.x + obstacle.width &&
           player.x + player.width > obstacle.x &&
           player.y < obstacle.y + obstacle.height &&
           player.y + player.height > obstacle.y;
}

// 踏みつけ判定（上から敵を踏んだか）
function checkStomp(player, enemy) {
    // プレイヤーが敵に接触している
    if (!checkCollision(player, enemy)) {
        return false;
    }

    // プレイヤーの下辺が敵の上半分にある
    const playerBottom = player.y + player.height;
    const enemyTop = enemy.y;
    const enemyMiddle = enemy.y + enemy.height / 2;

    // プレイヤーが落下中（下向きの速度がある）で、敵の上半分に接触
    return player.velocityY > 0 && playerBottom < enemyMiddle;
}


function drawSky() {
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, view.top, view.width, view.bottom - view.top);
}

function drawGround() {
    ctx.fillStyle = '#90EE90';
    ctx.fillRect(0, GROUND_Y, view.width, WORLD_HEIGHT - GROUND_Y);
    ctx.fillStyle = '#8B5A2B';
    ctx.fillRect(0, WORLD_HEIGHT, view.width, view.bottom - WORLD_HEIGHT);
}

// 端末のリフレッシュレートや処理落ちに関係なく、ゲームは常に秒間 60 ステップで進める
const TICK_MS = 1000 / 60;
// タブ復帰時などに長時間分を一気に進めて即死しないよう、1 フレームで追いつく量に上限を設ける
const MAX_TICKS_PER_FRAME = 4;
let lastFrameAt = 0;
let tickBacklog = 0;

function startGameLoop() {
    lastFrameAt = performance.now();
    tickBacklog = 0;
    requestAnimationFrame(gameLoop);
}

function gameLoop(now) {
    tickBacklog = Math.min(tickBacklog + now - lastFrameAt, TICK_MS * MAX_TICKS_PER_FRAME);
    lastFrameAt = now;
    // 60Hz 画面で毎フレームの間隔がわずかに揺れても 0 回/2 回のステップにぶれないよう、半ステップ分を閾値にする
    while (tickBacklog > TICK_MS / 2 && gameState === 'playing') {
        tickBacklog -= TICK_MS;
        ctx = tickBacklog > TICK_MS / 2 ? nullCtx : screenCtx;
        tick();
    }
    ctx = screenCtx;

    if (gameState !== 'playing') {
        drawGameOver();
        return;
    }
    requestAnimationFrame(gameLoop);
}

function tick() {
    applyWorldTransform();

    drawSky();

    // 背景要素の生成
    backgroundTimer++;
    if (backgroundTimer > 80) {
        // 雲を追加
        if (Math.random() < 0.3) {
            clouds.push(new Cloud());
        }
        backgroundTimer = 0;
    }

    // 山は定期的に追加
    if (Math.random() < 0.01) {
        mountains.push(new Mountain());
    }

    // 木は頻繁に追加
    if (Math.random() < 0.02) {
        trees.push(new Tree());
    }

    // 地面の模様を定期的に追加
    if (Math.random() < 0.05) {
        groundLines.push(new GroundLine());
    }

    // 雲の更新と描画（最も遠い背景）
    for (let i = clouds.length - 1; i >= 0; i--) {
        clouds[i].update();
        clouds[i].draw();
        if (clouds[i].isOffScreen()) {
            clouds.splice(i, 1);
        }
    }

    // 山の更新と描画（中景）
    for (let i = mountains.length - 1; i >= 0; i--) {
        mountains[i].update();
        mountains[i].draw();
        if (mountains[i].isOffScreen()) {
            mountains.splice(i, 1);
        }
    }

    // 木の更新と描画（近景）
    for (let i = trees.length - 1; i >= 0; i--) {
        trees[i].update();
        trees[i].draw();
        if (trees[i].isOffScreen()) {
            trees.splice(i, 1);
        }
    }

    // 地面描画
    drawGround();

    // 地面の模様を描画（スピード感を出すため）
    for (let i = groundLines.length - 1; i >= 0; i--) {
        groundLines[i].update();
        groundLines[i].draw();
        if (groundLines[i].isOffScreen()) {
            groundLines.splice(i, 1);
        }
    }

    // スコア更新（ボス戦中は増えない）
    if (!boss) {
        score++;
        if (score % 100 === 0) {
            gameSpeed += 0.2;
        }
    }
    if (score >= nextMilestone) {
        addBanner(`${nextMilestone} てん とっぱ!`);
        playItemSound();
        nextMilestone += 1000;
    }
    if (Math.random() < Math.min((gameSpeed - 2) * 0.08, 0.4)) {
        speedLine(view.width, view.top + 20, 330, gameSpeed);
    }
    updateUI();

    // ボス出現判定（3000, 6000, 9000...）
    if (!boss && score >= nextBossScore) {
        bossLevel++;
        boss = new Boss(bossLevel);
        addBanner('WARNING!! BOSS', '#FF5252');
        shakeScreen(8);
        playBossAppearSound();
        switchBgm('battle');
        // 次のボス出現スコアを設定
        nextBossScore += 3000;
    }

    // 障害物生成（ボス戦中は生成しない）
    if (!boss) {
        obstacleTimer++;
    if (obstacleTimer > 150) { // 120から150に変更（難易度を下げる）
        const rand = Math.random();

        // 8%の確率でアイテムを生成
        if (rand < 0.08) {
            // ランダムにアイテムタイプを選択
            const itemRand = Math.random();
            let itemType;
            if (!player.hasDoubleJump && itemRand < 0.4) {
                itemType = 'wing';
            } else if (!player.hasShield && itemRand < 0.7) {
                itemType = 'shield';
            } else if (!player.hasStarPower && itemRand >= 0.7) {
                itemType = 'star';
            } else {
                // すべて所持している場合は別のアイテムをランダムに生成
                const fallbackRand = Math.random();
                if (fallbackRand < 0.33) {
                    itemType = 'wing';
                } else if (fallbackRand < 0.66) {
                    itemType = 'shield';
                } else {
                    itemType = 'star';
                }
            }
            items.push(new Item(itemType));
        }
        // 25%の確率で敵を生成（30%から25%に変更）
        else if (rand < 0.36) {
            const enemyRand = Math.random();
            let enemyType;
            // スコア3000未満は射撃敵を出さない
            if (score < 3000) {
                if (enemyRand < 0.6) {
                    enemyType = 'walker';
                } else {
                    enemyType = 'flyer';
                }
            } else {
                // スコア3000以上で射撃敵も登場
                if (enemyRand < 0.4) {
                    enemyType = 'walker';
                } else if (enemyRand < 0.7) {
                    enemyType = 'flyer';
                } else {
                    enemyType = 'shooter';
                }
            }
            enemies.push(new Enemy(enemyType));
        } else {
            // 障害物を生成
            let type;
            if (rand < 0.5) {
                type = 'hole';
            } else if (rand < 0.65) {
                type = 'block';
            } else if (rand < 0.8) {
                type = 'slope_up';
            } else if (rand < 0.9) {
                type = 'slope_down';
            } else {
                type = 'step';
            }
            const obstacle = new Obstacle(type);
            obstacles.push(obstacle);
            if ((type === 'hole' || type === 'block') && Math.random() < 0.6) {
                spawnCoinArc(obstacle.x, obstacle.width);
            }
        }
        obstacleTimer = 0;
    }
        if (++coinTimer > 220) {
            coinTimer = 0;
            if (Math.random() < 0.5) spawnCoinRow();
        }
    }

    // 障害物更新・描画
    for (let i = obstacles.length - 1; i >= 0; i--) {
        obstacles[i].update();
        obstacles[i].draw();

        if (obstacles[i].isOffScreen()) {
            obstacles.splice(i, 1);
            continue;
        }

        // プレイヤーとの衝突判定（穴とブロックのみ）
        // 坂道や段差は乗れるので衝突判定しない
        if (player.alive && obstacles[i].type === 'hole' && checkCollision(player, obstacles[i])) {
            // 穴に落ちたらゲームオーバー
            if (player.hasShield) {
                player.hasShield = false;
                poofEffect(player.x + player.width / 2, player.y + player.height / 2);
                addPopup(player.x + player.width / 2, player.y - 20, 'GUARD!', '#4FC3F7');
                obstacles.splice(i, 1);
                playStompSound();
                updateUI();
                continue;
            }
            player.alive = false;
            gameState = 'gameover';
            updateHighScore();
            playDeathSound();
            stopMusic();
            gameOverAt = performance.now();
            updateUI();
        }

        // ブロックとの衝突判定（押し戻される）
        if (player.alive && obstacles[i].type === 'block' && checkCollision(player, obstacles[i])) {
            // ブロックに当たったらプレイヤーを左に押し戻す
            player.x -= gameSpeed * 1.5; // ブロックの速度より少し速く押し戻す
        }

        if (obstacles[i].type === 'hole' || obstacles[i].type === 'block') {
            rewardJumpOver(obstacles[i]);
        }
    }

    // プレイヤー更新・描画
    player.update(obstacles);
    player.draw();

    // 左端に追いやられたらゲームオーバー
    if (player.alive && player.x < 0) {
        player.alive = false;
        gameState = 'gameover';
        updateHighScore();
        playDeathSound();
        stopMusic();
        gameOverAt = performance.now();
        updateUI();
    }

    // 敵更新・描画
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].update();
        enemies[i].draw();

        if (enemies[i].isOffScreen()) {
            enemies.splice(i, 1);
            continue;
        }

        if (!player.alive) continue;

        // スターパワー中は触れるだけで敵を倒す
        const enemy = enemies[i];
        const enemyCenterX = enemy.x + enemy.width / 2;

        if (player.hasStarPower && checkCollision(player, enemy)) {
            enemies.splice(i, 1);
            explosionEffect(enemyCenterX, enemy.y + enemy.height / 2, 0.7);
            addScore(100, enemyCenterX, enemy.y - 10, '#FF80AB'); // スターパワー中はボーナス多め
            playStompSound();
            continue;
        }

        // 踏みつけ判定
        if (checkStomp(player, enemies[i])) {
            // 敵を倒す
            enemies.splice(i, 1);
            // プレイヤーに跳ね返りを与える
            player.velocityY = -10;
            player.isJumping = true;
            player.stretch(1.3, 0.75);
            player.stompCombo++;
            stompEffect(enemyCenterX, enemy.y + enemy.height, enemy.color, enemy.width);
            addScore(50 * Math.min(2 ** (player.stompCombo - 1), 8), enemyCenterX + 45, enemy.y - 20);
            if (player.stompCombo >= 2) {
                addPopup(enemyCenterX + 45, enemy.y - 45, `${player.stompCombo} COMBO!`, '#FF9800', 16);
            }
            playStompSound(player.stompCombo);
            continue;
        }

        // 通常の衝突判定（横や下から当たった場合）
        if (checkCollision(player, enemies[i])) {
            // シールドがあれば1回防御
            if (player.hasShield) {
                player.hasShield = false;
                enemies.splice(i, 1); // 敵を消す
                poofEffect(enemyCenterX, enemy.y + enemy.height / 2);
                addPopup(player.x + player.width / 2, player.y - 20, 'GUARD!', '#4FC3F7');
                playStompSound(); // シールド発動音
                updateUI();
                continue;
            }
            player.alive = false;
            gameState = 'gameover';
            updateHighScore();
            playDeathSound();
            stopMusic(); // 音楽停止
            gameOverAt = performance.now();
            updateUI();
            continue;
        }

        rewardJumpOver(enemy);
    }

    // 弾更新・描画
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].update();
        bullets[i].draw();

        if (bullets[i].isOffScreen()) {
            bullets.splice(i, 1);
            continue;
        }

        // プレイヤーとの衝突判定
        if (player.alive && checkCollision(player, bullets[i])) {
            // スターパワー中は弾を消す
            if (player.hasStarPower) {
                sparkle(bullets[i].x, bullets[i].y, '#FF80AB');
                bullets.splice(i, 1);
                continue;
            }
            // シールドがあれば1回防御
            if (player.hasShield) {
                player.hasShield = false;
                poofEffect(bullets[i].x, bullets[i].y);
                addPopup(player.x + player.width / 2, player.y - 20, 'GUARD!', '#4FC3F7');
                bullets.splice(i, 1);
                playStompSound(); // シールド発動音
                updateUI();
                continue;
            }
            player.alive = false;
            gameState = 'gameover';
            updateHighScore();
            playDeathSound();
            stopMusic(); // 音楽停止
            gameOverAt = performance.now();
            updateUI();
        }
    }

    // 爆弾更新・描画
    for (let i = bombs.length - 1; i >= 0; i--) {
        bombs[i].update();
        bombs[i].draw();

        if (bombs[i].isOffScreen()) {
            bombs.splice(i, 1);
            continue;
        }

        // プレイヤーとの衝突判定（反射していない爆弾のみ）
        if (player.alive && !bombs[i].reflected && checkCollision(player, bombs[i])) {
            // 爆弾をボスに向かって反射
            if (boss) {
                bombs[i].reflectToBoss(boss);
                sparkle(bombs[i].x + bombs[i].width / 2, bombs[i].y + bombs[i].height / 2, '#76FF03', 10);
                addPopup(player.x + player.width / 2, player.y - 20, 'はね返し!', '#76FF03', 16);
                playItemSound(); // 反射音
            } else {
                // ボスがいない場合は爆弾を消す
                bombs.splice(i, 1);
            }
            continue;
        }

        // ボスとの衝突判定（反射された爆弾）
        if (boss && bombs[i].reflected && checkCollision(boss, bombs[i])) {
            const bomb = bombs[i];
            bombs.splice(i, 1);
            hitBoss(bomb.x + bomb.width / 2, bomb.y + bomb.height / 2);
        }
    }

    // アイテム更新・描画
    for (let i = items.length - 1; i >= 0; i--) {
        items[i].update();
        items[i].draw();

        if (items[i].isOffScreen()) {
            items.splice(i, 1);
            continue;
        }

        // プレイヤーとの取得判定
        if (player.alive && checkCollision(player, items[i])) {
            const item = items[i];
            const label = { wing: '2だんジャンプ!', shield: 'シールド!', star: 'むてき!' }[item.type];
            sparkle(item.x + item.width / 2, item.y + item.height / 2, '#FFFFFF', 12);
            jumpRing(item.x + item.width / 2, item.y + item.height / 2);
            addPopup(item.x + item.width / 2, item.y - 15, label, '#80DEEA', 18);
            if (items[i].type === 'wing') {
                player.hasDoubleJump = true;
                player.doubleJumpTimer = 1800; // 30秒 (60fps * 30秒)
                playItemSound();
                if (!boss) {
                    switchBgm('happy');
                }
                updateUI();
            } else if (items[i].type === 'shield') {
                player.hasShield = true;
                playItemSound();
                updateUI();
            } else if (items[i].type === 'star') {
                player.hasStarPower = true;
                player.starPowerTimer = 600; // 10秒 (60fps * 10秒)
                playItemSound();
                updateUI();
            }
            items.splice(i, 1);
        }
    }

    // ボス更新・描画
    if (boss) {
        boss.update();
        boss.draw();

        if (!player.alive) {
            // プレイヤーが死んだらボスも消す
            boss = null;
        } else {
            // プレイヤーとボスの衝突判定（ダメージを受ける）
            if (checkCollision(player, boss)) {
                // シールドがあれば1回防御
                if (player.hasShield) {
                    player.hasShield = false;
                    poofEffect(player.x + player.width / 2, player.y + player.height / 2);
                    addPopup(player.x + player.width / 2, player.y - 20, 'GUARD!', '#4FC3F7');
                    playStompSound(); // シールド発動音
                    updateUI();
                } else if (!player.hasStarPower) {
                    // スターパワー中は無敵
                    player.alive = false;
                    gameState = 'gameover';
                    updateHighScore();
                    playDeathSound();
                    stopMusic();
                    boss = null;
                    gameOverAt = performance.now();
                    updateUI();
                }
            }
        }
    }

    for (let i = coins.length - 1; i >= 0; i--) {
        const coin = coins[i];
        coin.update();
        coin.draw();
        if (coin.isOffScreen()) {
            coins.splice(i, 1);
        } else if (player.alive && checkCollision(player, coin)) {
            coins.splice(i, 1);
            sparkle(coin.x + coin.width / 2, coin.y + coin.height / 2);
            addScore(10, coin.x + coin.width / 2, coin.y - 8);
            playCoinSound();
        }
    }

    updateEffects();
    drawEffects(view.width);
}

function drawOverlay(lines) {
    scoreElement.hidden = true;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);

    const unit = Math.min(view.cssWidth / 14, view.cssHeight / 9, 56);
    const totalHeight = lines.reduce((sum, line) => sum + unit * line.size * 1.5, 0);
    let y = (view.cssHeight - totalHeight) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const line of lines) {
        ctx.font = `bold ${unit * line.size}px sans-serif`;
        ctx.fillStyle = line.color || 'white';
        ctx.fillText(line.text, view.cssWidth / 2, y);
        y += unit * line.size * 1.5;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

function drawGameOver() {
    const isNewRecord = score > 0 && score >= highScore;
    drawOverlay([
        { text: 'GAME OVER', size: 1.1 },
        { text: `スコア ${score}`, size: 0.7 },
        { text: isNewRecord ? `🎉 ハイスコア更新！ ${highScore}` : `ハイスコア ${highScore}`, size: 0.55, color: '#FFD700' },
        { text: 'タップしてリスタート', size: 0.45 },
    ]);
}

function drawBackdrop() {
    clearEffects();
    applyWorldTransform();
    drawSky();
    drawGround();
    player.draw();
}

function drawTitle() {
    drawBackdrop();
    drawOverlay([
        { text: 'ジャンプランナー', size: 1 },
        { text: 'タップしてスタート', size: 0.5 },
    ]);
}

function startGame() {
    init();
    gameState = 'playing';
    updateUI();

    initAudio();
    playStartSound();
    playMusic();

    startGameLoop();
}

// ジャンプ連打中のタップでゲームオーバー直後に即リスタートしてしまわないよう、少し待つ
const RESTART_DELAY_MS = 800;

function handleTap() {
    if (gameState === 'playing') {
        player.jump();
    } else if (gameState === 'ready') {
        startGame();
    } else if (performance.now() - gameOverAt >= RESTART_DELAY_MS) {
        startGame();
    }
}

document.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleTap();
});

// タッチの pointerdown はブラウザによってユーザー操作と見なされず AudioContext が suspended のままになるため、pointerup で再開する
document.addEventListener('pointerup', () => {
    if (audioContext && audioContext.state === 'suspended') audioContext.resume();
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) handleTap();
    }
});

// ゲームオーバー画面はリサイズでキャンバスが消えても直前の場面を再現できないため、空と地面だけで描き直す
window.addEventListener('resize', () => {
    resizeCanvas();
    if (gameState === 'ready') {
        drawTitle();
    } else if (gameState === 'gameover') {
        drawBackdrop();
        drawGameOver();
    }
});

init();
drawTitle();

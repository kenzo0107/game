// キャンバス設定
const canvas = document.getElementById('gameCanvas');
const stage = document.getElementById('stage');
const screenCtx = canvas.getContext('2d');
// 処理落ちの追いつき分の進行では描画を捨てる。更新と描画が絡み合ったコードを分離する大改修を避けるため、描画先を差し替える
// メソッドが undefined を返すと createLinearGradient().addColorStop() のような呼び出しで例外になるため、自身を返す
const nullCtx = new Proxy({}, { get: () => () => nullCtx, set: () => true });
let ctx = screenCtx;

const WORLD_HEIGHT = 400;
const GROUND_Y = 360;
// 奥行きを出すため、キャラは地面の線より下の草の帯を走る。坂はこの高さから立ち上げ、足が坂の線に乗るようにする
const RUN_LINE_Y = 388;
const SKY_COLOR = '#87CEEB';
const HOLE_FALL_DEPTH = 12;
// 縦持ちでもキャラが小さくなりすぎないよう、横方向に見える範囲はこの幅まで狭める
const MIN_VIEW_WIDTH = 512;
// キャラを大きく見せるため、雲しかない空の上端は横持ちで見切れてよいことにして拡大率を上げる
const VISIBLE_WORLD_TOP = 80;
// 縦持ちで余る縦方向の領域のうち、地面より下に回す割合
const BELOW_GROUND_RATIO = 0.3;
const GATE_BOTTOM = 366;
const JUMP_CANCEL_FRAMES = 12;

// 画面全体を使うため、ゲーム内座標（高さ 400）を画面サイズに合わせて拡大し、余った領域に空と地面を広げる
const view = { width: 850, top: 0, bottom: WORLD_HEIGHT, scale: 1, cssWidth: 0, cssHeight: 0, dpr: 1 };

function resizeCanvas() {
    const cssWidth = stage.clientWidth;
    const cssHeight = stage.clientHeight;
    // 3 倍などの高密度画面で端末の解像度どおりに描くと描画が重くなる一方で見た目の差はほぼないため、2 倍で打ち止めにする
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
let gameState = 'ready'; // ready, story, playing, dying, miss, gameover
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
        this.doubleJumpUsed = false;
        // シールド関連
        this.hasShield = false;
        // スターパワー関連
        this.hasStarPower = false;
        this.starPowerTimer = 0; // 10秒 = 600フレーム
        this.magnetTimer = 0;
        this.powerTimer = 0;
        // アニメーション用
        this.animationFrame = 0;
        this.runPhase = 0;
        this.scaleX = 1;
        this.scaleY = 1;
        this.stompCombo = 0;
        this.slideTimer = 0;
        this.fastFall = false;
        this.dying = false;
        this.deathSpin = 0;
    }

    get sliding() {
        return this.slideTimer > 0;
    }

    // 寝そべった姿勢に合わせ、敵や弾・ゲートとの当たり判定だけ低く横長にする（足場判定は y と height のまま使う）
    hitbox() {
        if (!this.sliding) return this;
        return { x: this.x - 4, y: this.y + 18, width: this.width + 8, height: this.height - 18 };
    }

    slide() {
        if (!this.alive) return;
        if (this.isJumping) {
            this.fastFall = true;
            this.velocityY = Math.max(this.velocityY, 12);
            comicSfx(this.x - 10, this.y - 10, 'ヒュン!', '#B3E5FC', 13, 22);
        } else if (!this.sliding) {
            this.startSlide();
        }
    }

    startSlide() {
        this.slideTimer = 40;
        if (this.isOn('slope_down')) comicSfx(this.x + this.width + 10, this.y - 6, 'シャーッ!', '#B3E5FC', 14, 30);
        this.stretch(1.25, 0.8);
        landingDust(this.x + this.width / 2, this.feetY);
        comicSfx(this.x + this.width + 18, this.feetY - 14, 'ズザッ!', '#FFB74D', 13, 24);
        playSlideSound();
    }

    stretch(scaleX, scaleY) {
        this.scaleX = scaleX;
        this.scaleY = scaleY;
    }

    get feetY() {
        return this.y + this.height + 8;
    }

    isUnderGate() {
        return obstacles.some((o) => o.type === 'gate' && checkCollision(this, o));
    }

    isOn(type) {
        return !this.isJumping && obstacles.some((o) => o.type === type && o.canStandOn(this).canStand);
    }

    // 戻り値は、直後の下スワイプで取り消すための情報
    jump() {
        if (!this.alive) return null;
        if (this.sliding && this.isUnderGate()) return null;
        this.slideTimer = 0;
        this.fastFall = false;

        // 地上からのジャンプ
        if (!this.isJumping) {
            const undo = { kind: 'ground', y: this.y, frame: this.animationFrame };
            const onRamp = this.isOn('slope_up');
            this.velocityY = this.jumpPower;
            this.isJumping = true;
            this.doubleJumpUsed = false;
            this.stretch(0.75, 1.3);
            landingDust(this.x + this.width / 2, this.feetY);
            if (onRamp) {
                jumpRing(this.x + this.width / 2, this.feetY);
                comicSfx(this.x - 8, this.feetY - 8, 'ビヨーン!', '#FFD54F', 15, 26);
            } else {
                comicSfx(this.x - 8, this.feetY - 8, 'ピョン!', '#FFFFFF', 13, 22);
            }
            playJumpSound();
            return undo;
        }
        // 空中での二段ジャンプ
        if (!this.doubleJumpUsed) {
            this.velocityY = this.jumpPower;
            this.doubleJumpUsed = true;
            this.stretch(0.75, 1.3);
            jumpRing(this.x + this.width / 2, this.feetY);
            comicSfx(this.x - 8, this.feetY, 'ピョピョン!', '#FFD54F', 14, 26);
            playJumpSound();
            return { kind: 'double', frame: this.animationFrame };
        }
        return null;
    }

    // タッチでは押した瞬間にジャンプするため、そのまま下スワイプされたらジャンプをなかったことにしてスライディングへつなぐ
    cancelJump(undo) {
        if (!undo || this.animationFrame - undo.frame > JUMP_CANCEL_FRAMES) return;
        if (undo.kind === 'ground' && this.isJumping) {
            this.y = undo.y;
            this.velocityY = 0;
            this.isJumping = false;
        } else if (undo.kind === 'double') {
            this.doubleJumpUsed = false;
        }
    }

    update(obstacles = []) {
        if (!this.alive) return;

        // アニメーションフレームを更新
        this.animationFrame++;

        // 重力適用
        this.velocityY += this.gravity;
        this.y += this.velocityY;

        // 中心が高い地形に入ってから着地判定すると崖の側面から上へ瞬間移動するため、先に壁で押し戻す
        const wall = terrainSegmentAt(this.x + this.width);
        if (wall.height > terrainHeightAt(this.x) && this.y > this.groundY - wall.height) {
            this.x = wall.x - this.width;
        }

        // 坂道や段差の上に乗れるかチェック
        let currentGroundY = this.groundY - terrainHeightAt(this.x + this.width / 2);
        if (obstacles.some((o) => o.isHoleUnder(this))) currentGroundY = Infinity;
        for (const obstacle of obstacles) {
            const result = obstacle.canStandOn(this);
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
            if (this.fastFall) {
                this.fastFall = false;
                comicSfx(this.x + this.width / 2, this.feetY - 30, 'ズドン!', '#FF7043', 16, 26);
                shakeScreen(4);
                this.startSlide();
            }
        }

        this.scaleX += (1 - this.scaleX) * 0.2;
        this.scaleY += (1 - this.scaleY) * 0.2;

        if (!grounded) {
            if (this.isPlayer && Math.abs(this.velocityY) > 5 && this.animationFrame % 2 === 0) {
                const rising = this.velocityY < 0;
                motionLine(this.x + Math.random() * this.width, rising ? this.feetY + 4 : this.y - 30, 14 + Math.random() * 14, rising ? 1.5 : -1.5);
            }
            this.stretch(this.scaleX, Math.max(this.scaleY, 1 + Math.min(Math.abs(this.velocityY) * 0.012, 0.15)));
        } else {
            this.runPhase += 0.18 + gameSpeed * 0.04;
            if (this.sliding) {
                // ゲートの下で起き上がると押し戻されるため、くぐり終えるまでは姿勢を保つ
                // 下り坂は坂の終わりまで滑り降り、ふもとの敵をはね飛ばせるようにする
                if (!this.isUnderGate() && !this.isOn('slope_down')) this.slideTimer--;
                if (this.animationFrame % 2 === 0) runDust(this.x + this.width, this.feetY - 2);
            } else if (this.isPlayer && this.animationFrame % 6 === 0) {
                runDust(this.x + 4, this.feetY);
            }
        }

        if (this.magnetTimer > 0) this.magnetTimer--;
        if (this.powerTimer > 0) this.powerTimer--;

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
        if (!this.alive && !this.dying) return;

        // シールドエフェクト
        if (this.isPlayer && this.hasShield && !this.dying) {
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
        if (this.isPlayer && this.hasStarPower && !this.dying) {
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

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const hipY = this.y + this.height - 2;
        const limbColor = this.team === 'ally' ? '#006400' : '#8B0000';
        const swing = Math.sin(this.runPhase);
        const sliding = this.sliding && !this.dying;
        ctx.lineCap = 'round';

        if (sliding) {
            ctx.strokeStyle = limbColor;
            ctx.lineWidth = 5;
            for (const dy of [0, 5]) {
                ctx.beginPath();
                ctx.moveTo(cx, hipY + 6 + dy);
                ctx.lineTo(cx + 26, this.feetY - 4 + dy / 2);
                ctx.stroke();
            }
        }

        ctx.save();
        if (this.dying) {
            ctx.translate(cx, cy);
            ctx.rotate(this.deathSpin);
            ctx.translate(-cx, -cy);
        } else if (sliding) {
            ctx.translate(cx, hipY + 10);
            ctx.rotate(-1.1);
            ctx.scale(this.scaleX, this.scaleY);
            ctx.translate(-cx, -hipY);
        } else {
            const bob = this.isJumping ? 0 : -Math.abs(Math.sin(this.runPhase)) * 3;
            const lean = this.isJumping ? Math.max(Math.min(this.velocityY * 0.02, 0.25), -0.25) : 0.05;
            ctx.translate(cx, this.feetY + bob);
            ctx.rotate(lean);
            ctx.scale(this.scaleX, this.scaleY);
            ctx.translate(-cx, -this.feetY);
        }

        ctx.strokeStyle = limbColor;
        ctx.lineWidth = 5;
        const legs = sliding ? [] : [[this.x + 9, swing], [this.x + 21, -swing]];
        for (const [hipX, phase] of legs) {
            ctx.beginPath();
            ctx.moveTo(hipX, hipY);
            if (this.isJumping || this.dying) {
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

        if (this.dying) {
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            for (const ex of [this.x + 12, this.x + 22]) {
                ctx.beginPath();
                ctx.moveTo(ex - 3, this.y + 8);
                ctx.lineTo(ex + 3, this.y + 14);
                ctx.moveTo(ex + 3, this.y + 8);
                ctx.lineTo(ex - 3, this.y + 14);
                ctx.stroke();
            }
        } else {
            ctx.fillStyle = '#fff';
            ctx.fillRect(this.x + 9, this.y + 7, 7, 7);
            ctx.fillRect(this.x + 19, this.y + 7, 7, 7);
            ctx.fillStyle = '#000';
            // 体を前に傾けるぶん顔も下を向くため、黒目は白目の上寄りに置いて前を見ているように見せる
            const pupilY = this.isJumping && this.velocityY > 0 ? this.y + 10 : this.y + 8;
            ctx.fillRect(this.x + 13, pupilY, 3, 3);
            ctx.fillRect(this.x + 23, pupilY, 3, 3);
        }

        ctx.fillStyle = '#000';
        if (this.isJumping || this.dying || sliding) {
            ctx.beginPath();
            ctx.arc(this.x + 20, this.y + 21, 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(this.x + 16, this.y + 20, 8, 2);
        }

        ctx.strokeStyle = limbColor;
        ctx.lineWidth = 4;
        const shoulderY = this.y + 14;
        if (sliding) {
            for (const dy of [0, 6]) {
                ctx.beginPath();
                ctx.moveTo(this.x + 2, shoulderY + dy);
                ctx.lineTo(this.x - 9, shoulderY + dy - 4);
                ctx.stroke();
            }
        } else if (this.isJumping || this.dying) {
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

    }
}

// 障害物クラス
class Obstacle {
    constructor(type) {
        this.type = type; // 'hole', 'block', 'slope_up', 'slope_down', 'step'
        this.x = view.width;

        if (type === 'hole') {
            // 滞空時間は速度によらず一定なので、幅が固定だと低速時は踏み切れる猶予が約10フレームしかなく飛び越えられない
            this.width = Math.min(80, 30 * gameSpeed);
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
            this.y = RUN_LINE_Y - this.height;
        } else if (type === 'gate') {
            // 上端は画面外まで伸ばし、ジャンプでは越えられずスライディングでしかくぐれないようにする
            this.width = 34;
            this.y = -1000;
            this.height = GATE_BOTTOM - this.y;
        }
        this.lift = terrainHeightAt(this.x);
        this.y -= this.lift;
    }

    get baseY() {
        return GROUND_Y - this.lift;
    }

    get runLineY() {
        return RUN_LINE_Y - this.lift;
    }

    update() {
        this.x -= gameSpeed;
    }

    // 体の端が縁にかかっただけで落ちると、飛び越えたつもりの着地でやられてしまうため中心で判定する
    isHoleUnder(character) {
        if (this.type !== 'hole') return false;
        const centerX = character.x + character.width / 2;
        return centerX > this.x && centerX < this.x + this.width;
    }

    swallows(character) {
        return this.isHoleUnder(character) && character.y > character.groundY - this.lift + HOLE_FALL_DEPTH;
    }

    draw() {
        if (this.type === 'hole') {
            ctx.fillStyle = SKY_COLOR;
            ctx.fillRect(this.x, this.y - 2, this.width, view.bottom - this.y + 2);
            ctx.strokeStyle = '#2E7D32';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x, view.bottom);
            ctx.moveTo(this.x + this.width, this.y);
            ctx.lineTo(this.x + this.width, view.bottom);
            ctx.stroke();
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
        } else if (this.type === 'slope_up' || this.type === 'slope_down') {
            const up = this.type === 'slope_up';
            const highX = up ? this.x + this.width : this.x;
            const lowX = up ? this.x : this.x + this.width;
            const topY = this.runLineY - this.height;
            const grass = ctx.createLinearGradient(0, topY, 0, this.runLineY);
            grass.addColorStop(0, '#7ED87E');
            grass.addColorStop(1, '#90EE90');
            ctx.fillStyle = grass;
            ctx.beginPath();
            ctx.moveTo(lowX, this.runLineY);
            ctx.lineTo(highX, topY);
            ctx.lineTo(highX, this.runLineY);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#2E7D32';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(lowX, this.runLineY);
            ctx.lineTo(highX, topY);
            ctx.stroke();
        } else if (this.type === 'gate') {
            const top = view.top - 10;
            const bottom = this.y + this.height;
            ctx.fillStyle = '#8D6E63';
            ctx.fillRect(this.x + 4, top, this.width - 8, bottom - 20 - top);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x + 4, top, this.width - 8, bottom - 20 - top);
            for (let i = 0; i < 4; i++) {
                ctx.fillStyle = i % 2 === 0 ? '#FFD600' : '#212121';
                ctx.fillRect(this.x + (i * this.width) / 4, bottom - 20, this.width / 4, 20);
            }
            ctx.strokeRect(this.x, bottom - 20, this.width, 20);
            outlinedText('↓', this.x + this.width / 2, bottom - 40, 16, '#FFD600');
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

    // 段差の右端から降りる途中は体の左半分が段差に重なるが、押し戻すのは左からぶつかったときだけにする
    isBehind(character) {
        return character.x + character.width / 2 > this.x + this.width / 2;
    }

    // 坂道や段差の上に乗れるかチェック
    canStandOn(character) {
        if (this.type === 'slope_up' || this.type === 'slope_down' || this.type === 'step') {
            const playerCenterX = character.x + character.width / 2;

            if (playerCenterX >= this.x && playerCenterX <= this.x + this.width) {
                if (this.type === 'slope_up' || this.type === 'slope_down') {
                    const progress = (playerCenterX - this.x) / this.width;
                    const rise = this.type === 'slope_up' ? progress : 1 - progress;
                    const feetToTop = character.feetY - character.y;
                    return { canStand: true, groundY: this.runLineY - this.height * rise - feetToTop };
                } else if (this.type === 'step') {
                    // 横から入り込んだときに上へ移動させないよう、前のフレームで足が上面より上にあったときだけ乗せる
                    const feetToTop = character.feetY - character.y;
                    if (character.feetY - character.velocityY <= this.y + 0.5) {
                        return { canStand: true, groundY: this.y - feetToTop };
                    }
                }
            }
        }
        return { canStand: false };
    }
}

const WALKER_LEG_LENGTH = 8;

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
            this.speed = gameSpeed * 0.8;
            this.shootCooldown = 0;
            this.shootInterval = 100; // フレーム数
            this.color = '#8B008B'; // ダークマゼンタ
            this.width = 35;
        }
        if (type !== 'flyer') this.y = this.groundedY();
    }

    // 主人公と同じ道の上を走らせるため、足の先を主人公と同じ線にそろえる
    groundedY() {
        const legLength = this.type === 'walker' ? WALKER_LEG_LENGTH : 0;
        return RUN_LINE_Y - legLength - this.height - terrainHeightAt(this.x + this.width / 2);
    }

    knockAway() {
        this.knocked = true;
        this.vx = 6;
        this.vy = -9;
        this.spin = 0;
    }

    update() {
        if (this.knocked) {
            this.x += this.vx;
            this.y += this.vy;
            this.vy += 0.5;
            this.spin += 0.35;
            return;
        }
        this.x -= this.speed;
        this.animationFrame++;

        if (this.type !== 'flyer') {
            this.y = this.groundedY();
        }

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

        if (this.knocked) {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(this.spin);
            ctx.translate(-cx, -cy);
            this.drawBody();
            ctx.restore();
            return;
        }
        this.drawBody();
    }

    drawBody() {
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
            ctx.fillRect(this.x + 5 + legOffset, this.y + this.height, 6, WALKER_LEG_LENGTH);
            ctx.fillRect(this.x + 19 - legOffset, this.y + this.height, 6, WALKER_LEG_LENGTH);

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
        return this.x + this.width < 0 || (this.knocked && (this.x > view.width + 60 || this.y > view.bottom + 60));
    }
}

// 弾クラス
const REFLECTED_BULLET_SPEED = 9;
const ROLLING_BULLET_SPEED = 3.2;
const BULLET_STOMP_RADIUS = 16;

class Bullet {
    constructor(x, y, direction = -1, useGravity = false) {
        this.reflected = false;
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

    // 動き回るボスにまっすぐ撃ち返すと外れやすく、踏めたのに当たらない理不尽さが出るため、毎フレーム狙い直す
    reflect() {
        this.reflected = true;
        this.useGravity = false;
    }

    update() {
        if (this.reflected && boss) {
            const dx = boss.x + boss.width / 2 - this.x;
            const dy = boss.y + boss.height / 2 - this.y;
            const distance = Math.hypot(dx, dy) || 1;
            this.velocityX = (dx / distance) * REFLECTED_BULLET_SPEED;
            this.velocityY = (dy / distance) * REFLECTED_BULLET_SPEED;
        }
        this.x += this.velocityX;
        this.y += this.velocityY;

        // 重力を適用
        if (this.useGravity) {
            this.velocityY += this.gravity;
        }
    }

    // x, y は弾の中心。小さな弾をぴったり踏むのは難しいため、踏める範囲は見た目より広く取る
    stompBox() {
        const r = BULLET_STOMP_RADIUS;
        return { x: this.x - r, y: this.y - r, width: r * 2, height: r * 2 };
    }

    draw() {
        if (!this.alive) return;

        // 外側のグロー効果（視認性向上）
        ctx.fillStyle = this.reflected ? 'rgba(118, 255, 3, 0.6)' : 'rgba(255, 255, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2 + 4, 0, Math.PI * 2);
        ctx.fill();

        // 外側の影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.arc(this.x + 2, this.y + 2, this.width / 2 + 1, 0, Math.PI * 2);
        ctx.fill();

        // 弾本体（オレンジ色で目立つように）
        ctx.fillStyle = this.reflected ? '#64DD17' : '#FF4500';
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

const BOSS_TAUNT_AT = 50;
const BOSS_REPLY_AT = 140;
const BOSS_FIGHT_AT = 200;

class Boss {
    constructor(profile, level) {
        this.profile = profile;
        this.kind = profile.kind;
        this.level = level;
        this.introTimer = 0;
        this.showStatus = true;
        this.hazards = [];
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
        this.animationOffset += 0.1;
        if (this.invincibleTimer > 0) {
            this.invincibleTimer--;
        }
        this.introTimer++;
        if (this.introTimer === BOSS_TAUNT_AT) say(this, this.profile.taunt, 90);
        if (this.introTimer === BOSS_REPLY_AT) say(player, this.profile.reply, 70);
        if (this.introTimer === BOSS_FIGHT_AT) addBanner('たまを ふんで はねかえせ!', '#76FF03');
        this.act();
        this.hazards.forEach((h) => h.update());
        this.hazards = this.hazards.filter((h) => !h.done);
    }

    get fighting() {
        return this.introTimer >= BOSS_FIGHT_AT;
    }

    get harmsOnTouch() {
        return true;
    }

    get stompable() {
        return false;
    }

    get hittable() {
        return true;
    }

    hazardZones() {
        return this.hazards.filter((h) => !h.harmless).map((h) => ({ hazard: h, rect: h.zone() })).filter((z) => z.rect);
    }

    onStomped() {}

    // 盾で受けても体が重なったままだと次の tick でやられるため、ボス側を離れさせる
    onShieldHit() {}

    act() {
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

        // 攻撃のクールダウン
        if (this.attackCooldown > 0) {
            this.attackCooldown--;
        } else if (this.fighting && Math.random() < 0.015) {
            // ランダムで弾または爆弾を発射（難易度調整：0.02→0.015）
            this.attackCooldown = this.attackInterval;
            this.shoot();
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
        } else if (attackType < 0.8) {
            this.rollBullet();
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

    // 主人公は横に動けず、放物線や扇状の弾は届く前に地面へ落ちて踏む機会にならないため、足もとを転がって必ず届く弾を撃つ
    rollBullet() {
        const bullet = new Bullet(this.x, player.groundY + player.height / 2);
        bullet.velocityX = -ROLLING_BULLET_SPEED;
        bullets.push(bullet);
    }

    takeDamage(amount = 1) {
        if (this.invincibleTimer > 0) return false;

        this.hp -= amount;
        this.invincibleTimer = 30; // 0.5秒の無敵時間

        if (this.hp <= 0) {
            this.alive = false;
            return true; // ボス撃破
        }
        return false;
    }

    draw() {
        if (!this.alive) return;

        this.hazards.forEach((h) => h.draw());
        // 無敵時間中は点滅
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 5) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }
        this.drawBody();
        ctx.globalAlpha = 1.0;
        if (this.showStatus) this.drawStatus();
    }

    drawBody() {
        if (this.kind === 'tsuno') {
            // 赤い悪魔風
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

        } else if (this.kind === 'mecha') {
            // 紫の機械風ボス
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
            // 黒い影風の最強ボス
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

    }

    drawStatus() {
        ctx.fillStyle = '#fff';
        ctx.font = "900 15px 'Hiragino Sans', sans-serif";
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        ctx.strokeText(this.profile.name, this.x + this.width / 2, this.y - 30);
        ctx.fillText(this.profile.name, this.x + this.width / 2, this.y - 30);
        ctx.textAlign = 'left';

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

const LASER_WARN_TICKS = 70;
const LASER_FIRE_TICKS = 24;

// 段差の上でも同じ操作でよけられるよう、ボスの攻撃の高さはプレイヤーの足元を基準にする
function playerFloorY() {
    return player.groundY - terrainHeightAt(player.x + player.width / 2);
}

// 爆弾の跳ね返しだけでは最初のボスと同じ戦い方になるため、低いレーザーはジャンプ、高いレーザーは主にスライディングでよけさせる
class LaserHazard {
    constructor(boss, type) {
        this.boss = boss;
        this.type = type;
        this.timer = 0;
        this.harmless = false;
        this.done = false;
        addPopup(player.x + player.width / 2, player.y - 40, type === 'low' ? 'ジャンプ!' : 'スライディング!', '#FF8A80', 16);
        playLaserChargeSound();
    }

    top() {
        return this.type === 'low' ? playerFloorY() + 12 : playerFloorY() - 110;
    }

    bottom() {
        return this.type === 'low' ? playerFloorY() + 30 : playerFloorY() + 14;
    }

    update() {
        this.timer++;
        if (this.timer === LASER_WARN_TICKS) {
            shakeScreen(6);
            comicSfx(this.boss.x - 40, this.top() + 10, 'ビーーッ!', '#FF5252', 18, 24);
            playLaserSound();
        }
        if (this.timer >= LASER_WARN_TICKS + LASER_FIRE_TICKS) this.done = true;
    }

    zone() {
        if (this.timer < LASER_WARN_TICKS) return null;
        const top = this.top();
        return { x: -50, y: top, width: this.boss.x + 50, height: this.bottom() - top };
    }

    draw() {
        const top = this.top();
        const height = this.bottom() - top;
        const right = this.boss.x;
        if (this.timer < LASER_WARN_TICKS) {
            const blink = Math.floor(this.timer / 6) % 2 === 0;
            ctx.fillStyle = blink ? 'rgba(255, 82, 82, 0.35)' : 'rgba(255, 82, 82, 0.15)';
            ctx.fillRect(0, top, right, height);
            ctx.strokeStyle = '#FF5252';
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 8]);
            ctx.strokeRect(0, top, right, height);
            ctx.setLineDash([]);
            if (blink) outlinedText('!', right - 30, top + height / 2, 22, '#FFEB3B');
            return;
        }
        const flicker = Math.random() * 4;
        ctx.fillStyle = '#FF1744';
        ctx.fillRect(-50, top - flicker / 2, right + 50, height + flicker);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-50, top + height * 0.3, right + 50, height * 0.4);
    }
}

class ShockwaveHazard {
    constructor(x, color = '#FFD54F') {
        this.x = x;
        this.color = color;
        this.speed = 4.5;
        this.harmless = false;
        this.done = false;
    }

    update() {
        this.x -= this.speed;
        if (this.x < -60) this.done = true;
    }

    zone() {
        const floor = playerFloorY();
        return { x: this.x, y: floor + 12, width: 34, height: 18 };
    }

    draw() {
        const floor = playerFloorY() + 30;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
            const h = 26 - k * 7;
            ctx.beginPath();
            ctx.moveTo(this.x + k * 12, floor);
            ctx.quadraticCurveTo(this.x + k * 12 + 6, floor - h * 1.6, this.x + k * 12 + 20, floor);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    }
}

class ShadowCloneHazard {
    constructor(x) {
        this.body = new Player(x, 0, false, 'enemy');
        this.harmless = false;
        this.done = false;
        this.speed = 5;
    }

    update() {
        const body = this.body;
        body.x -= this.speed;
        body.y = playerFloorY();
        body.runPhase += 0.4;
        if (body.x < -60) this.done = true;
    }

    zone() {
        return this.body;
    }

    draw() {
        ctx.save();
        ctx.translate(this.body.x * 2 + this.body.width, 0);
        ctx.scale(-1, 1);
        ctx.globalAlpha = 0.85;
        // 未対応のブラウザでは赤い走者のまま描かれるだけで、遊ぶうえでは困らない
        ctx.filter = 'brightness(0.25)';
        this.body.draw();
        ctx.restore();
    }
}

function digHoleAt(x) {
    const hole = new Obstacle('hole');
    hole.x = x - hole.width / 2;
    hole.lift = terrainHeightAt(hole.x);
    hole.y = GROUND_Y - hole.lift;
    obstacles.push(hole);
    return hole;
}

class MechaBoss extends Boss {
    shoot() {
        const r = Math.random();
        if (this.hazards.length || r < 0.3) {
            bombs.push(new Bomb(this.x, this.y + this.height / 2));
            return;
        }
        if (r < 0.65) {
            this.rollBullet();
            return;
        }
        this.hazards.push(new LaserHazard(this, Math.random() < 0.5 ? 'low' : 'high'));
        this.attackCooldown = LASER_WARN_TICKS + LASER_FIRE_TICKS + 30;
    }
}

const GOLEM_HOME_POUNDS = 2;

// プレイヤーは横に動けず、画面の右側にいるボスには届かないため、ときどき歩いて迫らせて踏む機会を作る
class GolemBoss extends Boss {
    constructor(profile, level) {
        super(profile, level);
        this.width = 90;
        this.height = 90;
        this.homeX = view.width - 170;
        this.x = this.homeX;
        this.state = 'home';
        this.stateTimer = 0;
        this.pounds = 0;
        this.jumpY = 0;
        this.jumpVelocity = 0;
        this.placeBody();
    }

    placeBody() {
        this.y = RUN_LINE_Y - 3 - terrainHeightAt(this.x + this.width / 2) - this.height - this.jumpY;
    }

    enter(state) {
        this.state = state;
        this.stateTimer = 0;
    }

    act() {
        const t = ++this.stateTimer;
        if (this.state === 'home') {
            this.x = this.homeX;
            if (this.fighting && t > 90) {
                if (this.pounds >= GOLEM_HOME_POUNDS) {
                    this.pounds = 0;
                    say(this, 'ドス ドス ドス!', 50);
                    this.enter('charge');
                } else {
                    this.enter('crouch');
                }
            }
        } else if (this.state === 'crouch') {
            if (t >= 20) {
                this.jumpVelocity = 9;
                this.enter('air');
            }
        } else if (this.state === 'air') {
            this.jumpY += this.jumpVelocity;
            this.jumpVelocity -= 0.5;
            if (this.jumpY <= 0) this.land();
        } else if (this.state === 'charge') {
            this.x -= 2.2 + this.level * 0.05;
            if (this.x + this.width < -10) {
                this.x = view.width + 20;
                this.enter('return');
            }
        } else if (this.state === 'return') {
            this.x -= 2;
            if (this.x <= this.homeX) this.enter('home');
        } else if (this.state === 'retreat') {
            this.x += 5;
            if (this.x >= this.homeX) this.enter('home');
        }
        this.placeBody();
    }

    land() {
        this.jumpY = 0;
        this.pounds++;
        shakeScreen(10);
        smokePuffs(this.x + this.width / 2, this.y + this.height, 8, 1.4);
        comicSfx(this.x + this.width / 2, this.y - 10, 'ドスーン!', '#FFD54F', 22, 34);
        playStompSound();
        this.hazards.push(new ShockwaveHazard(this.x - 30));
        this.enter('home');
    }

    onStomped() {
        say(this, 'ゴゴッ!?', 50);
        this.enter('retreat');
    }

    onShieldHit() {
        this.enter('retreat');
    }

    get harmsOnTouch() {
        return this.state !== 'retreat';
    }

    get stompable() {
        return this.invincibleTimer === 0 && this.state !== 'retreat';
    }

    drawBody() {
        const { x, y, width: w, height: h } = this;
        const squash = this.state === 'crouch' ? 8 : 0;
        const step = this.state === 'charge' || this.state === 'return' ? Math.sin(this.animationOffset * 3) * 3 : 0;
        const top = y + squash;
        ctx.fillStyle = '#9E9E9E';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 3;
        ctx.fillRect(x + 6, top + 20, w - 12, h - 20 - squash);
        ctx.strokeRect(x + 6, top + 20, w - 12, h - 20 - squash);
        ctx.fillStyle = '#BDBDBD';
        ctx.fillRect(x + 16, top, w - 32, 30);
        ctx.strokeRect(x + 16, top, w - 32, 30);
        ctx.fillStyle = '#66BB6A';
        ctx.fillRect(x + 16, top, w - 32, 6);
        ctx.fillStyle = '#FFEE58';
        ctx.fillRect(x + 26, top + 10, 12, 8);
        ctx.fillRect(x + w - 38, top + 10, 12, 8);
        ctx.fillStyle = '#757575';
        ctx.fillRect(x - 6, top + 30 + step, 14, 40);
        ctx.fillRect(x + w - 8, top + 30 - step, 14, 40);
        ctx.strokeRect(x - 6, top + 30 + step, 14, 40);
        ctx.strokeRect(x + w - 8, top + 30 - step, 14, 40);
        ctx.strokeStyle = '#616161';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 30, top + 40);
        ctx.lineTo(x + 40, top + 55);
        ctx.lineTo(x + 34, top + 70);
        ctx.moveTo(x + 60, top + 45);
        ctx.lineTo(x + 54, top + 60);
        ctx.stroke();
    }
}

const RIVAL_SCALE = 1.5;

// ゴーレムと同じく、体当たりで近づいてきたときだけ踏めるようにする
class RivalBoss extends Boss {
    constructor(profile, level) {
        super(profile, level);
        this.width = 30 * RIVAL_SCALE;
        this.height = 30 * RIVAL_SCALE;
        this.homeX = view.width * 0.62;
        this.x = this.homeX;
        this.body = new Player(0, 0, false, 'enemy');
        this.state = 'run';
        this.stateTimer = 0;
        this.attackInterval = Math.max(90 - level * 5, 50);
        this.placeBody();
    }

    placeBody() {
        this.y = RUN_LINE_Y - 8 - terrainHeightAt(this.x + this.width / 2) - this.height;
    }

    enter(state) {
        this.state = state;
        this.stateTimer = 0;
    }

    act() {
        const t = ++this.stateTimer;
        this.body.runPhase += this.state === 'dash' ? 0.6 : 0.3;
        if (this.state === 'run') {
            this.x = this.homeX + Math.sin(this.animationOffset) * 20;
            if (this.attackCooldown > 0) {
                this.attackCooldown--;
            } else if (this.fighting) {
                this.attackCooldown = this.attackInterval;
                if (Math.random() < 0.5) this.dropBlock();
                else this.enter('windup');
            }
        } else if (this.state === 'windup') {
            if (t === 1) {
                addMark(this, '!', 40);
                say(this, 'いくぜ!', 40);
            }
            if (t >= 45) this.enter('dash');
        } else if (this.state === 'dash') {
            this.x -= 5;
            if (t % 8 === 0) runDust(this.x + this.width, this.y + this.height);
            if (this.x + this.width < -20) {
                this.x = view.width + 30;
                this.enter('return');
            }
        } else if (this.state === 'return') {
            this.x -= 3;
            if (this.x <= this.homeX) this.enter('run');
        } else if (this.state === 'retreat') {
            this.x += 6;
            if (this.x >= this.homeX) this.enter('run');
        }
        this.placeBody();
    }

    dropBlock() {
        const block = new Obstacle('block');
        block.x = this.x;
        block.lift = terrainHeightAt(block.x);
        block.y = 310 - block.lift;
        obstacles.push(block);
        comicSfx(this.x, this.y - 10, 'ポイッ', '#FFFFFF', 14, 24);
    }

    onStomped() {
        say(this, 'くっ…やるな!', 50);
        this.enter('retreat');
    }

    onShieldHit() {
        this.enter('retreat');
    }

    get harmsOnTouch() {
        return this.state !== 'retreat';
    }

    get stompable() {
        return this.invincibleTimer === 0 && this.state !== 'retreat';
    }

    drawBody() {
        ctx.save();
        ctx.translate(this.x + this.width, this.y);
        ctx.scale(-RIVAL_SCALE, RIVAL_SCALE);
        this.body.draw();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 2, 30, 4);
        ctx.fillStyle = '#29B6F6';
        starPath(15, -4, 7, 3);
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }
}


class WhaleBoss extends Boss {
    constructor(profile, level) {
        super(profile, level);
        this.width = 150;
        this.height = 60;
        this.baseY = 145;
        this.y = this.baseY;
        this.phase = 0;
    }

    act() {
        const left = 30;
        const right = Math.max(view.width - this.width - 20, left);
        if (this.fighting) this.phase += 0.006 + this.level * 0.0005;
        this.x = left + (right - left) * (0.5 + 0.5 * Math.cos(this.phase));
        this.y = this.baseY + Math.sin(this.animationOffset) * 12;

        if (this.attackCooldown > 0) {
            this.attackCooldown--;
        } else if (this.fighting && Math.random() < 0.02) {
            this.attackCooldown = this.attackInterval;
            this.spray();
        }
    }

    spray() {
        const spoutX = this.x + this.width * 0.35;
        comicSfx(spoutX, this.y - 30, 'プシュー!', '#4FC3F7', 16, 26);
        for (let k = 0; k < 3; k++) {
            const drop = new Bullet(spoutX, this.y);
            drop.setArcVelocity(-2.5 + k * 1.8, -6);
            drop.gravity = 0.25;
            bullets.push(drop);
        }
    }

    onStomped() {
        smokePuffs(this.x + this.width * 0.35, this.y, 6, 1);
        say(this, 'クジラ~ン!', 40);
    }

    get harmsOnTouch() {
        return false;
    }

    get stompable() {
        return this.invincibleTimer === 0;
    }

    drawBody() {
        const { x, y, width: w, height: h } = this;
        const tail = Math.sin(this.animationOffset * 2) * 6;
        ctx.fillStyle = '#3F51B5';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + w - 10, y + h / 2);
        ctx.lineTo(x + w + 25, y + h / 2 - 18 + tail);
        ctx.lineTo(x + w + 25, y + h / 2 + 14 + tail);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#C5CAE9';
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h * 0.75, w * 0.4, h * 0.22, 0, 0, Math.PI);
        ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(x + 30, y + h * 0.4, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(x + 28, y + h * 0.4, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.arc(x + 30 + k * 40, y + h + 12 + (k % 2) * 4, 14, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

const KAGE_MAX_HP = 6;
const KAGE_RAGE_HP = 3;
const KAGE_MOVES = ['laser', 'wave', 'hole', 'rain', 'clone'];

// 技だけが続くと反撃できないまま待たされるため、技の合間に必ず爆弾か転がる弾を挟む
class KageBoss extends Boss {
    constructor(profile, level) {
        super(profile, level);
        this.maxHp = KAGE_MAX_HP;
        this.hp = this.maxHp;
        this.moveIndex = 0;
        this.bombNext = true;
        this.raging = false;
    }

    shoot() {
        if (this.bombNext && Math.random() < 0.5) {
            bombs.push(new Bomb(this.x, this.y + this.height / 2));
        } else if (this.bombNext) {
            this.rollBullet();
        } else {
            this.useMove(KAGE_MOVES[this.moveIndex++ % KAGE_MOVES.length]);
        }
        this.bombNext = !this.bombNext;
        if (this.raging) this.attackCooldown = Math.floor(this.attackCooldown * 0.6);
    }

    useMove(move) {
        if (move === 'laser') {
            this.hazards.push(new LaserHazard(this, Math.random() < 0.5 ? 'low' : 'high'));
            this.attackCooldown = LASER_WARN_TICKS + LASER_FIRE_TICKS + 20;
        } else if (move === 'wave') {
            this.hazards.push(new ShockwaveHazard(this.x - 30, '#CE93D8'));
            shakeScreen(8);
        } else if (move === 'hole') {
            digHoleAt(Math.min(player.x + 320, view.width - 60));
            comicSfx(player.x + 320, GROUND_Y - 30, 'ズボッ', '#CE93D8', 16, 26);
        } else if (move === 'rain') {
            for (let k = 0; k < 4; k++) {
                const drop = new Bullet(this.x + 20, this.y);
                drop.setArcVelocity(-1.5 - k * 1.3, -7);
                drop.gravity = 0.3;
                bullets.push(drop);
            }
        } else if (move === 'clone') {
            this.hazards.push(new ShadowCloneHazard(this.x));
            say(this, 'わが ぶんしんよ!', 50);
        }
    }

    takeDamage(amount) {
        const defeated = super.takeDamage(amount);
        if (!defeated && !this.raging && this.hp <= KAGE_RAGE_HP) {
            this.raging = true;
            this.speed *= 1.4;
            say(this, 'ほんきを だすぞ…!', 80);
            shakeScreen(12);
        }
        return defeated;
    }

    drawBody() {
        super.drawBody();
        if (!this.raging) return;
        ctx.strokeStyle = '#FF1744';
        ctx.lineWidth = 3;
        const pulse = 6 + Math.sin(this.animationOffset * 4) * 3;
        ctx.strokeRect(this.x - pulse, this.y - pulse, this.width + pulse * 2, this.height + pulse * 2);
    }
}

// 踏まれて潜るときにも穴を残すと、跳ね返ったプレイヤーの真下に穴が開いて避けようがないため、穴は踏まれずに潜るときだけ残す
const MOLE_BODY = 64;
const MOLE_DIVE_TICKS = 20;
const MOLE_BURROW_TICKS = 60;
const MOLE_RISE_TICKS = 15;
const MOLE_UP_TICKS = 80;
const MOLE_REACH_MIN_TICKS = 45;
const MOLE_REACH_SPREAD_TICKS = 20;

class MoleBoss extends Boss {
    constructor(profile, level) {
        super(profile, level);
        this.width = MOLE_BODY;
        this.x = view.width - 160;
        this.state = 'intro';
        this.stateTimer = 0;
        this.visible = 1;
        this.fromX = this.x;
        this.toX = this.x;
        this.leavesHole = false;
        this.placeBody();
    }

    groundBottom() {
        return RUN_LINE_Y - 3 - terrainHeightAt(this.x + this.width / 2);
    }

    placeBody() {
        this.height = MOLE_BODY * this.visible;
        this.y = this.groundBottom() - this.height;
    }

    enter(state) {
        this.state = state;
        this.stateTimer = 0;
    }

    act() {
        this.stateTimer++;
        const t = this.stateTimer;
        if (this.state === 'intro') {
            if (this.fighting) this.dive(false);
        } else if (this.state === 'dive') {
            this.visible = 1 - t / MOLE_DIVE_TICKS;
            if (t >= MOLE_DIVE_TICKS) this.startBurrow();
        } else if (this.state === 'burrow') {
            const p = t / MOLE_BURROW_TICKS;
            this.x = this.fromX + (this.toX - this.fromX) * p;
            if (t % 6 === 0) smokePuffs(this.x + this.width / 2, this.groundBottom(), 2, 0.6);
            if (t >= MOLE_BURROW_TICKS) {
                this.enter('rise');
                comicSfx(this.x + this.width / 2, this.groundBottom() - 70, 'モグッ!', '#A1887F', 18, 30);
            }
        } else if (this.state === 'rise') {
            this.x -= gameSpeed;
            this.visible = t / MOLE_RISE_TICKS;
            if (t >= MOLE_RISE_TICKS) this.enter('up');
        } else if (this.state === 'up') {
            this.x -= gameSpeed;
            if (t >= MOLE_UP_TICKS) this.dive(true);
        }
        this.placeBody();
    }

    dive(leavesHole) {
        this.leavesHole = leavesHole;
        if (leavesHole) this.digHole();
        this.enter('dive');
    }

    digHole() {
        digHoleAt(this.x + this.width / 2);
        smokePuffs(this.x + this.width / 2, this.groundBottom(), 8, 1.2);
        comicSfx(this.x + this.width / 2, this.groundBottom() - 60, 'ザクッ', '#A1887F', 16, 26);
    }

    startBurrow() {
        this.fromX = this.x;
        // 出現位置を固定距離にすると低速時は地上にいる間に主人公まで届かず踏めないため、速度から逆算して地上にいる間に必ず届かせる
        const reachTicks = MOLE_RISE_TICKS + MOLE_REACH_MIN_TICKS + Math.random() * MOLE_REACH_SPREAD_TICKS;
        this.toX = Math.min(player.x + player.width + gameSpeed * reachTicks, view.width - this.width - 20);
        this.enter('burrow');
    }

    onStomped() {
        if (this.state === 'up' || this.state === 'rise') this.dive(false);
    }

    onShieldHit() {
        this.dive(false);
    }

    get harmsOnTouch() {
        return ['intro', 'rise', 'up'].includes(this.state);
    }

    get stompable() {
        return (this.state === 'rise' || this.state === 'up') && this.invincibleTimer === 0;
    }

    get hittable() {
        return this.state === 'rise' || this.state === 'up';
    }

    drawBody() {
        const bottom = this.groundBottom();
        const cx = this.x + this.width / 2;
        if (this.state === 'burrow') {
            ctx.fillStyle = '#6D4C41';
            ctx.beginPath();
            ctx.ellipse(cx, bottom, 26, 10 + Math.sin(this.animationOffset * 4) * 2, 0, Math.PI, 0);
            ctx.fill();
            return;
        }
        ctx.fillStyle = '#3E2723';
        ctx.beginPath();
        ctx.ellipse(cx, bottom, 40, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        if (this.visible <= 0) return;

        ctx.save();
        ctx.beginPath();
        ctx.rect(this.x - 30, view.top, this.width + 60, bottom - view.top);
        ctx.clip();
        const top = bottom - MOLE_BODY * this.visible;
        ctx.fillStyle = '#795548';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(cx, top + MOLE_BODY * 0.55, this.width / 2, MOLE_BODY * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#D7CCC8';
        ctx.beginPath();
        ctx.ellipse(cx, top + MOLE_BODY * 0.7, this.width * 0.3, MOLE_BODY * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.fillRect(cx - 22, top + 14, 44, 10);
        ctx.fillStyle = '#FFF';
        ctx.fillRect(cx - 18, top + 15, 6, 3);
        ctx.fillStyle = '#FF80AB';
        ctx.beginPath();
        ctx.arc(cx, top + 32, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#FFF';
        ctx.fillRect(cx - 6, top + 40, 5, 7);
        ctx.fillRect(cx + 1, top + 40, 5, 7);
        ctx.strokeStyle = '#FFE0B2';
        ctx.lineWidth = 3;
        for (const side of [-1, 1]) {
            const pawX = cx + side * (this.width / 2 + 4);
            for (let k = -1; k <= 1; k++) {
                ctx.beginPath();
                ctx.moveTo(pawX, top + 40);
                ctx.lineTo(pawX + side * 8, top + 34 + k * 6);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    drawStatus() {
        if (this.state === 'burrow' || this.visible < 0.5) return;
        super.drawStatus();
    }
}

const BOSS_CLASSES = { mecha: MechaBoss, golem: GolemBoss, mole: MoleBoss, rival: RivalBoss, whale: WhaleBoss, kage: KageBoss };

function createBoss(profile, level) {
    const BossClass = BOSS_CLASSES[profile.kind] || Boss;
    return new BossClass(profile, level);
}

// アイテムクラス
class Item {
    constructor(type) {
        this.type = type; // ITEM_LOOKS のキー
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

        if (this.type === 'shield') {
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
        } else {
            const look = ITEM_LOOKS[this.type];
            ctx.fillStyle = look.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.strokeStyle = look.border;
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '20px sans-serif';
            ctx.fillText(look.icon, this.x + this.width / 2, this.y + this.height / 2 + 1);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }
    }

    isOffScreen() {
        return this.x + this.width < 0;
    }
}

const ITEM_LOOKS = {
    heart: { icon: '❤️', color: '#FFCDD2', border: '#E53935' },
    magnet: { icon: '🧲', color: '#E1F5FE', border: '#0288D1' },
    boots: { icon: '👢', color: '#FFE0B2', border: '#EF6C00' },
    clock: { icon: '⏰', color: '#F3E5F5', border: '#7B1FA2' },
};
const MAGNET_TICKS = 600;
const MAGNET_RANGE = 260;
const MAGNET_PULL_SPEED = 9;
const POWER_TICKS = 900;
const POWER_DAMAGE = 2;
// 時間の進みが半分になるため、240 tick で実時間の 8 秒になる
const SLOW_TICKS = 240;
const SLOW_RATE = 0.5;
const HEART_ITEM_CHANCE = 0.1;

function pickItemType() {
    if (Math.random() < HEART_ITEM_CHANCE) return 'heart';
    const active = {
        shield: player.hasShield,
        star: player.hasStarPower,
        magnet: player.magnetTimer > 0,
        boots: player.powerTimer > 0,
        clock: slowTicks > 0,
    };
    const choices = Object.keys(active).filter((type) => !active[type]);
    return choices.length ? choices[Math.floor(Math.random() * choices.length)] : 'heart';
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

function spawnCoinArc(obstacle) {
    for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const x = obstacle.x - 30 + t * (obstacle.width + 60);
        coins.push(new Coin(x, obstacle.baseY - 40 - Math.sin(t * Math.PI) * 110));
    }
}

// 坂の上のほうで踏み切ったときの軌道の頂上付近に並べ、平地からのジャンプでは届かない高さにする
function spawnRampCoins(ramp) {
    const g = player.gravity;
    const v = -player.jumpPower;
    const takeoffX = ramp.x + ramp.width * 0.75;
    const centerY = ramp.runLineY - ramp.height * 0.75 - (player.feetY - player.y) + player.height / 2;
    const speed = gameSpeed + (speedGainPerFrame() * (takeoffX - player.x - player.width / 2)) / gameSpeed;
    for (const t of [16, 20, 25, 30, 34]) {
        coins.push(new Coin(takeoffX + speed * t - 8, centerY - (v * t - (g * t * t) / 2) - 8));
    }
}

// 歩く敵は坂より速く近づくため、坂のふもとがプレイヤーに届くころに出会う位置から歩かせる
function spawnWalkerAtFoot(slope) {
    const walker = new Enemy('walker');
    const footDistance = slope.x + slope.width - (player.x + player.width / 2);
    walker.x = player.x + player.width + (footDistance * walker.speed) / gameSpeed;
    enemies.push(walker);
}

function spawnCoinRow() {
    const lift = terrainHeightAt(view.width);
    for (let i = 0; i < 5; i++) {
        coins.push(new Coin(view.width + i * 28, 355 - lift));
    }
}

// 地形の高さ。区間ごとに一定の高さを持ち、上りの段差はジャンプで乗り越える
const TERRAIN_LEVELS = [0, 40, 80];
// 段差に体がぶつかる何フレーム前に踏み切ればよいか。早すぎても遅すぎても届く範囲の中ほどにする
const STEP_TAKEOFF_FRAMES = 18;
// 他の障害物と同じ手前の余白では、壁際から段差へ飛び乗る滞空(約44フレーム)中にゲートへ当たり、壁とゲートの間で詰む
const GATE_RUNUP_FRAMES = 90;
let terrain = [];

function resetTerrain() {
    terrain = [{ x: -50, width: view.width + 650, height: 0, guided: true }];
}

function terrainSegmentAt(x) {
    return terrain.find((s) => x < s.x + s.width) || terrain[terrain.length - 1];
}

function terrainHeightAt(x) {
    return terrain.length ? terrainSegmentAt(x).height : 0;
}

function isTerrainFlat(from, to) {
    return !terrain.some((s) => s.x > from && s.x < to);
}

function nextTerrainHeight(current) {
    if (boss) return 0;
    const choices = TERRAIN_LEVELS.filter((h) => h !== current);
    return choices[Math.floor(Math.random() * choices.length)];
}

// コインをジャンプの軌道どおりに並べ、どこで踏み切ればよいかを見せる
function spawnStepUpGuide(edgeX, fromHeight, toHeight) {
    const g = player.gravity;
    const v = -player.jumpPower;
    const landFrames = (v + Math.sqrt(v * v - 2 * g * (toHeight - fromHeight))) / g;
    // 段差に着くまでにスコアが進んで速度が上がるため、その分を見込む（1 フレームで score+1、100 ごとに +0.2）
    const framesToEdge = (edgeX - player.x - player.width) / gameSpeed;
    const speed = gameSpeed + speedGainPerFrame() * framesToEdge;
    const centerY = player.groundY - fromHeight + player.height / 2;
    const count = 7;
    for (let i = 0; i < count; i++) {
        const t = (landFrames * i) / (count - 1);
        const x = edgeX + speed * (t - STEP_TAKEOFF_FRAMES) - player.width / 2;
        const y = centerY - (v * t - (g * t * t) / 2);
        coins.push(new Coin(x - 8, y - 8));
    }
}

function updateTerrain() {
    for (const s of terrain) s.x -= gameSpeed;
    while (terrain.length > 1 && terrain[0].x + terrain[0].width < 0) terrain.shift();

    let last = terrain[terrain.length - 1];
    while (last.x + last.width < view.width + 1200) {
        // 速度が上がっても区間を通り過ぎる時間が変わらないよう、幅を速度に比例させる
        const width = (250 + Math.random() * 250) * gameSpeed;
        last = { x: last.x + last.width, width, height: nextTerrainHeight(last.height), guided: false };
        terrain.push(last);
    }

    for (let i = 1; i < terrain.length; i++) {
        const s = terrain[i];
        if (s.guided || s.x > view.width + 250) continue;
        s.guided = true;
        const prev = terrain[i - 1];
        if (s.height > prev.height) spawnStepUpGuide(s.x, prev.height, s.height);
    }
}

function hitBoss(x, y) {
    const powered = player.powerTimer > 0;
    const defeated = boss.takeDamage(powered ? POWER_DAMAGE : 1);
    if (defeated) {
        const bossX = boss.x + boss.width / 2;
        const bossY = boss.y + boss.height / 2;
        explosionEffect(bossX, bossY, 2);
        starBurst(bossX, bossY, 14);
        focusLines(bossX, bossY, 45);
        comicSfx(bossX, bossY - 30, 'ズガガーン!!', '#FF5252', 28, 50);
        hitStop(14);
        say(player, 'やったぜ!', 90);
        seedsCollected++;
        addBanner(`いろのタネ ${seedsCollected}/${BOSS_ROSTER.length} とりもどした!`, boss.profile.color);
        seedPickupEffect(bossX, bossY, boss.profile.color);
        addScore(500, bossX, boss.y - 20);
        lives++;
        addPopup(player.x + player.width / 2, player.y - 40, '1UP!', '#69F0AE', 26);
        playBossDefeatSound();
        boss = null;
        updateSeedsUI();
        if (seedsCollected === BOSS_ROSTER.length) {
            endingTimer = ENDING_DELAY_TICKS;
            bullets = [];
            bombs = [];
        }
        switchBgm('normal');
    } else {
        explosionEffect(x, y, powered ? 1.6 : 1);
        addPopup(x, y - 30, powered ? 'ダブルHIT!!' : 'HIT!', '#FF5252', 22);
        comicSfx(x - 20, y + 10, 'ドゴォ!', '#FFA726', 20, 30);
        focusLines(x, y, 12);
        hitStop(5);
        playStompSound();
    }
}

function pullCoin(coin) {
    const dx = player.x + player.width / 2 - (coin.x + coin.width / 2);
    const dy = player.y + player.height / 2 - (coin.y + coin.height / 2);
    const distance = Math.hypot(dx, dy);
    if (distance > MAGNET_RANGE || distance === 0) return;
    const step = Math.min(MAGNET_PULL_SPEED, distance);
    coin.x += (dx / distance) * step;
    coin.y += (dy / distance) * step;
}

function stompBullet(bullet) {
    player.velocityY = -10;
    player.isJumping = true;
    player.fastFall = false;
    player.stretch(1.3, 0.75);
    stompEffect(bullet.x, bullet.y + bullet.height / 2, '#FF4500', 24);
    hitStop(4);
    playItemSound();
    if (boss) {
        bullet.reflect();
        sparkle(bullet.x, bullet.y, '#76FF03', 10);
        addPopup(player.x + player.width / 2, player.y - 20, 'はね返し!', '#76FF03', 16);
        comicSfx(player.x + player.width + 20, player.y, 'カキーン!', '#76FF03', 18, 30);
    } else {
        addScore(30, bullet.x, bullet.y - 20);
        comicSfx(bullet.x, bullet.y - 20, 'パキッ', '#FFAB40', 14, 24);
    }
}

function stompBoss() {
    const stomped = boss;
    player.velocityY = -12;
    player.isJumping = true;
    player.fastFall = false;
    player.stretch(1.3, 0.75);
    stompEffect(stomped.x + stomped.width / 2, stomped.y + 10, '#795548', stomped.width);
    hitBoss(stomped.x + stomped.width / 2, stomped.y);
    if (stomped.alive) stomped.onStomped();
}

// ゲームオブジェクト
let player = null;
let coins = [];
let coinTimer = 0;
let lastCoinFrame = -Infinity;
let nextMilestone = 1000;
let obstacles = [];
let enemies = [];
let bullets = [];
let bombs = [];
let items = [];
let boss = null;
let bossLevel = 0;
let seedsCollected = 0;
let round = 1;
let slowTicks = 0;
const START_LIVES = 3;
let lives = START_LIVES;
// 撃破の演出を見せきってから紙芝居に切り替える
const ENDING_DELAY_TICKS = 120;
let endingTimer = 0;

// 序盤は操作に慣れてもらうため、最初のボスが出るまでは速くしない。ボス戦中はスコアが増えないので、実際に速くなるのは倒したあとから
function speedGainPerFrame() {
    return bossLevel > 0 ? 0.002 : 0;
}
let nextBossScore = 3000; // 次にボスが出現するスコア

// 地面の模様クラス（スピード感を出すため）
class GroundLine {
    constructor(x = view.width) {
        this.x = x;
        this.y = 365 + Math.random() * 30 - terrainHeightAt(x); // 地面の上にランダムに配置
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
let currentBgmType = 'normal'; // 'normal' または 'battle'

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

function playSlideSound() {
    if (!audioContext) return;
    const t = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(420, t);
    oscillator.frequency.exponentialRampToValueAtTime(140, t + 0.25);
    gainNode.gain.setValueAtTime(0.12, t);
    gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    oscillator.start(t);
    oscillator.stop(t + 0.25);
}

function playHitSound() {
    if (!audioContext) return;
    const t = audioContext.currentTime;
    playTone(110, 0.25, t, 'square');
    playTone(70, 0.3, t + 0.03, 'sawtooth');
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

function playSweep(type, fromFreq, toFreq, duration, volume) {
    if (!audioContext) return;
    const startTime = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(fromFreq, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(toFreq, startTime + duration);
    gainNode.gain.setValueAtTime(volume, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
}

function playLaserChargeSound() {
    playSweep('square', 200, 900, 1.0, 0.08);
}

function playLaserSound() {
    playSweep('sawtooth', 1200, 150, 0.4, 0.2);
}

const RUN_BASS_ROOTS = [45, 41, 43, 40];
const RUN_MELODY = [
    76, 0, 81, 76, 84, 0, 83, 81, 76, 0, 81, 76, 83, 84, 83, 81,
    77, 0, 81, 77, 84, 0, 83, 81, 77, 0, 81, 77, 79, 81, 79, 77,
    79, 0, 83, 79, 86, 0, 84, 83, 79, 0, 83, 79, 84, 86, 84, 83,
    80, 0, 83, 80, 88, 0, 86, 83, 80, 83, 86, 88, 86, 83, 80, 76,
];

function midiToFreq(note) {
    return 440 * 2 ** ((note - 69) / 12);
}

let noiseBuffer = null;

function playNoise(startTime, duration, volume, highpass) {
    if (!noiseBuffer) {
        noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.3, audioContext.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = audioContext.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(volume, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(masterGain);
    source.start(startTime);
    source.stop(startTime + duration);
}

function playKick(startTime) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(150, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(40, startTime + 0.12);
    gainNode.gain.setValueAtTime(0.4, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.15);
}

// BGM再生
function playMusic() {
    if (!audioContext) return;

    let step = 0;

    function playNextStep() {
        const t = audioContext.currentTime;
        // スピードが上がるほどテンポも上げ、追い立てられる感じを強める
        const stepSec = Math.max(0.085, 0.12 - (gameSpeed - 2) * 0.006);
        const bar = Math.floor(step / 16) % RUN_BASS_ROOTS.length;
        const beat = step % 16;

        const melody = RUN_MELODY[step % RUN_MELODY.length];
        if (melody) playTone(midiToFreq(melody), stepSec * 0.9, t, 'square');

        if (beat % 2 === 0) {
            const root = RUN_BASS_ROOTS[bar];
            playTone(midiToFreq(beat % 4 === 0 ? root : root + 12), stepSec * 1.8, t, 'sawtooth');
        }

        if (beat % 4 === 0 || (bar === 3 && beat === 14)) playKick(t);
        if (beat === 4 || beat === 12) playNoise(t, 0.12, 0.25, 1200);
        playNoise(t, 0.03, beat % 2 === 0 ? 0.05 : 0.1, 7000);

        step++;
        musicInterval = setTimeout(playNextStep, stepSec * 1000);
    }

    playNextStep();
}

// BGM停止
function stopMusic() {
    if (musicInterval) {
        clearInterval(musicInterval);
        clearTimeout(musicInterval);
        musicInterval = null;
    }
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

const bgmPlayers = { normal: playMusic, battle: playBattleMusic };

function switchBgm(type) {
    stopMusic();
    currentBgmType = type;
    bgmPlayers[type]();
}

// 初期化
function init() {
    boss = null;
    bossLevel = 0;
    seedsCollected = 0;
    round = 1;
    lives = START_LIVES;
    endingTimer = 0;
    nextMilestone = 1000;
    nextBossScore = 3000;
    score = 0;
    highScore = loadHighScore();
    gameSpeed = 2; // 3から2に変更（難易度を下げる）
    resetStage();
    currentBgmType = 'normal';
    gloom = gloomTarget();
    updateUI();
}

// 進み具合（スコア・タネ・周回・速さ）は残し、画面上の物と主人公だけを置き直す
function resetStage() {
    obstacles = [];
    enemies = [];
    bullets = [];
    bombs = [];
    items = [];
    coins = [];
    coinTimer = 0;
    lastCoinFrame = -Infinity;
    clearEffects();
    obstacleTimer = 0;
    backgroundTimer = 0;
    slowTicks = 0;
    resetTerrain();

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

    stopMusic();
}

// 倒しかけのボスを残すと、置き直した主人公の目の前に体力の減ったボスがいることになるため、出現からやり直させる
function continueGame() {
    if (boss) {
        boss = null;
        bossLevel--;
        nextBossScore -= 3000;
    }
    resetStage();
    gameState = 'playing';
    addBanner(`のこり ${lives}き がんばれ!`, '#69F0AE');
    updateUI();
    playStartSound();
    switchBgm('normal');
    startGameLoop();
}

// UI更新
const scoreElement = document.getElementById('score');
const livesElement = document.getElementById('lives');
const buffsElement = document.getElementById('buffs');

function buffsText() {
    const secondsLeft = (ticks, rate = 1) => Math.ceil(ticks / 60 / rate);
    return [
        player.magnetTimer > 0 && `🧲${secondsLeft(player.magnetTimer)}`,
        player.powerTimer > 0 && `👢${secondsLeft(player.powerTimer)}`,
        slowTicks > 0 && `⏰${secondsLeft(slowTicks, SLOW_RATE)}`,
    ].filter(Boolean).join(' ');
}

function updateUI() {
    scoreElement.textContent = score;
    scoreElement.hidden = gameState !== 'playing' && gameState !== 'dying';
    livesElement.textContent = `×${lives}`;
    livesElement.hidden = scoreElement.hidden;
    const buffs = buffsText();
    if (buffsElement.textContent !== buffs) buffsElement.textContent = buffs;
    buffsElement.hidden = scoreElement.hidden || !buffs;
    updateSeedsUI();
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

function pushedReaction() {
    addMark(player, 'sweat', 20);
    addMark(player, 'anger', 20);
    say(player, 'ぐぬぬ…', 40);
}

function guardReaction(x, y) {
    poofEffect(x, y);
    addPopup(player.x + player.width / 2, player.y - 20, 'GUARD!', '#4FC3F7');
    comicSfx(x, y - 10, 'ガキーン!', '#4FC3F7', 18, 30);
    addMark(player, 'sweat', 50);
    say(player, 'セーフ!');
    hitStop(4);
}

function rewardPass(target) {
    if (target.passed || target.x + target.width >= player.x) return;
    target.passed = true;
    if (!player.alive) return;
    if (target.type === 'gate') {
        const bottom = target.y + target.height;
        addScore(20, target.x + target.width / 2, bottom - 50, '#FFFFFF');
        addPopup(target.x + target.width / 2, bottom - 75, 'ナイス!', '#80DEEA', 16);
    } else if (player.isJumping) {
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


// 落下が速いと足が弾の上半分を1フレームで通り過ぎ、踏んだのにやられることがあるため、前のフレームの足の位置で判定する
function checkBulletStomp(player, bullet) {
    const prevBottom = player.y + player.height - player.velocityY;
    return player.velocityY > 0 && prevBottom <= bullet.y && checkCollision(player, bullet.stompBox());
}

function drawSky() {
    ctx.fillStyle = SKY_COLOR;
    ctx.fillRect(0, view.top, view.width, view.bottom - view.top);
}

function drawGround() {
    for (const s of terrain) {
        const top = GROUND_Y - s.height;
        const soil = top + WORLD_HEIGHT - GROUND_Y;
        ctx.fillStyle = '#90EE90';
        ctx.fillRect(s.x, top, s.width + 1, soil - top);
        ctx.fillStyle = '#8B5A2B';
        ctx.fillRect(s.x, soil, s.width + 1, view.bottom - soil);
    }
    ctx.strokeStyle = '#2E7D32';
    ctx.lineWidth = 3;
    ctx.beginPath();
    terrain.forEach((s, i) => {
        const top = GROUND_Y - s.height;
        if (i === 0) ctx.moveTo(s.x, top);
        else ctx.lineTo(s.x, top);
        ctx.lineTo(s.x + s.width, top);
    });
    ctx.stroke();
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

// 個々の物の速さを落とすと、速度に合わせた穴の幅やジャンプの軌道とずれて越えられなくなるため、時間の進みそのものを遅らせる
function gameLoop(now) {
    const rate = slowTicks > 0 && gameState === 'playing' ? SLOW_RATE : 1;
    tickBacklog = Math.min(tickBacklog + (now - lastFrameAt) * rate, TICK_MS * MAX_TICKS_PER_FRAME);
    lastFrameAt = now;
    // 60Hz 画面で毎フレームの間隔がわずかに揺れても 0 回/2 回のステップにぶれないよう、半ステップ分を閾値にする
    while (tickBacklog > TICK_MS / 2 && (gameState === 'playing' || gameState === 'dying')) {
        tickBacklog -= TICK_MS;
        ctx = tickBacklog > TICK_MS / 2 ? nullCtx : screenCtx;
        tick();
        if (slowTicks > 0 && --slowTicks === 0) addPopup(player.x + player.width / 2, player.y - 30, 'もとに もどった', '#CE93D8', 14);
    }
    ctx = screenCtx;

    if (gameState === 'gameover') {
        drawGameOver();
        return;
    }
    if (gameState === 'miss') {
        drawMiss();
        return;
    }
    requestAnimationFrame(gameLoop);
}

const DEATH_FREEZE_TICKS = 24;
const DEATH_TICKS = 100;
let deathTimer = 0;

function killPlayer() {
    player.alive = false;
    player.dying = true;
    player.slideTimer = 0;
    player.velocityY = 0;
    gameState = 'dying';
    deathTimer = 0;
    slowTicks = 0;
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    starBurst(cx, cy, 10);
    spawnParticle({ kind: 'burst', x: cx + 30, y: cy - 35, size: 36, life: DEATH_FREEZE_TICKS + 12, text: 'ドカーン!' });
    focusLines(cx, cy, DEATH_FREEZE_TICKS + 6);
    addMark(player, 'dizzy', DEATH_TICKS);
    shakeScreen(12);
    updateHighScore();
    stopMusic();
    playHitSound();
}

function drawFrozenScene() {
    drawSky();
    for (const list of [clouds, mountains, trees]) list.forEach((o) => o.draw());
    drawGround();
    groundLines.forEach((o) => o.draw());
    drawGloom(gloom);
    for (const list of [obstacles, enemies, bullets, bombs, items, coins]) list.forEach((o) => o.draw());
    if (boss) boss.draw();
}

// やられた瞬間に世界を止めてから跳ね上がって落ちる流れにするため、通常の tick とは別に描画だけ行う
function dyingTick() {
    deathTimer++;
    if (deathTimer === DEATH_FREEZE_TICKS) {
        player.velocityY = -11;
        say(player, 'ぎゃふん!', DEATH_TICKS);
        comicSfx(player.x + player.width / 2, player.y - 30, 'ヒュ~ン', '#B39DDB', 16, 50);
        playDeathSound();
    }
    if (deathTimer > DEATH_FREEZE_TICKS) {
        player.y += player.velocityY;
        player.velocityY += 0.5;
        player.deathSpin += 0.25;
    }

    applyWorldTransform();
    drawFrozenScene();
    player.draw();
    updateEffects();
    drawEffects();

    const flash = 0.7 - deathTimer * 0.08;
    if (flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flash})`;
        ctx.fillRect(-50, view.top - 50, view.width + 100, view.bottom - view.top + 100);
    }

    if (deathTimer >= DEATH_TICKS) {
        lives--;
        gameState = lives > 0 ? 'miss' : 'gameover';
        gameOverAt = performance.now();
        updateUI();
    }
}

function tick() {
    if (gameState === 'dying') {
        dyingTick();
        return;
    }
    applyWorldTransform();
    if (hitStopTicks > 0) {
        hitStopTicks--;
        drawFrozenScene();
        player.draw();
        updateEffects();
        drawEffects();
        return;
    }

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

    updateTerrain();
    drawGround();

    // 地面の模様を描画（スピード感を出すため）
    for (let i = groundLines.length - 1; i >= 0; i--) {
        groundLines[i].update();
        groundLines[i].draw();
        if (groundLines[i].isOffScreen()) {
            groundLines.splice(i, 1);
        }
    }
    updateGloom();
    drawGloom(gloom);

    // スコア更新（ボス戦中は増えない）
    if (!boss) {
        score++;
        if (score % 100 === 0 && speedGainPerFrame() > 0) {
            gameSpeed += 0.2;
        }
    }
    if (score >= nextMilestone) {
        addBanner(`${nextMilestone} てん とっぱ!`);
        playItemSound();
        nextMilestone += 1000;
    }
    if (gameSpeed >= 3.5 && score % 240 === 0 && !player.isJumping && !player.sliding) {
        comicSfx(player.x - 20, player.y + 6, 'ダダダッ', '#FFFFFF', 13, 30);
    }
    if (Math.random() < Math.min((gameSpeed - 2) * 0.08, 0.4)) {
        speedLine(view.width, view.top + 20, 330, gameSpeed);
    }
    updateUI();

    // ボス出現判定（3000, 6000, 9000...）
    if (!boss && score >= nextBossScore) {
        bossLevel++;
        boss = createBoss(BOSS_ROSTER[seedsCollected], bossLevel);
        addBanner('WARNING!! BOSS', '#FF5252');
        shakeScreen(8);
        focusLines(player.x + player.width / 2, player.y, 40, '#4A148C');
        addMark(player, '!', 50);
        addMark(player, 'sweat', 120);
        say(player, 'で、でた~!', 90);
        for (let k = 0; k < 4; k++) {
            comicSfx(view.width - 50 - (k % 2) * 30, 140 + k * 45, 'ゴゴゴ', '#CE93D8', 18, 90 + k * 10);
        }
        playBossAppearSound();
        switchBgm('battle');
        // 次のボス出現スコアを設定
        nextBossScore += 3000;
    }

    // 障害物生成（ボス戦中は生成しない）
    if (!boss) {
        obstacleTimer++;
    // 段差の踏み切りや着地の場所に障害物が重なると避けようがないため、平らな場所にだけ出す
    if (obstacleTimer > 150 && isTerrainFlat(view.width - 40 * gameSpeed, view.width + 200 + 40 * gameSpeed)) { // 120から150に変更（難易度を下げる）
        const rand = Math.random();

        // 8%の確率でアイテムを生成
        if (rand < 0.08) {
            // ランダムにアイテムタイプを選択
            items.push(new Item(pickItemType()));
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
            } else if (rand < 0.6) {
                type = 'block';
            } else if (rand < 0.72 && isTerrainFlat(view.width - GATE_RUNUP_FRAMES * gameSpeed, view.width)) {
                type = 'gate';
            } else if (rand < 0.8) {
                type = 'slope_up';
            } else if (rand < 0.9 && isTerrainFlat(view.width, view.width + 360 + 40 * gameSpeed)) {
                type = 'hill';
            } else {
                type = 'step';
            }
            const obstacle = new Obstacle(type === 'hill' ? 'slope_up' : type);
            obstacles.push(obstacle);
            if ((type === 'hole' || type === 'block') && Math.random() < 0.6) {
                spawnCoinArc(obstacle);
            } else if (type === 'slope_up') {
                spawnRampCoins(obstacle);
            } else if (type === 'hill') {
                // 下り坂だけを置くと左端が崖になり、差し掛かった瞬間に頂上へ移動してしまうため、登り坂から続けて置く
                const downhill = new Obstacle('slope_down');
                downhill.x = obstacle.x + obstacle.width;
                obstacles.push(downhill);
                spawnRampCoins(obstacle);
                if (Math.random() < 0.6) spawnWalkerAtFoot(downhill);
            } else if (type === 'gate' && Math.random() < 0.6) {
                for (let c = 0; c < 4; c++) coins.push(new Coin(obstacle.x - 40 + c * 34, 362 - obstacle.lift));
            }
        }
        obstacleTimer = 0;
    }
        if (++coinTimer > 220) {
            coinTimer = 0;
            if (Math.random() < 0.5 && isTerrainFlat(view.width - 40 * gameSpeed, view.width + 140 + 40 * gameSpeed)) spawnCoinRow();
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
        if (player.alive && obstacles[i].swallows(player)) {
            // 穴に落ちたらゲームオーバー
            if (player.hasShield) {
                player.hasShield = false;
                guardReaction(player.x + player.width / 2, player.y + player.height / 2);
                obstacles.splice(i, 1);
                playStompSound();
                updateUI();
                continue;
            }
            killPlayer();
        }

        // ブロックとの衝突判定（押し戻される）
        if (player.alive && ['block', 'step'].includes(obstacles[i].type) && checkCollision(player.hitbox(), obstacles[i]) && !obstacles[i].isBehind(player)) {
            // ブロックに当たったらプレイヤーを左に押し戻す
            player.x -= gameSpeed * 1.5; // ブロックの速度より少し速く押し戻す
            pushedReaction();
        }

        if (player.alive && obstacles[i].type === 'gate' && checkCollision(player.hitbox(), obstacles[i])) {
            player.x -= gameSpeed * 1.5;
            pushedReaction();
        }

        if (['hole', 'block', 'gate', 'step'].includes(obstacles[i].type)) {
            rewardPass(obstacles[i]);
        }
    }

    // プレイヤー更新・描画
    player.update(obstacles);
    player.draw();

    // 左端に追いやられたらゲームオーバー
    if (player.alive && player.x < 0) {
        killPlayer();
    }

    // 敵更新・描画
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].update();
        enemies[i].draw();

        if (enemies[i].isOffScreen()) {
            enemies.splice(i, 1);
            continue;
        }

        const enemy = enemies[i];
        if (!player.alive || enemy.knocked) continue;
        const enemyCenterX = enemy.x + enemy.width / 2;
        if (!enemy.noticed && enemy.x > player.x && enemy.x - (player.x + player.width) < 120) {
            enemy.noticed = true;
            addMark(player, '!', 24);
        }

        if (player.sliding && enemy.type !== 'flyer' && checkCollision(player, enemy)) {
            enemy.knockAway();
            starBurst(enemyCenterX, enemy.y + enemy.height / 2, 6);
            spawnParticle({ kind: 'burst', x: enemyCenterX, y: enemy.y, size: 26, life: 26, text: 'ズザーッ!' });
            focusLines(enemyCenterX, enemy.y + enemy.height / 2, 10);
            hitStop(3);
            shakeScreen(5);
            addScore(30, enemyCenterX + 40, enemy.y - 20);
            playStompSound(2);
            continue;
        }

        // スターパワー中は触れるだけで敵を倒す
        if (player.hasStarPower && checkCollision(player.hitbox(), enemy)) {
            enemy.knockAway();
            explosionEffect(enemyCenterX, enemy.y + enemy.height / 2, 0.7);
            comicSfx(enemyCenterX, enemy.y - 16, 'バシーン!', '#FF80AB', 16, 26);
            hitStop(2);
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
            player.fastFall = false;
            player.stretch(1.3, 0.75);
            player.stompCombo++;
            stompEffect(enemyCenterX, enemy.y + enemy.height, enemy.color, enemy.width);
            addScore(50 * Math.min(2 ** (player.stompCombo - 1), 8), enemyCenterX + 45, enemy.y - 20);
            focusLines(enemyCenterX, enemy.y + enemy.height / 2, 10 + player.stompCombo * 4);
            hitStop(3 + Math.min(player.stompCombo, 4));
            if (player.stompCombo >= 2) {
                addPopup(enemyCenterX + 45, enemy.y - 45, `${player.stompCombo} COMBO!`, '#FF9800', 16);
            }
            if (player.stompCombo >= 3) {
                say(player, player.stompCombo >= 5 ? 'とまらないぜ!!' : 'まだまだ~!');
            }
            playStompSound(player.stompCombo);
            continue;
        }

        // 通常の衝突判定（横や下から当たった場合）
        if (checkCollision(player.hitbox(), enemies[i])) {
            // シールドがあれば1回防御
            if (player.hasShield) {
                player.hasShield = false;
                enemies.splice(i, 1); // 敵を消す
                guardReaction(enemyCenterX, enemy.y + enemy.height / 2);
                playStompSound(); // シールド発動音
                updateUI();
                continue;
            }
            killPlayer();
            continue;
        }

        rewardPass(enemy);
    }

    // 弾更新・描画
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].update();
        bullets[i].draw();

        if (bullets[i].isOffScreen()) {
            bullets.splice(i, 1);
            continue;
        }

        if (bullets[i].reflected) {
            if (boss && boss.hittable && checkCollision(boss, bullets[i].stompBox())) {
                const bullet = bullets[i];
                bullets.splice(i, 1);
                hitBoss(bullet.x, bullet.y);
            }
            continue;
        }

        if (player.alive && !player.sliding && checkBulletStomp(player, bullets[i])) {
            stompBullet(bullets[i]);
            if (!boss) bullets.splice(i, 1);
            continue;
        }

        // プレイヤーとの衝突判定
        if (player.alive && checkCollision(player.hitbox(), bullets[i])) {
            // スターパワー中は弾を消す
            if (player.hasStarPower) {
                sparkle(bullets[i].x, bullets[i].y, '#FF80AB');
                comicSfx(bullets[i].x, bullets[i].y - 10, 'パシッ', '#FF80AB', 12, 20);
                bullets.splice(i, 1);
                continue;
            }
            // シールドがあれば1回防御
            if (player.hasShield) {
                player.hasShield = false;
                guardReaction(bullets[i].x, bullets[i].y);
                bullets.splice(i, 1);
                playStompSound(); // シールド発動音
                updateUI();
                continue;
            }
            killPlayer();
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
        if (player.alive && !bombs[i].reflected && checkCollision(player.hitbox(), bombs[i])) {
            // 爆弾をボスに向かって反射
            if (boss) {
                bombs[i].reflectToBoss(boss);
                sparkle(bombs[i].x + bombs[i].width / 2, bombs[i].y + bombs[i].height / 2, '#76FF03', 10);
                addPopup(player.x + player.width / 2, player.y - 20, 'はね返し!', '#76FF03', 16);
                comicSfx(player.x + player.width + 20, player.y, 'カキーン!', '#76FF03', 18, 30);
                hitStop(4);
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
        if (player.alive && checkCollision(player.hitbox(), items[i])) {
            const item = items[i];
            const label = {
                shield: 'シールド!', star: 'むてき!', heart: '1UP!', magnet: 'マグネット!', boots: 'パワーブーツ!', clock: 'スロー!',
            }[item.type];
            sparkle(item.x + item.width / 2, item.y + item.height / 2, '#FFFFFF', 12);
            jumpRing(item.x + item.width / 2, item.y + item.height / 2);
            addPopup(item.x + item.width / 2, item.y - 15, label, '#80DEEA', 18);
            comicSfx(item.x + item.width / 2, item.y - 40, 'キュピーン!', '#FFF176', 18, 34);
            focusLines(item.x + item.width / 2, item.y + item.height / 2, 16, '#FFFFFF');
            say(player, item.type === 'star' ? 'むてきだ~!' : 'やった~!');
            if (item.type === 'heart') {
                lives++;
                playItemSound();
                updateUI();
            } else if (item.type === 'magnet') {
                player.magnetTimer = MAGNET_TICKS;
                playItemSound();
                updateUI();
            } else if (item.type === 'boots') {
                player.powerTimer = POWER_TICKS;
                playItemSound();
                updateUI();
            } else if (item.type === 'clock') {
                slowTicks = SLOW_TICKS;
                playItemSound();
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

        if (player.alive) {
            const zone = boss.hazardZones().find((z) => checkCollision(player.hitbox(), z.rect));
            if (boss.stompable && checkStomp(player, boss)) {
                stompBoss();
            } else if (zone) {
                if (player.hasShield) {
                    player.hasShield = false;
                    zone.hazard.harmless = true;
                    guardReaction(player.x + player.width / 2, player.y + player.height / 2);
                    playStompSound();
                    updateUI();
                } else if (!player.hasStarPower) {
                    killPlayer();
                }
            } else if (boss.harmsOnTouch && checkCollision(player.hitbox(), boss)) {
                // シールドがあれば1回防御
                if (player.hasShield) {
                    player.hasShield = false;
                    guardReaction(player.x + player.width / 2, player.y + player.height / 2);
                    playStompSound(); // シールド発動音
                    updateUI();
                    boss.onShieldHit();
                } else if (!player.hasStarPower) {
                    // スターパワー中は無敵
                    killPlayer();
                }
            }
        }
    }

    for (let i = coins.length - 1; i >= 0; i--) {
        const coin = coins[i];
        coin.update();
        if (player.magnetTimer > 0 && player.alive) pullCoin(coin);
        coin.draw();
        if (coin.isOffScreen()) {
            coins.splice(i, 1);
        } else if (player.alive && checkCollision(player.hitbox(), coin)) {
            coins.splice(i, 1);
            sparkle(coin.x + coin.width / 2, coin.y + coin.height / 2);
            addScore(10, coin.x + coin.width / 2, coin.y - 8);
            if (player.animationFrame - lastCoinFrame > 30) {
                comicSfx(coin.x + coin.width / 2, coin.y - 26, 'チャリン♪', '#FFE082', 12, 26);
            }
            lastCoinFrame = player.animationFrame;
            playCoinSound();
        }
    }

    updateEffects();
    drawEffects();

    if (player.alive && endingTimer > 0 && --endingTimer === 0) startEnding();
}

function startEnding() {
    stopMusic();
    playBossDefeatSound();
    playStory(endingPanels(round + 1), () => {
        round++;
        seedsCollected = 0;
        enemies = [];
        bullets = [];
        bombs = [];
        clearEffects();
        addBanner(`${round}しゅうめ スタート!`, '#CE93D8');
        updateUI();
        switchBgm('normal');
    });
}

function drawOverlay(lines, { gloom = false } = {}) {
    scoreElement.hidden = true;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);
    if (gloom) drawGloomLines();

    const unit = Math.min(view.cssWidth / 14, view.cssHeight / 9, 56);
    const totalHeight = lines.reduce((sum, line) => sum + unit * line.size * 1.5, 0);
    let y = (view.cssHeight - totalHeight) / 2;
    for (const line of lines) {
        const size = unit * line.size;
        if (line.comic) {
            comicText(line.text, view.cssWidth / 2, y + size / 2, size, line.color || '#FFEB3B', -0.06);
        } else {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${size}px sans-serif`;
            ctx.fillStyle = line.color || 'white';
            ctx.fillText(line.text, view.cssWidth / 2, y + size / 2);
        }
        y += size * 1.5;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

// 漫画でショックを表す縦線を、画面上部から垂らす
function drawGloomLines() {
    ctx.strokeStyle = 'rgba(30, 20, 60, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 6; x < view.cssWidth; x += 9) {
        const length = view.cssHeight * (0.25 + 0.25 * Math.abs(Math.sin(x * 12.9898)));
        ctx.moveTo(x, 0);
        ctx.lineTo(x, length);
    }
    ctx.stroke();
}

function drawGameOver() {
    const isNewRecord = score > 0 && score >= highScore;
    drawOverlay([
        { text: isNewRecord ? 'やったね!!' : 'ガーン!!', size: 0.7, color: isNewRecord ? '#FFD54F' : '#90CAF9', comic: true },
        { text: 'GAME OVER', size: 1.1, color: '#FF5252', comic: true },
        { text: `スコア ${score}`, size: 0.7 },
        { text: isNewRecord ? `🎉 ハイスコア更新！ ${highScore}` : `ハイスコア ${highScore}`, size: 0.55, color: '#FFD700' },
        { text: 'タップしてリスタート', size: 0.45 },
    ], { gloom: !isNewRecord });
}

function drawMiss() {
    drawOverlay([
        { text: 'ミス!', size: 1.1, color: '#FF8A65', comic: true },
        { text: `のこり ${lives}き`, size: 0.8, color: '#69F0AE' },
        { text: `スコア ${score}`, size: 0.55 },
        { text: 'タップしてつづきから', size: 0.45 },
    ], { gloom: true });
}

function drawBackdrop() {
    clearEffects();
    applyWorldTransform();
    drawSky();
    drawGround();
    drawGloom(gloom);
    player.draw();
}

function drawTitle() {
    drawBackdrop();
    drawOverlay([
        { text: 'ジャンプランナー', size: 1.1, comic: true },
        { text: 'カゲノオウから いろのタネを とりもどせ!', size: 0.38, color: '#CE93D8' },
        { text: 'タップしてスタート', size: 0.5 },
        { text: 'タップでジャンプ(くうちゅうで もう1かい) / 下スワイプでスライディング', size: 0.32, color: '#FFD700' },
    ]);
}

// Android の Chrome は全画面中でないと向きを固定できない。iOS の Safari は固定できないため、shared/landscape.js で画面を回して横向きにする
function lockLandscape() {
    if (!matchMedia('(pointer: coarse)').matches || !screen.orientation?.lock) return;
    const lock = () => screen.orientation.lock('landscape').catch(() => {});
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) {
        lock();
        return;
    }
    document.documentElement.requestFullscreen().then(lock, () => {});
}

function startGame() {
    lockLandscape();
    init();
    gameState = 'playing';
    updateUI();

    initAudio();
    playStartSound();
    playMusic();

    startGameLoop();
}

function startFromTitle() {
    if (localStorage.getItem(PROLOGUE_SEEN_KEY)) {
        startGame();
        return;
    }
    lockLandscape();
    playStory(PROLOGUE, () => {
        localStorage.setItem(PROLOGUE_SEEN_KEY, '1');
        startGame();
    });
}

// ジャンプ連打中のタップでゲームオーバー直後に即リスタートしてしまわないよう、少し待つ
const RESTART_DELAY_MS = 800;

let gestureJump = null;

function handleTap() {
    if (gameState === 'playing') {
        gestureJump = player.jump();
    } else if (gameState === 'story') {
        advanceStory();
    } else if (gameState === 'ready') {
        startFromTitle();
    } else if (performance.now() - gameOverAt < RESTART_DELAY_MS) {
        return;
    } else if (gameState === 'miss') {
        continueGame();
    } else if (gameState === 'gameover') {
        startGame();
    }
}

function handleSlide() {
    if (gameState !== 'playing') return;
    player.cancelJump(gestureJump);
    gestureJump = null;
    player.slide();
}

// 下スワイプを待ってからジャンプすると反応が遅れるため、ジャンプは押した瞬間に行い、スワイプされたら取り消す
const SWIPE_DOWN_PX = 30;
let swipeStartY = null;

document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.back')) return;
    e.preventDefault();
    swipeStartY = e.clientY;
    handleTap();
});

document.addEventListener('pointermove', (e) => {
    if (swipeStartY === null || e.clientY - swipeStartY < SWIPE_DOWN_PX) return;
    swipeStartY = null;
    handleSlide();
});

document.addEventListener('pointercancel', () => {
    swipeStartY = null;
});

// タッチの pointerdown はブラウザによってユーザー操作と見なされず AudioContext が suspended のままになるため、pointerup で再開する
document.addEventListener('pointerup', () => {
    swipeStartY = null;
    if (audioContext && audioContext.state === 'suspended') audioContext.resume();
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        if (!e.repeat) handleTap();
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        if (!e.repeat) {
            gestureJump = null;
            handleSlide();
        }
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
    } else if (gameState === 'miss') {
        drawBackdrop();
        drawMiss();
    }
});

init();
drawTitle();

// DOM要素
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const distanceEl = document.getElementById('distance');
const bestEl = document.getElementById('best');
const canvasContainer = document.getElementById('canvas-container');
const powerGaugeUI = document.getElementById('powerGaugeUI');
const powerBar = document.getElementById('powerBar');
const powerValue = document.getElementById('powerValue');

// Three.js基本設定
let scene, camera, renderer;
let player, ball, field;
let playerParts = {}; // プレイヤーのパーツを保持
let ballTrail = [];

// ゲーム状態
const GAME_STATE = {
    READY: 'ready',
    POWER_SELECT: 'power_select',
    THROWING_ANIMATION: 'throwing_animation',
    THROWING: 'throwing',
    CAMERA_ZOOM: 'camera_zoom',
    RESULT: 'result'
};

let gameState = GAME_STATE.READY;
let power = 0;
let powerDirection = 1;
let ballPhysics = null;
let distance = 0;
let bestDistance = parseInt(localStorage.getItem('bestDistance')) || 0;
let animationFrame = 0;
let throwAnimationDuration = 60; // フレーム数

// カメラアニメーション用
let cameraTargetPosition = new THREE.Vector3();
let cameraTargetLookAt = new THREE.Vector3();
const CAMERA_ZOOM_SPEED = 0.05; // ズーム速度（0.02-0.1、小さいほどゆっくり）

// 物理定数
const GRAVITY = 0.02;
const MAX_POWER = 1.2;
const FIELD_LENGTH = 80;

// 初期化
function init() {
    bestEl.textContent = bestDistance;
    initThreeJS();
    createField();
    createPlayer();
    animate();
}

// Three.jsシーン初期化
function initThreeJS() {
    // シーン作成
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 50, 100);

    // カメラ設定
    camera = new THREE.PerspectiveCamera(
        60,
        canvasContainer.clientWidth / canvasContainer.clientHeight,
        0.1,
        1000
    );
    // プレイヤーとフィールド全体が見える固定位置
    const playerX = -FIELD_LENGTH / 2 + 5;
    camera.position.set(playerX - 8, 6, 15);
    camera.lookAt(playerX + 15, 2, 0);

    // レンダラー作成
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(renderer.domElement);

    // ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(20, 30, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // リサイズ対応
    window.addEventListener('resize', onWindowResize, false);

    // クリックイベント
    canvasContainer.addEventListener('click', onCanvasClick);
}

function onWindowResize() {
    camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
}

// フィールド作成
function createField() {
    const fieldGroup = new THREE.Group();

    // 芝生
    const grassGeometry = new THREE.PlaneGeometry(FIELD_LENGTH, 30);
    const grassMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d5016,
        roughness: 0.8
    });
    const grass = new THREE.Mesh(grassGeometry, grassMaterial);
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    fieldGroup.add(grass);

    // フィールドライン
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });

    // サイドライン
    const sideLineGeometry1 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-FIELD_LENGTH / 2, 0.01, -15),
        new THREE.Vector3(FIELD_LENGTH / 2, 0.01, -15)
    ]);
    const sideLine1 = new THREE.Line(sideLineGeometry1, lineMaterial);
    fieldGroup.add(sideLine1);

    const sideLineGeometry2 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-FIELD_LENGTH / 2, 0.01, 15),
        new THREE.Vector3(FIELD_LENGTH / 2, 0.01, 15)
    ]);
    const sideLine2 = new THREE.Line(sideLineGeometry2, lineMaterial);
    fieldGroup.add(sideLine2);

    // 距離マーカー
    for (let i = 0; i <= FIELD_LENGTH; i += 10) {
        const x = i - FIELD_LENGTH / 2;

        // マーカーライン
        const markerGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x, 0.01, -15),
            new THREE.Vector3(x, 0.01, -13)
        ]);
        const marker = new THREE.Line(markerGeometry, lineMaterial);
        fieldGroup.add(marker);

        // テキスト（簡易版：小さい立方体で表現）
        const textGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textMesh.position.set(x, 0.5, -14);
        fieldGroup.add(textMesh);
    }

    scene.add(fieldGroup);
    field = fieldGroup;
}

// プレイヤー作成
function createPlayer() {
    const playerGroup = new THREE.Group();

    // 体（箱）
    const bodyGeometry = new THREE.BoxGeometry(0.8, 1.5, 0.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2196F3 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.5;
    body.castShadow = true;
    playerGroup.add(body);
    playerParts.body = body;

    // 頭
    const headGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xFFDBAC });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.6;
    head.castShadow = true;
    playerGroup.add(head);
    playerParts.head = head;

    // 腕（右）- スローイン用
    const armGeometry = new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8);
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x2196F3 });
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.6, 1.5, 0);
    rightArm.castShadow = true;
    playerGroup.add(rightArm);
    playerParts.rightArm = rightArm;

    // 腕（左）
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.6, 1.5, 0);
    leftArm.castShadow = true;
    playerGroup.add(leftArm);
    playerParts.leftArm = leftArm;

    // 脚（右）
    const legGeometry = new THREE.CylinderGeometry(0.15, 0.15, 1.5, 8);
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x1976D2 });
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.25, 0.75, 0);
    rightLeg.castShadow = true;
    playerGroup.add(rightLeg);
    playerParts.rightLeg = rightLeg;

    // 脚（左）
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.25, 0.75, 0);
    leftLeg.castShadow = true;
    playerGroup.add(leftLeg);
    playerParts.leftLeg = leftLeg;

    playerGroup.position.set(-FIELD_LENGTH / 2 + 5, 0, 0);
    scene.add(playerGroup);
    player = playerGroup;

    // 初期ポーズを設定
    resetPlayerPose();
}

// プレイヤーのポーズをリセット
function resetPlayerPose() {
    if (!playerParts.rightArm || !playerParts.leftArm) return;

    playerParts.rightArm.rotation.set(0, 0, Math.PI / 4);
    playerParts.rightArm.position.set(0.6, 1.5, 0);

    playerParts.leftArm.rotation.set(0, 0, -Math.PI / 4);
    playerParts.leftArm.position.set(-0.6, 1.5, 0);
}

// スローインアニメーション更新
function updateThrowAnimation() {
    animationFrame++;

    const progress = animationFrame / throwAnimationDuration;

    if (progress <= 0.5) {
        // 前半: ボールを頭上に持ち上げる
        const t = progress * 2; // 0 to 1

        // 両腕を上げる
        playerParts.rightArm.rotation.z = Math.PI / 4 - t * (Math.PI * 0.6);
        playerParts.rightArm.position.y = 1.5 + t * 0.5;

        playerParts.leftArm.rotation.z = -Math.PI / 4 + t * (Math.PI * 0.6);
        playerParts.leftArm.position.y = 1.5 + t * 0.5;

        // ボールを手の位置に
        if (ball) {
            ball.position.set(
                player.position.x + 0.3,
                player.position.y + 2.8 + t * 0.5,
                0
            );
        }
    } else {
        // 後半: 投げる動作
        const t = (progress - 0.5) * 2; // 0 to 1

        // 腕を前に振る
        playerParts.rightArm.rotation.z = -Math.PI / 3 - t * Math.PI / 3;
        playerParts.rightArm.rotation.x = -t * Math.PI / 4;
        playerParts.rightArm.position.y = 2.0 - t * 0.3;

        playerParts.leftArm.rotation.z = Math.PI / 3 + t * Math.PI / 3;
        playerParts.leftArm.rotation.x = -t * Math.PI / 4;
        playerParts.leftArm.position.y = 2.0 - t * 0.3;

        // ボールを前方に移動
        if (ball) {
            ball.position.set(
                player.position.x + 0.3 + t * 1.5,
                player.position.y + 3.3 - t * 0.8,
                0
            );
        }
    }

    // アニメーション完了
    if (animationFrame >= throwAnimationDuration) {
        releaseBall();
    }
}

// ボールを放す
function releaseBall() {
    if (!ball) return;

    const angle = 45 * (Math.PI / 180);
    const velocity = (power / 100) * MAX_POWER;

    ballPhysics = {
        velocityX: Math.cos(angle) * velocity,
        velocityY: Math.sin(angle) * velocity,
        velocityZ: 0
    };

    ballTrail = [];
    gameState = GAME_STATE.THROWING;

    // カメラは固定（プレイヤーとボールの両方が見える位置）
    // カメラ位置は変更しない
}

// 五角形の形状を作成
function createPentagonShape(size) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * size;
        const y = Math.sin(angle) * size;
        if (i === 0) {
            shape.moveTo(x, y);
        } else {
            shape.lineTo(x, y);
        }
    }
    shape.lineTo(Math.cos(-Math.PI / 2) * size, Math.sin(-Math.PI / 2) * size);
    return shape;
}

// ボール作成（投げる前、手に持つ）
function createBallInHand() {
    const ballGroup = new THREE.Group();
    const ballRadius = 0.4;

    // 白いベース球体
    const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
    const ballMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
        metalness: 0.0
    });
    const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
    ballMesh.castShadow = true;
    ballGroup.add(ballMesh);

    // 黒い五角形のパターン
    const pentagonShape = createPentagonShape(0.15);
    const extrudeSettings = {
        depth: 0.02,
        bevelEnabled: false
    };
    const pentagonGeometry = new THREE.ExtrudeGeometry(pentagonShape, extrudeSettings);
    const pentagonMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.6
    });

    // 正十二面体の頂点位置に五角形を配置
    const phi = (1 + Math.sqrt(5)) / 2; // 黄金比
    const pentagonPositions = [
        // 上下
        [0, 1, 0],
        [0, -1, 0],
        // 上部リング
        [1, phi, 0],
        [-1, phi, 0],
        [0, phi, 1],
        [0, phi, -1],
        // 下部リング
        [1, -phi, 0],
        [-1, -phi, 0],
        [0, -phi, 1],
        [0, -phi, -1],
        // 中央リング
        [phi, 0, 1],
        [phi, 0, -1]
    ];

    pentagonPositions.forEach(pos => {
        const pentagon = new THREE.Mesh(pentagonGeometry, pentagonMaterial);

        // 位置を正規化して球面に配置
        const length = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]);
        const x = (pos[0] / length) * (ballRadius + 0.01);
        const y = (pos[1] / length) * (ballRadius + 0.01);
        const z = (pos[2] / length) * (ballRadius + 0.01);

        pentagon.position.set(x, y, z);

        // 球面に沿って回転
        pentagon.lookAt(x * 2, y * 2, z * 2);

        pentagon.castShadow = true;
        ballGroup.add(pentagon);
    });

    ballGroup.position.set(player.position.x + 0.3, player.position.y + 2.8, 0);
    scene.add(ballGroup);
    ball = ballGroup;
}

// パワーゲージ更新
function updatePowerGauge() {
    power += powerDirection * 2;
    if (power >= 100 || power <= 0) {
        powerDirection *= -1;
    }
    power = Math.max(0, Math.min(100, power));

    powerBar.style.width = power + '%';
    powerValue.textContent = Math.round(power);
}

// ボール物理更新
function updateBallPhysics() {
    if (!ballPhysics || !ball) return;

    ballPhysics.velocityY -= GRAVITY;
    ball.position.x += ballPhysics.velocityX;
    ball.position.y += ballPhysics.velocityY;
    ball.position.z += ballPhysics.velocityZ;

    // ボール回転
    ball.rotation.x += 0.1;
    ball.rotation.z += 0.05;

    // 軌跡エフェクト
    if (ballTrail.length > 0) {
        const lastPos = ballTrail[ballTrail.length - 1];
        if (ball.position.distanceTo(lastPos) > 0.5) {
            ballTrail.push(ball.position.clone());
            if (ballTrail.length > 20) {
                ballTrail.shift();
            }
        }
    } else {
        ballTrail.push(ball.position.clone());
    }

    // 地面に着いたら停止
    if (ball.position.y <= 0.4) {
        ball.position.y = 0.4;
        ballPhysics.velocityX = 0;
        ballPhysics.velocityY = 0;
        ballPhysics.velocityZ = 0;

        // 飛距離計算
        const startX = player.position.x;
        distance = Math.round(ball.position.x - startX);
        distanceEl.textContent = distance;

        // ベスト更新
        if (distance > bestDistance) {
            bestDistance = distance;
            bestEl.textContent = bestDistance;
            localStorage.setItem('bestDistance', bestDistance);
        }

        // カメラズームアニメーション開始
        cameraTargetPosition.set(ball.position.x - 3, 3, 8);
        cameraTargetLookAt.copy(ball.position);
        gameState = GAME_STATE.CAMERA_ZOOM;
    }
}

// カメラズームアニメーション更新
function updateCameraZoom() {
    // 現在位置から目標位置に向かって徐々に移動
    camera.position.lerp(cameraTargetPosition, CAMERA_ZOOM_SPEED);

    // 現在の注視点を計算
    const currentLookAtTarget = new THREE.Vector3(player.position.x + 15, 2, 0);
    currentLookAtTarget.lerp(cameraTargetLookAt, CAMERA_ZOOM_SPEED);
    camera.lookAt(currentLookAtTarget);

    // 目標位置に十分近づいたら完了
    const distance = camera.position.distanceTo(cameraTargetPosition);
    if (distance < 0.1) {
        camera.position.copy(cameraTargetPosition);
        camera.lookAt(cameraTargetLookAt);
        gameState = GAME_STATE.RESULT;
        startBtn.disabled = false;
        startBtn.textContent = 'もう一度';
    }
}

// 投げるアニメーション開始
function startThrowAnimation() {
    // カメラをプレイヤーの斜め後方上空に固定
    // プレイヤーとボールの軌道が両方見える位置
    camera.position.set(player.position.x - 8, 6, 15);
    camera.lookAt(player.position.x + 15, 2, 0);

    // ボールを作成
    createBallInHand();

    animationFrame = 0;
    gameState = GAME_STATE.THROWING_ANIMATION;
    powerGaugeUI.classList.remove('active');
}

// アニメーションループ
function animate() {
    requestAnimationFrame(animate);

    if (gameState === GAME_STATE.POWER_SELECT) {
        updatePowerGauge();
    }

    if (gameState === GAME_STATE.THROWING_ANIMATION) {
        updateThrowAnimation();
    }

    if (gameState === GAME_STATE.THROWING) {
        updateBallPhysics();
    }

    if (gameState === GAME_STATE.CAMERA_ZOOM) {
        updateCameraZoom();
    }

    renderer.render(scene, camera);
}

// キャンバスクリック
function onCanvasClick() {
    if (gameState === GAME_STATE.POWER_SELECT) {
        startThrowAnimation();
    }
}

// スタートボタン
startBtn.addEventListener('click', () => {
    if (gameState === GAME_STATE.READY || gameState === GAME_STATE.RESULT) {
        gameState = GAME_STATE.POWER_SELECT;
        power = 0;
        powerDirection = 1;
        distance = 0;
        distanceEl.textContent = 0;
        startBtn.disabled = true;
        powerGaugeUI.classList.add('active');

        // ボール削除
        if (ball) {
            scene.remove(ball);
            ball = null;
        }
        ballPhysics = null;
        ballTrail = [];

        // プレイヤーのポーズリセット
        resetPlayerPose();

        // カメラリセット（プレイヤーが見える位置）
        camera.position.set(player.position.x - 8, 6, 15);
        camera.lookAt(player.position.x + 15, 2, 0);
    }
});

// リセットボタン
resetBtn.addEventListener('click', () => {
    gameState = GAME_STATE.READY;
    power = 0;
    distance = 0;
    distanceEl.textContent = 0;
    startBtn.disabled = false;
    startBtn.textContent = 'スタート';
    powerGaugeUI.classList.remove('active');

    if (ball) {
        scene.remove(ball);
        ball = null;
    }
    ballPhysics = null;
    ballTrail = [];

    // プレイヤーのポーズリセット
    resetPlayerPose();

    // カメラリセット（プレイヤーが見える位置）
    camera.position.set(player.position.x - 8, 6, 15);
    camera.lookAt(player.position.x + 15, 2, 0);
});

// ゲーム開始
init();

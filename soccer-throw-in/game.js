const stage = document.getElementById('stage');
const distanceEl = document.getElementById('distance');
const bestEl = document.getElementById('best');
const hintEl = document.getElementById('hint');
const resultEl = document.getElementById('result');
const resultDistanceEl = document.getElementById('resultDistance');
const resultBestEl = document.getElementById('resultBest');
const gaugeEl = document.getElementById('gauge');
const powerBar = document.getElementById('powerBar');
const powerValue = document.getElementById('powerValue');
const angleValue = document.getElementById('angleValue');

const STATE = {
    READY: 'ready',
    AIMING: 'aiming',
    SWINGING: 'swinging',
    FLYING: 'flying',
    RESULT: 'result'
};

const GRAVITY = 0.02;
const MAX_POWER = 1.2;
const POWER_SPEED = 120;
const ANGLE_MIN = 15;
const ANGLE_MAX = 75;
const ANGLE_PER_PIXEL = 0.2;
const WINDUP_SECONDS = 0.25;
const SWING_SECONDS = 0.22;
const RELEASE_AT = 0.6;
const BALL_RADIUS = 0.4;
const SHOULDER_Y = 2.1;
const HAND_REACH = 1.45;
const PLAYER_X = -35;

const ARM_REST = -1.2;
const ARM_WINDUP = -Math.PI - 0.6;
const ARM_FOLLOW = -1.1;

let scene, camera, renderer, player, ball, aimArrow;
const arms = [];
const camLook = new THREE.Vector3();
const camTargetPos = new THREE.Vector3();
const camTargetLook = new THREE.Vector3();

let state = STATE.READY;
let power = 0;
let powerDirection = 1;
let angle = 45;
let windup = 0;
let swing = 0;
let velocity = null;
let bestDistance = loadBest();
let aim = null;

function loadBest() {
    try {
        return parseInt(localStorage.getItem('bestDistance'), 10) || 0;
    } catch {
        return 0;
    }
}

function saveBest(value) {
    try {
        localStorage.setItem('bestDistance', String(value));
    } catch {
        return;
    }
}

function isPortrait() {
    return innerWidth < innerHeight;
}

function init() {
    bestEl.textContent = bestDistance;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 50, 110);

    camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 30, bottom: -30 });
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    createField();
    createPlayer();
    createBall();
    createAimArrow();
    resetRound();
    snapCamera();

    addEventListener('resize', onResize);
    bindInput();

    let last = performance.now();
    renderer.setAnimationLoop(now => {
        // 1フレーム固定量で進めると 120Hz 端末でボールが倍速になるため、経過時間を60fps換算する
        const frames = Math.min((now - last) / (1000 / 60), 3);
        last = now;
        update(frames);
        renderer.render(scene, camera);
    });
}

function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.fov = isPortrait() ? 70 : 60;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}

function createLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.strokeText(text, 64, 32);
    ctx.fillStyle = 'white';
    ctx.fillText(text, 64, 32);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        depthWrite: false
    }));
    sprite.scale.set(3, 1.5, 1);
    return sprite;
}

function addLine(group, from, to) {
    const line = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.hypot(to.x - from.x, to.z - from.z) || 0.15, 0.15),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = -Math.atan2(to.z - from.z, to.x - from.x);
    line.position.set((from.x + to.x) / 2, 0.02, (from.z + to.z) / 2);
    group.add(line);
}

function createField() {
    const field = new THREE.Group();

    const grass = new THREE.Mesh(
        new THREE.PlaneGeometry(240, 120),
        new THREE.MeshStandardMaterial({ color: 0x2d5016, roughness: 0.8 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    field.add(grass);

    for (let i = 0; i < 12; i += 2) {
        const stripe = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 30),
            new THREE.MeshStandardMaterial({ color: 0x3a6b1e, roughness: 0.8 })
        );
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(PLAYER_X + 5 + i * 10, 0.005, 0);
        stripe.receiveShadow = true;
        field.add(stripe);
    }

    addLine(field, { x: PLAYER_X - 5, z: -15 }, { x: PLAYER_X + 125, z: -15 });
    addLine(field, { x: PLAYER_X - 5, z: 15 }, { x: PLAYER_X + 125, z: 15 });

    for (let m = 10; m <= 100; m += 10) {
        const x = PLAYER_X + m;
        addLine(field, { x, z: -15 }, { x, z: 15 });
        const label = createLabel(`${m}m`);
        label.position.set(x, 0.9, -4);
        field.add(label);
    }

    scene.add(field);
}

function createArm(side, material) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.55, SHOULDER_Y, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 1.2, 8), material);
    arm.position.y = -0.6;
    arm.castShadow = true;
    pivot.add(arm);
    return pivot;
}

function createPlayer() {
    player = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: 0x2196f3 });
    const shorts = new THREE.MeshStandardMaterial({ color: 0x1976d2 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.5), shirt);
    body.position.y = 1.75;
    body.castShadow = true;
    player.add(body);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffdbac })
    );
    head.position.y = 2.75;
    head.castShadow = true;
    player.add(head);

    for (const side of [-1, 1]) {
        const arm = createArm(side, shirt);
        player.add(arm);
        arms.push(arm);

        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8), shorts);
        leg.position.set(side * 0.22, 0.6, 0);
        leg.castShadow = true;
        player.add(leg);
    }

    player.rotation.y = Math.PI / 2;
    player.position.set(PLAYER_X, 0, 0);
    scene.add(player);
}

function createBall() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, size * 2, size);
    ctx.fillStyle = '#111';
    const spots = [[0.12, 0.5], [0.37, 0.25], [0.37, 0.75], [0.62, 0.5], [0.87, 0.25], [0.87, 0.75], [0.25, 0.05], [0.75, 0.95]];
    for (const [u, v] of spots) {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            ctx.lineTo(u * size * 2 + Math.cos(a) * 18, v * size + Math.sin(a) * 18);
        }
        ctx.fill();
    }

    ball = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_RADIUS, 24, 16),
        new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.4 })
    );
    ball.castShadow = true;
    scene.add(ball);
}

function createAimArrow() {
    aimArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 1, 0).normalize(), new THREE.Vector3(), 4, 0xffd23f, 0.9, 0.6);
    aimArrow.visible = false;
    scene.add(aimArrow);
}

function setArms(armAngle) {
    for (const arm of arms) arm.rotation.x = armAngle;
    ball.position.set(
        player.position.x - HAND_REACH * Math.sin(armAngle),
        SHOULDER_Y - HAND_REACH * Math.cos(armAngle),
        0
    );
}

function updateAimArrow() {
    const rad = THREE.MathUtils.degToRad(angle);
    aimArrow.position.copy(ball.position);
    aimArrow.setDirection(new THREE.Vector3(Math.cos(rad), Math.sin(rad), 0));
    aimArrow.setLength(2 + 3 * (power / 100), 0.9, 0.6);
}

function resetRound() {
    state = STATE.READY;
    power = 0;
    powerDirection = 1;
    windup = 0;
    swing = 0;
    velocity = null;
    ball.rotation.set(0, 0, 0);
    setArms(ARM_REST);
    aimArrow.visible = false;
    resultEl.hidden = true;
    gaugeEl.hidden = true;
    distanceEl.textContent = 0;
}

function startAiming(y) {
    if (state === STATE.RESULT) resetRound();
    if (state !== STATE.READY) return;
    state = STATE.AIMING;
    aim = { startY: y, startAngle: angle };
    hintEl.hidden = true;
    gaugeEl.hidden = false;
    aimArrow.visible = true;
    vibrate(10);
}

function moveAim(y) {
    if (state !== STATE.AIMING || !aim) return;
    angle = THREE.MathUtils.clamp(
        Math.round(aim.startAngle + (aim.startY - y) * ANGLE_PER_PIXEL),
        ANGLE_MIN,
        ANGLE_MAX
    );
}

function release() {
    aim = null;
    if (state !== STATE.AIMING) return;
    state = STATE.SWINGING;
    swing = 0;
    aimArrow.visible = false;
    vibrate(25);
}

function cancelAim() {
    aim = null;
    if (state === STATE.AIMING) resetRound();
}

function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
}

function bindInput() {
    const canvas = renderer.domElement;
    let pointerId = null;

    canvas.addEventListener('pointerdown', e => {
        if (pointerId !== null) return;
        pointerId = e.pointerId;
        canvas.setPointerCapture(e.pointerId);
        startAiming(e.clientY);
    });
    canvas.addEventListener('pointermove', e => {
        if (e.pointerId === pointerId) moveAim(e.clientY);
    });
    canvas.addEventListener('pointerup', e => {
        if (e.pointerId !== pointerId) return;
        pointerId = null;
        release();
    });
    canvas.addEventListener('pointercancel', e => {
        if (e.pointerId !== pointerId) return;
        pointerId = null;
        cancelAim();
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    addEventListener('keydown', e => {
        if (e.code === 'Space' && !e.repeat) {
            e.preventDefault();
            startAiming(0);
        } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
            e.preventDefault();
            angle = THREE.MathUtils.clamp(angle + (e.code === 'ArrowUp' ? 1 : -1), ANGLE_MIN, ANGLE_MAX);
        }
    });
    addEventListener('keyup', e => {
        if (e.code === 'Space') release();
    });
}

function updateAiming(frames) {
    windup = Math.min(windup + frames / 60 / WINDUP_SECONDS, 1);
    const eased = 1 - (1 - windup) ** 2;
    setArms(ARM_REST + (ARM_WINDUP - ARM_REST) * eased);

    power += powerDirection * POWER_SPEED * (frames / 60);
    if (power >= 100) {
        power = 100;
        powerDirection = -1;
    } else if (power <= 0) {
        power = 0;
        powerDirection = 1;
    }
    powerBar.style.width = `${power}%`;
    powerValue.textContent = Math.round(power);
    angleValue.textContent = angle;
    updateAimArrow();
}

function updateSwing(frames) {
    swing = Math.min(swing + frames / 60 / SWING_SECONDS, 1);
    const from = ARM_REST + (ARM_WINDUP - ARM_REST) * (1 - (1 - windup) ** 2);
    const armAngle = from + (ARM_FOLLOW - from) * swing;

    if (!velocity) {
        setArms(armAngle);
        if (swing >= RELEASE_AT) {
            const rad = THREE.MathUtils.degToRad(angle);
            const speed = (power / 100) * MAX_POWER;
            velocity = new THREE.Vector3(Math.cos(rad) * speed, Math.sin(rad) * speed, 0);
        }
    } else {
        for (const arm of arms) arm.rotation.x = armAngle;
        updateBall(frames);
    }
    if (swing >= 1 && velocity) state = STATE.FLYING;
}

function updateBall(frames) {
    velocity.y -= GRAVITY * frames;
    ball.position.addScaledVector(velocity, frames);
    ball.rotation.z -= 0.15 * frames;

    if (ball.position.y > BALL_RADIUS) return;
    ball.position.y = BALL_RADIUS;
    finish();
}

function finish() {
    state = STATE.RESULT;
    gaugeEl.hidden = true;
    const distance = Math.max(0, Math.round(ball.position.x - player.position.x));
    distanceEl.textContent = distance;
    resultDistanceEl.textContent = `${distance}m`;
    const isBest = distance > bestDistance;
    resultBestEl.hidden = !isBest;
    if (isBest) {
        bestDistance = distance;
        bestEl.textContent = bestDistance;
        saveBest(bestDistance);
    }
    resultEl.hidden = false;
    vibrate(isBest ? [30, 60, 30] : 30);
}

function setCameraTarget() {
    const portrait = isPortrait();
    const p = ball.position;
    const px = player.position.x;

    if (state === STATE.FLYING || (state === STATE.SWINGING && velocity)) {
        // 縦画面は投げた方向を奥行きで見せるため背後から、横画面は真横から追う
        if (portrait) {
            camTargetPos.set(p.x - 9, Math.max(5, p.y * 0.6 + 3), 4);
            camTargetLook.set(p.x + 8, Math.max(0.5, p.y * 0.5), 0);
        } else {
            camTargetPos.set(Math.max(px - 8, p.x - 14), 6, 15);
            camTargetLook.set(Math.max(px + 15, p.x + 2), Math.max(2, p.y * 0.6), 0);
        }
    } else if (state === STATE.RESULT) {
        if (portrait) {
            camTargetPos.set(p.x - 6, 3.5, 3);
        } else {
            camTargetPos.set(p.x - 3, 3, 8);
        }
        camTargetLook.copy(p);
    } else if (portrait) {
        camTargetPos.set(px - 9, 6, 3);
        camTargetLook.set(px + 22, 0, -1);
    } else {
        camTargetPos.set(px - 8, 6, 15);
        camTargetLook.set(px + 15, 2, 0);
    }
}

function snapCamera() {
    onResize();
    setCameraTarget();
    camera.position.copy(camTargetPos);
    camLook.copy(camTargetLook);
    camera.lookAt(camLook);
}

function updateCamera(frames) {
    setCameraTarget();
    const k = 1 - Math.pow(1 - 0.08, frames);
    camera.position.lerp(camTargetPos, k);
    camLook.lerp(camTargetLook, k);
    camera.lookAt(camLook);
}

function update(frames) {
    if (state === STATE.AIMING) updateAiming(frames);
    else if (state === STATE.SWINGING) updateSwing(frames);
    else if (state === STATE.FLYING) updateBall(frames);
    updateCamera(frames);
}

init();

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

OUT_DIR="site"

GAMES=(
  "pilot|vite|パイロット|3D フライト|操縦桿を握って大空へ。自由自在に飛び回ろう！"
  "nawabari|tsc|ナワバリバトル|対戦アクション|インクを塗って陣地を広げろ。最後に多く塗ったほうが勝ち！"
  "jump-runner|static|ジャンプランナー|ランアクション|タップでジャンプ！障害物をよけてどこまで走れるか挑戦しよう。"
  "penalty-kick|static|サッカー PK|スポーツ|キーパーとの真剣勝負。コースを狙ってゴールを決めろ！"
  "soccer-throw-in|static|サッカー スローイン|3D スポーツ|ねらいを定めて味方へスローイン。正確さが勝負のカギ！"
  "bowling|vite|ボーリング|3D スポーツ|100 ピンをなぎ倒せ！ストライクをねらって高スコアを目指そう。"
)

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cp -r thumbnails "$OUT_DIR/thumbnails"

links=""
stage=0
for entry in "${GAMES[@]}"; do
  IFS='|' read -r name type title genre desc <<<"$entry"
  echo "==> $name ($type)"
  dest="$OUT_DIR/$name"

  case "$type" in
    vite)
      # npm run build の tsc は未使用変数などでも失敗するため、公開用には型チェックを挟まない
      # minify は設定に terser を指定していても未インストールなことがあるため esbuild に固定する
      (cd "$name" && npm ci && npx vite build --base=./ --minify esbuild --outDir "../$dest" --emptyOutDir)
      ;;
    tsc)
      (cd "$name" && npm ci && npm run build)
      mkdir -p "$dest"
      cp "$name/index.html" "$name"/*.js "$dest/"
      ;;
    static)
      mkdir -p "$dest"
      cp "$name"/*.html "$dest/"
      find "$name" -maxdepth 1 \( -name '*.js' -o -name '*.css' \) -exec cp {} "$dest/" \;
      ;;
    *)
      echo "unknown type: $type" >&2
      exit 1
      ;;
  esac

  [[ -f "$dest/index.html" ]] || { echo "missing $dest/index.html" >&2; exit 1; }
  [[ -f "thumbnails/$name.svg" ]] || { echo "missing thumbnails/$name.svg" >&2; exit 1; }
  stage=$((stage + 1))
  stage_label=$(printf '%02d' "$stage")
  links+="      <a class=\"card\" href=\"./$name/\">
        <div class=\"thumb\">
          <span class=\"stage\">STAGE $stage_label</span>
          <img src=\"./thumbnails/$name.svg\" alt=\"\" loading=\"lazy\" />
        </div>
        <div class=\"body\">
          <span class=\"genre\">$genre</span>
          <h2>$title</h2>
          <p>$desc</p>
          <span class=\"play\">PRESS START</span>
        </div>
      </a>"$'\n'
done

cat >"$OUT_DIR/index.html" <<EOF
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GAME ARCADE</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DotGothic16&family=Press+Start+2P&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg: #07051a;
        --panel: #15103a;
        --edge: #3a2f86;
        --text: #f4f1ff;
        --muted: #a9a2d6;
        --pink: #ff3ea5;
        --cyan: #29e7ff;
        --yellow: #ffd23f;
        --px: 4px;
      }
      * { box-sizing: border-box; }
      html { background: var(--bg); }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "DotGothic16", system-ui, sans-serif;
        color: var(--text);
        background:
          radial-gradient(900px 500px at 15% -10%, rgba(255, 62, 165, 0.28), transparent 60%),
          radial-gradient(900px 500px at 100% 0%, rgba(41, 231, 255, 0.22), transparent 60%),
          var(--bg);
        overflow-x: hidden;
      }
      #stars { position: fixed; inset: 0; width: 100%; height: 100%; z-index: -2; image-rendering: pixelated; }
      body::before {
        content: "";
        position: fixed;
        inset: auto -50% -40% -50%;
        height: 60vh;
        background:
          linear-gradient(transparent 0 calc(100% - 2px), rgba(255, 62, 165, 0.5) 0) 0 0 / 100% 48px,
          linear-gradient(90deg, transparent 0 calc(100% - 2px), rgba(41, 231, 255, 0.4) 0) 0 0 / 48px 100%;
        transform: perspective(400px) rotateX(62deg);
        mask-image: linear-gradient(to top, #000 10%, transparent 90%);
        animation: grid 2.4s linear infinite;
        pointer-events: none;
        z-index: -1;
      }
      @keyframes grid { to { background-position: 0 48px, 0 0; } }
      body::after {
        content: "";
        position: fixed;
        inset: 0;
        background:
          repeating-linear-gradient(rgba(0, 0, 0, 0.22) 0 1px, transparent 1px 3px),
          radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.55));
        pointer-events: none;
        z-index: 100;
      }

      .hud {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        font-family: "Press Start 2P", monospace;
        font-size: 0.65rem;
        background: rgba(7, 5, 26, 0.85);
        border-bottom: var(--px) solid var(--edge);
        backdrop-filter: blur(6px);
      }
      .hud .label { color: var(--pink); margin-right: 8px; }
      .hud .value { color: var(--yellow); }
      .hud button {
        font: inherit;
        color: var(--cyan);
        background: none;
        border: 2px solid currentColor;
        padding: 6px 10px;
        cursor: pointer;
      }
      .hud button[aria-pressed="false"] { color: var(--muted); }

      .wrap { max-width: 1120px; margin: 0 auto; padding: 0 16px 80px; }
      header { text-align: center; padding: 64px 0 48px; }
      h1 {
        margin: 0 0 28px;
        font-family: "Press Start 2P", monospace;
        font-size: clamp(1.7rem, 8vw, 4.4rem);
        line-height: 1.25;
        color: var(--yellow);
        text-shadow: 4px 4px 0 var(--pink), 8px 8px 0 #000;
        animation: float 2s steps(4) infinite alternate;
      }
      @keyframes float { to { transform: translateY(-8px); } }
      .insert {
        font-family: "Press Start 2P", monospace;
        font-size: 0.8rem;
        letter-spacing: 0.2em;
        color: var(--cyan);
        background: none;
        border: 0;
        padding: 8px;
        cursor: pointer;
        animation: blink 1s steps(2) infinite;
      }
      .insert.has-credit { color: var(--yellow); }
      @keyframes blink { 50% { opacity: 0; } }
      .lead { margin: 16px 0 0; color: var(--muted); font-size: 1.05rem; }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
        gap: 32px 28px;
      }
      .card {
        --edge-color: var(--edge);
        position: relative;
        display: flex;
        flex-direction: column;
        margin: var(--px);
        background: var(--panel);
        color: inherit;
        text-decoration: none;
        box-shadow:
          0 calc(var(--px) * -1) 0 0 var(--edge-color),
          0 var(--px) 0 0 var(--edge-color),
          calc(var(--px) * -1) 0 0 0 var(--edge-color),
          var(--px) 0 0 0 var(--edge-color),
          calc(var(--px) * 3) calc(var(--px) * 3) 0 0 #000;
        transition: transform 0.12s steps(2);
      }
      .card:hover, .card:focus-visible {
        --edge-color: var(--accent);
        transform: translate(calc(var(--px) * -1), calc(var(--px) * -1));
        outline: none;
      }
      .card:nth-child(6n+1) { --accent: #4fa3ff; --g1: #1e3c8a; --g2: #4fa3ff; }
      .card:nth-child(6n+2) { --accent: #ff3ea5; --g1: #7a1fa2; --g2: #ff3ea5; }
      .card:nth-child(6n+3) { --accent: #ffb02e; --g1: #b33a00; --g2: #ffb02e; }
      .card:nth-child(6n+4) { --accent: #3ee08f; --g1: #0b6b3a; --g2: #3ee08f; }
      .card:nth-child(6n+5) { --accent: #29e7ff; --g1: #005f7a; --g2: #29e7ff; }
      .card:nth-child(6n+6) { --accent: #c084fc; --g1: #4c1d95; --g2: #c084fc; }
      .thumb {
        position: relative;
        display: grid;
        place-items: center;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        background: linear-gradient(135deg, var(--g1), var(--g2));
        border-bottom: var(--px) solid #000;
      }
      .stage {
        position: absolute;
        z-index: 1;
        top: 10px;
        left: 10px;
        padding: 6px 8px;
        font-family: "Press Start 2P", monospace;
        font-size: 0.55rem;
        color: #fff;
        background: rgba(0, 0, 0, 0.55);
      }
      .thumb img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s steps(3);
      }
      .card:hover .thumb img, .card:focus-visible .thumb img { transform: scale(1.08); }
      .thumb::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(rgba(0, 0, 0, 0.16) 50%, transparent 0) 0 0 / 100% 4px;
        pointer-events: none;
      }
      .body { display: flex; flex-direction: column; gap: 8px; padding: 18px 20px 20px; flex: 1; }
      .genre {
        align-self: flex-start;
        padding: 3px 8px;
        font-size: 0.8rem;
        color: #000;
        background: var(--accent);
      }
      h2 { margin: 4px 0 0; font-weight: 400; font-size: 1.5rem; }
      h2::before { content: "▶ "; color: var(--accent); visibility: hidden; }
      .card:hover h2::before, .card:focus-visible h2::before {
        visibility: visible;
        animation: blink 0.6s steps(2) infinite;
      }
      .body p { margin: 0; color: var(--muted); line-height: 1.7; flex: 1; }
      .play {
        margin-top: 10px;
        align-self: flex-end;
        padding: 10px 14px;
        font-family: "Press Start 2P", monospace;
        font-size: 0.65rem;
        color: #000;
        background: var(--accent);
        box-shadow: var(--px) var(--px) 0 0 #000;
      }
      .card:active .play { transform: translate(var(--px), var(--px)); box-shadow: none; }
      footer {
        margin-top: 64px;
        text-align: center;
        font-family: "Press Start 2P", monospace;
        font-size: 0.6rem;
        line-height: 2;
        color: var(--muted);
        letter-spacing: 0.15em;
      }
      .keys { color: var(--cyan); }
      @media (hover: none) { .keys, h2::before { display: none; } }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation: none !important; transition: none !important; }
      }
    </style>
  </head>
  <body>
    <canvas id="stars" aria-hidden="true"></canvas>
    <div class="hud">
      <div><span class="label">1P</span><span class="label">CREDIT</span><span class="value" id="credit">00</span></div>
      <button type="button" id="sound" aria-pressed="true">♪ ON</button>
    </div>
    <div class="wrap">
      <header>
        <h1>GAME<br />ARCADE</h1>
        <button type="button" class="insert" id="insert">INSERT COIN</button>
        <p class="lead">― SELECT YOUR GAME ―</p>
      </header>
      <main class="grid" id="games">
$links      </main>
      <footer>
        <div class="keys">← ↑ → ↓ SELECT · ENTER START</div>
        <div>${#GAMES[@]} GAMES · © GAME ARCADE</div>
      </footer>
    </div>
    <script>
      (function () {
        var audio = null;
        var soundOn = true;
        try { soundOn = localStorage.getItem("arcadeSound") !== "off"; } catch (e) {}

        function beep(notes, type) {
          if (!soundOn) return;
          try {
            audio = audio || new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === "suspended") audio.resume();
            var t = audio.currentTime;
            notes.forEach(function (n) {
              var osc = audio.createOscillator();
              var gain = audio.createGain();
              osc.type = type || "square";
              osc.frequency.value = n[0];
              gain.gain.setValueAtTime(0.06, t + n[1]);
              gain.gain.exponentialRampToValueAtTime(0.001, t + n[1] + n[2]);
              osc.connect(gain).connect(audio.destination);
              osc.start(t + n[1]);
              osc.stop(t + n[1] + n[2]);
            });
          } catch (e) {}
        }
        var sfx = {
          move: function () { beep([[880, 0, 0.05]]); },
          coin: function () { beep([[988, 0, 0.08], [1319, 0.08, 0.3]]); },
          start: function () { beep([[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.25]]); },
        };

        var soundButton = document.getElementById("sound");
        function renderSound() {
          soundButton.setAttribute("aria-pressed", String(soundOn));
          soundButton.textContent = soundOn ? "♪ ON" : "♪ OFF";
        }
        renderSound();
        soundButton.addEventListener("click", function () {
          soundOn = !soundOn;
          try { localStorage.setItem("arcadeSound", soundOn ? "on" : "off"); } catch (e) {}
          renderSound();
          sfx.move();
        });

        var credit = 0;
        var creditEl = document.getElementById("credit");
        var insert = document.getElementById("insert");
        insert.addEventListener("click", function () {
          credit = Math.min(credit + 1, 99);
          creditEl.textContent = String(credit).padStart(2, "0");
          insert.textContent = "PRESS START";
          insert.classList.add("has-credit");
          sfx.coin();
        });

        var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
        var grid = document.getElementById("games");
        cards.forEach(function (card) {
          card.addEventListener("mouseenter", sfx.move);
          card.addEventListener("focus", sfx.move);
          card.addEventListener("click", function (e) {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            sfx.start();
            setTimeout(function () { location.href = card.href; }, soundOn ? 450 : 0);
          });
        });

        document.addEventListener("keydown", function (e) {
          var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: "up", ArrowDown: "down" }[e.key];
          if (!step) return;
          e.preventDefault();
          var cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
          var current = cards.indexOf(document.activeElement);
          var next;
          if (current < 0) next = 0;
          else if (step === "up") next = current - cols;
          else if (step === "down") next = current + cols;
          else next = current + step;
          if (next >= 0 && next < cards.length) {
            cards[next].focus();
            cards[next].scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        });

        var canvas = document.getElementById("stars");
        var ctx = canvas.getContext("2d");
        var stars = [];
        function resize() {
          canvas.width = Math.ceil(innerWidth / 3);
          canvas.height = Math.ceil(innerHeight / 3);
          stars = [];
          var count = Math.round(canvas.width * canvas.height / 180);
          for (var i = 0; i < count; i++) {
            stars.push({ x: Math.random() * canvas.width | 0, y: Math.random() * canvas.height | 0, p: Math.random() * 6.28, s: 0.5 + Math.random() * 2 });
          }
        }
        var still = matchMedia("(prefers-reduced-motion: reduce)").matches;
        function draw(time) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          stars.forEach(function (s) {
            var a = still ? 0.7 : 0.35 + 0.65 * Math.abs(Math.sin(s.p + time / 1000 * s.s));
            ctx.fillStyle = "rgba(255, 255, 255, " + a.toFixed(2) + ")";
            ctx.fillRect(s.x, s.y, 1, 1);
          });
          if (!still) requestAnimationFrame(draw);
        }
        resize();
        addEventListener("resize", function () { resize(); if (still) draw(0); });
        requestAnimationFrame(draw);
      })();
    </script>
  </body>
</html>
EOF
touch "$OUT_DIR/.nojekyll"
echo "==> built ${#GAMES[@]} games into $OUT_DIR/"

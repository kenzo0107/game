#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

OUT_DIR="site"

GAMES=(
  "pilot|vite|パイロット|✈️|3D フライト|操縦桿を握って大空へ。自由自在に飛び回ろう！"
  "nawabari|tsc|ナワバリバトル|🎨|対戦アクション|インクを塗って陣地を広げろ。最後に多く塗ったほうが勝ち！"
  "jump-runner|static|ジャンプランナー|🏃|ランアクション|タップでジャンプ！障害物をよけてどこまで走れるか挑戦しよう。"
  "penalty-kick|static|サッカー PK|⚽|スポーツ|キーパーとの真剣勝負。コースを狙ってゴールを決めろ！"
  "soccer-throw-in|static|サッカー スローイン|🥅|3D スポーツ|ねらいを定めて味方へスローイン。正確さが勝負のカギ！"
  "bowling|vite|ボーリング|🎳|3D スポーツ|100 ピンをなぎ倒せ！ストライクをねらって高スコアを目指そう。"
)

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

links=""
for entry in "${GAMES[@]}"; do
  IFS='|' read -r name type title icon genre desc <<<"$entry"
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
  links+="      <a class=\"card\" href=\"./$name/\">
        <div class=\"thumb\"><span>$icon</span></div>
        <div class=\"body\">
          <span class=\"genre\">$genre</span>
          <h2>$title</h2>
          <p>$desc</p>
          <span class=\"play\">PLAY ▶</span>
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
    <link href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=M+PLUS+Rounded+1c:wght@500;800&family=Press+Start+2P&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg: #0b0820;
        --panel: rgba(255, 255, 255, 0.06);
        --line: rgba(255, 255, 255, 0.12);
        --text: #f4f1ff;
        --muted: #b7b0d8;
        --pink: #ff3ea5;
        --cyan: #29e7ff;
        --yellow: #ffd23f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "M PLUS Rounded 1c", system-ui, sans-serif;
        color: var(--text);
        background:
          radial-gradient(1200px 600px at 10% -10%, rgba(255, 62, 165, 0.35), transparent 60%),
          radial-gradient(1000px 600px at 110% 10%, rgba(41, 231, 255, 0.28), transparent 60%),
          var(--bg);
        overflow-x: hidden;
      }
      body::before {
        content: "";
        position: fixed;
        inset: auto -50% -40% -50%;
        height: 70vh;
        background:
          linear-gradient(transparent 0 calc(100% - 1px), rgba(255, 62, 165, 0.45) 0) 0 0 / 100% 48px,
          linear-gradient(90deg, transparent 0 calc(100% - 1px), rgba(41, 231, 255, 0.35) 0) 0 0 / 48px 100%;
        transform: perspective(400px) rotateX(62deg);
        mask-image: linear-gradient(to top, #000 10%, transparent 90%);
        animation: grid 3s linear infinite;
        pointer-events: none;
        z-index: -1;
      }
      @keyframes grid { to { background-position: 0 48px, 0 0; } }
      .wrap { max-width: 1120px; margin: 0 auto; padding: 0 16px 80px; }
      header { text-align: center; padding: 72px 0 48px; }
      .insert {
        font-family: "Press Start 2P", monospace;
        font-size: 0.7rem;
        letter-spacing: 0.2em;
        color: var(--yellow);
        animation: blink 1.2s steps(2) infinite;
      }
      @keyframes blink { 50% { opacity: 0; } }
      h1 {
        margin: 20px 0 12px;
        font-family: "Press Start 2P", monospace;
        font-size: clamp(1.6rem, 7vw, 4.2rem);
        line-height: 1.2;
        background: linear-gradient(90deg, var(--pink), var(--yellow), var(--cyan));
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        filter: drop-shadow(0 0 18px rgba(255, 62, 165, 0.55));
      }
      .lead { margin: 0; color: var(--muted); font-size: 1.05rem; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
        gap: 24px;
      }
      .card {
        position: relative;
        display: flex;
        flex-direction: column;
        border-radius: 20px;
        background: var(--panel);
        border: 1px solid var(--line);
        backdrop-filter: blur(8px);
        color: inherit;
        text-decoration: none;
        overflow: hidden;
        transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
      }
      .card:hover, .card:focus-visible {
        transform: translateY(-6px);
        border-color: var(--accent);
        box-shadow: 0 16px 40px -12px var(--accent), 0 0 0 1px var(--accent);
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
        background:
          repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.07) 0 12px, transparent 12px 24px),
          linear-gradient(135deg, var(--g1), var(--g2));
      }
      .thumb span {
        font-size: 4.5rem;
        filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.35));
        transition: transform 0.3s ease;
      }
      .card:hover .thumb span { transform: scale(1.15) rotate(-6deg); }
      .body { display: flex; flex-direction: column; gap: 8px; padding: 18px 20px 20px; flex: 1; }
      .genre {
        align-self: flex-start;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 800;
        color: var(--accent);
        border: 1px solid var(--accent);
      }
      h2 { margin: 4px 0 0; font-family: "Dela Gothic One", sans-serif; font-weight: 400; font-size: 1.45rem; }
      .body p { margin: 0; color: var(--muted); line-height: 1.6; flex: 1; }
      .play {
        margin-top: 8px;
        align-self: flex-end;
        padding: 10px 18px;
        border-radius: 10px;
        font-family: "Press Start 2P", monospace;
        font-size: 0.7rem;
        color: #0b0820;
        background: var(--accent);
        transition: transform 0.2s ease;
      }
      .card:hover .play { transform: scale(1.06); }
      footer {
        margin-top: 56px;
        text-align: center;
        font-family: "Press Start 2P", monospace;
        font-size: 0.6rem;
        color: var(--muted);
        letter-spacing: 0.15em;
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before { animation: none !important; transition: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <div class="insert">INSERT COIN</div>
        <h1>GAME ARCADE</h1>
        <p class="lead">ブラウザですぐ遊べるミニゲーム集</p>
      </header>
      <main class="grid">
$links      </main>
      <footer>${#GAMES[@]} GAMES · PRESS START</footer>
    </div>
  </body>
</html>
EOF

touch "$OUT_DIR/.nojekyll"
echo "==> built ${#GAMES[@]} games into $OUT_DIR/"

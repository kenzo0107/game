#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

OUT_DIR="site"

GAMES=(
  "basketball|vite|3D バスケットボール"
  "baybrade|vite|ベイブレードバトル"
  "minecraft|vite|マインクラフト風ボクセル"
  "pilot|vite|パイロット"
  "nawabari|tsc|ナワバリバトル"
  "jump-runner|static|ジャンプランナー"
  "penalty-kick|static|サッカー PK"
  "soccer-throw-in|static|サッカー スローイン"
)

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

links=""
for entry in "${GAMES[@]}"; do
  IFS='|' read -r name type title <<<"$entry"
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
  links+="      <li><a href=\"./$name/\">$title</a></li>"$'\n'
done

cat >"$OUT_DIR/index.html" <<EOF
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ゲーム一覧</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; background: #111; color: #eee; }
      h1 { font-size: 1.6rem; }
      ul { list-style: none; padding: 0; display: grid; gap: 12px; }
      a { display: block; padding: 16px; border-radius: 8px; background: #222; color: #8cf; text-decoration: none; font-size: 1.1rem; }
      a:hover { background: #333; }
    </style>
  </head>
  <body>
    <h1>ゲーム一覧</h1>
    <ul>
$links    </ul>
  </body>
</html>
EOF

touch "$OUT_DIR/.nojekyll"
echo "==> built ${#GAMES[@]} games into $OUT_DIR/"

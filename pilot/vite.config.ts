import { defineConfig } from 'vite'

// アーケードとして公開するときは複数ゲームで three を共有してダウンロード量を減らすため、
// build.sh が import map で読み込ませる前提でバンドルから外す。単体で build・preview するときは従来どおり同梱する
const sharedThree = process.env.ARCADE_SHARED_THREE === '1'

export default defineConfig({
  base: './',
  server: {
    fs: {
      allow: ['..'],
    },
  },
  build: {
    rolldownOptions: {
      external: sharedThree ? ['three'] : [],
    },
  },
})

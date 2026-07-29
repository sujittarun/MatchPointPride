import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Stamped into every error report so a bug can be pinned to a release.
const version = JSON.parse(readFileSync('./package.json', 'utf8')).version

// Served from https://<user>.github.io/MatchPointPride/
export default defineConfig({
  base: '/MatchPointPride/',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})

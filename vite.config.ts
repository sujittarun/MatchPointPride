import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://<user>.github.io/MatchPointPride/
export default defineConfig({
  base: '/MatchPointPride/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Stamped into every error report so a bug can be pinned to a release.
const version = JSON.parse(readFileSync('./package.json', 'utf8')).version

/* Two targets, one bundle.

   web      served from https://<user>.github.io/MatchPointPride/, so
            everything is rooted at that path.
   android  loaded by the WebView from https://localhost/index.html
            with the files sitting in the APK's assets. There is no
            /MatchPointPride/ there, so the asset URLs have to be
            relative or every script tag 404s against the app itself.

   They write to different directories on purpose. Sharing `dist` would
   mean a stray `npm run build:android` could leave a relative-base
   build in the folder the Pages workflow uploads. */
export default defineConfig(({ mode }) => {
  const android = mode === 'android'
  return {
    base: android ? './' : '/MatchPointPride/',
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: {
      outDir: android ? 'dist-android' : 'dist',
      emptyOutDir: true,
      sourcemap: false,
    },
  }
})

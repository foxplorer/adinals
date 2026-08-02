import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @bsv/sdk 2.1.6 probes node:crypto before falling back to its browser
      // hash implementation. Vite's external-module proxy throws when that
      // optional property is read, so resolve the probe to an inert shim.
      'node:crypto': fileURLToPath(new URL('./src/shims/nodeCrypto.ts', import.meta.url)),
    },
  },
  build: {
    sourcemap: false,
  },
  server: {
    proxy: {
      '/adinals-overlay': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/adinals-overlay/, ''),
      },
    },
  },
})

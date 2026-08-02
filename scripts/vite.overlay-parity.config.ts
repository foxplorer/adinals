import { defineConfig } from 'vite'

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: 'scripts/overlay-reader-parity.ts',
    outDir: '.overlay-parity-dist',
    emptyOutDir: true,
  },
})

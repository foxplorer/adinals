import { defineConfig } from 'vite'

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: 'scripts/overlay-view-model-diff.ts',
    outDir: '.overlay-view-model-dist',
    emptyOutDir: true,
  },
})

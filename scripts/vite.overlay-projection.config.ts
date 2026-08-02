import { defineConfig } from 'vite'

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: 'scripts/overlay-projection-diff.ts',
    outDir: '.overlay-projection-dist',
    emptyOutDir: true,
  },
})

import { defineConfig } from 'vite'

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: 'scripts/overlay-reconcile.ts',
    outDir: '.overlay-reconcile-dist',
    emptyOutDir: true,
  },
})

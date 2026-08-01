import { defineConfig } from 'vite'

export default defineConfig(() => {
  // Retained fixtures deliberately belong to the isolated canary namespace.
  // A developer's production `.env.local` must not reinterpret those signed
  // bytes as `app=adinals` records during the offline self-test.
  Object.assign(process.env, {
    VITE_ADINALS_ENV: 'development',
    VITE_ADINALS_APP: 'adinals-brc100-test',
    VITE_ADINALS_BASKET: 'adinals brc100 test',
    VITE_ADINALS_KEY_PROTOCOL: 'adinals brc100 test',
    VITE_ADINALS_ACTION_LABEL: 'adinals brc100 test action',
    VITE_ADINALS_OVERLAY_TOPIC: 'tm_adinals_brc100_test',
    VITE_ADINALS_MESSAGEBOX: 'adinals_brc100_test_inbox',
  })

  return {
    ssr: { noExternal: true },
    build: {
      ssr: 'scripts/collection-script-selftest.ts',
      outDir: '.selftest-dist',
      emptyOutDir: true,
    },
  }
})

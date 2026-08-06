import { AdinalsOverlayClient } from './src/overlay/client.ts'
import { readOverlayFormula } from './src/readers/overlayReader.ts'
const client = new AdinalsOverlayClient(
  'https://backend.93913ed6b421f18f80e669c61239a690.projects.babbage.systems',
  { topic: 'tm_adinals' },
)
const records = await readOverlayFormula(client, {
  type: 'collectionProjection', version: 1,
  origin: 'ba4ad45336217b47fe0a48603a381d5c13bee854c41aa8eac6b6ab6d49008925_0',
})
const nulls = (records as any[]).filter((r) => r.height === null)
console.log(`${records.length} records, ${nulls.length} without a height`)
for (const r of nulls) console.log('   still null:', String(r.outpoint).slice(0, 12), r.recordType)

import { Beef, Transaction } from '@bsv/sdk'
import { AdinalsOverlayClient } from '../src/overlay/client.ts'
import { reconcileConfirmedExternalSpends } from '../src/overlay/externalReconciliation.ts'
import { readOverlayFormula, readOverlayLifecycleProjection } from '../src/readers/overlayReader.ts'
import { parseGorillaPoolTransactionProof } from '../src/readers/rawTransactions.ts'

const endpoint = (process.env.ADINALS_OVERLAY_URL ?? 'http://localhost:8080').replace(/\/+$/, '')
const gorillaPool = 'https://ordinals.gorillapool.io/api'
const client = new AdinalsOverlayClient(endpoint)

const confirmedTransaction = async (txid: string): Promise<Transaction | null> => {
  const response = await fetch(`${gorillaPool}/tx/${txid}`, {
    headers: { accept: 'application/octet-stream' },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GorillaPool proof request failed: ${response.status}`)
  const transaction = parseGorillaPoolTransactionProof(
    new Uint8Array(await response.arrayBuffer()),
  )
  if (transaction.id('hex') !== txid) throw new Error('GorillaPool proof txid mismatch')
  return transaction.merklePath ? transaction : null
}

const combinedProof = (predecessor: Transaction, current: Transaction): number[] => {
  const beef = new Beef()
  beef.mergeBeef(predecessor.toBEEF())
  beef.mergeBeef(current.toBEEF())
  if (!beef.isValid()) throw new Error('combined confirmed reconciliation BEEF is invalid')
  return beef.toBinary()
}

const currentOutpoints = async (): Promise<string[]> => {
  const collections = await readOverlayFormula(client, {
    type: 'collections', version: 1, limit: 500,
  })
  const projections = await Promise.all(collections
    .filter((record) => record.recordType === 'collection')
    .map((record) => readOverlayLifecycleProjection(client, record.outpoint)))
  return projections.flatMap((projection) => projection.ads.map((ad) => ad.currentOutpoint))
}

let passes = 0
let totalSubmitted = 0
let totalAlreadyPresent = 0
let totalChecked = 0
const failures: Array<{ outpoint: string; error: string }> = []
for (; passes < 20; passes += 1) {
  const result = await reconcileConfirmedExternalSpends({
    currentOutpoints: await currentOutpoints(),
    async discoverConfirmedSpend(outpoint) {
      const response = await fetch(`${gorillaPool}/txos/${encodeURIComponent(outpoint)}`, {
        headers: { accept: 'application/json' },
      })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`GorillaPool outpoint request failed: ${response.status}`)
      const row = await response.json() as { spend?: unknown }
      const txid = typeof row.spend === 'string' ? row.spend.toLowerCase() : ''
      if (!txid) return null
      if (!/^[0-9a-f]{64}$/.test(txid)) throw new Error('GorillaPool returned an invalid spend txid')
      const [predecessor, current] = await Promise.all([
        confirmedTransaction(outpoint.split('_')[0]!),
        confirmedTransaction(txid),
      ])
      // Reconciliation is confirmed-only. Mempool/unproven spends remain for
      // immediate browser submission or a later confirmed pass.
      if (!predecessor || !current) return null
      return { txid, beef: combinedProof(predecessor, current) }
    },
    submit: (beef) => client.submit(beef),
    hasOutput: (outpoint) => client.hasOutput(outpoint),
  })
  totalChecked += result.checked
  totalSubmitted += result.submitted
  totalAlreadyPresent += result.alreadyPresent
  failures.push(...result.failures)
  if (result.failures.length || result.submitted === 0) break
}

if (failures.length) {
  throw new Error(`Confirmed reconciliation failed: ${failures.map((failure) =>
    `${failure.outpoint}: ${failure.error}`).join(' | ')}`)
}

console.log(JSON.stringify({
  endpoint,
  passes: passes + 1,
  checked: totalChecked,
  submitted: totalSubmitted,
  alreadyPresent: totalAlreadyPresent,
  failures: 0,
}))


import { Hash, Utils } from '@bsv/sdk'
import type { AdinalsCollectionMap } from '../protocol/collectionMetadata.ts'
import type { CollectionScriptVerification } from '../protocol/collectionScript.ts'

export type CollectionFixtureSource = {
  broadcast: false
  txid: string
  outpoint: string
  anchorTxid: string
  anchorOutpoint: string
  rawtx: string
  atomicBeef: number[]
  basket: string
  ownerAddress: string
  map: AdinalsCollectionMap
  verification: CollectionScriptVerification
}

export function buildCollectionFixture(
  source: CollectionFixtureSource,
  context: { walletVersion: string; source: 'live-result' | 'wallet-recovery' },
) {
  return {
    format: 'adinals-brc100-collection-fixture-v1',
    exportedAt: new Date().toISOString(),
    source: context.source,
    walletVersion: context.walletVersion,
    broadcast: false,
    txid: source.txid,
    outpoint: source.outpoint,
    anchorTxid: source.anchorTxid,
    anchorOutpoint: source.anchorOutpoint,
    basket: source.basket,
    ownerAddress: source.ownerAddress,
    map: source.map,
    verification: source.verification,
    rawtx: source.rawtx,
    atomicBeef: {
      encoding: 'base64',
      bytes: source.atomicBeef.length,
      sha256: Utils.toHex(Hash.sha256(source.atomicBeef)),
      data: Utils.toBase64(source.atomicBeef),
    },
  }
}

export function downloadCollectionFixture(
  source: CollectionFixtureSource,
  context: { walletVersion: string; source: 'live-result' | 'wallet-recovery' },
): void {
  const fixture = buildCollectionFixture(source, context)
  const blob = new Blob([`${JSON.stringify(fixture, null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `adinals-collection-${source.txid}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

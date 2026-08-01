import { Hash, Utils } from '@bsv/sdk'
import type { AdinalsNoSendAction } from '../actions/lifecycle.ts'

export function buildActionFixture(
  action: AdinalsNoSendAction,
  context: { walletVersion: string },
) {
  return {
    format: 'adinals-brc100-action-fixture-v1',
    exportedAt: new Date().toISOString(),
    walletVersion: context.walletVersion,
    kind: action.kind,
    broadcast: false,
    txid: action.txid,
    outpoint: action.outpoint,
    stateOutpoint: action.stateOutpoint,
    anchorTxid: action.anchorTxid,
    anchorOutpoint: action.anchorOutpoint,
    basket: action.basket,
    protocolID: action.protocolID,
    ownerKeyID: action.ownerKeyID,
    signerKeyID: action.signerKeyID,
    ownerAddress: action.ownerAddress,
    map: action.map,
    verification: action.verification,
    rawtx: action.rawtx,
    atomicBeef: {
      encoding: 'base64',
      bytes: action.atomicBeef.length,
      sha256: Utils.toHex(Hash.sha256(action.atomicBeef)),
      data: Utils.toBase64(action.atomicBeef),
    },
  }
}

export function downloadActionFixture(
  action: AdinalsNoSendAction,
  context: { walletVersion: string },
): void {
  const fixture = buildActionFixture(action, context)
  const blob = new Blob([`${JSON.stringify(fixture, null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `adinals-${action.kind}-${action.txid}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

import { Inscription, MAP as MAPTemplate } from '@1sat/templates'
import { P2PKH, PublicKey, Script } from '@bsv/sdk'
import {
  verifyCollectionScript,
  type CollectionScriptVerification,
  type SigmaInput,
} from './collectionScript.ts'
import type { AdinalsRecordMap, RecordContent } from './adinalMetadata.ts'

export * from './adinalMetadata.ts'

export function buildUnsignedAdinalRecordScript(
  ownerPublicKey: string,
  map: AdinalsRecordMap,
  content?: RecordContent,
): Script {
  const suffix = new Script()
  for (const chunk of new P2PKH().lock(PublicKey.fromString(ownerPublicKey).toAddress()).chunks) suffix.chunks.push(chunk)
  for (const chunk of MAPTemplate.set(map).chunks) suffix.chunks.push(chunk)
  const recordContent = content ?? { data: new TextEncoder().encode(map.name), type: 'text/plain;charset=utf-8' }
  return new Script(Inscription.create(recordContent.data, recordContent.type, { scriptSuffix: suffix }).lock().chunks)
}

export function verifyAdinalRecordScript(
  lockingScript: Script,
  unsigned: Script,
  sigmaInput: SigmaInput,
  map: AdinalsRecordMap,
): CollectionScriptVerification {
  return verifyCollectionScript(lockingScript, unsigned, sigmaInput, map as never)
}

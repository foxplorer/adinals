import { ADINALS_NAMESPACE } from '../config/environment.ts'

export type AdinalsRecordMap = Record<string, string> & {
  app: string
  type: 'ord'
  name: string
  subType: 'collectionItem' | 'adUpdate' | 'adDecision'
  protocolVersion: '3'
}

export type RecordContent = { data: Uint8Array; type: string }

const outpoint = (value: string, label: string): string => {
  const normalized = value.trim().replace('.', '_')
  if (!/^[0-9a-f]{64}_\d+$/i.test(normalized)) throw new Error(`${label} must be a transaction outpoint.`)
  return normalized.toLowerCase()
}

const baseMap = (name: string, subType: AdinalsRecordMap['subType']): AdinalsRecordMap => ({
  app: ADINALS_NAMESPACE.app, type: 'ord', name: name.trim(), subType, protocolVersion: '3',
})

export type CreateAdinalInput = {
  collectionId: string; name: string; serial: number; format: 'text' | 'image'; text?: string
  image?: RecordContent; maxChars?: number; url?: string; now?: Date
}

export function buildAdinalMintMap(input: CreateAdinalInput): AdinalsRecordMap {
  const name = input.name.trim()
  const collectionId = outpoint(input.collectionId, 'Collection ID')
  if (!name) throw new Error('An ad needs a name.')
  if (!Number.isSafeInteger(input.serial) || input.serial < 1) throw new Error('Ad serial must be a positive whole number.')
  if (input.format !== 'text' && input.format !== 'image') throw new Error('Ad format must be text or image.')
  const text = input.text?.trim() ?? ''
  if (input.format === 'text') {
    if (!text) throw new Error('A text ad needs creative text.')
    if (input.maxChars && [...text].length > input.maxChars) throw new Error(`Ad exceeds its ${input.maxChars}-character limit.`)
  }
  if (input.format === 'image' && (!input.image?.data.length || !input.image.type.trim())) throw new Error('An image ad needs image bytes and a content type.')
  const url = input.url?.trim() ?? ''
  if (url && !/^https:\/\//i.test(url)) throw new Error('Ad destination must use HTTPS.')
  return {
    ...baseMap(`${name} #${input.serial}`, 'collectionItem'),
    subTypeData: JSON.stringify({ collectionId, mintNumber: input.serial }), adFormat: input.format,
    ...(input.format === 'text' ? { adText: text, adMaxChars: String(input.maxChars ?? 0) } : {}),
    ...(url ? { adUrl: url } : {}), mintedAt: (input.now ?? new Date()).toISOString(),
  }
}

export type UpdateAdinalInput = {
  collectionId: string; adOrigin: string; adOutpoint: string; ownerEpoch: string
  format: 'text' | 'image'; text?: string; image?: RecordContent; url?: string; now?: Date
}

export function buildAdinalUpdateMap(input: UpdateAdinalInput): AdinalsRecordMap {
  const collectionId = outpoint(input.collectionId, 'Collection ID')
  const adOrigin = outpoint(input.adOrigin, 'Ad origin')
  const adOutpoint = outpoint(input.adOutpoint, 'Current Adinal')
  const ownerEpoch = outpoint(input.ownerEpoch, 'Ownership epoch')
  const text = input.text?.trim() ?? ''
  if (input.format === 'text' && !text) throw new Error('A text update needs creative text.')
  if (input.format === 'image' && (!input.image?.data.length || !input.image.type.trim())) throw new Error('An image update needs image bytes and a content type.')
  const url = input.url?.trim() ?? ''
  if (url && !/^https:\/\//i.test(url)) throw new Error('Ad destination must use HTTPS.')
  return {
    ...baseMap('Ad update', 'adUpdate'), collectionId, adOrigin, adOutpoint, ownerEpoch,
    transition: 'spend-linked-self-v1', adFormat: input.format,
    ...(input.format === 'text' ? { adText: text } : {}), ...(url ? { adUrl: url } : {}),
    updatedAt: (input.now ?? new Date()).toISOString(),
  }
}

export type DecideAdinalInput = {
  collectionId: string; adOrigin: string; updateOutpoint: string; adOutpoint: string
  ownerEpoch: string; verdict: 'approved' | 'disapproved'; reasonCode: string; now?: Date
}

export function buildAdinalDecisionMap(input: DecideAdinalInput): AdinalsRecordMap {
  const collectionId = outpoint(input.collectionId, 'Collection ID')
  const adOrigin = outpoint(input.adOrigin, 'Ad origin')
  const updateOutpoint = outpoint(input.updateOutpoint, 'Update outpoint')
  const adOutpoint = outpoint(input.adOutpoint, 'Updated Adinal outpoint')
  const ownerEpoch = outpoint(input.ownerEpoch, 'Ownership epoch')
  const [updateTxid, updateVout] = updateOutpoint.split('_')
  const [adTxid, adVout] = adOutpoint.split('_')
  if (updateVout !== '1') throw new Error('The approved update must be output 1.')
  if (adTxid !== updateTxid || adVout !== '0') throw new Error('The updated Adinal must be output 0 of the same transaction.')
  return {
    ...baseMap('Ad decision', 'adDecision'), collectionId, adOrigin, updateOutpoint, adOutpoint, ownerEpoch,
    transitionTxid: updateTxid as string, revisionOutpoint: updateOutpoint, decision: input.verdict,
    reasonCode: input.reasonCode.trim(), decidedAt: (input.now ?? new Date()).toISOString(),
  }
}

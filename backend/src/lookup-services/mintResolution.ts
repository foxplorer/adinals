import type { AdmittedOutputRecord } from './AdinalsStorage.js'

type MintFacts = {
  record: AdmittedOutputRecord
  collectionId: string
  mintNumber: number
}

const subtypeData = (map: Record<string, string>): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(map.subTypeData ?? '')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

const facts = (record: AdmittedOutputRecord): MintFacts | null => {
  if (record.recordType !== 'collectionItem' || !record.map) return null
  const data = subtypeData(record.map)
  if (
    typeof data?.collectionId !== 'string' ||
    typeof data.mintNumber !== 'number' ||
    !Number.isSafeInteger(data.mintNumber)
  ) return null
  return {
    record,
    collectionId: data.collectionId,
    mintNumber: data.mintNumber
  }
}

const relatedMintError = (
  mint: MintFacts,
  collection: AdmittedOutputRecord
): string => {
  const collectionMap = collection.map
  const mintMap = mint.record.map
  if (!collectionMap || !mintMap || collection.recordType !== 'collection') {
    return 'collection evidence unavailable'
  }
  const capacity = Number(collectionMap.adMax)
  if (mint.record.signerAddress !== collection.signerAddress) {
    return 'mint signer is not collection creator'
  }
  if (mintMap.adFormat !== collectionMap.adFormat) return 'format mismatch'
  if (mint.mintNumber < 1 || !Number.isSafeInteger(capacity) || mint.mintNumber > capacity) {
    return 'slot is outside collection capacity'
  }
  if (mintMap.adFormat === 'text') {
    const collectionMax = Number(collectionMap.adMaxChars)
    if (
      mintMap.adMaxChars !== collectionMap.adMaxChars ||
      !Number.isSafeInteger(collectionMax) ||
      [...(mintMap.adText ?? '')].length > collectionMax
    ) return 'text rules mismatch'
  }
  return ''
}

const confirmedOrder = (left: AdmittedOutputRecord, right: AdmittedOutputRecord): number =>
  (left.blockHeight as number) - (right.blockHeight as number) ||
  (left.transactionIndex as number) - (right.transactionIndex as number) ||
  left.txid.localeCompare(right.txid) ||
  left.outputIndex - right.outputIndex

export const resolveMintWinners = (
  records: readonly AdmittedOutputRecord[]
): AdmittedOutputRecord[] => {
  const collections = new Map(
    records
      .filter((record) => record.recordType === 'collection')
      .map((record) => [`${record.txid}_${record.outputIndex}`, record])
  )
  const groups = new Map<string, MintFacts[]>()

  for (const record of records) {
    const mint = facts(record)
    if (!mint) continue
    const collection = collections.get(mint.collectionId)
    if (!collection || relatedMintError(mint, collection)) continue
    const key = `${mint.collectionId}:${mint.mintNumber}`
    groups.set(key, [...(groups.get(key) ?? []), mint])
  }

  const winners: AdmittedOutputRecord[] = []
  for (const candidates of groups.values()) {
    const confirmed = candidates.filter(({ record }) =>
      record.blockHeight !== undefined && record.transactionIndex !== undefined
    )
    if (confirmed.length) {
      confirmed.sort((left, right) => confirmedOrder(left.record, right.record))
      winners.push(confirmed[0].record)
    } else if (candidates.length === 1) {
      winners.push(candidates[0].record)
    }
    // Multiple unconfirmed claims are quarantined until deterministic order is
    // proven; local arrival order never decides protocol state.
  }
  return winners
}

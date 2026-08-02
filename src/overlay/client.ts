import { Transaction } from '@bsv/sdk'

export type OverlayQuery = Record<string, unknown> & {
  type: string
  version: 1
}

export type OverlayOutput = {
  beef: number[]
  outputIndex: number
}

export type OverlayLookupResponse = {
  type?: string
  outputs: OverlayOutput[]
}

export type OverlaySteak = Record<string, {
  outputsToAdmit: number[]
  coinsToRetain: number[]
}>

type OverlayClientOptions = {
  fetcher?: typeof fetch
  topic?: string
  service?: string
}

const responseMessage = (body: unknown, fallback: string): string => {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

const normalizedOutpoint = (value: string): string => {
  const match = /^([0-9a-f]{64})[._](\d+)$/i.exec(value.trim())
  if (!match) throw new Error('A valid overlay output outpoint is required.')
  const outputIndex = Number(match[2])
  if (!Number.isSafeInteger(outputIndex)) throw new Error('A valid overlay output index is required.')
  return `${match[1]!.toLowerCase()}_${outputIndex}`
}

export class AdinalsOverlayClient {
  readonly endpoint: string
  readonly topic: string
  readonly service: string
  readonly fetcher: typeof fetch

  constructor(endpoint: string, options: OverlayClientOptions = {}) {
    const normalized = endpoint.trim().replace(/\/+$/, '')
    if (!/^https?:\/\//.test(normalized)) throw new Error('A valid Adinals overlay HTTP endpoint is required.')
    this.endpoint = normalized
    this.topic = options.topic ?? 'tm_adinals'
    this.service = options.service ?? 'ls_adinals'
    // Browser fetch requires its native global receiver. Storing it directly
    // and later calling `this.fetcher(...)` binds `this` to the client object,
    // which Brave/Chromium rejects as an illegal invocation.
    this.fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init))
  }

  async submit(atomicBeef: readonly number[]): Promise<OverlaySteak> {
    if (atomicBeef.length === 0) throw new Error('Overlay submission requires verified Atomic BEEF.')
    const response = await this.fetcher(`${this.endpoint}/submit`, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-topics': JSON.stringify([this.topic]),
      },
      body: Uint8Array.from(atomicBeef),
    })
    const body = await response.json().catch(() => null) as unknown
    if (!response.ok) {
      throw new Error(responseMessage(body, `Adinals overlay submission failed: ${response.status}`))
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Adinals overlay returned a malformed STEAK acknowledgment.')
    }
    return body as OverlaySteak
  }

  async lookup(query: OverlayQuery): Promise<OverlayLookupResponse> {
    const response = await this.fetcher(`${this.endpoint}/lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service: this.service, query }),
    })
    const body = await response.json().catch(() => null) as unknown
    if (!response.ok) {
      throw new Error(responseMessage(body, `Adinals overlay lookup failed: ${response.status}`))
    }
    if (!body || typeof body !== 'object' || !Array.isArray((body as { outputs?: unknown }).outputs)) {
      throw new Error('Adinals overlay returned a malformed lookup formula.')
    }
    return body as OverlayLookupResponse
  }

  async hasOutput(outpoint: string): Promise<boolean> {
    const normalized = normalizedOutpoint(outpoint)
    const [txid, outputIndexText] = normalized.split('_') as [string, string]
    const outputIndex = Number(outputIndexText)
    const result = await this.lookup({ type: 'output', version: 1, origin: normalized })
    return result.outputs.some((candidate) => {
      if (candidate.outputIndex !== outputIndex || !Array.isArray(candidate.beef)) return false
      try {
        const transaction = Transaction.fromBEEF(candidate.beef)
        return transaction.id('hex') === txid && Boolean(transaction.outputs[outputIndex])
      } catch {
        return false
      }
    })
  }
}

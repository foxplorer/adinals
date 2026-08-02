/**
 * Adinals — collections, ads, updates and approvals.
 *
 * The canonical Adinals product interface backed by a connected BRC-100
 * wallet. Funding, derived-key signing, custom transaction scripts, and output
 * custody stay inside the wallet; public discovery remains independently
 * verified by this application.
 *
 * Version 3 owner updates spend the live Adinal back to its owner and commit the
 * creative as output 1. See productCatalog.ts for public resolution and
 * productWallet.ts for the BRC-100 action adapter.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  APP,
  CONTENT,
  MARKET,
  proveSpendLinkedRecord,
  readRecords,
  submitToIndexer,
  type MarketEvent,
  type Row,
} from '../readers/productCatalog'
import { isFoxplorerCreator } from '../curation'
import {
  buyAd,
  cancelAdListing,
  createCollection,
  createConnectedLabKeys,
  decideUpdate,
  listAdForSale,
  mintAd,
  ownsAd,
  ownsCollection,
  ownsListing,
  publishUpdate,
  type LabKeys,
  type LabWriteResult,
} from '../wallet/productWallet'
import { ADINALS_NAMESPACE, ADINALS_OVERLAY_URL } from '../config/environment.ts'
import { runOverlayShadowRead } from '../readers/overlayShadowReadClient.ts'
import type {
  OverlaySubmission,
  OverlaySubmissionStatus,
} from '../overlay/submissionQueue.ts'
import { useWallet } from '../wallet/WalletContext.tsx'
import { useOwnership } from './useOwnership.ts'
import {
  IMAGE_PROFILE,
  imageProfileSummary,
  imageSelectionLabel,
  readImageFile,
  type SelectedImage,
} from '../media/imageProfile'
import {
  AD_URL_MAX_LENGTH,
  adUrlHost,
  validateAdUrl,
  validateStoredAdUrl,
} from '../media/adUrl'
import {
  adDecisionRecordError,
  adMintRecordError,
  adUpdateRecordError,
  ADINALS_PROTOCOL_VERSION,
  collectionRulesFromRecord,
  readAdinalsSubTypeData,
  type AdinalsCollectionRules,
} from '../protocol/records'
import {
  colorPickerValue,
  getAdinalsCollectionUiProfile,
  isValidHexColor,
  normalizeHexColor,
} from './adinalsCollectionProfiles'
import './Adinals.css'

type CreativeFormat = 'text' | 'image'
type CollectionScope = 'all' | 'featured' | 'mine'
type EmbedTarget = { kind: 'ad' | 'collection'; origin: string; name: string }
type EmbedFormat = 'html' | 'json' | 'react'
type EmbedTheme = 'dark' | 'light' | 'transparent'
type CollectionEmbedMode = 'random' | 'grid'

const ADINALS_API_BASE = (
  import.meta.env.VITE_ADINALS_API_BASE ||
  'https://tenmillionfoxes-99288f417d7b.herokuapp.com/adinals/v1'
).replace(/\/+$/, '')
const ADINALS_EMBED_SCRIPT =
  import.meta.env.VITE_ADINALS_EMBED_SCRIPT_URL || 'https://adinals.com/adinals-embed.js'
const ADINALS_REPOSITORY = 'https://github.com/foxplorer/adinals'
const ADINALS_PREVIEW_API_BASE = ADINALS_API_BASE
const ADINALS_PREVIEW_SCRIPT = import.meta.env.DEV ? '/adinals-embed.js' : ADINALS_EMBED_SCRIPT

let embedScriptLoad: Promise<void> | null = null

function loadEmbedScript(): Promise<void> {
  if (customElements.get('adinals-embed')) return Promise.resolve()
  if (embedScriptLoad) return embedScriptLoad
  embedScriptLoad = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-adinals-embed-preview]')
    const script = existing ?? document.createElement('script')
    const ready = () => customElements.whenDefined('adinals-embed').then(() => resolve(), reject)
    script.addEventListener('load', ready, { once: true })
    script.addEventListener('error', () => {
      embedScriptLoad = null
      script.remove()
      reject(new Error('The embed component could not be loaded.'))
    }, { once: true })
    if (!existing) {
      script.type = 'module'
      script.src = ADINALS_PREVIEW_SCRIPT
      script.dataset.adinalsEmbedPreview = 'true'
      document.head.append(script)
    }
  })
  return embedScriptLoad
}

type Collection = {
  origin: string
  name: string
  description: string
  /** Verified SIGMA address — the only identity that can approve. */
  creator: string
  max: number
  approval: string
  contentPolicy: string
  format: CreativeFormat
  imageProfile: string
  maxChars: number
  placement: string
  expiresAt: string
  expired: boolean
  height: number | null
}

type Update = {
  outpoint: string
  /** Output 0 of the same transaction: the live Adinal state this update describes. */
  adOutpoint: string
  /** The transfer/purchase outpoint that began the current owner's epoch. */
  ownerEpoch: string
  format: CreativeFormat
  text: string
  contentUrl: string
  url: string
  signer: string
  height: number | null
  idx: number
  createdAt: string
  /** Signed by whoever holds the ad right now. */
  valid: boolean
  invalidReason: string
  verdict?: 'approved' | 'disapproved' | 'conflicted'
  verdictOutpoint?: string
  verdictAt?: string
  verdictHeight?: number | null
  verdictIdx?: number
}

type Ad = {
  origin: string
  outpoint: string
  collectionId: string
  owner: string
  ownerEpoch: string
  serial: number
  name: string
  format: CreativeFormat
  mintText: string
  mintContentUrl: string
  mintUrl: string
  mintedAt: string
  height: number | null
  listing: { price: number; seller: string } | null
  originHeight: number | null
  originIdx: number
  /** False when the ad was not signed by the collection's creator. */
  fromCreator: boolean
  invalidReason: string
  /** A later creator-signed origin claimed a slot already occupied on chain. */
  duplicateSlot: boolean
  updates: Update[]
  liveText: string
  liveContentUrl: string
  liveUrl: string
  status: 'live' | 'pending' | 'rejected'
  marketEvents: MarketEvent[]
  /** A spend is known, but GorillaPool has not returned its successor state. */
  indexPending: boolean
}

type RecentAdAction = {
  label: string
  txid: string
  indexStatus: 'submitting' | 'indexed' | 'delayed'
  broadcastStatus: 'accepted' | 'uncertain'
  overlayStatus?: OverlayReceiptStatus
  placement: 'creative' | 'sale'
}

type OverlayReceiptStatus = OverlaySubmissionStatus | 'not-queued'

const isTransientUpdateProofError = (value: string): boolean =>
  /failed to fetch|network|timeout|timed out|temporarily unavailable|raw transaction .* unavailable|abort/i.test(value)
const isUnconfirmedCurrentListing = (ad: Ad): boolean =>
  Boolean(
    ad.listing &&
    ad.marketEvents.some(
      (event) => event.kind === 'listed' && event.outpoint === ad.outpoint && event.height === null
    )
  )
const PROOF_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const
/** Lets the rendered view settle before the background overlay comparison runs. */
const OVERLAY_SHADOW_READ_DELAY_MS = 1_500

type CreatorReviewStats = {
  count: number
  totalBlocks: number
  approved: number
  rejected: number
}

type ActivityEntry =
  | { kind: 'market'; market: MarketEvent; height: number | null; idx: number; time: string; order: number }
  | { kind: 'update'; update: Update; height: number | null; idx: number; time: string; order: number }
  | { kind: 'decision'; update: Update; height: number | null; idx: number; time: string; order: number }

function activityEntries(ad: Ad): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  let order = 0
  for (const market of ad.marketEvents) {
    entries.push({
      kind: 'market',
      market,
      height: market.height,
      idx: market.idx,
      time: '',
      order: order++,
    })
  }
  for (const update of ad.updates) {
    entries.push({
      kind: 'update',
      update,
      height: update.height,
      idx: update.idx,
      time: update.createdAt,
      order: order++,
    })
    if (update.verdict) {
      entries.push({
        kind: 'decision',
        update,
        height: update.verdictHeight ?? null,
        idx: update.verdictIdx ?? 0,
        time: update.verdictAt ?? '',
        order: order++,
      })
    }
  }
  return entries.sort((a, b) => {
    const height = (a.height ?? Number.MAX_SAFE_INTEGER) - (b.height ?? Number.MAX_SAFE_INTEGER)
    if (height !== 0) return height
    if (a.idx !== b.idx) return a.idx - b.idx
    const time = (Date.parse(a.time) || 0) - (Date.parse(b.time) || 0)
    return time || a.order - b.order
  })
}

/**
 * A successful broadcast is already authoritative enough to update the local
 * dashboard. Keep those optimistic consequences if a manual/background reload
 * reaches a search index before that index exposes the new outpoint.
 */
function preservePendingAdState(loaded: Ad[], current: Ad[]): Ad[] {
  const currentByOrigin = new Map(current.map((ad) => [ad.origin, ad]))
  const merged = loaded.map((ad) => {
    const previous = currentByOrigin.get(ad.origin)
    if (!previous) return ad

    const loadedUpdates = new Set(ad.updates.map((update) => update.outpoint))
    const pendingUpdates = previous.updates.filter(
      (update) => update.height === null && !loadedUpdates.has(update.outpoint)
    )
    const loadedMarketEvents = new Set(ad.marketEvents.map((event) => event.outpoint))
    const pendingMarketEvents = previous.marketEvents.filter(
      (event) => event.height === null && !loadedMarketEvents.has(event.outpoint)
    )

    if (!pendingUpdates.length && !pendingMarketEvents.length) return ad

    const withUpdates = pendingUpdates.length
      ? {
          ...ad,
          outpoint: previous.outpoint,
          owner: previous.owner,
          ownerEpoch: previous.ownerEpoch,
          updates: [...ad.updates, ...pendingUpdates],
          liveText: previous.liveText,
          liveContentUrl: previous.liveContentUrl,
          liveUrl: previous.liveUrl,
          status: previous.status,
        }
      : ad

    return pendingMarketEvents.length
      ? {
          ...withUpdates,
          outpoint: previous.outpoint,
          owner: previous.owner,
          ownerEpoch: previous.ownerEpoch,
          listing: previous.listing,
          updates: previous.updates,
          liveText: previous.liveText,
          liveContentUrl: previous.liveContentUrl,
          liveUrl: previous.liveUrl,
          status: previous.status,
          marketEvents: [...ad.marketEvents, ...pendingMarketEvents],
        }
      : withUpdates
  })

  const loadedOrigins = new Set(loaded.map((ad) => ad.origin))
  return [...merged, ...current.filter((ad) => ad.height === null && !loadedOrigins.has(ad.origin))]
}

const WOC_TX = 'https://whatsonchain.com/tx'
const contentSources = (outpoint: string) => [
  `${CONTENT}/${outpoint}`,
  `https://ordfs.network/${outpoint}`,
  `https://api.1sat.app/content/${outpoint}`,
]

function InscriptionImage({
  outpoint,
  alt,
  className = '',
  fallback = 'No image',
  retryWhileIndexing = false,
  localImage,
}: {
  outpoint: string
  alt: string
  className?: string
  fallback?: string
  retryWhileIndexing?: boolean
  localImage?: SelectedImage
}) {
  const [failed, setFailed] = useState(false)
  const [sourceIndex, setSourceIndex] = useState(0)
  const [retryCount, setRetryCount] = useState(0)
  const [localSrc, setLocalSrc] = useState('')
  const [remoteReady, setRemoteReady] = useState(false)
  useEffect(() => {
    setFailed(false)
    setSourceIndex(0)
    setRetryCount(0)
    setRemoteReady(false)
  }, [outpoint])
  useEffect(() => {
    if (!localImage) {
      setLocalSrc('')
      return
    }
    const bytes = localImage.data.slice().buffer
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: localImage.type }))
    setLocalSrc(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [localImage])
  useEffect(() => {
    if (!localSrc || !outpoint || remoteReady) return
    let cancelled = false
    let timer: number | undefined
    let probe: HTMLImageElement | null = null

    const trySource = (index: number) => {
      if (cancelled) return
      probe = new Image()
      probe.onload = () => {
        if (cancelled) return
        setSourceIndex(index)
        setFailed(false)
        setRemoteReady(true)
      }
      probe.onerror = () => {
        if (cancelled) return
        if (index < contentSources(outpoint).length - 1) {
          trySource(index + 1)
        } else {
          timer = window.setTimeout(() => trySource(0), 30_000)
        }
      }
      probe.src = contentSources(outpoint)[index] as string
    }

    trySource(0)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
      if (probe) {
        probe.onload = null
        probe.onerror = null
      }
    }
  }, [localSrc, outpoint, remoteReady])
  useEffect(() => {
    if (!failed || !retryWhileIndexing || retryCount >= 40) return
    const timer = window.setTimeout(() => {
      setFailed(false)
      setSourceIndex(0)
      setRetryCount((count) => count + 1)
    }, 30_000)
    return () => window.clearTimeout(timer)
  }, [failed, retryCount, retryWhileIndexing])
  if (localSrc && !remoteReady) {
    return (
      <span className={`adlab-local-image-preview ${className}`}>
        <img className="adlab-inscription-image adlab-creative-image" src={localSrc} alt={alt} />
        <small>Broadcast ✓ · on-chain image propagating</small>
      </span>
    )
  }
  if (!outpoint || failed) {
    return <div className={`adlab-inscription-image adlab-image-fallback ${className}`}>{fallback}</div>
  }
  return (
    <img
      className={`adlab-inscription-image ${className}`}
      src={contentSources(outpoint)[sourceIndex]}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (sourceIndex < contentSources(outpoint).length - 1) setSourceIndex(sourceIndex + 1)
        else setFailed(true)
      }}
    />
  )
}

function CreativePreview({
  format,
  text,
  contentUrl,
  url,
  className = '',
  localImage,
  destinationLink = true,
}: {
  format: CreativeFormat
  text: string
  contentUrl: string
  url: string
  className?: string
  localImage?: SelectedImage
  destinationLink?: boolean
}) {
  return (
    <span className="adlab-creative-preview">
      {format === 'image' ? (
        <InscriptionImage
          outpoint={contentUrl}
          alt="Image ad creative"
          className={`adlab-creative-image ${className}`}
          fallback="Image propagating — retrying automatically"
          retryWhileIndexing
          localImage={localImage}
        />
      ) : (
        <span className={className}>“{text || '—'}”</span>
      )}
      {url && (
        destinationLink ? (
          <a
            className="adlab-destination"
            href={url}
            target="_blank"
            rel="sponsored noopener noreferrer"
            title={url}
          >
            Visit {adUrlHost(url)} ↗
          </a>
        ) : (
          <small className="adlab-destination" title={url}>Destination: {adUrlHost(url)}</small>
        )
      )}
    </span>
  )
}

function HexColorEditor({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  const normalized = normalizeHexColor(value)
  const valid = isValidHexColor(value)
  return (
    <label className="adlab-inline-field adlab-color-field">
      <span>{label}</span>
      <span className="adlab-color-controls">
        <input
          className="ads-input ads-adinput adlab-color-text-input"
          value={value}
          maxLength={7}
          inputMode="text"
          spellCheck={false}
          autoCapitalize="characters"
          aria-invalid={!valid}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          placeholder="#RRGGBB"
        />
        <span className="adlab-color-picker-button" title="Open color picker">
          <span
            className={`adlab-color-swatch${valid ? '' : ' adlab-color-swatch-invalid'}`}
            style={valid ? { backgroundColor: normalized } : undefined}
            aria-hidden="true"
          />
          <strong>Choose color</strong>
          <input
            className="adlab-color-picker"
            type="color"
            value={colorPickerValue(value)}
            aria-label={`${label}: choose color`}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
          />
        </span>
      </span>
      <small className={`ads-note${valid ? '' : ' adlab-field-error'}`}>
        {valid
          ? `${normalized} · type a hex color or use the picker`
          : 'Enter exactly # followed by six hexadecimal characters.'}
      </small>
    </label>
  )
}

function HexColorReadout({ value }: { value: string }) {
  const normalized = normalizeHexColor(value)
  const valid = isValidHexColor(value)
  return (
    <span className="adlab-color-readout">
      <span
        className={`adlab-color-swatch${valid ? '' : ' adlab-color-swatch-invalid'}`}
        style={valid ? { backgroundColor: normalized } : undefined}
        aria-hidden="true"
      />
      <span>“{value || '—'}”</span>
    </span>
  )
}

function SelectedImagePreview({ image }: { image: SelectedImage }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    const bytes = image.data.slice().buffer
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: image.type }))
    setSrc(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [image])

  return src ? (
    <img
      className="adlab-selected-image-preview"
      src={src}
      alt={`Preview of selected replacement ${image.name}`}
    />
  ) : null
}

async function copyEmbedCode(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Copy was blocked by the browser')
}

function EmbedPreview({
  target,
  theme,
  mode,
}: {
  target: EmbedTarget
  theme: EmbedTheme
  mode: CollectionEmbedMode
}) {
  const mount = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    let cancelled = false
    let element: HTMLElement | null = null
    setStatus('loading')
    void loadEmbedScript().then(() => {
      if (cancelled || !mount.current) return
      element = document.createElement('adinals-embed')
      element.setAttribute('kind', target.kind)
      element.setAttribute('origin', target.origin)
      element.setAttribute('theme', theme)
      element.setAttribute('api-base', ADINALS_PREVIEW_API_BASE)
      if (target.kind === 'collection') element.setAttribute('mode', mode)
      mount.current.replaceChildren(element)
      setStatus('ready')
    }, () => {
      if (!cancelled) setStatus('failed')
    })
    return () => {
      cancelled = true
      element?.remove()
    }
  }, [mode, target.kind, target.origin, theme])

  return (
    <div className="adlab-embed-preview">
      <div className="adlab-embed-preview-head">
        <strong>Live preview</strong>
        <span>{status === 'loading' ? 'Loading component…' : status === 'failed' ? 'Preview unavailable' : 'Exact embed output'}</span>
      </div>
      <div className="adlab-embed-preview-stage">
        {status === 'loading' && <span>Loading live Adinals…</span>}
        {status === 'failed' && <span>Deploy or configure the embed script to preview it here.</span>}
        <div className="adlab-embed-preview-mount" ref={mount} />
      </div>
    </div>
  )
}

function EmbedDialog({ target, onClose }: { target: EmbedTarget; onClose: () => void }) {
  const [format, setFormat] = useState<EmbedFormat>('html')
  const [theme, setTheme] = useState<EmbedTheme>('dark')
  const [mode, setMode] = useState<CollectionEmbedMode>('random')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const endpoint = target.kind === 'ad'
    ? `${ADINALS_API_BASE}/ads/${target.origin}`
    : `${ADINALS_API_BASE}/collections/${target.origin}/live`
  const html = `<script type="module" src="${ADINALS_EMBED_SCRIPT}"></script>\n<adinals-embed\n  kind="${target.kind}"\n  origin="${target.origin}"\n  ${target.kind === 'collection' ? `mode="${mode}"\n  ` : ''}theme="${theme}"\n  api-base="${ADINALS_API_BASE}"\n></adinals-embed>`
  const react = `import { useEffect, useState } from 'react'\n\nconst ENDPOINT = '${endpoint}'\nconst REFRESH_MS = 10 * 60 * 1000\n\nexport function LiveAdinals() {\n  const [data, setData] = useState(null)\n\n  useEffect(() => {\n    let cancelled = false\n    const refresh = async () => {\n      if (document.visibilityState !== 'visible') return\n      const response = await fetch(ENDPOINT)\n      if (!response.ok) return // preserve the last valid state\n      const next = await response.json()\n      if (!cancelled) setData(next)\n    }\n    refresh()\n    const timer = window.setInterval(refresh, REFRESH_MS)\n    document.addEventListener('visibilitychange', refresh)\n    return () => {\n      cancelled = true\n      window.clearInterval(timer)\n      document.removeEventListener('visibilitychange', refresh)\n    }\n  }, [])\n\n  if (!data?.displayEligible) return null\n  ${target.kind === 'collection'
    ? `const ads = data.ads || []\n  const ad = ads[Math.floor(Math.random() * ads.length)]\n  const creative = ad?.creative`
    : `const creative = data.creative`}
  if (!creative) return null

  const content = creative.kind === 'image'
    ? <img src={creative.contentUrl} alt="" />
    : <span>{creative.text}</span>

  return creative.destinationUrl
    ? <a href={creative.destinationUrl} rel="noopener noreferrer sponsored">{content}</a>
    : content
}`
  const code = format === 'html' ? html : format === 'json' ? endpoint : react

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <div className="adlab-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="adlab-embed-dialog" role="dialog" aria-modal="true" aria-labelledby="adlab-embed-title">
        <header>
          <div>
            <span className="adlab-kicker">Live embed</span>
            <h2 id="adlab-embed-title">Embed {target.name}</h2>
          </div>
          <button type="button" className="adlab-modal-close" onClick={onClose} aria-label="Close embed dialog">×</button>
        </header>
        <p>
          Uses the immutable {target.kind === 'ad' ? 'Adinal origin' : 'collection origin'}, loads immediately,
          refreshes every ten minutes while visible, and preserves the last valid creative during an outage.
        </p>

        <EmbedPreview target={target} theme={theme} mode={mode} />

        <div className="adlab-embed-tabs" role="tablist" aria-label="Embed format">
          {(['html', 'json', 'react'] as EmbedFormat[]).map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={format === item}
              className={format === item ? 'adlab-embed-tab-active' : ''}
              onClick={() => { setFormat(item); setCopyStatus('idle') }}
              key={item}
            >
              {item === 'html' ? 'Website HTML' : item === 'json' ? 'JSON data' : 'React / JSX'}
            </button>
          ))}
        </div>

        {format === 'html' && (
          <div className="adlab-embed-options">
            {target.kind === 'collection' && (
              <label><span>Display</span><select value={mode} onChange={(event) => setMode(event.target.value as CollectionEmbedMode)}><option value="random">Random live ad</option><option value="grid">Responsive grid</option></select></label>
            )}
            <label><span>Theme</span><select value={theme} onChange={(event) => setTheme(event.target.value as EmbedTheme)}><option value="dark">Dark</option><option value="light">Light</option><option value="transparent">Transparent</option></select></label>
          </div>
        )}

        <pre className="adlab-embed-code"><code>{code}</code></pre>
        <div className="adlab-embed-footer">
          <small>
            {format === 'html'
              ? 'Includes signed destination links and the closable Ads by Adinals provenance drawer.'
              : format === 'json'
                ? 'Best for games, agents, Node.js, or a completely custom renderer.'
                : 'Starter code; extend image rendering and the provenance drawer to match your application.'}
          </small>
          <button
            type="button"
            className="ads-back adlab-primary"
            onClick={() => void copyEmbedCode(code).then(
              () => setCopyStatus('copied'),
              () => setCopyStatus('failed')
            )}
          >
            {copyStatus === 'copied' ? 'Copied ✓' : copyStatus === 'failed' ? 'Copy failed' : 'Copy'}
          </button>
        </div>
      </section>
    </div>
  )
}

/**
 * What a write produced, shown next to the button that made it.
 *
 * Every record is a real transaction, so the txid and its links are the receipt
 * — and index submission matters separately. A successful submission request
 * does not prove GorillaPool's public lookup is current yet.
 */
type Receipt = {
  label: string
  txid: string
  outpoint: string
  indexStatus: 'submitting' | 'indexed' | 'delayed'
  broadcastStatus: 'accepted' | 'uncertain'
  overlayStatus?: OverlayReceiptStatus
  hasMedia: boolean
}

function RecentAdActionLine({ action }: { action: RecentAdAction }) {
  return (
    <span className="adlab-action-receipt" role="status" aria-live="polite">
      <span className="adlab-action-receipt-head">
        <strong>✓ {action.label}</strong>
        <a
          className="ads-link ads-mono"
          href={`${WOC_TX}/${action.txid}`}
          target="_blank"
          rel="noreferrer"
          title={action.txid}
        >
          {action.txid.slice(0, 10)}… ↗
        </a>
      </span>
      <small>
        {action.broadcastStatus === 'uncertain'
          ? 'Submitted · awaiting network evidence'
          : action.indexStatus === 'submitting'
          ? 'Broadcast · submitting to index…'
          : action.indexStatus === 'indexed'
            ? 'Broadcast · indexed'
            : 'Broadcast · index submission delayed'}
      </small>
      {action.overlayStatus && <small>Overlay · {action.overlayStatus}</small>}
    </span>
  )
}

function ReceiptLine({ receipt, onDismiss }: { receipt: Receipt; onDismiss: () => void }) {
  return (
    <section className="adlab-transaction" aria-live="polite">
      <div className="adlab-transaction-icon">✓</div>
      <div className="adlab-transaction-copy">
        <strong>
          {receipt.label} · {receipt.broadcastStatus === 'uncertain'
            ? 'transaction submitted'
            : 'transaction broadcast'}
        </strong>
        <span>
          {receipt.broadcastStatus === 'uncertain' && receipt.indexStatus !== 'indexed'
            ? 'The broadcast reply was unavailable. Inputs are reserved while the app reconciles this exact txid; do not retry with another transaction.'
            : receipt.indexStatus === 'submitting'
            ? 'The dashboard updated from the txid. Sending the transaction to GorillaPool now…'
            : receipt.indexStatus === 'indexed'
              ? receipt.hasMedia
                ? 'The dashboard updated locally and GorillaPool now returns the exact record. Media retrieval may still need a short retry.'
                : 'The dashboard updated locally and GorillaPool now returns the exact record.'
              : 'The dashboard updated from the txid. GorillaPool does not return the exact record yet.'}
        </span>
        {receipt.overlayStatus && (
          <span>
            Overlay: {receipt.overlayStatus === 'not-queued'
              ? 'not queued—refresh this app before another canary.'
              : receipt.overlayStatus}
          </span>
        )}
        <span className="ads-mono adlab-txid">{receipt.txid}</span>
      </div>
      <div className="adlab-transaction-links">
        <span className={`ads-badge ${receipt.indexStatus === 'indexed' ? 'ads-ok' : 'ads-pending'}`}>
          {receipt.broadcastStatus === 'uncertain' && receipt.indexStatus !== 'indexed'
            ? 'reconciling…'
            : receipt.indexStatus === 'submitting'
              ? 'submitting index…'
              : receipt.indexStatus === 'indexed'
                ? 'indexed'
                : 'index delayed'}
        </span>
        <a className="ads-link" href={`${WOC_TX}/${receipt.txid}`} target="_blank" rel="noreferrer">
          transaction ↗
        </a>
        <a className="ads-link" href={`${MARKET}/${receipt.outpoint}`} target="_blank" rel="noreferrer">
          1Sat record ↗
        </a>
      </div>
      <button
        type="button"
        className="adlab-transaction-close"
        onClick={onDismiss}
        aria-label="Dismiss transaction receipt"
      >
        ×
      </button>
    </section>
  )
}

const str = (v: unknown, fallback = ''): string =>
  v === undefined || v === null ? fallback : String(v)
const num = (v: unknown): number => Number(v) || 0
const shortAddress = (value: string): string =>
  value.length > 18 ? `${value.slice(0, 9)}…${value.slice(-6)}` : value
const hasExpired = (expiresAt: string): boolean => {
  const time = Date.parse(expiresAt)
  return Number.isFinite(time) && time <= Date.now()
}
const expirationLabel = (expiresAt: string): string => {
  if (!expiresAt) return 'No expiration'
  const time = Date.parse(expiresAt)
  if (!Number.isFinite(time)) return 'Invalid expiration'
  const remaining = time - Date.now()
  if (remaining <= 0) return `Expired ${new Date(time).toLocaleDateString()}`
  const hours = Math.ceil(remaining / 3_600_000)
  return hours <= 48 ? `Expires in ${hours}h` : `Expires in ${Math.ceil(hours / 24)} days`
}

/** subTypeData arrives parsed from the indexer though it was written as a string. */
function subTypeData(map: Record<string, unknown>): Record<string, unknown> {
  return readAdinalsSubTypeData(map)
}

function collectionFromRow(row: Row): Collection | null {
  const validation = collectionRulesFromRecord(row)
  if (validation.error) return null

  const data = subTypeData(row.map)
  return {
    origin: row.origin,
    name: str(row.map.name, '(unnamed)'),
    description: str(data.description),
    creator: row.signer,
    max: validation.rules.capacity,
    approval: validation.rules.approval,
    contentPolicy: str(row.map.adContentPolicy, 'unspecified'),
    format: validation.rules.format,
    imageProfile: validation.rules.imageProfile ?? '',
    maxChars: validation.rules.maxChars ?? 0,
    placement: str(row.map.adPlacement),
    expiresAt: str(row.map.expiresAt),
    expired: hasExpired(str(row.map.expiresAt)),
    height: row.originHeight,
  }
}

function provenanceRoute(pathname: string):
  | { kind: 'collection'; origin: string }
  | { kind: 'ad'; origin: string }
  | null {
  const match = /^\/(collection|ad)\/([0-9a-f]{64}_\d+)\/?$/i.exec(pathname)
  if (!match?.[1] || !match[2]) return null
  return {
    kind: match[1].toLowerCase() === 'collection' ? 'collection' : 'ad',
    origin: match[2].toLowerCase(),
  }
}

function Outpoint({ value, label }: { value: string; label?: string }) {
  if (!value) return <span className="ads-mono">—</span>
  return (
    <a className="ads-link" href={`${MARKET}/${value}`} target="_blank" rel="noreferrer">
      {label ?? `${value.slice(0, 10)}…`}
    </a>
  )
}

function ActivityTime({ value, height }: { value: string; height: number | null }) {
  const parsed = Date.parse(value)
  const hasTime = Number.isFinite(parsed)
  return (
    <span className="adlab-activity-time">
      {hasTime ? (
        <>
          <time dateTime={new Date(parsed).toISOString()}>
            {new Date(parsed).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </time>
          <small>
            {new Date(parsed).toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
            })}
          </small>
        </>
      ) : (
        <span>{height === null ? 'Mempool' : 'Time unavailable'}</span>
      )}
      {height !== null && <small>Block {height.toLocaleString()}</small>}
    </span>
  )
}

function reviewAverageLabel(stats: CreatorReviewStats | undefined): string {
  if (!stats?.count) return 'No completed reviews yet'
  const average = stats.totalBlocks / stats.count
  const blocks = Number.isInteger(average) ? average.toFixed(0) : average.toFixed(1)
  return `Avg review ${blocks} block${average === 1 ? '' : 's'} · ${stats.count} decision${stats.count === 1 ? '' : 's'}`
}

export function AdLab() {
  const {
    wallet,
    session,
    status: walletStatus,
    error: walletError,
    refreshing: walletRefreshing,
    connect,
    disconnect,
    refresh: refreshWallet,
  } = useWallet()
  const ownership = useOwnership()
  const keys = useMemo<LabKeys | null>(
    () => wallet && session
      ? createConnectedLabKeys(wallet, session, ownership.model)
      : null,
    [wallet, session, ownership.model]
  )
  const [note, setNote] = useState<string | null>(null)
  const [noteKind, setNoteKind] = useState<'error' | 'success' | 'info'>('info')
  const [busy, setBusy] = useState(false)
  const writeInFlight = useRef(false)
  const openedProvenance = useRef(false)
  const defaultTabWallet = useRef<string | null>(null)

  const [collections, setCollections] = useState<Collection[]>([])
  const [ads, setAds] = useState<Ad[]>([])
  const [localMintSlots, setLocalMintSlots] = useState<Record<string, number[]>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'approvals' | 'ads' | 'collections'>('collections')
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [collectionScope, setCollectionScope] = useState<CollectionScope>('all')
  const [showExpiredCollections, setShowExpiredCollections] = useState(false)

  const [draft, setDraft] = useState({
    name: '',
    description: '',
    max: '5',
    maxChars: '16',
    format: 'text',
    placement: '',
    approval: 'creator',
    contentPolicy: 'unspecified',
    expiresInDays: '7',
  })
  const [adDraft, setAdDraft] = useState<Record<string, string>>({})
  const [adUrlDraft, setAdUrlDraft] = useState<Record<string, string>>({})
  const [saleDraft, setSaleDraft] = useState<Record<string, string>>({})
  const [mintText, setMintText] = useState('')
  const [mintUrl, setMintUrl] = useState('')
  const [mintImage, setMintImage] = useState<SelectedImage | null>(null)
  const [mintFileInputKey, setMintFileInputKey] = useState(0)
  const [adImageDraft, setAdImageDraft] = useState<Record<string, SelectedImage>>({})
  const [adImageError, setAdImageError] = useState<Record<string, string>>({})
  const [localImagePreviews, setLocalImagePreviews] = useState<Record<string, SelectedImage>>({})
  const [recentAdActions, setRecentAdActions] = useState<Record<string, RecentAdAction>>({})
  const [adImageInputVersion, setAdImageInputVersion] = useState(0)
  const [openHistory, setOpenHistory] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [cover, setCover] = useState<SelectedImage | null>(null)
  const [walletDetailsOpen, setWalletDetailsOpen] = useState(false)
  const [showCreateCollection, setShowCreateCollection] = useState(false)
  const [embedTarget, setEmbedTarget] = useState<EmbedTarget | null>(null)
  // `null` means no retry cycle. Incrementing the revision rearms the one
  // timer-owning effect after each transient result without allowing parallel
  // retry loops.
  const [proofRetryRevision, setProofRetryRevision] = useState<number | null>(null)
  const proofRetryAttempts = useRef(0)

  const refreshBalance = useCallback(async () => {
    if (!keys) return
    await Promise.all([refreshWallet(), ownership.refresh()])
  }, [keys, ownership.refresh, refreshWallet])

  /**
   * Assemble the four record types into ads.
   *
   * Every join is a verified SIGMA-address comparison: an ad counts if the collection's
   * creator signed it, an update counts if the ad's current owner signed it, a
   * verdict counts if the creator signed it. No record is taken at its word
   * about who wrote it. A missing or invalid SIGMA has no signer and therefore
   * cannot satisfy any creator or owner authority check.
   */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [collectionRows, adRows, updateRows, decisionRows] = await Promise.all([
        readRecords('collection'),
        readRecords('ad'),
        readRecords('update'),
        readRecords('approval'),
      ])

      const validCollectionRows = collectionRows.filter(
        (row) => !collectionRulesFromRecord(row).error
      )
      const loadedCollections = validCollectionRows
        .map(collectionFromRow)
        .filter((item): item is Collection => Boolean(item))
      setCollections((current) => {
        const loadedOrigins = new Set(loadedCollections.map((item) => item.origin))
        return [
          ...loadedCollections,
          ...current.filter((item) => !loadedOrigins.has(item.origin)),
        ]
      })

      const byCollection = new Map<string, Row>(
        validCollectionRows.map((row) => [row.origin, row])
      )
      const collectionRules = new Map<string, AdinalsCollectionRules>(
        validCollectionRows.map((row) => [row.origin, collectionRulesFromRecord(row).rules])
      )
      const updatesFor = new Map<string, Row[]>()
      for (const row of updateRows) {
        const adOrigin = str(row.map.adOrigin)
        if (adOrigin) updatesFor.set(adOrigin, [...(updatesFor.get(adOrigin) ?? []), row])
      }
      const decisionsFor = new Map<string, Row[]>()
      for (const row of decisionRows) {
        const target = str(row.map.updateOutpoint) || str(row.map.revisionOutpoint)
        if (target) decisionsFor.set(target, [...(decisionsFor.get(target) ?? []), row])
      }

      const updateProofs = new Map(
        await Promise.all(
          updateRows.map(async (update) => [
            update.origin,
            await proveSpendLinkedRecord(update.origin, str(update.map.adOutpoint)),
          ] as const)
        )
      )
      const hasTransientProofFailure = [...updateProofs.values()].some(
        (proof) => isTransientUpdateProofError(proof.error)
      )
      if (hasTransientProofFailure) {
        setProofRetryRevision((current) => (current ?? 0) + 1)
      } else {
        proofRetryAttempts.current = 0
        setProofRetryRevision(null)
      }

      const assembled = adRows.map((row): Ad => {
          const data = subTypeData(row.map)
          const collectionId = str(data.collectionId)
          const parent = byCollection.get(collectionId)
          const parentRules = collectionRules.get(collectionId)
          const creator = parent?.signer ?? ''
          const openCollection = str(parent?.map.adApproval, 'creator') === 'open'
          const parentFormat: CreativeFormat =
            str(parent?.map.adFormat, 'text') === 'image' ? 'image' : 'text'
          const format: CreativeFormat = str(row.map.adFormat, 'text') === 'image' ? 'image' : 'text'
          const mintText = str(row.map.adText)
          const mintUrlResult = validateStoredAdUrl(str(row.map.adUrl))
          const mintUrl = mintUrlResult.error ? '' : mintUrlResult.url
          const mintInvalidReason = parentRules
            ? adMintRecordError(row, parentRules)
            : 'collection not found'
          const ownerEpoch = [...row.marketEvents]
            .reverse()
            .find((event) => event.kind === 'purchased' || event.kind === 'transferred')
            ?.outpoint ?? row.origin

          const orderedUpdateRows = [...(updatesFor.get(row.origin) ?? [])].sort((a, b) => {
            const aIndex = row.ownershipOutpoints.indexOf(
              updateProofs.get(a.origin)?.successorOutpoint ?? ''
            )
            const bIndex = row.ownershipOutpoints.indexOf(
              updateProofs.get(b.origin)?.successorOutpoint ?? ''
            )
            const normalizedA = aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex
            const normalizedB = bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex
            return normalizedA - normalizedB || a.origin.localeCompare(b.origin)
          })

          const updates: Update[] = orderedUpdateRows.map((update) => {
            const transition = updateProofs.get(update.origin) ?? {
              error: 'missing spend-linked update proof',
              predecessorOutpoint: '',
              successorOutpoint: '',
              recordOutpoint: update.origin,
              owner: '',
            }
            // Stranger decisions are ignored. If the real creator signs both
            // verdicts for one exact update, fail closed instead of letting API
            // ordering decide which creative becomes live.
            const validVerdicts = parentRules
              ? (decisionsFor.get(update.origin) ?? []).filter(
                  (decision) => !adDecisionRecordError(decision, {
                    collection: parentRules,
                    adOrigin: row.origin,
                    updateOutpoint: update.origin,
                    adOutpoint: transition.successorOutpoint,
                    ownerEpoch,
                  })
                )
              : []
            const verdictKinds = new Set(
              validVerdicts.map((decision) => str(decision.map.decision))
            )
            const conflicted = verdictKinds.has('approved') && verdictKinds.has('disapproved')
            const verdictRow = validVerdicts[0]
            const updateUrlResult = validateStoredAdUrl(str(update.map.adUrl))
            const updateFormat = str(update.map.adFormat, 'text') === 'image' ? 'image' : 'text'
            const invalidReason = parentRules
              ? adUpdateRecordError(update, {
                  collection: parentRules,
                  adOrigin: row.origin,
                  ownershipOutpoints: row.ownershipOutpoints,
                  currentOwner: row.owner,
                  currentOwnerEpoch: ownerEpoch,
                  transition,
                })
              : 'collection not found'
            return {
              outpoint: update.origin,
              adOutpoint: transition.successorOutpoint,
              ownerEpoch,
              format: updateFormat,
              text: str(update.map.adText),
              contentUrl: update.origin,
              url: updateUrlResult.url,
              signer: transition.owner || update.signer,
              height: update.height,
              idx: update.idx,
              createdAt: str(update.map.updatedAt),
              // The entire ownership test: signed by whoever holds the ad now.
              valid:
                !invalidReason,
              invalidReason,
              verdict: conflicted
                ? 'conflicted'
                : verdictRow
                  ? str(verdictRow?.map.decision) === 'disapproved'
                  ? 'disapproved'
                  : 'approved'
                  : undefined,
              verdictOutpoint: verdictRow?.origin,
              verdictAt: verdictRow ? str(verdictRow.map.decidedAt) : undefined,
              verdictHeight: verdictRow?.height,
              verdictIdx: verdictRow?.idx,
            }
          })

          // Status describes the current owner's newest proposal, while live
          // text resolves independently to that owner's newest publishable
          // update. A pending or rejected proposal must not erase an older
          // approval; after a sale, former-owner updates are invalid and the
          // mint text remains until the buyer gets an update published.
          let liveText = mintText
          let liveContentUrl = format === 'image' ? row.origin : ''
          let liveUrl = mintUrl
          let status: Ad['status'] = 'live'
          let foundProposalStatus = false
          for (let i = updates.length - 1; i >= 0; i -= 1) {
            const update = updates[i]
            if (!update?.valid) continue
            const publishable =
              update.verdict !== 'conflicted' &&
              (openCollection || update.signer === creator || update.verdict === 'approved')
            if (!foundProposalStatus) {
              status = publishable
                ? 'live'
                : update.verdict === 'disapproved' || update.verdict === 'conflicted'
                  ? 'rejected'
                  : 'pending'
              foundProposalStatus = true
            }
            if (publishable) {
              liveText = update.text
              liveContentUrl = update.format === 'image' ? update.contentUrl : ''
              liveUrl = update.url
              break
            }
          }

          return {
            origin: row.origin,
            outpoint: row.outpoint,
            collectionId,
            owner: row.owner,
            ownerEpoch,
            serial: num(data.mintNumber),
            name: str(row.map.name, '(unnamed)'),
            format,
            mintText,
            mintContentUrl: format === 'image' ? row.origin : '',
            mintUrl,
            mintedAt: str(row.map.mintedAt),
            height: row.originHeight,
            listing: row.listing,
            originHeight: row.originHeight,
            originIdx: row.originIdx,
            fromCreator:
              !mintInvalidReason,
            invalidReason: mintInvalidReason,
            duplicateSlot: false,
            updates,
            liveText,
            liveContentUrl,
            liveUrl,
            status,
            marketEvents: row.marketEvents,
            indexPending: row.chainIncomplete,
          }
        })

      // A collection slot is unique. The earliest creator-signed origin wins;
      // later claims remain visible and manageable (they are real ordinals) but
      // are labelled duplicates and do not consume more collection capacity.
      const slotClaims = new Map<string, Ad[]>()
      for (const ad of assembled) {
        if (!ad.fromCreator || ad.serial < 1) continue
        const key = `${ad.collectionId}:${ad.serial}`
        slotClaims.set(key, [...(slotClaims.get(key) ?? []), ad])
      }
      const canonicalOrigins = new Set<string>()
      for (const claims of slotClaims.values()) {
        claims.sort((a, b) => {
          const height =
            (a.originHeight ?? Number.MAX_SAFE_INTEGER) -
            (b.originHeight ?? Number.MAX_SAFE_INTEGER)
          if (height !== 0) return height
          if (a.originIdx !== b.originIdx) return a.originIdx - b.originIdx
          return a.origin.localeCompare(b.origin)
        })
        if (claims[0]) canonicalOrigins.add(claims[0].origin)
      }
      const nextAds = assembled.map((ad) => ({
          ...ad,
          duplicateSlot:
            ad.fromCreator &&
            ad.serial > 0 &&
            (slotClaims.get(`${ad.collectionId}:${ad.serial}`)?.length ?? 0) > 1 &&
            !canonicalOrigins.has(ad.origin),
        }))
      setAds((current) => preservePendingAdState(nextAds, current))
    } catch (error) {
      setNoteKind('error')
      setNote(error instanceof Error ? error.message : String(error))
      // If this was already a proof-recovery cycle, a broader transient search
      // failure must rearm it rather than silently cancelling the remaining
      // backoff attempts. Initial page-load failures still require an explicit
      // refresh because no proof failure has been identified yet.
      setProofRetryRevision((current) => current === null ? null : current + 1)
    } finally {
      setLoading(false)
      setHasLoaded(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (proofRetryRevision === null) return
    const attempt = proofRetryAttempts.current
    if (attempt >= PROOF_RETRY_DELAYS_MS.length) return
    const timer = window.setTimeout(() => {
      proofRetryAttempts.current += 1
      void load()
    }, PROOF_RETRY_DELAYS_MS[attempt])
    return () => window.clearTimeout(timer)
  }, [load, proofRetryRevision])
  useEffect(() => {
    if (!keys) setActiveTab('collections')
  }, [keys])
  // Stage one of overlay reads: compare the configured overlay against the
  // rendered public reader in the background and retain the result. Nothing
  // here feeds the view, so an unavailable overlay changes nothing on screen.
  useEffect(() => {
    if (!selected || !ADINALS_OVERLAY_URL) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void runOverlayShadowRead(selected).catch(() => null).then((result) => {
        if (!cancelled && result?.status === 'diverged') {
          console.warn('Overlay shadow read diverged', result.origin, result.errors)
        }
      })
    }, OVERLAY_SHADOW_READ_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [selected])
  useEffect(() => {
    const onOverlayStatus = (event: Event) => {
      const record = (event as CustomEvent<OverlaySubmission>).detail
      if (!record || typeof record.txid !== 'string') return
      setReceipt((current) =>
        current?.txid === record.txid
          ? { ...current, overlayStatus: record.status }
          : current
      )
      setRecentAdActions((current) => {
        let changed = false
        const next = Object.fromEntries(Object.entries(current).map(([origin, action]) => {
          if (action.txid !== record.txid) return [origin, action]
          changed = true
          return [origin, { ...action, overlayStatus: record.status }]
        }))
        return changed ? next : current
      })
    }
    window.addEventListener('adinals-overlay-status', onOverlayStatus)
    return () => window.removeEventListener('adinals-overlay-status', onOverlayStatus)
  }, [])
  useEffect(() => {
    const timer = window.setInterval(() => {
      setCollections((current) =>
        current.map((item) => ({ ...item, expired: hasExpired(item.expiresAt) }))
      )
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  /** Every write reports the same thing: the txid it broadcast, or why not. */
  const run = useCallback(
    async (
      label: string,
      action: () => Promise<LabWriteResult>,
      onBroadcast?: (result: LabWriteResult) => void,
      hasMedia = false,
      adAction?: {
        origin: string
        successLabel: string
        placement: RecentAdAction['placement']
      }
    ) => {
      if (writeInFlight.current) return
      writeInFlight.current = true
      setBusy(true)
      setNote(null)
      setReceipt(null)

      const releaseWriteLock = () => {
        writeInFlight.current = false
        setBusy(false)
      }

      let result: LabWriteResult
      try {
        result = await action()
        if (result.error || !result.txid) {
          setNoteKind('error')
          setNote(`${label} failed: ${result.error ?? 'no txid returned'}`)
          releaseWriteLock()
          return
        }
      } catch (error) {
        setNoteKind('error')
        setNote(`${label} failed: ${error instanceof Error ? error.message : String(error)}`)
        releaseWriteLock()
        return
      }

      setNote(null)
      const overlayStatus = result.overlayStatus ?? (ADINALS_OVERLAY_URL ? 'not-queued' : undefined)
      setReceipt({
        label: adAction?.successLabel ?? label,
        txid: result.txid,
        outpoint: result.outpoint ?? `${result.txid}_0`,
        indexStatus: 'submitting',
        broadcastStatus: result.broadcastStatus ?? 'accepted',
        ...(overlayStatus && { overlayStatus }),
        hasMedia,
      })
      if (adAction) {
        setRecentAdActions((current) => ({
          ...current,
          [adAction.origin]: {
            label: adAction.successLabel,
            txid: result.txid as string,
            indexStatus: 'submitting',
            broadcastStatus: result.broadcastStatus ?? 'accepted',
            ...(overlayStatus && { overlayStatus }),
            placement: adAction.placement,
          },
        }))
      }
      onBroadcast?.(result)

      // A returned txid is the write success boundary. Release immediately so
      // another slot can use the locally tracked change output while metadata
      // indexing and reconciliation continue in the background.
      releaseWriteLock()

      try {
        const exactOutpoint = result.outpoint ?? `${result.txid}_0`
        const indexed = await submitToIndexer(result.txid, exactOutpoint)
        setReceipt((current) =>
          current && current.txid === result.txid
            ? { ...current, indexStatus: indexed ? 'indexed' : 'delayed' }
            : current
        )
        if (adAction) {
          setRecentAdActions((current) => {
            const existing = current[adAction.origin]
            return existing?.txid === result.txid
              ? {
                  ...current,
                  [adAction.origin]: {
                    ...existing,
                    indexStatus: indexed ? 'indexed' : 'delayed',
                  },
                }
              : current
          })
        }
      } catch (error) {
        setNoteKind('info')
        setNote(
          `${label} broadcast succeeded. Refresh later if indexing is still catching up: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    },
    []
  )

  const applyLocalDecision = useCallback((
    adOrigin: string,
    updateOutpoint: string,
    verdict: 'approved' | 'disapproved',
    result: LabWriteResult,
  ) => {
    const verdictOutpoint = result.outpoint ?? `${result.txid}_0`
    const verdictAt = new Date().toISOString()
    setAds((current) => current.map((ad) => {
      if (ad.origin !== adOrigin) return ad
      const decided = ad.updates.find((update) => update.outpoint === updateOutpoint)
      if (!decided) return ad
      return {
        ...ad,
        ...(verdict === 'approved'
          ? {
              liveText: decided.text,
              liveContentUrl: decided.contentUrl,
              liveUrl: decided.url,
              status: 'live' as const,
            }
          : { status: 'rejected' as const }),
        updates: ad.updates.map((update) => update.outpoint === updateOutpoint
          ? {
              ...update,
              verdict,
              verdictOutpoint,
              verdictAt,
              verdictHeight: null,
              verdictIdx: 0,
            }
          : update),
      }
    }))
  }, [])

  const collection = useMemo(
    () => collections.find((item) => item.origin === selected) ?? null,
    [collections, selected]
  )
  const collectionUiProfile = getAdinalsCollectionUiProfile(collection?.origin)
  const usesHexColorEditor = collectionUiProfile.creativeEditor === 'hex-color'
  const mintUrlResult = useMemo(
    () => collectionUiProfile.destinationLinks
      ? validateAdUrl(mintUrl)
      : { url: '', error: '' },
    [collectionUiProfile.destinationLinks, mintUrl]
  )
  const normalizedMintText = usesHexColorEditor
    ? normalizeHexColor(mintText)
    : mintText.trim()
  const mintTextValid = !usesHexColorEditor || isValidHexColor(mintText)
  useEffect(() => {
    // Creative belongs to one collection and one immutable format. Never carry a
    // previous collection's text or image into the next mint form.
    setMintText('')
    setMintUrl('')
    setMintImage(null)
    setMintFileInputKey((key) => key + 1)
  }, [collection?.origin])
  const members = useMemo(
    () =>
      collection
        ? ads.filter((ad) => ad.collectionId === collection.origin).sort((a, b) => a.serial - b.serial)
        : [],
    [ads, collection]
  )
  const canonicalMembers = useMemo(
    () =>
      collection
        ? members.filter(
            (ad) =>
              ad.fromCreator &&
              !ad.duplicateSlot &&
              ad.serial >= 1 &&
              ad.serial <= collection.max
          )
        : [],
    [collection, members]
  )
  const occupiedSlots = useMemo(
    () =>
      new Set([
        ...canonicalMembers.map((ad) => ad.serial),
        ...(collection ? localMintSlots[collection.origin] ?? [] : []),
      ]),
    [canonicalMembers, collection, localMintSlots]
  )
  const isCreator = Boolean(keys && collection && ownsCollection(keys, collection.origin))
  const ownedCollections = useMemo(
    () => (keys ? collections.filter((item) => ownsCollection(keys, item.origin)) : []),
    [collections, keys]
  )
  const foxplorerCollections = useMemo(
    () => collections.filter((item) => isFoxplorerCreator(item.creator)),
    [collections]
  )
  const visibleOwnedCollections = useMemo(
    () =>
      showExpiredCollections
        ? ownedCollections
        : ownedCollections.filter((item) => !item.expired),
    [ownedCollections, showExpiredCollections]
  )
  const visibleFoxplorerCollections = useMemo(
    () =>
      showExpiredCollections
        ? foxplorerCollections
        : foxplorerCollections.filter((item) => !item.expired),
    [foxplorerCollections, showExpiredCollections]
  )
  const visibleAllCollections = useMemo(
    () =>
      showExpiredCollections
        ? collections
        : collections.filter((item) => !item.expired),
    [collections, showExpiredCollections]
  )
  const myAds = useMemo(
    () =>
      keys
        ? ads.filter(
            (ad) =>
              !ad.duplicateSlot &&
              (ownsAd(keys, ad.origin, ad.owner) || ownsListing(keys, ad.outpoint))
          )
        : [],
    [ads, keys]
  )
  const visibleMyAds = useMemo(
    () =>
      showExpiredCollections
        ? myAds
        : myAds.filter((ad) => {
            const parent = collections.find((item) => item.origin === ad.collectionId)
            return !parent || !parent.expired
          }),
    [collections, myAds, showExpiredCollections]
  )
  const pendingApprovals = useMemo(() => {
    if (!keys) return []
    return ads.flatMap((ad) => {
      if (ad.duplicateSlot || !ad.fromCreator) return []
      const parent = collections.find((item) => item.origin === ad.collectionId)
      if (
        !parent ||
        !ownsCollection(keys, parent.origin) ||
        parent.approval === 'open' ||
        parent.expired
      ) return []
      const latestValid = [...ad.updates].reverse().find((update) => update.valid)
      if (!latestValid || latestValid.signer === parent.creator || latestValid.verdict) return []
      return [{ collection: parent, ad, update: latestValid }]
    })
  }, [ads, collections, keys])
  const incompleteTransitions = useMemo(
    () => ads.filter((ad) => !ad.duplicateSlot && ad.indexPending),
    [ads]
  )
  useEffect(() => {
    if (!hasLoaded) return
    const walletIdentity = keys?.identityKey ?? 'signed-out'
    if (defaultTabWallet.current === walletIdentity) return
    defaultTabWallet.current = walletIdentity
    setActiveTab(keys && pendingApprovals.length > 0 ? 'approvals' : 'collections')
  }, [hasLoaded, keys, pendingApprovals.length])
  const myPendingUpdates = useMemo(() => {
    if (!keys) return []
    return myAds.flatMap((ad) => {
      const parent = collections.find((item) => item.origin === ad.collectionId)
      if (!parent || parent.expired || parent.approval === 'open' || ownsCollection(keys, parent.origin)) {
        return []
      }
      const latestMine = [...ad.updates]
        .reverse()
        .find((update) => update.valid && update.signer === ad.owner)
      if (!latestMine || latestMine.verdict) return []
      return [{ collection: parent, ad, update: latestMine }]
    })
  }, [collections, keys, myAds])
  const creatorReviewStats = useMemo(() => {
    const stats = new Map<string, CreatorReviewStats>()
    for (const ad of ads) {
      const parent = collections.find((item) => item.origin === ad.collectionId)
      if (!parent || parent.approval === 'open') continue
      for (const update of ad.updates) {
        if (
          update.signer === parent.creator ||
          !update.verdict ||
          update.height === null ||
          update.verdictHeight === null ||
          update.verdictHeight === undefined
        ) continue
        const current = stats.get(parent.creator) ?? {
          count: 0,
          totalBlocks: 0,
          approved: 0,
          rejected: 0,
        }
        current.count += 1
        current.totalBlocks += Math.max(0, update.verdictHeight - update.height)
        if (update.verdict === 'approved') current.approved += 1
        else current.rejected += 1
        stats.set(parent.creator, current)
      }
    }
    return stats
  }, [ads, collections])
  const displayedCollections = useMemo(
    () => {
      const source = collectionScope === 'all'
        ? visibleAllCollections
        : collectionScope === 'featured'
          ? visibleFoxplorerCollections
          : collectionScope === 'mine'
            ? visibleOwnedCollections
            : []
      return [...source].sort((a, b) => a.name.localeCompare(b.name))
    },
    [collectionScope, visibleAllCollections, visibleFoxplorerCollections, visibleOwnedCollections]
  )
  const visibleCollectionCount = visibleAllCollections.length
  const openCollection = useCallback((origin: string) => {
    setActiveTab('collections')
    setSelected(origin)
    window.requestAnimationFrame(() => {
      document.getElementById('adlab-collection-detail')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }, [])

  useEffect(() => {
    if (!hasLoaded || openedProvenance.current) return
    const route = provenanceRoute(window.location.pathname)
    if (!route) return
    openedProvenance.current = true

    if (route.kind === 'collection') {
      if (collections.some((item) => item.origin === route.origin)) {
        openCollection(route.origin)
      } else {
        setNoteKind('error')
        setNote('That collection is not available in the current indexed result.')
      }
      return
    }

    const linkedAd = ads.find((item) => item.origin === route.origin)
    if (linkedAd && collections.some((item) => item.origin === linkedAd.collectionId)) {
      openCollection(linkedAd.collectionId)
      setOpenHistory(linkedAd.origin)
    } else {
      setNoteKind('error')
      setNote('That Adinal is not available in the current indexed result.')
    }
  }, [ads, collections, hasLoaded, openCollection])

  const startNewCollection = useCallback(() => {
    setActiveTab('collections')
    setSelected(null)
    setShowCreateCollection(true)
    window.requestAnimationFrame(() => {
      document.getElementById('adlab-create-collection')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }, [])

  const chooseImage = useCallback(
    async (file: File | undefined, accept: (image: SelectedImage | null) => void) => {
      if (!file) {
        accept(null)
        return
      }
      try {
        accept(await readImageFile(file))
        setNote(null)
      } catch (error) {
        accept(null)
        setNoteKind('error')
        setNote(error instanceof Error ? error.message : String(error))
      }
    },
    []
  )

  const chooseAdImage = useCallback(
    async (origin: string, file: File | undefined, input: HTMLInputElement) => {
      if (!file) {
        setAdImageDraft((current) => {
          const next = { ...current }
          delete next[origin]
          return next
        })
        setAdImageError((current) => {
          const next = { ...current }
          delete next[origin]
          return next
        })
        return
      }

      try {
        const image = await readImageFile(file)
        setAdImageDraft((current) => ({ ...current, [origin]: image }))
        setAdImageError((current) => {
          const next = { ...current }
          delete next[origin]
          return next
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setAdImageDraft((current) => {
          const next = { ...current }
          delete next[origin]
          return next
        })
        setAdImageError((current) => ({ ...current, [origin]: message }))
        // The browser otherwise keeps displaying the rejected filename even
        // though no update draft exists and the submit button is disabled.
        input.value = ''
      }
    },
    []
  )

  return (
    <main className="ads-page adlab-page">
      <div className="adlab-shell">
        <header className="adlab-hero">
          <div>
            <div className="adlab-hero-meta">
              <span className="adlab-eyebrow">BETA · BSV MAINNET · 1SATORDINALS</span>
              <a
                className="adlab-source-link"
                href={ADINALS_REPOSITORY}
                target="_blank"
                rel="noreferrer"
                aria-label="View the open-source Adinals repository on GitHub"
              >
                Open source · GitHub ↗
              </a>
            </div>
            <h1 className="adlab-wordmark" aria-label="Adinals">
              <span className="adlab-wordmark-ad">Ad</span>
              <span className="adlab-wordmark-inals">inals</span>
            </h1>
            <p>
              Buy, sell, update, and embed live content—for agents and humans. Or curate your collection with creator approvals.
            </p>
            <div className="adlab-hero-stats" aria-label="Ad Lab summary">
              <div><strong>{visibleOwnedCollections.length}</strong><span>collections</span></div>
              <div><strong>{visibleMyAds.length}</strong><span>my ads</span></div>
              <div className={pendingApprovals.length ? 'adlab-stat-alert' : ''}>
                <strong>{pendingApprovals.length}</strong><span>to review</span>
              </div>
            </div>
          </div>
          <div className="adlab-hero-side">
            <section className="adlab-panel adlab-wallet adlab-wallet-compact" aria-label="Wallet">
              {keys ? (
                <>
                  <div className="adlab-wallet-main">
                    <div className="adlab-wallet-status">●</div>
                    <div>
                      <span className="adlab-kicker">BRC-100 wallet</span>
                      <strong>Wallet connected</strong>
                      <p>{session?.network} · block {session?.height.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="adlab-wallet-actions">
                    <button
                      type="button"
                      className="ads-back adlab-balance-refresh"
                      disabled={walletRefreshing || ownership.loading}
                      aria-busy={walletRefreshing || ownership.loading}
                      onClick={() => void refreshBalance()}
                    >
                      {(walletRefreshing || ownership.loading) && <span className="adlab-inline-spinner" aria-hidden="true" />}
                      {walletRefreshing || ownership.loading ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="ads-back adlab-wallet-details-toggle"
                    aria-expanded={walletDetailsOpen}
                    onClick={() => setWalletDetailsOpen((open) => !open)}
                  >
                    {walletDetailsOpen ? 'Hide wallet details ↑' : 'Show wallet details ↓'}
                  </button>
                  <div className={`adlab-wallet-details${walletDetailsOpen ? ' adlab-wallet-details-open' : ''}`}>
                    <div className="adlab-wallet-details-content">
                      <span>Identity key</span><code>{session?.identityKey}</code>
                      <span>Wallet version</span><code>{session?.version}</code>
                      <span>Application namespace</span><code>{ADINALS_NAMESPACE.app}</code>
                      <span>Tracked ordinal basket</span><code>{session?.basket}</code>
                      <span>Tracked outputs</span><code>{session?.ordinalCount ?? 'Unavailable'}</code>
                      <p>
                        Funding, derived keys, signatures, and custody remain inside the connected
                        wallet. Adinals never receives or stores private keys.
                      </p>
                      <button
                        type="button"
                        className="ads-back ads-reject"
                        onClick={() => {
                          disconnect()
                          setWalletDetailsOpen(false)
                        }}
                      >
                        Disconnect from this page
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="adlab-onboarding">
                  <div>
                    <span className="adlab-kicker">Get started</span>
                    <strong>Connect a BRC-100 wallet</strong>
                    <p>Your wallet funds, signs, and retains every Adinal output.</p>
                  </div>
                  <div className="adlab-wallet-actions">
                    <button
                      type="button"
                      className="ads-back adlab-primary"
                      disabled={walletStatus === 'connecting'}
                      onClick={() => void connect()}
                    >
                      {walletStatus === 'connecting' ? 'Looking for wallet…' : 'Connect wallet'}
                    </button>
                  </div>
                </div>
              )}
              {(walletError || ownership.error) && (
                <div className="wallet-inline-error">{walletError || ownership.error}</div>
              )}
            </section>
          </div>
        </header>

        {note && (
          <div
            className={`adlab-feedback adlab-feedback-${noteKind}`}
            role={noteKind === 'error' ? 'alert' : 'status'}
            aria-live={noteKind === 'error' ? 'assertive' : 'polite'}
          >
            <strong>{noteKind === 'error' ? 'Something needs attention' : noteKind === 'success' ? 'Done' : 'Notice'}</strong>
            <span>{note}</span>
            <button type="button" onClick={() => setNote(null)} aria-label="Dismiss message">×</button>
          </div>
        )}
        {receipt && <ReceiptLine receipt={receipt} onDismiss={() => setReceipt(null)} />}

        {incompleteTransitions.length > 0 && (
          <div className="adlab-feedback adlab-feedback-info" role="status">
            <strong>Public ownership state is still indexing</strong>
            <span>
              GorillaPool reports {incompleteTransitions.length} spent Adinal
              {incompleteTransitions.length === 1 ? '' : 's'} but has not returned the successor
              state yet. Old sale and owner labels are provisional, and affected actions are
              disabled. Refresh after the next block; with the current reader, block confirmation
              may be required before purchase or transfer history is complete enough to authorize
              a buyer&rsquo;s update in the creator inbox. Update and decision records themselves often
              index immediately. A verified Adinals overlay is intended to reduce the spend-history delay.
            </span>
          </div>
        )}

        <nav className="adlab-tabs" role="tablist" aria-label="Adinals workspace">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'approvals'}
            className={activeTab === 'approvals' ? 'adlab-tab-active' : ''}
            disabled={!keys}
            onClick={() => setActiveTab('approvals')}
          >
            <span>Approvals</span>
            <strong className={pendingApprovals.length ? 'adlab-tab-alert' : ''}>
              {pendingApprovals.length}
            </strong>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ads'}
            className={activeTab === 'ads' ? 'adlab-tab-active' : ''}
            disabled={!keys}
            onClick={() => setActiveTab('ads')}
          >
            <span>My ads</span>
            <strong>{visibleMyAds.length}</strong>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'collections'}
            className={activeTab === 'collections' ? 'adlab-tab-active' : ''}
            onClick={() => setActiveTab('collections')}
          >
            <span>Collections</span>
            <strong>{visibleCollectionCount}</strong>
          </button>
        </nav>

        {keys && activeTab === 'approvals' && (
          <section role="tabpanel" className={`adlab-panel adlab-approvals ${pendingApprovals.length ? 'adlab-approvals-active' : ''}`}>
            <div className="adlab-section-head">
              <div>
                <span className="adlab-kicker">Creator inbox</span>
                <h2>Pending approvals</h2>
                <p>
                  {pendingApprovals.length
                    ? `${pendingApprovals.length} owner update${pendingApprovals.length === 1 ? '' : 's'} waiting for your decision.`
                    : 'No currently verifiable updates need review. Update records can index immediately, but an update after a recent purchase cannot appear here until GorillaPool also returns the buyer’s spend chain and owner epoch; refresh after the next block.'}
                </p>
              </div>
              <span className={`adlab-count ${pendingApprovals.length ? 'adlab-count-alert' : ''}`}>
                {pendingApprovals.length}
              </span>
            </div>

            {pendingApprovals.length > 0 && (
              <div className="adlab-approval-list">
                {pendingApprovals.map(({ collection: pendingCollection, ad, update }) => (
                  <article className="adlab-approval-card" key={update.outpoint}>
                    <div className="adlab-approval-copy">
                      <span className="adlab-kicker">{pendingCollection.name} · slot #{ad.serial}</span>
                      <CreativePreview
                        format={update.format}
                        text={update.text}
                        contentUrl={update.contentUrl}
                        url={update.url}
                        className="adlab-approval-creative"
                        localImage={localImagePreviews[update.contentUrl]}
                      />
                      <small>
                        Submitted by {shortAddress(update.signer)} · replaces the current {ad.format} creative
                      </small>
                    </div>
                    <div className="adlab-approval-actions">
                      <button
                        type="button"
                        className="ads-back ads-approve"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            'Approval',
                            () => decideUpdate(keys, {
                              collectionId: pendingCollection.origin,
                              adOrigin: ad.origin,
                              updateOutpoint: update.outpoint,
                              adOutpoint: update.adOutpoint,
                              ownerEpoch: update.ownerEpoch,
                              verdict: 'approved',
                              reasonCode: 'approved',
                            }),
                            (result) => applyLocalDecision(ad.origin, update.outpoint, 'approved', result),
                          )
                        }
                      >
                        Approve and publish
                      </button>
                      <button
                        type="button"
                        className="ads-back ads-reject"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            'Rejection',
                            () => decideUpdate(keys, {
                              collectionId: pendingCollection.origin,
                              adOrigin: ad.origin,
                              updateOutpoint: update.outpoint,
                              adOutpoint: update.adOutpoint,
                              ownerEpoch: update.ownerEpoch,
                              verdict: 'disapproved',
                              reasonCode: 'changes-needed',
                            }),
                            (result) => applyLocalDecision(ad.origin, update.outpoint, 'disapproved', result),
                          )
                        }
                      >
                        Reject
                      </button>
                      <button type="button" className="ads-back" onClick={() => openCollection(pendingCollection.origin)}>
                        View ad
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {keys && activeTab === 'ads' && (
          <section role="tabpanel" className="adlab-panel">
            <div className="adlab-section-head">
              <div>
                <span className="adlab-kicker">Owned by this wallet</span>
                <h2>My ads</h2>
                <p>Update your live copy, check creator review, or manage a sale from its collection.</p>
              </div>
              <span className="adlab-count">{visibleMyAds.length}</span>
            </div>

            <label className="adlab-show-expired adlab-show-expired-ads">
              <input
                type="checkbox"
                checked={showExpiredCollections}
                onChange={(event) => setShowExpiredCollections(event.target.checked)}
              />
              <span>Show expired ads</span>
            </label>

            <div className={`adlab-my-updates ${myPendingUpdates.length ? 'adlab-my-updates-active' : ''}`}>
              <div>
                <span className="adlab-kicker">My pending updates</span>
                <strong>
                  {myPendingUpdates.length
                    ? `${myPendingUpdates.length} update${myPendingUpdates.length === 1 ? '' : 's'} awaiting creator review`
                    : 'No updates awaiting review'}
                </strong>
              </div>
              {myPendingUpdates.map(({ collection: pendingCollection, ad, update }) => (
                <button
                  type="button"
                  className="adlab-pending-update"
                  key={update.outpoint}
                  onClick={() => openCollection(pendingCollection.origin)}
                >
                  <span>{pendingCollection.name} · slot #{ad.serial}</span>
                  <CreativePreview
                    format={update.format}
                    text={update.text}
                    contentUrl={update.contentUrl}
                    url={update.url}
                    className="adlab-pending-creative"
                    localImage={localImagePreviews[update.contentUrl]}
                    destinationLink={false}
                  />
                  <small>Waiting for {shortAddress(pendingCollection.creator)} →</small>
                </button>
              ))}
            </div>

            {visibleMyAds.length ? (
              <div className="adlab-my-ads-grid">
                {visibleMyAds.map((ad) => {
                  const parent = collections.find((item) => item.origin === ad.collectionId)
                  if (!parent) return null
                  return (
                    <article
                      className={`adlab-my-ad-card${parent.expired ? ' adlab-my-ad-expired' : ''}`}
                      key={ad.origin}
                    >
                      <div className="adlab-card-top">
                        <span className="adlab-kicker">{parent.name} · slot #{ad.serial}</span>
                        <span
                          className={`ads-badge ${
                            parent.expired
                              ? 'ads-bad adlab-expired-badge'
                              : ad.listing
                                ? 'ads-listed'
                                : ad.status === 'pending'
                                  ? 'ads-pending'
                                  : 'ads-ok'
                          }`}
                        >
                          {parent.expired
                            ? 'Expired'
                            : ad.listing
                              ? `${ad.listing.price.toLocaleString()} sats`
                              : ad.status === 'pending'
                                ? 'Awaiting review'
                                : 'Live'}
                        </span>
                      </div>
                      <CreativePreview
                        format={ad.format}
                        text={ad.liveText || ad.mintText}
                        contentUrl={ad.liveContentUrl}
                        url={ad.liveUrl}
                        className="adlab-my-ad-creative"
                        localImage={localImagePreviews[ad.liveContentUrl]}
                      />
                      {parent.expired && (
                        <div className="adlab-expired-editor-notice" role="status">
                          <strong>This ad has expired</strong>
                          <span>It cannot be updated, embedded, listed, or purchased. Ownership and history remain on chain.</span>
                        </div>
                      )}
                      <p>{expirationLabel(parent.expiresAt)}</p>
                      <div className="adlab-card-actions">
                        <button type="button" className="ads-back" onClick={() => openCollection(parent.origin)}>
                          Manage ad
                        </button>
                        <button
                          type="button"
                          className="ads-back adlab-embed-button"
                          disabled={parent.expired || ad.duplicateSlot || !ad.fromCreator}
                          onClick={() => setEmbedTarget({ kind: 'ad', origin: ad.origin, name: `${parent.name} · slot #${ad.serial}` })}
                        >
                          Embed
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="adlab-empty">
                <strong>You do not own any active ad slots</strong>
                <span>
                  {myAds.length
                    ? 'Your expired ads are hidden. Select “Show expired ads” to view their ownership and history.'
                    : 'Open a collection below to buy a listed ad, or mint slots in your own collection.'}
                </span>
              </div>
            )}
          </section>
        )}

        {activeTab === 'collections' && !collection && (
        <section role="tabpanel" className="adlab-panel" id="adlab-collections">
          <div className="adlab-section-head">
            <div>
              <span className="adlab-kicker">
                {collectionScope === 'all' ? 'Public discovery · open protocol' : 'Curated discovery · open protocol'}
              </span>
              <h2>
                {collectionScope === 'all'
                  ? 'All collections'
                  : collectionScope === 'featured'
                    ? 'Featured collections'
                    : 'My collections'}
              </h2>
              <p>
                {collectionScope === 'all'
                  ? 'Every protocol-valid collection indexed in the active Adinals namespace. Public listing does not imply endorsement.'
                  : collectionScope === 'featured'
                    ? 'Collections cryptographically signed by a recognized Foxplorer creator address.'
                    : 'Collections held and signed by the connected BRC-100 wallet.'}
              </p>
            </div>
            <div className="adlab-head-actions">
              <button type="button" className="ads-back adlab-action-button" disabled={loading} onClick={() => void load()}>
                {loading ? 'Reading chain…' : '↻ Refresh collections'}
              </button>
              {keys && (
                <button type="button" className="ads-back adlab-primary adlab-action-button" onClick={() => setShowCreateCollection((open) => !open)}>
                  {showCreateCollection ? '← Back to collections' : '+ New collection'}
                </button>
              )}
            </div>
          </div>

          {!showCreateCollection && (
            <div className="adlab-discovery-tools">
              <div className="adlab-discovery-tabs" role="tablist" aria-label="Collection discovery">
                <button
                  type="button"
                  role="tab"
                  aria-selected={collectionScope === 'all'}
                  className={collectionScope === 'all' ? 'adlab-discovery-tab-active' : ''}
                  onClick={() => setCollectionScope('all')}
                >
                  All <strong>{visibleAllCollections.length}</strong>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={collectionScope === 'featured'}
                  className={collectionScope === 'featured' ? 'adlab-discovery-tab-active' : ''}
                  onClick={() => setCollectionScope('featured')}
                >
                  Featured <strong>{visibleFoxplorerCollections.length}</strong>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={collectionScope === 'mine'}
                  className={collectionScope === 'mine' ? 'adlab-discovery-tab-active' : ''}
                  disabled={!keys}
                  onClick={() => setCollectionScope('mine')}
                >
                  My collections <strong>{visibleOwnedCollections.length}</strong>
                </button>
              </div>

              <label className="adlab-show-expired">
                <input
                  type="checkbox"
                  checked={showExpiredCollections}
                  onChange={(event) => setShowExpiredCollections(event.target.checked)}
                />
                <span>Show expired collections</span>
              </label>
            </div>
          )}

          {!showCreateCollection && (displayedCollections.length ? (
            <div className="adlab-collection-grid">
              {displayedCollections.map((item) => {
                const mine = Boolean(keys && ownsCollection(keys, item.origin))
                const foxplorer = isFoxplorerCreator(item.creator)
                const itemAds = ads.filter(
                  (ad) =>
                    ad.collectionId === item.origin &&
                    ad.fromCreator &&
                    !ad.duplicateSlot &&
                    ad.serial >= 1 &&
                    ad.serial <= item.max
                )
                const itemPending = pendingApprovals.filter(
                  (pending) => pending.collection.origin === item.origin
                ).length
                const reviewStats = creatorReviewStats.get(item.creator)
                return (
                  <article
                    className={`adlab-collection-card${item.expired ? ' adlab-collection-expired' : ''}${item.origin === selected ? ' adlab-collection-selected' : ''}`}
                    key={item.origin}
                  >
                    <button type="button" onClick={() => openCollection(item.origin)}>
                      <InscriptionImage
                        outpoint={item.origin}
                        alt={`${item.name} collection cover`}
                        className="adlab-collection-cover"
                        fallback={
                          item.height === null
                            ? 'Image propagating — retrying automatically'
                            : 'Adinals collection'
                        }
                        retryWhileIndexing={item.height === null}
                        localImage={localImagePreviews[item.origin]}
                      />
                      <div className="adlab-card-top">
                        <span className={`adlab-kicker${foxplorer ? ' adlab-foxplorer-label' : ''}`}>
                          {foxplorer
                            ? '✓ Foxplorer collection'
                            : mine
                              ? 'Your collection'
                              : 'Public collection'}
                        </span>
                        {item.expired ? (
                          <span className="ads-badge ads-bad adlab-expired-badge">Expired</span>
                        ) : itemPending > 0 ? (
                          <span className="adlab-count adlab-count-alert">{itemPending}</span>
                        ) : null}
                      </div>
                      <strong>{item.name}</strong>
                      <p>{item.description || 'No description provided.'}</p>
                      {item.placement && (
                        <small className="adlab-card-placement">Displayed in: {item.placement}</small>
                      )}
                      <div className="adlab-card-meta">
                        <span>{item.format === 'image' ? 'Image ads' : 'Text ads'}</span>
                        <span>{itemAds.length}/{item.max} filled</span>
                        <span>{Math.max(0, item.max - itemAds.length)} available</span>
                        {item.format === 'text' ? (
                          <span>{item.maxChars}-character limit</span>
                        ) : (
                          <span>{item.imageProfile || IMAGE_PROFILE}</span>
                        )}
                        <span>
                          {item.contentPolicy === 'family-friendly'
                            ? 'family-friendly policy'
                            : 'no content policy stated'}
                        </span>
                        <span>{item.approval === 'open' ? 'automatic updates' : 'creator approval'}</span>
                        {item.approval !== 'open' && (
                          <span>{reviewAverageLabel(reviewStats)}</span>
                        )}
                        <span className={item.expired ? 'adlab-expired-text' : ''}>
                          {expirationLabel(item.expiresAt)}
                        </span>
                      </div>
                    </button>
                    <div className="adlab-card-footer">
                      <span>
                        {foxplorer
                          ? `Created by Foxplorer · ${shortAddress(item.creator)}`
                          : mine
                            ? 'Created by you'
                            : `By ${shortAddress(item.creator)}`}
                      </span>
                      <Outpoint value={item.origin} label="On-chain record ↗" />
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="adlab-empty">
              <strong>
                {collectionScope === 'all'
                  ? 'No public collections indexed yet'
                  : collectionScope === 'featured'
                    ? 'No featured collections yet'
                    : 'You have not created a collection with this wallet'}
              </strong>
              <span>
                {collectionScope === 'all'
                  ? 'Refresh after GorillaPool indexes a collection in this namespace.'
                  : collectionScope === 'featured'
                    ? 'Foxplorer-signed collections will appear here.'
                    : 'Create one here, or connect the wallet that holds an existing collection.'}
              </span>
            </div>
          ))}

          {keys && showCreateCollection && (
            <div className="adlab-create-panel" id="adlab-create-collection">
              <div className="adlab-section-head">
                <div>
                  <span className="adlab-kicker">Permanent rules</span>
                  <h2>Create a collection</h2>
                  <p>Capacity, creative format, content policy, and creator approval cannot be changed after broadcast.</p>
                </div>
              </div>
              <div className="adlab-form-grid">
                <label className="ads-field adlab-span-2">
                  <span>Collection name</span>
                  <input className="ads-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Sponsor messages" />
                  <small className="ads-note">Shown in wallets, explorers, and marketplaces.</small>
                </label>
                <label className="ads-field adlab-span-2">
                  <span>Description</span>
                  <input className="ads-input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="A finite collection of ownable live content" />
                </label>
                <label className="ads-field">
                  <span>Number of ad slots</span>
                  <input className="ads-price" inputMode="numeric" value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.target.value.replace(/\D/g, '') })} />
                  <small className="ads-note">Permanent maximum.</small>
                </label>
                <label className="ads-field">
                  <span>Creative format</span>
                  <select
                    className="ads-input"
                    value={draft.format}
                    onChange={(event) => setDraft({ ...draft, format: event.target.value })}
                  >
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                  </select>
                  <small className="ads-note">One format per collection keeps publisher requirements predictable.</small>
                </label>
                {draft.format === 'text' ? (
                  <label className="ads-field">
                    <span>Characters per ad</span>
                    <input className="ads-price" inputMode="numeric" value={draft.maxChars} onChange={(e) => setDraft({ ...draft, maxChars: e.target.value.replace(/\D/g, '') })} />
                    <small className="ads-note">Maximum live text length for every ad.</small>
                  </label>
                ) : (
                  <div className="ads-field adlab-image-profile-note">
                    <span>Image profile</span>
                    <strong>{IMAGE_PROFILE}</strong>
                    <div className="adlab-image-expectations" role="note" aria-label="Image requirements">
                      <span>{imageProfileSummary}.</span>
                      <span>Raw bytes live in each inscription, never in MAP metadata.</span>
                    </div>
                  </div>
                )}
                <label className="ads-field adlab-span-2">
                  <span>Where these ads appear (optional)</span>
                  <input className="ads-input" value={draft.placement} onChange={(e) => setDraft({ ...draft, placement: e.target.value })} placeholder="Website, game, app, or agent" />
                </label>
                <label className="ads-field">
                  <span>Owner update policy</span>
                  <select
                    className="ads-input"
                    value={draft.approval}
                    onChange={(event) => setDraft({ ...draft, approval: event.target.value })}
                  >
                    <option value="creator">Creator review required</option>
                    <option value="open">Open — updates go live automatically</option>
                  </select>
                  <small className="ads-note">This publication rule is permanent and independent of the content standard.</small>
                </label>
                <label className="ads-field">
                  <span>Content policy</span>
                  <select
                    className="ads-input"
                    value={draft.contentPolicy}
                    onChange={(event) =>
                      setDraft({ ...draft, contentPolicy: event.target.value })
                    }
                  >
                    <option value="unspecified">No policy stated</option>
                    <option value="family-friendly">Family-friendly</option>
                  </select>
                  <small className="ads-note">
                    Creator-declared—not an Adinals certification. Open collections do not receive prepublication review.
                  </small>
                </label>
                <label className="ads-field">
                  <span>Display window</span>
                  <select
                    className="ads-input"
                    value={draft.expiresInDays}
                    onChange={(event) => setDraft({ ...draft, expiresInDays: event.target.value })}
                  >
                    <option value="1">1 day</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="0">No expiration</option>
                  </select>
                  <small className="ads-note">All ad slots inherit this deadline. Expiration ends display eligibility; it does not erase the assets.</small>
                </label>
                <label className="ads-field adlab-span-2">
                  <span>Cover image (optional)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) =>
                      void chooseImage(event.target.files?.[0], setCover)
                    }
                  />
                  <small className="ads-note">
                    {cover
                      ? `${imageSelectionLabel(cover)} · roughly ${Math.ceil((cover.bytes / 1000) * 100)} sats`
                      : 'PNG, JPEG, or WebP up to 1 MB. Aim for 300 KB or less; stored fully on chain and smaller files cost less.'}
                  </small>
                </label>
              </div>
              <div className="adlab-form-submit">
                <span>Creator <code>BRC-100 derived key</code></span>
                <button
                  type="button"
                  className="ads-back adlab-primary"
                  disabled={
                    busy ||
                    !draft.name.trim() ||
                    !(Number(draft.max) > 0) ||
                    (draft.format === 'text' && !(Number(draft.maxChars) > 0))
                  }
                  onClick={() => {
                    const format: CreativeFormat = draft.format === 'image' ? 'image' : 'text'
                    const approval = draft.approval === 'open' ? 'open' : 'creator'
                    const contentPolicy = draft.contentPolicy === 'family-friendly'
                      ? 'family-friendly'
                      : 'unspecified'
                    const expiresAt = Number(draft.expiresInDays) > 0
                      ? new Date(
                          Date.now() + Number(draft.expiresInDays) * 86_400_000
                        ).toISOString()
                      : ''
                    void run(
                      'Collection',
                      () => createCollection(keys, {
                        name: draft.name,
                        description: draft.description,
                        max: Number(draft.max),
                        format,
                        approval,
                        contentPolicy,
                        maxChars: Number(draft.maxChars),
                        placement: draft.placement,
                        ...(expiresAt && { expiresAt }),
                        ...(cover && { cover: { data: cover.data, type: cover.type } }),
                      }),
                      (result) => {
                        const origin = result.outpoint ?? `${result.txid}_0`
                        const optimisticCollection: Collection = {
                          origin,
                          name: draft.name.trim(),
                          description: draft.description.trim(),
                          creator: keys.ordAddress,
                          max: Number(draft.max),
                          approval,
                          contentPolicy,
                          format,
                          imageProfile: format === 'image' ? IMAGE_PROFILE : '',
                          maxChars: format === 'text' ? Number(draft.maxChars) : 0,
                          placement: draft.placement.trim(),
                          expiresAt,
                          expired: false,
                          height: null,
                        }
                        setCollections((current) => [
                          optimisticCollection,
                          ...current.filter((item) => item.origin !== origin),
                        ])
                        if (cover) {
                          setLocalImagePreviews((current) => ({
                            ...current,
                            [origin]: cover,
                          }))
                        }
                        setShowCreateCollection(false)
                        setCollectionScope('mine')
                        setCover(null)
                        setDraft({
                          name: '',
                          description: '',
                          max: '5',
                          maxChars: '16',
                          format: 'text',
                          placement: '',
                          approval: 'creator',
                          contentPolicy: 'unspecified',
                          expiresInDays: '7',
                        })
                      },
                      Boolean(cover)
                    )
                  }}
                >
                  {busy ? 'Creating…' : 'Create permanent collection'}
                </button>
              </div>
            </div>
          )}
        </section>
        )}

      {activeTab === 'collections' && collection && (
        <section role="tabpanel" className="adlab-panel adlab-collection-detail" id="adlab-collection-detail">
          <nav className="adlab-collection-toolbar" aria-label="Collection navigation and actions">
            <button
              type="button"
              className="ads-back adlab-collection-back adlab-action-button"
              onClick={() => setSelected(null)}
            >
              <span aria-hidden="true">←</span> Back to all collections
            </button>
            <div className="adlab-head-actions">
              <button
                type="button"
                className="ads-back adlab-embed-button adlab-action-button"
                disabled={collection.expired}
                onClick={() => setEmbedTarget({ kind: 'collection', origin: collection.origin, name: collection.name })}
              >
                Embed collection
              </button>
              <button
                type="button"
                className="ads-back adlab-action-button"
                disabled={loading}
                onClick={() => void load()}
              >
                {loading ? 'Reading chain…' : '↻ Refresh collection'}
              </button>
              {keys && (
                <button
                  type="button"
                  className="ads-back adlab-primary adlab-action-button"
                  onClick={startNewCollection}
                >
                  + New collection
                </button>
              )}
            </div>
          </nav>
          <div className="adlab-section-head">
            <InscriptionImage
              outpoint={collection.origin}
              alt={`${collection.name} collection cover`}
              className="adlab-detail-cover"
              fallback={
                collection.height === null
                  ? 'Image propagating — retrying automatically'
                  : 'No cover'
              }
              retryWhileIndexing={collection.height === null}
              localImage={localImagePreviews[collection.origin]}
            />
            <div>
              <div className="adlab-detail-labels">
                <span className="adlab-kicker">Collection workspace</span>
                {isFoxplorerCreator(collection.creator) && (
                  <span className="ads-badge adlab-foxplorer-badge">✓ Foxplorer collection</span>
                )}
              </div>
              <h2>{collection.name}</h2>
              <p>{collection.description || 'No description provided.'}</p>
            </div>
          </div>
          <div className="adlab-rules">
            <div><strong>{occupiedSlots.size}/{collection.max}</strong><span>slots filled</span></div>
            <div><strong>{Math.max(0, collection.max - occupiedSlots.size)}</strong><span>slots available</span></div>
            <div><strong>{collection.format === 'image' ? 'Image' : 'Text'}</strong><span>ad format</span></div>
            {collection.format === 'text' ? (
              <div><strong>{collection.maxChars}</strong><span>characters per ad</span></div>
            ) : (
              <div><strong>{collection.imageProfile || IMAGE_PROFILE}</strong><span>{imageProfileSummary}</span></div>
            )}
            <div>
              <strong>
                {collection.contentPolicy === 'family-friendly'
                  ? 'Family-friendly'
                  : 'No policy stated'}
              </strong>
              <span>creator-declared content policy</span>
            </div>
            <div><strong>{collection.approval === 'open' ? 'Automatic' : 'Creator review'}</strong><span>owner updates</span></div>
            {collection.approval !== 'open' && (
              <div>
                <strong>{reviewAverageLabel(creatorReviewStats.get(collection.creator))}</strong>
                <span>confirmed response history across this creator&rsquo;s collections</span>
              </div>
            )}
            <div><strong>{isCreator ? 'You' : shortAddress(collection.creator)}</strong><span>collection creator</span></div>
            <div className={collection.expired ? 'adlab-rule-expired' : ''}>
              <strong>{expirationLabel(collection.expiresAt)}</strong><span>display eligibility</span>
            </div>
            {collection.placement && (
              <div><strong>{collection.placement}</strong><span>where displayed</span></div>
            )}
          </div>

          {collection.expired && (
            <div className="adlab-feedback adlab-feedback-error">
              <strong>This collection has expired</strong>
              <span>Its assets still exist, but Adinals will not treat them as displayable or allow new updates, listings, purchases, or approvals. Existing sellers can remove their listings.</span>
            </div>
          )}

          {members.length !== canonicalMembers.length && (
            <div className="adlab-feedback adlab-feedback-error">
              <strong>Duplicate or invalid records found</strong>
              <span>
                {members.length - canonicalMembers.length} record{members.length - canonicalMembers.length === 1 ? '' : 's'} do not count toward collection capacity. They remain visible so their assets can still be managed.
              </span>
            </div>
          )}

          {keys && isCreator && !collection.expired && occupiedSlots.size < collection.max && (
            <div className="adlab-mint-panel">
              <div>
                <span className="adlab-kicker">Next available slot</span>
                <strong>Mint ad #{(() => { let next = 1; while (occupiedSlots.has(next)) next += 1; return next })()}</strong>
                <small>This creates permanent Ad #{(() => { let next = 1; while (occupiedSlots.has(next)) next += 1; return next })()}. Its {collection.format === 'image' ? 'image' : 'text'} can change later.</small>
              </div>
              {collection.format === 'image' ? (
                <label className="ads-field">
                  <span>Starting image</span>
                  <input
                    key={mintFileInputKey}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) =>
                      void chooseImage(event.target.files?.[0], setMintImage)
                    }
                  />
                  <small className="ads-note">
                    {mintImage ? imageSelectionLabel(mintImage) : imageProfileSummary}
                  </small>
                </label>
              ) : (
                usesHexColorEditor ? (
                  <HexColorEditor
                    value={mintText}
                    onChange={setMintText}
                    label="Starting color"
                  />
                ) : (
                  <label className="ads-field">
                    <span>Starting ad text</span>
                    <input
                      className="ads-input ads-adinput"
                      value={mintText}
                      maxLength={collection.maxChars || undefined}
                      onChange={(e) => setMintText(e.target.value)}
                      placeholder={`Up to ${collection.maxChars} characters`}
                    />
                    <small className="ads-note">{[...mintText].length}/{collection.maxChars} characters</small>
                  </label>
                )
              )}
              {collectionUiProfile.destinationLinks && (
                <label className="ads-field adlab-url-field">
                  <span>Optional destination link</span>
                  <input
                    className="ads-input"
                    type="url"
                    inputMode="url"
                    maxLength={AD_URL_MAX_LENGTH}
                    value={mintUrl}
                    onChange={(event) => setMintUrl(event.target.value)}
                    placeholder="https://example.com"
                    aria-invalid={Boolean(mintUrlResult.error)}
                  />
                  <small className={`ads-note${mintUrlResult.error ? ' adlab-field-error' : ''}`}>
                    {mintUrlResult.error || 'Optional. HTTPS only; signed as part of this creative.'}
                  </small>
                </label>
              )}
              <button
                type="button"
                className="ads-back adlab-primary"
                disabled={
                  busy ||
                  Boolean(mintUrlResult.error) ||
                  (collection.format === 'image' ? !mintImage : !normalizedMintText || !mintTextValid)
                }
                onClick={() => {
                  let serial = 1
                  while (occupiedSlots.has(serial)) serial += 1
                  const mintOwner = collection.creator
                  void run(
                    `Ad #${serial}`,
                    () =>
                      collection.format === 'image' && mintImage
                        ? mintAd(keys, {
                            collectionId: collection.origin,
                            name: 'Ad',
                            serial,
                            url: mintUrlResult.url,
                            format: 'image',
                            image: { data: mintImage.data, type: mintImage.type },
                          })
                        : mintAd(keys, {
                            collectionId: collection.origin,
                            name: 'Ad',
                            serial,
                            url: mintUrlResult.url,
                            format: 'text',
                            text: normalizedMintText,
                            maxChars: collection.maxChars,
                          }),
                    (result) => {
                      const outpoint = result.outpoint ?? `${result.txid}_0`
                      const now = new Date().toISOString()
                      setLocalMintSlots((current) => ({
                        ...current,
                        [collection.origin]: [
                          ...new Set([...(current[collection.origin] ?? []), serial]),
                        ],
                      }))
                      setAds((current) => [
                        ...current.filter((item) => item.origin !== outpoint),
                        {
                          origin: outpoint,
                          outpoint,
                          collectionId: collection.origin,
                          owner: mintOwner,
                          ownerEpoch: outpoint,
                          serial,
                          name: `Ad #${serial}`,
                          format: collection.format,
                          mintText: collection.format === 'text' ? normalizedMintText : '',
                          mintContentUrl: collection.format === 'image' ? outpoint : '',
                          mintUrl: mintUrlResult.url,
                          mintedAt: now,
                          height: null,
                          listing: null,
                          originHeight: null,
                          originIdx: 0,
                          fromCreator: true,
                          invalidReason: '',
                          duplicateSlot: false,
                          updates: [],
                          liveText: collection.format === 'text' ? normalizedMintText : '',
                          liveContentUrl: collection.format === 'image' ? outpoint : '',
                          liveUrl: mintUrlResult.url,
                          status: 'live',
                          marketEvents: [],
                          indexPending: false,
                        },
                      ])
                      setMintText('')
                      setMintUrl('')
                      setMintImage(null)
                      setMintFileInputKey((key) => key + 1)
                    },
                    collection.format === 'image'
                  )
                }}
              >
                {busy ? 'Minting…' : 'Mint ad slot'}
              </button>
            </div>
          )}

          <div className="adlab-ad-list">
              <div className="adlab-ad-list-head" aria-hidden="true">
                <span>Slot</span>
                <span>Live creative / edit</span>
                <span>State</span>
                <span>Current owner</span>
                <span>On chain</span>
                <span>Sale</span>
                <span>Activity</span>
              </div>
              {members.length === 0 && (
                <div className="adlab-empty">
                  <strong>No ad slots minted yet</strong>
                  <span>
                    {isCreator
                      ? 'Use “Mint ad slot” above to create the first one.'
                      : 'The creator has not minted any ad slots.'}
                  </span>
                </div>
              )}
                {members.map((ad) => {
                  const mine = Boolean(
                    keys && !ad.listing && ownsAd(keys, ad.origin, ad.owner)
                  )
                  const myListing = Boolean(
                    keys && ad.listing && ownsListing(keys, ad.outpoint)
                  )
                  const activeSlot =
                    ad.fromCreator &&
                    !ad.duplicateSlot &&
                    ad.serial >= 1 &&
                    ad.serial <= collection.max &&
                    !collection.expired
                  const destinationDraft = collectionUiProfile.destinationLinks
                    ? adUrlDraft[ad.origin] ?? ad.liveUrl
                    : ''
                  const destinationResult = collectionUiProfile.destinationLinks
                    ? validateAdUrl(destinationDraft)
                    : { url: '', error: '' }
                  const textDraft = adDraft[ad.origin] ?? ad.liveText
                  const normalizedTextDraft = usesHexColorEditor
                    ? normalizeHexColor(textDraft)
                    : textDraft.trim()
                  const textDraftValid = !usesHexColorEditor || isValidHexColor(textDraft)
                  const activityCount =
                    1 +
                    ad.marketEvents.length +
                    ad.updates.length +
                    ad.updates.filter((update) => update.verdict).length
                  return (
                    <article
                      className={`adlab-ad-item${mine || myListing ? ' ads-mine' : ''}${collection.expired ? ' adlab-ad-expired' : ''}`}
                      key={ad.origin}
                    >
                      <div className="adlab-ad-row">
                        <div className="adlab-ad-cell" data-label="Slot">
                          {ad.serial || '—'}
                          {!ad.fromCreator && (
                            <div className="ads-badge ads-bad">{ad.invalidReason || 'invalid record'}</div>
                          )}
                          {ad.duplicateSlot && (
                            <div className="ads-badge ads-bad">duplicate slot</div>
                          )}
                        </div>
                        <div className="adlab-ad-cell adlab-creative-cell" data-label="Live creative">
                          {collection.expired && mine && (
                            <div className="adlab-expired-editor-notice" role="status">
                              <strong>This ad has expired</strong>
                              <span>Its ownership and history remain on chain, but updates and live display are closed.</span>
                            </div>
                          )}
                          {ad.format === 'image' ? (
                            <>
                              <CreativePreview
                                format="image"
                                text=""
                                contentUrl={ad.liveContentUrl}
                                url={ad.liveUrl}
                                localImage={localImagePreviews[ad.liveContentUrl]}
                              />
                              {mine && keys && activeSlot && (
                                <span className="ads-market adlab-image-update">
                                  <input
                                    key={`${ad.origin}:${adImageInputVersion}`}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    aria-label={`New image for ${ad.name}`}
                                    aria-describedby={`ad-image-note-${ad.origin}`}
                                    onChange={(event) => {
                                      const input = event.currentTarget
                                      void chooseAdImage(ad.origin, input.files?.[0], input)
                                    }}
                                  />
                                  <small
                                    id={`ad-image-note-${ad.origin}`}
                                    className={`ads-note${adImageError[ad.origin] ? ' adlab-field-error' : ''}`}
                                  >
                                    {adImageError[ad.origin]
                                      ? adImageError[ad.origin]
                                      : adImageDraft[ad.origin]
                                      ? imageSelectionLabel(adImageDraft[ad.origin])
                                      : `${imageProfileSummary}. The update creates a new inscription.`}
                                  </small>
                                  {adImageDraft[ad.origin] && (
                                    <SelectedImagePreview image={adImageDraft[ad.origin]} />
                                  )}
                                  <label className="adlab-inline-field">
                                    <span>Optional destination link</span>
                                    <input
                                      className="ads-input"
                                      type="url"
                                      inputMode="url"
                                      maxLength={AD_URL_MAX_LENGTH}
                                      value={destinationDraft}
                                      onChange={(event) =>
                                        setAdUrlDraft((drafts) => ({
                                          ...drafts,
                                          [ad.origin]: event.target.value,
                                        }))
                                      }
                                      placeholder="https://example.com"
                                      aria-invalid={Boolean(destinationResult.error)}
                                    />
                                    <small className={`ads-note${destinationResult.error ? ' adlab-field-error' : ''}`}>
                                      {destinationResult.error || 'The image and destination are signed and reviewed together.'}
                                    </small>
                                  </label>
                                  <button
                                    type="button"
                                    className="ads-back"
                                    disabled={busy || !adImageDraft[ad.origin] || Boolean(destinationResult.error)}
                                    onClick={() => {
                                      const nextImage = adImageDraft[ad.origin]
                                      if (!nextImage) return
                                      const needsCreatorReview =
                                        collection.approval !== 'open' &&
                                        !ownsCollection(keys, collection.origin)
                                      void run(
                                        'Image update',
                                        () => publishUpdate(keys, {
                                          collectionId: collection.origin,
                                          adOrigin: ad.origin,
                                          adOutpoint: ad.outpoint,
                                          ownerEpoch: ad.ownerEpoch,
                                          url: destinationResult.url,
                                          format: 'image',
                                          image: { data: nextImage.data, type: nextImage.type },
                                        }),
                                        (result) => {
                                          const outpoint = result.outpoint ?? `${result.txid}_0`
                                          const stateOutpoint = result.stateOutpoint ?? ad.outpoint
                                          const optimisticUpdate: Update = {
                                            outpoint,
                                            adOutpoint: stateOutpoint,
                                            ownerEpoch: ad.ownerEpoch,
                                            format: 'image',
                                            text: '',
                                            contentUrl: outpoint,
                                            url: destinationResult.url,
                                            signer: keys.ordAddress,
                                            height: null,
                                            idx: 0,
                                            createdAt: new Date().toISOString(),
                                            valid: true,
                                            invalidReason: '',
                                          }
                                          setAds((current) =>
                                            current.map((item) =>
                                                  item.origin === ad.origin
                                                ? {
                                                    ...item,
                                                    outpoint: stateOutpoint,
                                                    updates: [...item.updates, optimisticUpdate],
                                                    liveContentUrl: needsCreatorReview
                                                      ? item.liveContentUrl
                                                      : outpoint,
                                                    liveUrl: needsCreatorReview
                                                      ? item.liveUrl
                                                      : destinationResult.url,
                                                    status: needsCreatorReview ? 'pending' : 'live',
                                                  }
                                                : item
                                            )
                                          )
                                          setLocalImagePreviews((current) => ({
                                            ...current,
                                            [outpoint]: nextImage,
                                          }))
                                          setAdImageDraft((current) => {
                                            const next = { ...current }
                                            delete next[ad.origin]
                                            return next
                                          })
                                          setAdImageError((current) => {
                                            const next = { ...current }
                                            delete next[ad.origin]
                                            return next
                                          })
                                          setAdUrlDraft((current) => {
                                            const next = { ...current }
                                            delete next[ad.origin]
                                            return next
                                          })
                                          setAdImageInputVersion((version) => version + 1)
                                        },
                                        true,
                                        {
                                          origin: ad.origin,
                                          successLabel: 'Image updated',
                                          placement: 'creative',
                                        }
                                      )
                                    }}
                                  >
                                    {busy ? '…' : 'update image'}
                                  </button>
                                  {recentAdActions[ad.origin]?.placement === 'creative' && (
                                    <RecentAdActionLine action={recentAdActions[ad.origin]} />
                                  )}
                                </span>
                              )}
                            </>
                          ) : mine && keys && activeSlot ? (
                            <span className="ads-market">
                              {usesHexColorEditor ? (
                                <HexColorEditor
                                  value={textDraft}
                                  onChange={(value) =>
                                    setAdDraft((drafts) => ({ ...drafts, [ad.origin]: value }))
                                  }
                                  label={`Color for slot ${ad.serial}`}
                                />
                              ) : (
                                <input
                                  className="ads-input ads-adinput"
                                  value={textDraft}
                                  maxLength={collection.maxChars || undefined}
                                  onChange={(e) =>
                                    setAdDraft((d) => ({ ...d, [ad.origin]: e.target.value }))
                                  }
                                />
                              )}
                              {collectionUiProfile.destinationLinks && (
                                <label className="adlab-inline-field">
                                  <span>Optional destination link</span>
                                  <input
                                    className="ads-input"
                                    type="url"
                                    inputMode="url"
                                    maxLength={AD_URL_MAX_LENGTH}
                                    value={destinationDraft}
                                    onChange={(event) =>
                                      setAdUrlDraft((drafts) => ({
                                        ...drafts,
                                        [ad.origin]: event.target.value,
                                      }))
                                    }
                                    placeholder="https://example.com"
                                    aria-invalid={Boolean(destinationResult.error)}
                                  />
                                  <small className={`ads-note${destinationResult.error ? ' adlab-field-error' : ''}`}>
                                    {destinationResult.error || 'Optional. Changing only this link still creates a signed update.'}
                                  </small>
                                </label>
                              )}
                              <button
                                type="button"
                                className="ads-back"
                                disabled={
                                  busy ||
                                  Boolean(destinationResult.error) ||
                                  !normalizedTextDraft ||
                                  !textDraftValid ||
                                  (
                                    normalizedTextDraft === (
                                      usesHexColorEditor ? normalizeHexColor(ad.liveText) : ad.liveText
                                    ) && destinationResult.url === ad.liveUrl
                                  )
                                }
                                onClick={() => {
                                  const nextText = normalizedTextDraft
                                  const needsCreatorReview =
                                    collection.approval !== 'open' &&
                                    !ownsCollection(keys, collection.origin)
                                  void run(
                                    'Update',
                                    () =>
                                      publishUpdate(keys, {
                                        collectionId: collection.origin,
                                        adOrigin: ad.origin,
                                        adOutpoint: ad.outpoint,
                                        ownerEpoch: ad.ownerEpoch,
                                        url: destinationResult.url,
                                        format: 'text',
                                        text: nextText,
                                        maxChars: collection.maxChars,
                                      }),
                                    (result) => {
                                      const stateOutpoint = result.stateOutpoint ?? ad.outpoint
                                      const optimisticUpdate: Update = {
                                        outpoint: result.outpoint ?? `${result.txid}_0`,
                                        adOutpoint: stateOutpoint,
                                        ownerEpoch: ad.ownerEpoch,
                                        format: 'text',
                                        text: nextText,
                                        contentUrl: '',
                                        url: destinationResult.url,
                                        signer: keys.ordAddress,
                                        height: null,
                                        idx: 0,
                                        createdAt: new Date().toISOString(),
                                        valid: true,
                                        invalidReason: '',
                                      }
                                      setAds((current) =>
                                        current.map((item) =>
                                          item.origin === ad.origin
                                            ? {
                                                ...item,
                                                outpoint: stateOutpoint,
                                                updates: [...item.updates, optimisticUpdate],
                                                liveText: needsCreatorReview ? item.liveText : nextText,
                                                liveUrl: needsCreatorReview ? item.liveUrl : destinationResult.url,
                                                status: needsCreatorReview ? 'pending' : 'live',
                                              }
                                            : item
                                        )
                                      )
                                      setAdDraft((current) => {
                                        const next = { ...current }
                                        delete next[ad.origin]
                                        return next
                                      })
                                      setAdUrlDraft((current) => {
                                        const next = { ...current }
                                        delete next[ad.origin]
                                        return next
                                      })
                                    },
                                    false,
                                    {
                                      origin: ad.origin,
                                      successLabel: 'Text updated',
                                      placement: 'creative',
                                    }
                                  )
                                }}
                              >
                                {busy ? '…' : 'update'}
                              </button>
                              {recentAdActions[ad.origin]?.placement === 'creative' && (
                                <RecentAdActionLine action={recentAdActions[ad.origin]} />
                              )}
                            </span>
                          ) : usesHexColorEditor ? (
                            <HexColorReadout value={ad.liveText} />
                          ) : (
                            <CreativePreview
                              format="text"
                              text={ad.liveText}
                              contentUrl=""
                              url={ad.liveUrl}
                              className="ads-adtext"
                            />
                          )}
                        </div>
                        <div className="adlab-ad-cell" data-label="State">
                          {collection.expired ? (
                            <span className="ads-badge ads-bad adlab-expired-badge">Expired</span>
                          ) : activeSlot ? (
                            <span
                              className={`ads-badge ${
                                ad.status === 'live'
                                  ? 'ads-ok'
                                  : ad.status === 'pending'
                                    ? 'ads-pending'
                                    : 'ads-bad'
                              }`}
                            >
                              {ad.status === 'live' ? 'Live' : ad.status === 'pending' ? 'Awaiting creator' : 'Change rejected'}
                            </span>
                          ) : (
                            <span className="ads-badge ads-bad">Not an active slot</span>
                          )}
                          {ad.height === null && (
                            <span className="ads-badge ads-pending">Confirming</span>
                          )}
                          {ad.indexPending ? (
                            <span className="ads-badge ads-pending">State indexing</span>
                          ) : ad.listing && (
                            <span className="ads-badge ads-listed">For sale</span>
                          )}
                        </div>
                        <div data-label="Owner" className="adlab-ad-cell ads-mono">
                          {mine || myListing ? (
                            <span className="ads-badge ads-ok">You</span>
                          ) : ad.indexPending ? (
                            <span className="ads-badge ads-pending">Updating…</span>
                          ) : ad.listing ? (
                            <span className="ads-badge ads-listed">Marketplace</span>
                          ) : (
                            shortAddress(ad.owner)
                          )}
                        </div>
                        <div className="adlab-ad-cell" data-label="On chain">
                          <span className="adlab-outpoint-stack">
                            <small>Current</small>
                            <Outpoint value={ad.outpoint} />
                            {ad.outpoint !== ad.origin && (
                              <small>
                                Origin <Outpoint value={ad.origin} />
                              </small>
                            )}
                          </span>
                        </div>
                        <div className="adlab-ad-cell" data-label="Sale">
                          {ad.indexPending ? (
                            <span className="ads-market">
                              <span className="ads-badge ads-pending">Previous sale state · spent</span>
                              <small>
                                Waiting for GorillaPool to return the successor. Refresh after the
                                next block; buying, delisting, and relisting are disabled meanwhile.
                              </small>
                            </span>
                          ) : ad.listing ? (
                            <span className="ads-market">
                              <span className="ads-badge ads-pending">
                                {ad.listing.price.toLocaleString()} sats
                              </span>
                              {isUnconfirmedCurrentListing(ad) && (
                                <small>
                                  Unconfirmed marketplace state. A purchase from another wallet may
                                  remain invisible until the next block; stale actions fail safely.
                                </small>
                              )}
                              {keys &&
                                (myListing ? (
                                  <button
                                    type="button"
                                    className="ads-back ads-reject"
                                    disabled={busy}
                                    onClick={() =>
                                      void run(
                                        'Remove listing',
                                        () => cancelAdListing(keys, { listingOutpoint: ad.outpoint }),
                                        (result) =>
                                          setAds((current) =>
                                            current.map((item) =>
                                              item.origin === ad.origin
                                                ? {
                                                    ...item,
                                                    outpoint: result.outpoint ?? `${result.txid}_0`,
                                                    owner: keys.ordAddress,
                                                    listing: null,
                                                    marketEvents: [
                                                      ...item.marketEvents,
                                                      {
                                                        kind: 'delisted',
                                                        outpoint: result.outpoint ?? `${result.txid}_0`,
                                                        previousOwner: item.owner,
                                                        owner: keys.ordAddress,
                                                        price: item.listing?.price ?? null,
                                                        height: null,
                                                        idx: 0,
                                                      },
                                                    ],
                                                  }
                                                : item
                                            )
                                          ),
                                        false,
                                        {
                                          origin: ad.origin,
                                          successLabel: 'Listing removed',
                                          placement: 'sale',
                                        }
                                      )
                                    }
                                  >
                                {busy ? 'Removing…' : 'Remove listing'}
                                  </button>
                                ) : activeSlot ? (
                                  <button
                                    type="button"
                                    className="ads-back ads-approve"
                                    disabled={busy}
                                    onClick={() => {
                                      if (
                                        !window.confirm(
                                          `Buy this ad for ${ad.listing?.price.toLocaleString()} satoshis? ` +
                                            `${expirationLabel(collection.expiresAt)}. ` +
                                            "The seller's creative will disappear; the permanent mint creative returns until you publish your own update."
                                        )
                                      ) {
                                        return
                                      }
                                      void run(
                                        'Purchase',
                                        () =>
                                          buyAd(keys, {
                                            listingOutpoint: ad.outpoint,
                                            adOrigin: ad.origin,
                                            expiresAt: collection.expiresAt,
                                          }),
                                        (result) =>
                                          setAds((current) =>
                                            current.map((item) =>
                                              item.origin === ad.origin
                                                ? {
                                                    ...item,
                                                    outpoint: result.outpoint ?? `${result.txid}_0`,
                                                    owner: keys.ordAddress,
                                                    ownerEpoch: result.outpoint ?? `${result.txid}_0`,
                                                    listing: null,
                                                    updates: item.updates.map((update) => ({
                                                      ...update,
                                                      valid: false,
                                                    })),
                                                    liveText: item.mintText,
                                                    liveContentUrl: item.mintContentUrl,
                                                    liveUrl: item.mintUrl,
                                                    status: 'live',
                                                    marketEvents: [
                                                      ...item.marketEvents,
                                                      {
                                                        kind: 'purchased',
                                                        outpoint: result.outpoint ?? `${result.txid}_0`,
                                                        previousOwner: item.owner,
                                                        owner: keys.ordAddress,
                                                        price: item.listing?.price ?? null,
                                                        height: null,
                                                        idx: 0,
                                                      },
                                                    ],
                                                  }
                                                : item
                                            )
                                          )
                                      )
                                    }}
                                  >
                                    {busy ? 'Buying…' : 'Buy ad'}
                                  </button>
                                ) : (
                                  <span className="ads-badge ads-bad">
                                    {collection.expired ? 'Expired · purchase blocked' : 'Do not buy'}
                                  </span>
                                ))}
                            </span>
                          ) : mine && keys && activeSlot ? (
                            <span className="ads-market">
                              <input
                                className="ads-price"
                                inputMode="numeric"
                                placeholder="sats"
                                aria-label={`Sale price for ${ad.name}`}
                                value={saleDraft[ad.origin] ?? ''}
                                onChange={(event) =>
                                  setSaleDraft((drafts) => ({
                                    ...drafts,
                                    [ad.origin]: event.target.value.replace(/\D/g, ''),
                                  }))
                                }
                              />
                              <button
                                type="button"
                                className="ads-back"
                                disabled={
                                  busy ||
                                  !Number.isSafeInteger(Number(saleDraft[ad.origin])) ||
                                  !(Number(saleDraft[ad.origin]) > 0)
                                }
                                onClick={() => {
                                  const priceSatoshis = Number(saleDraft[ad.origin])
                                  void run(
                                    'List for sale',
                                    () =>
                                      listAdForSale(keys, {
                                        adOutpoint: ad.outpoint,
                                        priceSatoshis,
                                      }),
                                    (result) => {
                                      setAds((current) =>
                                        current.map((item) =>
                                          item.origin === ad.origin
                                            ? {
                                                ...item,
                                                outpoint: result.outpoint ?? `${result.txid}_0`,
                                                listing: {
                                                  price: priceSatoshis,
                                                  seller: keys.payAddress,
                                                },
                                                marketEvents: [
                                                  ...item.marketEvents,
                                                  {
                                                    kind: 'listed',
                                                    outpoint: result.outpoint ?? `${result.txid}_0`,
                                                    previousOwner: item.owner,
                                                    owner: item.owner,
                                                    price: priceSatoshis,
                                                    height: null,
                                                    idx: 0,
                                                  },
                                                ],
                                              }
                                            : item
                                        )
                                      )
                                      setSaleDraft((current) => ({ ...current, [ad.origin]: '' }))
                                    },
                                    false,
                                    {
                                      origin: ad.origin,
                                      successLabel: 'Listed for sale',
                                      placement: 'sale',
                                    }
                                  )
                                }}
                              >
                                {busy ? 'Listing…' : 'List for sale'}
                              </button>
                            </span>
                          ) : mine && !activeSlot ? (
                            <span className="ads-badge ads-bad">Not marketable</span>
                          ) : (
                            <span className="ads-mono">—</span>
                          )}
                          {recentAdActions[ad.origin]?.placement === 'sale' && (
                            <RecentAdActionLine action={recentAdActions[ad.origin]} />
                          )}
                        </div>
                        <div data-label="Activity" className="adlab-ad-cell adlab-ad-activity-cell">
                          <button
                            type="button"
                            className="ads-back adlab-activity-toggle"
                            onClick={() =>
                              setOpenHistory((open) => (open === ad.origin ? null : ad.origin))
                            }
                          >
                            {openHistory === ad.origin
                              ? 'Hide activity'
                              : `Show activity (${activityCount})`}
                          </button>
                        </div>
                      </div>

                      {openHistory === ad.origin && (
                            <div className="adlab-activity">
                              <div className="adlab-activity-heading">
                                <strong>Activity</strong>
                                <span>Oldest to newest</span>
                              </div>
                              <div className="adlab-activity-row">
                                <div data-label="Event"><span className="ads-badge">Minted</span></div>
                                <div data-label="Creative" className="adlab-activity-creative">
                                  <CreativePreview
                                    format={ad.format}
                                    text={ad.mintText}
                                    contentUrl={ad.mintContentUrl}
                                    url={ad.mintUrl}
                                    localImage={localImagePreviews[ad.mintContentUrl]}
                                  />
                                </div>
                                <div data-label="Status"><span className="ads-badge ads-ok">Original creative</span></div>
                                <div data-label="Date and time"><ActivityTime value={ad.mintedAt} height={ad.height} /></div>
                                <div data-label="Record"><Outpoint value={ad.origin} label="View ↗" /></div>
                                <div data-label="Action"><span className="adlab-activity-none">—</span></div>
                              </div>
                              {activityEntries(ad).map((entry) => {
                                if (entry.kind === 'market') {
                                  const event = entry.market
                                  const eventLabel =
                                    event.kind === 'listed'
                                      ? 'Listed'
                                      : event.kind === 'purchased'
                                        ? 'Purchased'
                                        : event.kind === 'delisted'
                                          ? 'Removed'
                                          : 'Transferred'
                                  const priceLabel =
                                    event.price === null
                                      ? 'No indexed sale price'
                                      : event.kind === 'purchased'
                                        ? `Sold for ${event.price.toLocaleString()} sats`
                                        : `${event.price.toLocaleString()} sats`
                                  const ownerLabel =
                                    event.kind === 'listed'
                                      ? `${shortAddress(event.owner)} listed it`
                                      : event.kind === 'delisted'
                                        ? `Returned to ${shortAddress(event.owner)}`
                                        : `${shortAddress(event.previousOwner)} → ${shortAddress(event.owner)}`
                                  return (
                                    <div
                                      className="adlab-activity-row adlab-activity-market"
                                      key={`market:${event.outpoint}`}
                                    >
                                      <div data-label="Event">
                                        <span
                                          className={`ads-badge ${
                                            event.kind === 'purchased'
                                              ? 'ads-ok'
                                              : event.kind === 'listed'
                                                ? 'ads-listed'
                                                : event.kind === 'delisted'
                                                  ? 'ads-bad'
                                                  : ''
                                          }`}
                                        >
                                          {eventLabel}
                                        </span>
                                      </div>
                                      <div data-label="Price" className="adlab-activity-creative">
                                        {priceLabel}
                                      </div>
                                      <div data-label="Ownership">
                                        <span className="ads-badge" title={`${event.previousOwner} → ${event.owner}`}>
                                          {ownerLabel}
                                        </span>
                                      </div>
                                      <div data-label="Date and time">
                                        <ActivityTime value="" height={event.height} />
                                      </div>
                                      <div data-label="Record">
                                        <Outpoint value={event.outpoint} label="View ↗" />
                                      </div>
                                      <div data-label="Action"><span className="adlab-activity-none">—</span></div>
                                    </div>
                                  )
                                }

                                const update = entry.update
                                if (entry.kind === 'decision') {
                                  return (
                                    <div
                                      className="adlab-activity-row adlab-activity-decision"
                                      key={`decision:${update.verdictOutpoint}`}
                                    >
                                      <div data-label="Event">
                                        <span className={`ads-badge ${update.verdict === 'approved' ? 'ads-ok' : 'ads-bad'}`}>
                                          {update.verdict === 'approved'
                                            ? 'Approved'
                                            : update.verdict === 'conflicted'
                                              ? 'Conflicting decisions'
                                              : 'Rejected'}
                                        </span>
                                      </div>
                                      <div data-label="Creative" className="adlab-activity-creative">
                                        <CreativePreview
                                          format={update.format}
                                          text={update.text}
                                          contentUrl={update.contentUrl}
                                          url={update.url}
                                          localImage={localImagePreviews[update.contentUrl]}
                                        />
                                      </div>
                                      <div data-label="Status">
                                        <span className={`ads-badge ${update.verdict === 'approved' ? 'ads-ok' : 'ads-bad'}`}>
                                          {update.verdict === 'approved'
                                            ? 'Published live'
                                            : update.verdict === 'conflicted'
                                              ? 'Quarantined'
                                              : 'Not published'}
                                        </span>
                                      </div>
                                      <div data-label="Date and time">
                                        <ActivityTime value={update.verdictAt ?? ''} height={update.verdictHeight ?? null} />
                                      </div>
                                      <div data-label="Record">
                                        <Outpoint value={update.verdictOutpoint ?? ''} label="View ↗" />
                                      </div>
                                      <div data-label="Action"><span className="adlab-activity-none">—</span></div>
                                    </div>
                                  )
                                }

                                const verificationUnavailable =
                                  !update.valid && isTransientUpdateProofError(update.invalidReason)
                                const ownershipPathIndexing =
                                  !update.valid &&
                                  update.invalidReason === 'update is not in the Adinal spend chain' &&
                                  (ad.indexPending || (ad.listing !== null && update.height === null))
                                const verificationPending =
                                  verificationUnavailable || ownershipPathIndexing

                                return (
                                  <div className="adlab-activity-row" key={`update:${update.outpoint}`}>
                                    <div data-label="Event"><span className="ads-badge">Updated</span></div>
                                    <div data-label="Creative" className="adlab-activity-creative">
                                      <CreativePreview
                                        format={update.format}
                                        text={update.text}
                                        contentUrl={update.contentUrl}
                                        url={update.url}
                                        localImage={localImagePreviews[update.contentUrl]}
                                      />
                                    </div>
                                    <div data-label="Status">
                                      <span
                                        className={`ads-badge ${verificationPending ? 'ads-pending' : update.valid ? 'ads-ok' : 'ads-bad'}`}
                                        title={`verified SIGMA address: ${update.signer || 'none'}`}
                                      >
                                        {verificationUnavailable
                                          ? 'Verification unavailable · retrying'
                                          : ownershipPathIndexing
                                            ? 'Ownership path indexing · refresh after next block'
                                          : !update.valid
                                          ? `Ignored · ${update.invalidReason || 'invalid update'}`
                                          : update.signer === collection.creator || collection.approval === 'open'
                                            ? 'Published automatically'
                                            : 'Owner SIGMA valid'}
                                      </span>
                                    </div>
                                    <div data-label="Date and time"><ActivityTime value={update.createdAt} height={update.height} /></div>
                                    <div data-label="Record"><Outpoint value={update.outpoint} label="View ↗" /></div>
                                    <div data-label="Action">
                                      {keys &&
                                      isCreator &&
                                      activeSlot &&
                                      collection.approval !== 'open' &&
                                      update.valid &&
                                      update.signer !== collection.creator &&
                                      !update.verdict ? (
                                        <span className="adlab-activity-actions">
                                          <button
                                            type="button"
                                            className="ads-back ads-approve"
                                            disabled={busy}
                                            onClick={() =>
                                              void run(
                                                'Approval',
                                                () => decideUpdate(keys, {
                                                  collectionId: collection.origin,
                                                  adOrigin: ad.origin,
                                                  updateOutpoint: update.outpoint,
                                                  adOutpoint: update.adOutpoint,
                                                  ownerEpoch: update.ownerEpoch,
                                                  verdict: 'approved',
                                                  reasonCode: 'approved',
                                                }),
                                                (result) => applyLocalDecision(ad.origin, update.outpoint, 'approved', result),
                                              )
                                            }
                                          >
                                            Approve
                                          </button>
                                          <button
                                            type="button"
                                            className="ads-back ads-reject"
                                            disabled={busy}
                                            onClick={() =>
                                              void run(
                                                'Rejection',
                                                () => decideUpdate(keys, {
                                                  collectionId: collection.origin,
                                                  adOrigin: ad.origin,
                                                  updateOutpoint: update.outpoint,
                                                  adOutpoint: update.adOutpoint,
                                                  ownerEpoch: update.ownerEpoch,
                                                  verdict: 'disapproved',
                                                  reasonCode: 'changes-needed',
                                                }),
                                                (result) => applyLocalDecision(ad.origin, update.outpoint, 'disapproved', result),
                                              )
                                            }
                                          >
                                            Reject
                                          </button>
                                        </span>
                                      ) : (
                                        <span className="adlab-activity-none">—</span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                      )}
                    </article>
                  )
                })}
          </div>
        </section>
      )}

        <p className="adlab-protocol-note">
          {ADINALS_NAMESPACE.environment === 'production' ? 'Production' : 'Development'} namespace <strong>{APP}</strong> · protocol version {ADINALS_PROTOCOL_VERSION} · records are permanent
        </p>

        <section className="adlab-explainer">
          <div>
            <span className="adlab-kicker">What is an Adinal?</span>
            <h2>An ownable live-content slot</h2>
            <p>
              A collection creates finite, transferable slots. Owners control their live creative
              directly or propose changes to the collection creator. Ads are the first use case:
              anyone can embed an eligible collection in a site, game, app, or agent.
            </p>
            <p>
              Useful for your own projects today; a cooperative-network experiment tomorrow.
              Whether independent publishers and owners form lasting networks remains to be seen.
            </p>
          </div>
          <div className="adlab-honest-boundary">
            <strong>You own control, not attention.</strong>
            <span>No one must display an Adinal. Ownership promises no traffic, review speed, resale, future value, or revenue.</span>
          </div>
          <dl className="adlab-core-rules" aria-label="Core collection rules">
            <div><dt>Open</dt><dd>Valid owner updates become live immediately.</dd></div>
            <div><dt>Reviewed</dt><dd>The creator decides; previous approved copy stays live.</dd></div>
            <div><dt>Sold</dt><dd>The buyer starts from the mint copy, never the seller&rsquo;s ad.</dd></div>
            <div><dt>Expired</dt><dd>Display eligibility ends; ownership and provenance remain.</dd></div>
          </dl>
          <ol className="adlab-verbs" aria-label="Adinals workflow">
            <li>Buy</li><li>Update</li><li>Embed</li><li>Sell</li><li>Approve</li>
          </ol>
        </section>

        {embedTarget && <EmbedDialog target={embedTarget} onClose={() => setEmbedTarget(null)} />}

        <footer className="adlab-legal">
          <div className="adlab-legal-intro">
            <div>
              <span className="adlab-kicker">Public protocol · public records</span>
              <strong>Own content control—not guaranteed attention.</strong>
            </div>
            <p>
              No collection or slot promises display, impressions, traffic, approval speed,
              resale, future value, revenue, or continued publisher support.
            </p>
          </div>

          <a
            className="adlab-footer-source"
            href={ADINALS_REPOSITORY}
            target="_blank"
            rel="noreferrer"
          >
            <span><strong>Open source</strong> under the MIT License</span>
            <span>View Adinals on GitHub ↗</span>
          </a>

          <div className="adlab-legal-links">
            <details id="protocol" className="adlab-legal-protocol">
              <summary>Protocol</summary>
              <div className="adlab-legal-copy">
                <span className="adlab-kicker">
                  {ADINALS_NAMESPACE.environment === 'production' ? 'Production' : 'Development'} namespace · version {ADINALS_PROTOCOL_VERSION} · BRC-100 wallet
                </span>
                <h2>How the Adinals protocol works</h2>
                <p>
                  Adinals uses public Bitcoin SV mainnet transactions, MAP metadata, ordinal
                  ownership, and standard SIGMA signatures. Every version 3 record uses the exact,
                  case-sensitive MAP identity <code>app: &quot;adinals&quot;</code>,
                  <code>type: &quot;ord&quot;</code>, and <code>protocolVersion: &quot;3&quot;</code>.
                  Independent readers can derive the same collection, ownership, update, and
                  eligibility state from the same public records and raw transactions.
                </p>

                <h3>BRC-100 wallet interoperability</h3>
                <p>
                  This application connects to a BRC-100 wallet for authentication, funding,
                  derived-key signatures, transaction construction, publication, and basket
                  custody. It prepares each write as a no-send action, verifies the returned raw
                  transaction and Atomic BEEF, and then asks the wallet to publish the exact
                  verified action. Private keys are never requested by or stored in Adinals.
                </p>
                <p>
                  BRC-100 is the wallet-to-application interface, not a new Adinals protocol
                  version and not an extra on-chain validity rule. Version 3 records remain valid
                  because of their transaction bytes, spend relationships, MAP fields, and
                  signatures. Another compatible writer can create the same valid records without
                  BRC-100. A BRC-100 wallet may derive different controller and signer keys for
                  different records, so readers establish ownership from the verified ordinal
                  spend chain and wallet custody rather than assuming one permanent wallet address.
                </p>

                <h3>Version 3 chain of custody at a glance</h3>
                <ul>
                  <li><strong>Collection:</strong> its valid SIGMA signer becomes the permanent creator and fixes the rules.</li>
                  <li><strong>Mint:</strong> the creator signs a numbered <code>collectionItem</code>; its origin remains the Adinal&rsquo;s permanent identity.</li>
                  <li><strong>Transfer or sale:</strong> spending the current one-satoshi output advances custody and a purchase starts a new owner epoch.</li>
                  <li><strong>Update:</strong> one transaction spends the exact current Adinal, returns it to the same controller at output 0, and commits the proposed creative at output 1.</li>
                  <li><strong>Review:</strong> when required, the creator signs a separate decision naming that exact transition, both outputs, and its owner epoch.</li>
                  <li><strong>Display:</strong> a reader reconstructs the chain and publishes only the newest eligible creative; a publisher still decides whether to display it.</li>
                </ul>

                <h3>1. A collection fixes the rules</h3>
                <p>
                  A creator signs a <code>collection</code> record defining a finite capacity,
                  creative format (<code>text</code> or <code>image</code>), update policy
                  (<code>open</code> or <code>creator</code>), optional
                  <code>family-friendly</code> content policy, optional display expiration, and
                  either a text limit or the <code>image-2x1-v1</code> profile. That image profile
                  accepts PNG, JPEG, or WebP up to 1 MB; 300 KB or less and 1024×512 are
                  recommendations, not validity requirements. Collection rules are permanent;
                  incompatible records are ignored rather than changing them.
                </p>

                <h3>2. The creator mints finite slots</h3>
                <p>
                  Each <code>collectionItem</code> record references the collection origin and one
                  numbered slot within its capacity. The item&rsquo;s origin outpoint is its permanent
                  identity. A valid mint must be signed by the collection creator and match the
                  collection&rsquo;s format. If multiple valid mints claim one slot, the earliest in
                  deterministic chain order wins.
                </p>

                <h3>3. The spend chain determines ownership</h3>
                <p>
                  Ownership follows the item&rsquo;s Bitcoin spend chain. A recognized marketplace-lock
                  output represents a listing rather than an ownership transfer, so the seller
                  remains the logical owner until purchase. Delisting, purchasing, or transferring
                  spends the current output without changing the permanent origin. A buyer receives
                  control of the slot while its provenance remains publicly derivable.
                </p>

                <h3>4. Owner updates advance the Adinal</h3>
                <p>
                  A version 3 update spends the exact live Adinal as input 0, returns its one
                  satoshi to the same owner at output 0, and writes the complete
                  <code>adUpdate</code> at output 1. The owner&rsquo;s input signature commits all inputs
                  and outputs. The update names its predecessor and ownership epoch; readers also
                  prove both outputs are in the Adinal&rsquo;s spend chain. This binds authority,
                  ordering, creative bytes, and destination URL in one Bitcoin transition.
                </p>

                <h3>5. Open and reviewed collections resolve differently</h3>
                <p>
                  In an open collection, the newest valid current-owner update in deterministic
                  chain order can become live directly. In a creator-reviewed collection, the
                  creator&rsquo;s own valid update is self-approved; any other owner&rsquo;s update needs an
                  <code>adDecision</code> signed by the creator and tied to the transition txid,
                  successor Adinal output, sibling update output, and ownership epoch. An
                  <code>approved</code> decision publishes that proposal; a
                  <code>disapproved</code> decision leaves the previous approved creative live.
                  After a sale, resolution begins again from the creator&rsquo;s mint creative until the
                  new owner publishes an eligible update. Conflicting creator verdicts for the
                  same transition are quarantined rather than resolved by indexer ordering.
                </p>

                <h3>6. Readers determine display eligibility</h3>
                <p>
                  A reader verifies the namespace, protocol version, record references,
                  signatures, the raw input-0 spend, output positions, complete signature scope,
                  current ownership epoch, collection rules, duplicate slots, expiration, and
                  creative validity before returning live content. Signed client timestamps
                  must be valid UTC ISO timestamps, but transaction order—not those timestamps—sets
                  precedence. Expiration ends display eligibility without ending ownership.
                  Eligibility means a record passes protocol and collection rules; publishers still
                  decide whether, where, and how to display it.
                </p>

                <h3>What is trusted—and what is not</h3>
                <p>
                  Bitcoin transaction validity and the ordinal spend chain establish custody,
                  authorization, and ordering. The owner&rsquo;s input signature is the security root for
                  an update; SIGMA attributes records to the owner or immutable collection creator.
                  The current reference reader uses GorillaPool to discover records and spend history
                  and to report cryptographically valid SIGMA signers, then obtains raw transaction
                  bytes and independently verifies the spend-linked update envelope in the browser.
                  WhatsOnChain and GorillaPool are therefore availability and discovery dependencies;
                  an indexer-provided owner label, database row, client timestamp, publisher, or
                  application server cannot replace the required transaction and signature evidence.
                </p>

                <h3>Expiration and existing listings</h3>
                <p>
                  At expiration, version 3 readers stop displaying the collection and the reference
                  wallet refuses new updates, listings, purchases, and approvals. The ordinal and its
                  provenance continue to exist. The current OrdLock sale covenant does not contain the
                  collection expiration, so a custom client can still spend an already-existing listing
                  and pay its seller after expiration. That spend can change Bitcoin custody, but it does
                  not restore display eligibility. Covenant-enforced marketplace expiry requires a later
                  listing contract version; existing sellers may still delist through this interface.
                </p>

                <p>
                  Version 3 recognizes the exact record subtypes <code>collection</code>,
                  <code>collectionItem</code>, <code>adUpdate</code>, and <code>adDecision</code>.
                  Records from another namespace, protocol version, or subtype do not participate
                  in version 3 resolution. Version 2 records remain historical and are not
                  silently reinterpreted under these rules.
                </p>

                <h3>Record metadata by subtype</h3>
                <ul>
                  <li>
                    <code>collection</code> declares <code>subTypeData</code> with description and
                    quantity, plus <code>adMax</code>, <code>adApproval</code>,
                    <code>adFormat</code>, optional <code>adContentPolicy</code>, optional
                    <code>adPlacement</code>, optional <code>expiresAt</code>, and
                    <code>createdAt</code>. Text collections declare <code>adMaxChars</code>;
                    image collections declare <code>adImageProfile</code>.
                  </li>
                  <li>
                    <code>collectionItem</code> declares its <code>collectionId</code> and
                    <code>mintNumber</code> inside <code>subTypeData</code>, plus
                    <code>adFormat</code>, optional <code>adUrl</code>, and <code>mintedAt</code>.
                    Text mints carry <code>adText</code> and <code>adMaxChars</code>; image mints
                    carry the image bytes in the inscription.
                  </li>
                  <li>
                    <code>adUpdate</code> declares <code>collectionId</code>, <code>adOrigin</code>,
                    exact predecessor <code>adOutpoint</code>, <code>ownerEpoch</code>,
                    <code>transition: &quot;spend-linked-self-v1&quot;</code>, <code>adFormat</code>, optional
                    <code>adUrl</code>, and <code>updatedAt</code>. It carries either
                    <code>adText</code> or inscribed image bytes.
                  </li>
                  <li>
                    <code>adDecision</code> declares <code>collectionId</code>,
                    <code>adOrigin</code>, the exact <code>updateOutpoint</code>,
                    its matching compatibility alias <code>revisionOutpoint</code>,
                    successor <code>adOutpoint</code>, <code>ownerEpoch</code>, and
                    <code>transitionTxid</code>, plus
                    <code>decision</code>, <code>reasonCode</code>, and <code>decidedAt</code>.
                  </li>
                </ul>
                <p>
                  MAP values are encoded as strings; <code>subTypeData</code> is a JSON string,
                  numeric fields use decimal strings, and timestamps use canonical UTC ISO form.
                  The human-readable <code>name</code> is required but does not confer authority.
                </p>

                <h3>Permissions come from signatures and ownership</h3>
                <ul>
                  <li>Anyone with a signing key may create a collection; its verified signer becomes its permanent creator.</li>
                  <li>Only that creator may mint its finite slots or issue valid review decisions.</li>
                  <li>Only the current slot owner may authorize a spend-linked update. Ordinary transfers require its Bitcoin signature; recognized listing covenants separately define valid delisting and purchase spends.</li>
                  <li>No participant may change a collection&rsquo;s capacity, format, approval mode, content policy, or expiration after creation.</li>
                  <li>Anyone may read or embed eligible output without wallet permission. Publishers retain final display control; a site&rsquo;s featured-collection list is interface curation, not protocol authority.</li>
                </ul>

                <h3>Embedding text and images</h3>
                <p>
                  The public endpoints <code>/adinals/v1/collections/&#123;origin&#125;/live</code> and
                  <code>/adinals/v1/ads/&#123;origin&#125;</code> accept immutable origins and return
                  derived JSON only after protocol validation. Consumers must check
                  <code>displayEligible</code>. A text creative exposes
                  <code>creative.kind: &quot;text&quot;</code> and <code>creative.text</code>; an image
                  creative exposes <code>creative.kind: &quot;image&quot;</code>,
                  <code>creative.contentUrl</code>, and <code>creative.profile</code>. Both expose
                  an optional <code>destinationUrl</code> and the creative&rsquo;s
                  <code>sourceOutpoint</code>. Collection responses return the same creative shape
                  inside each entry of <code>ads</code>.
                </p>
                <p>
                  Embedders should render text as text rather than HTML, load images from the
                  returned content URL, treat destination links as untrusted external links, and
                  keep a local fallback or last valid response for temporary reader or indexer
                  outages. The provided web component handles both creative formats; JSON consumers
                  choose their own layout, refresh schedule, and fallback behavior.
                </p>

                <h3>Public and permanent by design</h3>
                <p>
                  Origins, updates, decisions, transfers, timestamps, addresses, and inscribed
                  creative bytes may remain public indefinitely. Indexers and interfaces can fail
                  or disagree temporarily, but they do not gain authority to rewrite valid public
                  records.
                </p>
              </div>
            </details>

            <details id="terms">
              <summary>Terms of Service</summary>
              <div className="adlab-legal-copy">
                <span className="adlab-kicker">Beta draft · last updated July 27, 2026</span>
                <h2>Adinals Terms of Service</h2>
                <p>
                  By using this beta, you agree to these terms. Do not use it unless you are
                  legally able to enter this agreement and to use BSV where you live.
                </p>

                <h3>What the service provides</h3>
                <p>
                  Adinals is a frontend interface for creating, signing, reading, updating,
                  reviewing, transferring, and embedding public live-content records on BSV.
                  The interface helps construct transactions; the blockchain and independent
                  indexers operate outside Adinals&rsquo; control.
                </p>
                <p>
                  This beta is an experiment. It can be used as a personal or internally operated
                  live-content tool, but internal use does not make blockchain records private.
                  No cooperative network, outside publisher adoption, marketplace activity, or
                  continuing ecosystem is promised.
                </p>

                <h3>No promise of attention or value</h3>
                <p>
                  A slot represents protocol-recognized control of eligible content under its
                  collection rules. It does not guarantee that Adinals or any other publisher
                  will display it. There is no promise of impressions, clicks, audience,
                  approval time, liquidity, resale, price appreciation, income, or profit. Do
                  not spend more than you are willing to lose.
                </p>

                <h3>Collection and publisher control</h3>
                <p>
                  Collection rules, creator authority, capacity, review mode, content standard,
                  and expiration may be permanent once broadcast. Creators may approve or reject
                  proposals where review is required. Publishers independently choose whether,
                  where, and how to display a collection and may stop at any time.
                </p>

                <h3>Your content and conduct</h3>
                <p>
                  You are responsible for every record you sign. You must have the rights needed
                  to publish your content and must not submit unlawful, deceptive, infringing,
                  abusive, exploitative, malicious, or privacy-invasive material. Owning a slot
                  does not grant ownership of another person&rsquo;s copyright, trademark, identity,
                  endorsement, product, or brand. Advertising claims and sponsorship disclosures
                  remain the advertiser&rsquo;s and publisher&rsquo;s responsibility.
                </p>

                <h3>Public and irreversible transactions</h3>
                <p>
                  BSV mainnet transactions use real funds and generally cannot be reversed by
                  Adinals. Content, addresses, signatures, decisions, rejected proposals,
                  transaction history, and timestamps may remain publicly available indefinitely.
                  Never publish secrets, private keys, sensitive personal information, or content
                  that may need to be erased.
                </p>

                <h3>Wallet responsibility</h3>
                <p>
                  The connected BRC-100 wallet is self-custodial. You are solely responsible for
                  that wallet&rsquo;s recovery material, security, transaction fees, collection rules,
                  purchases, sales, and applicable taxes. Adinals cannot recover wallet access.
                  Review every amount and rule before authorizing it in your wallet.
                </p>

                <h3>Beta availability and risk</h3>
                <p>
                  The beta is provided as available and may contain defects, stale index data,
                  failed broadcasts, incompatible records, or interrupted third-party services.
                  To the maximum extent permitted by applicable law, no warranty is made and
                  Adinals is not liable for lost keys, funds, data, opportunities, content,
                  profits, or indirect damages arising from use of the beta. Nothing here is
                  financial, investment, legal, or tax advice.
                </p>
              </div>
            </details>

            <details id="privacy">
              <summary>Privacy</summary>
              <div className="adlab-legal-copy">
                <span className="adlab-kicker">Frontend-only beta · last updated July 27, 2026</span>
                <h2>Privacy and public-chain notice</h2>

                <h3>No Adinals account database</h3>
                <p>
                  The current beta is a frontend-only application. It does not create an Adinals
                  account or send private keys to an Adinals application server. Private keys,
                  funding, derived-key signing, and wallet recovery remain under the connected
                  BRC-100 wallet&rsquo;s control. This page receives only the public results and proof
                  material needed to verify authorized actions.
                </p>

                <h3>Everything submitted on-chain is public</h3>
                <p>
                  Collection records, creative text or media, wallet addresses, signatures,
                  ownership history, updates, approvals, rejections, prices, and timestamps are
                  public blockchain data—not private messages. Public addresses are pseudonymous,
                  not guaranteed anonymous. Once broadcast, Adinals cannot delete, conceal, or
                  correct the original transaction. Do not place personal or confidential data
                  on-chain.
                </p>

                <h3>Direct third-party requests</h3>
                <p>
                  Your browser communicates directly with GorillaPool for ordinal indexing and
                  with WhatsOnChain for transaction status and immutable transaction data.
                  Transaction publication is requested through the connected BRC-100 wallet.
                  Opening marketplace or explorer links contacts 1Sat Market or WhatsOnChain.
                  The website host and those independent services may receive ordinary network
                  information such as your IP address, browser headers, requested URLs, and
                  timing, subject to their own policies. Adinals does not control their retention
                  or use of that information.
                </p>

                <h3>Local application state and future changes</h3>
                <p>
                  The beta may retain identity-scoped transaction recovery and publication status
                  in browser storage, but it does not store wallet keys. Clearing site data removes
                  that local application state but does not remove wallet custody or public
                  blockchain records. This page does not intentionally add behavioral advertising
                  trackers. If hosted APIs, accounts, analytics, support forms, or other data
                  collection are added later, this notice must be updated before they launch.
                </p>
              </div>
            </details>
          </div>

          <p className="adlab-legal-review-note">
            Beta disclosure draft. Add the production operator identity, contact method,
            governing law, and jurisdiction-specific legal review before launch.
          </p>
        </footer>
      </div>
    </main>
  )
}

export default AdLab

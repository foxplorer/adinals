import { useEffect, useMemo, useState } from 'react'
import type { AdinalsNoSendAction } from '../actions/lifecycle.ts'
import {
  publishLifecycleAction,
  readLifecyclePublicationPreflight,
  validateLifecyclePublicationReadiness,
  type LifecyclePublicationPreflight,
} from '../actions/publishLifecycle.ts'
import { reconcileLifecyclePublication } from '../actions/lifecyclePublicationReconciliation.ts'
import { LIFECYCLE_PUBLISH_ENABLED } from '../config/environment.ts'
import {
  loadLifecyclePublicationAttempts,
  saveLifecyclePublicationAttempt,
  type LifecyclePublicationAttempt,
} from '../fixtures/lifecyclePublicationStore.ts'
import { loadCollectionPublicationAttempt } from '../fixtures/publicationStore.ts'
import { submitTransactionToGorillaPool } from '../readers/gorillaPoolSubmission.ts'
import { useWallet } from '../wallet/WalletContext.tsx'

const normalized = (value?: string): string => (value ?? '').replace('.', '_').toLowerCase()

export function LifecyclePublicationPanel({
  actions,
  collectionOutpoint,
  retainedMintTxid,
}: {
  actions: AdinalsNoSendAction[]
  collectionOutpoint?: string
  retainedMintTxid: string
}) {
  const { wallet, session } = useWallet()
  const [attempts, setAttempts] = useState<LifecyclePublicationAttempt[]>([])
  const [collectionAccepted, setCollectionAccepted] = useState(false)
  const [preflight, setPreflight] = useState<LifecyclePublicationPreflight | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setAttempts([])
    setCollectionAccepted(false)
    setPreflight(null)
    if (!session || !collectionOutpoint) return
    void Promise.all([
      loadLifecyclePublicationAttempts(session.identityKey),
      loadCollectionPublicationAttempt(session.identityKey, collectionOutpoint),
    ]).then(([stored, collectionAttempt]) => {
      setAttempts(stored)
      setCollectionAccepted(collectionAttempt?.outcome === 'accepted')
    }).catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)))
  }, [session?.identityKey, collectionOutpoint])

  const selection = useMemo(() => {
    // One exact action is handled at a time. A retained mint wins over older
    // duplicate rehearsals; every later transition follows creation order.
    const publishable = actions.filter((action) =>
      action.kind !== 'mint' || !retainedMintTxid || action.txid === retainedMintTxid)
    const openAttempt = [...attempts].reverse().find((attempt) => attempt.outcome !== 'accepted')
    if (openAttempt) {
      return {
        action: publishable.find((item) => item.outpoint === openAttempt.outpoint) ?? null,
        attempt: openAttempt,
        parentReady: true,
      }
    }
    const next = publishable.find((action) =>
      !attempts.some((attempt) => attempt.outpoint === action.outpoint)) ?? null
    if (next) {
      const needsPublishedCollection = next.kind === 'mint' || next.kind === 'decision'
      return {
        action: next,
        attempt: null,
        parentReady: needsPublishedCollection ? collectionAccepted : true,
      }
    }
    const latest = publishable.at(-1) ?? null
    return {
      action: latest,
      attempt: latest
        ? attempts.find((attempt) => attempt.outpoint === latest.outpoint) ?? null
        : null,
      parentReady: true,
    }
  }, [actions, attempts, collectionAccepted, retainedMintTxid])

  const replaceAttempt = (attempt: LifecyclePublicationAttempt) => {
    setAttempts((current) => [...current.filter((item) => item.outpoint !== attempt.outpoint), attempt])
  }

  const check = async () => {
    if (!wallet || !selection.action || selection.attempt) return
    setWorking('check')
    setError('')
    try {
      const result = await readLifecyclePublicationPreflight(wallet, selection.action)
      validateLifecyclePublicationReadiness(selection.action, result)
      setPreflight(result)
    } catch (failure) {
      setPreflight(null)
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking('')
    }
  }

  const publish = async () => {
    const action = selection.action
    if (!wallet || !session || !action || !preflight || selection.attempt || !selection.parentReady) return
    setWorking('publish')
    setError('')
    try {
      validateLifecyclePublicationReadiness(action, preflight)
      const now = new Date().toISOString()
      const started: LifecyclePublicationAttempt = {
        format: 'adinals-brc100-lifecycle-publication-v1', outpoint: action.outpoint,
        ...(action.stateOutpoint && { stateOutpoint: action.stateOutpoint }),
        identityKey: session.identityKey, kind: action.kind, primaryTxid: action.txid,
        txids: preflight.txids, startedAt: now, updatedAt: now, outcome: 'submitting',
        message: 'The exact wallet publication request has started. Do not retry it.',
        sendWithResults: [], reviewActionResults: [], indexerOutcome: 'not-submitted',
      }
      await saveLifecyclePublicationAttempt(started)
      replaceAttempt(started)
      const result = await publishLifecycleAction(wallet, action, preflight)
      let completed: LifecyclePublicationAttempt = {
        ...started, updatedAt: new Date().toISOString(), outcome: result.outcome,
        message: result.message, sendWithResults: result.sendWithResults,
        reviewActionResults: result.reviewActionResults,
        ...(result.overlaySubmission && { overlayStatus: result.overlaySubmission.status }),
      }
      await saveLifecyclePublicationAttempt(completed)
      replaceAttempt(completed)
      setPreflight(null)
      if (result.outcome === 'accepted') {
        const indexed = await submitTransactionToGorillaPool(action.txid)
        completed = { ...completed, updatedAt: new Date().toISOString(), indexerOutcome: indexed ? 'submitted' : 'not-indexed' }
        await saveLifecyclePublicationAttempt(completed)
        replaceAttempt(completed)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking('')
    }
  }

  const reconcile = async () => {
    if (!wallet || !selection.attempt) return
    setWorking('reconcile')
    setError('')
    try {
      const result = await reconcileLifecyclePublication(wallet, selection.attempt)
      let updated: LifecyclePublicationAttempt = {
        ...selection.attempt, updatedAt: result.checkedAt, outcome: result.outcome,
        message: result.message, indexerOutcome: result.indexerOutcome,
      }
      if (result.outcome === 'accepted' && result.indexerOutcome !== 'indexed') {
        const indexed = await submitTransactionToGorillaPool(updated.primaryTxid)
        updated = { ...updated, updatedAt: new Date().toISOString(), indexerOutcome: indexed ? 'submitted' : 'not-indexed' }
      }
      await saveLifecyclePublicationAttempt(updated)
      replaceAttempt(updated)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking('')
    }
  }

  if (!selection.action && !selection.attempt) return null
  const action = selection.action
  const phrase = action ? `PUBLISH ${action.txid.slice(0, 8)}` : ''
  return (
    <section className="collection-result lifecycle-result">
      <span className="phase-badge">Lifecycle publication · controlled canary</span>
      <h3>{action ? `Publish ${action.kind}` : 'Lifecycle publication attempt'}</h3>
      {action && <p><code>{action.txid}</code></p>}
      {!selection.parentReady && <p>Locked until the exact parent publication is accepted and persisted.</p>}
      {selection.attempt ? (
        <>
          <strong>Publication state: {selection.attempt.outcome}</strong>
          <p>{selection.attempt.message}</p>
          <p>Indexer: {selection.attempt.indexerOutcome}</p>
          {selection.attempt.overlayStatus && <p>Overlay: {selection.attempt.overlayStatus}</p>}
          <button type="button" className="ads-back" disabled={Boolean(working)} onClick={() => void reconcile()}>
            {working === 'reconcile' ? 'Reconciling exact txids…' : 'Reconcile wallet + public network'}
          </button>
        </>
      ) : (
        <>
          {!LIFECYCLE_PUBLISH_ENABLED && <p>Disabled in this build with <code>VITE_ENABLE_LIFECYCLE_PUBLISH=false</code>.</p>}
          <button type="button" className="ads-back" disabled={!wallet || !selection.parentReady || Boolean(working)} onClick={() => void check()}>
            {working === 'check' ? 'Checking exact batch…' : 'Check lifecycle publish readiness'}
          </button>
          {preflight && <>
            <p>Exact batch is still no-send and absent from configured public readers.</p>
            <label><input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} /> I understand this broadcasts irreversible mainnet transactions.</label>
            <label><span>Type <code>{phrase}</code></span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
            <button type="button" className="ads-back adlab-primary" disabled={!LIFECYCLE_PUBLISH_ENABLED || !understood || confirmation !== phrase || Boolean(working)} onClick={() => void publish()}>
              {working === 'publish' ? 'Submitting exact batch…' : 'Publish exact lifecycle batch'}
            </button>
          </>}
        </>
      )}
      {error && <div className="wallet-inline-error">{error}</div>}
    </section>
  )
}

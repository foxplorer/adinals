import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AdinalsActionError,
  createAdinalsCollection,
  type AdinalsCollectionRehearsal,
} from '../actions/index.ts'
import {
  recoverNoSendCollection,
  type CollectionRecoveryAudit,
} from '../actions/recovery.ts'
import {
  publishRecoveredCollection,
  validatePublicationReadiness,
} from '../actions/publishCollection.ts'
import { reconcileCollectionPublication } from '../actions/publicationReconciliation.ts'
import { ADINALS_NAMESPACE, COLLECTION_PUBLISH_ENABLED } from '../config/environment'
import { downloadCollectionFixture } from '../fixtures/collectionFixture.ts'
import {
  forgetCollectionRehearsal,
  listCollectionRehearsals,
  loadLatestCollectionRehearsal,
  saveCollectionRehearsal,
  type RetainedCollectionRehearsal,
} from '../fixtures/rehearsalStore.ts'
import { releaseCollectionRehearsal } from '../actions/releaseCollectionRehearsal.ts'
import {
  reviewNoSendActions,
  type NoSendActionSummary,
} from '../wallet/noSendMaintenance.ts'
import {
  repairOverlayFromBaskets,
  type BasketRepairResult,
} from '../overlay/basketRepairClient.ts'
import {
  readSigningConformance,
  summarizeSigningConformance,
  type SigningConformance,
} from '../wallet/signingConformance.ts'
import {
  loadCollectionPublicationAttempt,
  saveCollectionPublicationAttempt,
  type CollectionPublicationAttempt,
} from '../fixtures/publicationStore.ts'
import { COLLECTION_VERIFIER_REVISION } from '../protocol/collectionScript.ts'
import {
  readCollectionNetworkPreflight,
  type CollectionNetworkPreflight,
  type ReaderStatus,
} from '../readers/networkStatus.ts'
import { submitTransactionToGorillaPool } from '../readers/gorillaPoolSubmission.ts'
import { useWallet } from '../wallet/WalletContext'
import './Adinals.css'
import { LifecycleWorkspace } from './LifecycleWorkspace.tsx'
import { OwnershipPanel } from './OwnershipPanel.tsx'
import { ApprovalsView, CollectionsView, MyAdsView } from './AdinalsViews.tsx'
import { useOwnership, type OwnershipState } from './useOwnership.ts'

type Tab = 'approvals' | 'ads' | 'collections'

const FIRST_METANET_COLLECTION_OUTPOINT =
  '8f561d9ae486ca6d4d82bbec64a77fed8a6a73fb6c099151f35de9335f4a0dec_0'

const shortKey = (value: string): string =>
  value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value

const readerLabel = (status: ReaderStatus): string =>
  `${status.presence === 'present' ? 'Found' : status.presence === 'absent' ? 'Absent' : 'Unavailable'} — ${status.detail}`

function WalletPanel() {
  const { status, session, error, refreshing, connect, disconnect, refresh } = useWallet()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const connected = status === 'connected' && session

  return (
    <section className="adlab-panel adlab-wallet adlab-wallet-compact" aria-label="BRC-100 wallet">
      {connected ? (
        <>
          <div className="adlab-wallet-main">
            <div className="adlab-wallet-status" aria-hidden="true">●</div>
            <div>
              <span className="adlab-kicker">BRC-100 wallet</span>
              <strong>Wallet connected</strong>
              <p>
                {session.network} · block{' '}
                {session.height === null
                  ? 'height unavailable from this wallet'
                  : session.height.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="adlab-wallet-actions">
            <button className="ads-back" type="button" onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <button
            type="button"
            className="ads-back adlab-wallet-details-toggle"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            {detailsOpen ? 'Hide wallet details ↑' : 'Show wallet details ↓'}
          </button>
          <div className={`adlab-wallet-details${detailsOpen ? ' adlab-wallet-details-open' : ''}`}>
            <div className="adlab-wallet-details-content">
              <span>Identity key</span>
              <code title={session.identityKey}>{session.identityKey}</code>
              <span>Wallet version</span>
              <code>{session.version}</code>
              <span>Application namespace</span>
              <code>{ADINALS_NAMESPACE.app}</code>
              <span>Tracked ordinal basket</span>
              <code>{session.basket ?? 'No basket permission'}</code>
              <span>Outputs in selected basket</span>
              <code>{session.ordinalCount === null ? 'Unavailable' : session.ordinalCount.toLocaleString()}</code>
              <p>
                Adinals does not receive or store your private keys. Disconnecting here only forgets this page session;
                authorization remains controlled by your wallet.
              </p>
              <button className="ads-back ads-reject" type="button" onClick={disconnect}>
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
            <p>BSV Desktop, Metanet-compatible, or another WalletInterface provider.</p>
          </div>
          <button
            type="button"
            className="ads-back adlab-primary"
            disabled={status === 'connecting'}
            onClick={() => void connect()}
          >
            {status === 'connecting' ? 'Looking for wallet…' : status === 'error' ? 'Try again' : 'Connect wallet'}
          </button>
        </div>
      )}
      {error && <div className="wallet-inline-error" role="alert">{error}</div>}
    </section>
  )
}

function CollectionWorkspace() {
  const { wallet, session } = useWallet()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [maxSupply, setMaxSupply] = useState(3)
  const [approval, setApproval] = useState<'creator' | 'open'>('creator')
  const [format, setFormat] = useState<'text' | 'image'>('text')
  const [maxChars, setMaxChars] = useState(280)
  const [placement, setPlacement] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [familyFriendly, setFamilyFriendly] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AdinalsCollectionRehearsal | null>(null)
  const [resultOrigin, setResultOrigin] = useState<'live' | 'browser-snapshot' | 'wallet-recovery'>('live')
  const [snapshotMessage, setSnapshotMessage] = useState('')
  const [recoveryOutpoint, setRecoveryOutpoint] = useState(FIRST_METANET_COLLECTION_OUTPOINT)
  const [recovering, setRecovering] = useState(false)
  const [recoveryAudit, setRecoveryAudit] = useState<CollectionRecoveryAudit | null>(null)
  const [checkingNetwork, setCheckingNetwork] = useState(false)
  const [networkAudit, setNetworkAudit] = useState<CollectionNetworkPreflight | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publicationConfirmation, setPublicationConfirmation] = useState('')
  const [publicationUnderstood, setPublicationUnderstood] = useState(false)
  const [publicationAttempt, setPublicationAttempt] = useState<CollectionPublicationAttempt | null>(null)
  const [reconcilingPublication, setReconcilingPublication] = useState(false)
  const [retainedRehearsals, setRetainedRehearsals] = useState<RetainedCollectionRehearsal[]>([])
  const [rehearsalOutcomes, setRehearsalOutcomes] = useState<Record<string, string>>({})
  const [releasing, setReleasing] = useState('')
  const [releaseNote, setReleaseNote] = useState('')
  const [noSendSummary, setNoSendSummary] = useState<NoSendActionSummary | null>(null)
  const [noSendBusy, setNoSendBusy] = useState(false)
  const [noSendNote, setNoSendNote] = useState('')
  const [noSendUnderstood, setNoSendUnderstood] = useState(false)
  const [basketRepair, setBasketRepair] = useState<BasketRepairResult | null>(null)
  const [basketRepairBusy, setBasketRepairBusy] = useState(false)
  const [basketRepairNote, setBasketRepairNote] = useState('')
  const [signing, setSigning] = useState<SigningConformance | null>(null)
  const [signingBusy, setSigningBusy] = useState(false)
  const [signingNote, setSigningNote] = useState('')

  /**
   * Asks the wallet to sign a throwaway hash with a derived key and checks the
   * result against the public key it reports. A spend that fails at
   * `OP_CHECKSIG` cannot distinguish a wrong message from a wrong key; this can.
   */
  const checkSigning = async () => {
    if (!wallet) return
    setSigningBusy(true)
    setSigningNote('')
    try {
      const result = await readSigningConformance(
        wallet,
        [1, ADINALS_NAMESPACE.keyProtocol],
        'signing-conformance-probe',
      )
      setSigning(result)
      setSigningNote(summarizeSigningConformance(result))
    } catch (signingError) {
      setSigning(null)
      setSigningNote(signingError instanceof Error ? signingError.message : String(signingError))
    } finally {
      setSigningBusy(false)
    }
  }

  /**
   * Wallet-side review of every no-send action, including rehearsals whose
   * abort reference this application never retained. Releasing is not scoped to
   * Adinals and cannot be undone.
   */
  const reviewNoSend = async (abort: boolean) => {
    if (!wallet) return
    setNoSendBusy(true)
    setNoSendNote('')
    try {
      const summary = await reviewNoSendActions(wallet, { abort })
      setNoSendSummary(summary)
      setNoSendNote(abort
        ? `Requested release of ${summary.totalActions} no-send action(s).`
        : `${summary.totalActions} no-send action(s) currently reserve wallet funding.`)
      if (abort) {
        setNoSendUnderstood(false)
        await refreshRetainedRehearsals()
      }
    } catch (noSendError) {
      setNoSendSummary(null)
      setNoSendNote(
        `${noSendError instanceof Error ? noSendError.message : String(noSendError)} — this wallet may not implement the reserved maintenance label.`,
      )
    } finally {
      setNoSendBusy(false)
    }
  }

  /**
   * Offers the Adinals this wallet holds to the overlay.
   *
   * Inspecting asks the node which of them it already has; submitting sends the
   * wallet's own BEEF for the ones it does not. Nothing here creates, signs, or
   * broadcasts a transaction: every record involved is already on chain, and the
   * only new thing is that this node learns about it.
   */
  const runBasketRepair = async (submit: boolean) => {
    if (!wallet) return
    setBasketRepairBusy(true)
    setBasketRepairNote('')
    try {
      const summary = await repairOverlayFromBaskets(wallet, { submit })
      setBasketRepair(summary)
      // Both notes describe the state the run left behind, so a second click is
      // never invited for work that already succeeded.
      setBasketRepairNote(submit
        ? `Submitted ${summary.submitted} transaction(s); ${summary.failures.length} refused. `
          + `${summary.present} of ${summary.outputs} now held, ${summary.incomplete} still missing history.`
        : `${summary.outputs} basket output(s): ${summary.present} already held, ${summary.submittable} submittable, ${summary.incomplete} missing history.`)
    } catch (repairError) {
      setBasketRepair(null)
      setBasketRepairNote(repairError instanceof Error ? repairError.message : String(repairError))
    } finally {
      setBasketRepairBusy(false)
    }
  }

  const refreshRetainedRehearsals = useCallback(async () => {
    if (!session) return
    const rows = await listCollectionRehearsals(session.identityKey)
    setRetainedRehearsals(rows)
    // A published rehearsal reserves nothing: its wallet action was sent, not
    // abandoned. Listing it as reserved funding would misreport the wallet.
    const outcomes = await Promise.all(rows.map(async (row) => [
      row.result.outpoint,
      (await loadCollectionPublicationAttempt(session.identityKey, row.result.outpoint))?.outcome ?? '',
    ] as const))
    setRehearsalOutcomes(Object.fromEntries(outcomes))
  }, [session])

  /** Drops a retained record whose wallet action is already gone. */
  const forgetRehearsal = async (outpoint: string) => {
    setReleasing(outpoint)
    try {
      await forgetCollectionRehearsal(outpoint)
      setReleaseNote('Retained record dropped. The wallet was not asked to do anything.')
      await refreshRetainedRehearsals()
    } finally {
      setReleasing('')
    }
  }

  useEffect(() => {
    void refreshRetainedRehearsals()
  }, [refreshRetainedRehearsals])

  /**
   * Releases the wallet inputs a rehearsal reserved. A no-send action keeps its
   * funding UTXO and its no-send change unspendable until it is aborted, so an
   * abandoned rehearsal can lock far more than its own anchor reserve.
   */
  const releaseRehearsal = async (rehearsal: AdinalsCollectionRehearsal) => {
    if (!wallet) return
    setReleasing(rehearsal.outpoint)
    setReleaseNote('')
    try {
      const released = await releaseCollectionRehearsal(wallet, rehearsal)
      if (released.childAborted) await forgetCollectionRehearsal(rehearsal.outpoint)
      setReleaseNote(released.notes.join(', ') || 'The wallet reported nothing to release.')
      await refreshRetainedRehearsals()
    } catch (releaseError) {
      setReleaseNote(releaseError instanceof Error ? releaseError.message : String(releaseError))
    } finally {
      setReleasing('')
    }
  }

  useEffect(() => {
    if (!session) return
    let active = true
    void loadLatestCollectionRehearsal(session.identityKey)
      .then((saved) => {
        if (!active || !saved || saved.map.app !== ADINALS_NAMESPACE.app) return
        void loadCollectionPublicationAttempt(session.identityKey, saved.outpoint)
          .then((attempt) => {
            if (active) setPublicationAttempt(attempt)
          })
          .catch(() => undefined)
        setResult((current) => {
          if (current) return current
          setRecoveryOutpoint(saved.outpoint)
          setRecoveryAudit(null)
          setNetworkAudit(null)
          setPublicationAttempt(null)
          setPublicationConfirmation('')
          setPublicationUnderstood(false)
          setResultOrigin('browser-snapshot')
          setSnapshotMessage('Restored from this browser’s IndexedDB. Confirm wallet state before publishing.')
          return saved
        })
      })
      .catch((storeError) => {
        if (active) setSnapshotMessage(`Browser snapshot recovery unavailable: ${storeError instanceof Error ? storeError.message : String(storeError)}`)
      })
    return () => {
      active = false
    }
  }, [session?.identityKey])

  const recoveryTxid = recoveryAudit?.walletOutpoint.split('.')[0]
  const exactRecoveryAction = recoveryAudit?.actions.find(
    (action) => action.txid === recoveryTxid,
  )
  const recoveryCleared = Boolean(
    recoveryAudit &&
    !recoveryAudit.actionQueryError &&
    !recoveryAudit.outputQueryError &&
    !recoveryAudit.outputFound &&
    !exactRecoveryAction,
  )
  const creationBlocked = !recoveryCleared

  const recover = async () => {
    if (!wallet || !session) return
    setRecovering(true)
    setError('')
    setRecoveryAudit(null)
    setNetworkAudit(null)
    setPublicationAttempt(null)
    setPublicationConfirmation('')
    setPublicationUnderstood(false)
    try {
      const audit = await recoverNoSendCollection(
        wallet,
        session.basket ?? ADINALS_NAMESPACE.basket,
        recoveryOutpoint,
      )
      setRecoveryAudit(audit)
      if (audit.candidate) {
        setPublicationAttempt(await loadCollectionPublicationAttempt(session.identityKey, audit.candidate.outpoint))
        if (audit.candidate.valid) {
          const recovered: AdinalsCollectionRehearsal = {
            status: 'rehearsed',
            broadcast: false,
            indexed: null,
            txid: audit.candidate.txid,
            outpoint: audit.candidate.outpoint,
            outputIndex: audit.candidate.outputIndex,
            anchorTxid: audit.candidate.anchorTxid,
            anchorOutpoint: audit.candidate.anchorOutpoint,
            rawtx: audit.candidate.rawtx,
            atomicBeef: audit.candidate.atomicBeef,
            noSendChange: [],
            basket: audit.candidate.basket,
            protocolID: audit.candidate.protocolID,
            keyID: audit.candidate.keyID,
            ownerAddress: audit.candidate.ownerAddress,
            map: audit.candidate.map,
            verification: audit.candidate.verification,
            verifierRevision: COLLECTION_VERIFIER_REVISION,
            // Recovery is read-only and never learns a wallet's opaque abort
            // handles, so a recovered candidate cannot be released by reference.
            actionReference: '',
            anchorReference: '',
          }
          await saveCollectionRehearsal(session.identityKey, recovered)
          setResult(recovered)
          setResultOrigin('wallet-recovery')
          setSnapshotMessage('Recovered from wallet BEEF. The wallet-derived creator key was matched to the verified SIGMA signer and saved for this browser session.')
        }
      }
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : String(recoveryError))
    } finally {
      setRecovering(false)
    }
  }

  const publish = async () => {
    const candidate = recoveryAudit?.candidate
    if (!wallet || !session || !candidate || !networkAudit) return
    setPublishing(true)
    setError('')
    try {
      // Validate before writing the attempt marker. A stale preflight is safe to
      // repeat and must not permanently consume the one allowed publish attempt.
      validatePublicationReadiness(candidate, networkAudit)
      const now = new Date().toISOString()
      const started: CollectionPublicationAttempt = {
        format: 'adinals-brc100-publication-attempt-v1',
        outpoint: candidate.outpoint,
        identityKey: session.identityKey,
        txid: candidate.txid,
        anchorTxid: candidate.anchorTxid,
        startedAt: now,
        updatedAt: now,
        outcome: 'submitting',
        message: 'The wallet publication request has started. Do not retry this transaction chain.',
        sendWithResults: [],
        reviewActionResults: [],
        indexerOutcome: 'not-submitted',
      }
      // Fail closed: if the anti-retry marker cannot be persisted, the wallet
      // mutation is never called.
      await saveCollectionPublicationAttempt(started)
      setPublicationAttempt(started)

      const result = await publishRecoveredCollection(wallet, candidate, networkAudit)
      let completed: CollectionPublicationAttempt = {
        ...started,
        updatedAt: new Date().toISOString(),
        outcome: result.outcome,
        message: result.message,
        sendWithResults: result.sendWithResults,
        reviewActionResults: result.reviewActionResults,
        ...(result.overlaySubmission && { overlayStatus: result.overlaySubmission.status }),
      }
      await saveCollectionPublicationAttempt(completed)
      setPublicationAttempt(completed)
      setNetworkAudit(null)

      if (result.outcome === 'accepted') {
        const indexed = await submitTransactionToGorillaPool(candidate.txid)
        completed = {
          ...completed,
          updatedAt: new Date().toISOString(),
          // A successful POST proves acceptance by the submission endpoint,
          // not that a subsequent GorillaPool lookup already returns the tx.
          indexerOutcome: indexed ? 'submitted' : 'not-indexed',
        }
        await saveCollectionPublicationAttempt(completed)
        setPublicationAttempt(completed)
      }
    } catch (publicationError) {
      setError(publicationError instanceof Error ? publicationError.message : String(publicationError))
    } finally {
      setPublishing(false)
    }
  }

  const reconcilePublication = async () => {
    if (!wallet || !publicationAttempt) return
    setReconcilingPublication(true)
    setError('')
    try {
      const reconciliation = await reconcileCollectionPublication(wallet, publicationAttempt)
      const updated: CollectionPublicationAttempt = {
        ...publicationAttempt,
        updatedAt: reconciliation.checkedAt,
        outcome: reconciliation.outcome,
        message: reconciliation.message,
        indexerOutcome: reconciliation.indexerOutcome,
      }
      await saveCollectionPublicationAttempt(updated)
      setPublicationAttempt(updated)
    } catch (reconciliationError) {
      setError(reconciliationError instanceof Error ? reconciliationError.message : String(reconciliationError))
    } finally {
      setReconcilingPublication(false)
    }
  }

  const checkNetwork = async () => {
    if (!recoveryAudit?.candidate?.valid) return
    setCheckingNetwork(true)
    setError('')
    setNetworkAudit(null)
    try {
      setNetworkAudit(await readCollectionNetworkPreflight(
        recoveryAudit.candidate.anchorTxid,
        recoveryAudit.candidate.txid,
        fetch,
        recoveryAudit.candidate.outpoint,
      ))
    } catch (networkError) {
      setError(networkError instanceof Error ? networkError.message : String(networkError))
    } finally {
      setCheckingNetwork(false)
    }
  }

  const rehearse = async (event: FormEvent) => {
    event.preventDefault()
    if (!wallet || !session) return
    setWorking(true)
    setError('')
    setResult(null)
    try {
      const rehearsal = await createAdinalsCollection(wallet, {
        name,
        description,
        maxSupply,
        approval,
        format,
        contentPolicy: familyFriendly ? 'family-friendly' : 'unspecified',
        maxChars: format === 'text' ? maxChars : undefined,
        placement,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }, { basket: session.basket ?? ADINALS_NAMESPACE.basket })
      try {
        await saveCollectionRehearsal(session.identityKey, rehearsal)
        setSnapshotMessage('Complete rehearsal saved in this browser. Export the fixture before publishing.')
      } catch (storeError) {
        setSnapshotMessage(`The rehearsal is valid, but browser persistence failed: ${storeError instanceof Error ? storeError.message : String(storeError)}`)
      }
      setResultOrigin('live')
      setResult(rehearsal)
      setRecoveryOutpoint(rehearsal.outpoint)
      setRecoveryAudit(null)
      setNetworkAudit(null)
      setPublicationAttempt(null)
      setPublicationConfirmation('')
      setPublicationUnderstood(false)
    } catch (rehearsalError) {
      if (rehearsalError instanceof AdinalsActionError) {
        setError(
          `${rehearsalError.message} (${rehearsalError.stage})${
            rehearsalError.anchorTxid ? ` No-send anchor: ${rehearsalError.anchorTxid}` : ''
          }`,
        )
      } else {
        setError(rehearsalError instanceof Error ? rehearsalError.message : String(rehearsalError))
      }
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="collection-workspace-stack">
      <section className="collection-recovery" aria-label="Wallet signing conformance">
        <div>
          <span className="phase-badge">Wallet signing</span>
          <h3>Derived-key signing conformance</h3>
          <p>
            A spend that fails at <code>OP_CHECKSIG</code> proves only that the signature does not match the pushed
            public key. It cannot say whether the wallet signed a different message or used a different key. This asks
            the wallet to sign a throwaway hash with a derived key and verifies the result against the public key it
            reports for the same protocol and key identifier. No transaction is created or broadcast.
          </p>
        </div>
        <div className="adlab-wallet-actions">
          <button type="button" className="ads-back" disabled={!wallet || signingBusy} onClick={() => void checkSigning()}>
            {signingBusy ? 'Asking wallet…' : 'Check derived-key signing'}
          </button>
        </div>
        {signing && (
          <ul className="retained-rehearsals">
            <li>
              <span>Signs the exact hash supplied</span>
              <span>{signing.directHashHonoured ? 'Yes' : 'No'}</span>
            </li>
            <li>
              <span>Honours the hash when data accompanies it</span>
              <span>{signing.bothFieldsHonourDirectHash ? 'Yes' : 'No'}</span>
            </li>
            <li>
              <span>Hashes supplied data once before signing</span>
              <span>{signing.dataHashedOnce ? 'Yes' : 'No'}</span>
            </li>
            <li>
              <span>Reported public key</span>
              <code>{shortKey(signing.publicKey)}</code>
            </li>
          </ul>
        )}
        {signing?.errors.map((entry) => <p key={entry} role="alert">{entry}</p>)}
        {signingNote && <p role="status">{signingNote}</p>}
      </section>
      <section className="collection-recovery" aria-label="Overlay repair from wallet baskets">
        <div>
          <span className="phase-badge">Overlay ingestion</span>
          <h3>Teach the overlay what this wallet holds</h3>
          <p>
            The node learns about a record when this application submits it, when reconciliation finds it through
            GorillaPool, or when a peer synchronises it. A connected wallet is a fourth source and the only one that
            involves no third party: the evidence is the BEEF the wallet already holds for its own outputs. An Adinal
            minted in another session, imported, or bought elsewhere can reach the node on the strength of its own
            transaction.
          </p>
          <p>
            History is what limits it. A collection and a mint admit on their own evidence, but a later state only
            admits if the overlay already holds the output it spent, and a wallet&rsquo;s BEEF is pruned at whatever
            ancestors carry merkle proofs. Anything whose lineage this wallet cannot complete is reported rather than
            sent, and belongs to the confirmed GorillaPool backfill instead.
          </p>
          <p>
            Inspecting is read-only. Submitting sends transactions that are already public on chain to the configured
            overlay; it creates nothing, signs nothing, and broadcasts nothing.
          </p>
        </div>
        <div className="adlab-wallet-actions">
          <button
            type="button"
            className="ads-back"
            disabled={!wallet || basketRepairBusy}
            onClick={() => void runBasketRepair(false)}
          >
            {basketRepairBusy ? 'Reading baskets…' : 'Inspect wallet baskets'}
          </button>
          <button
            type="button"
            className="ads-back adlab-primary"
            disabled={!wallet || basketRepairBusy || !basketRepair?.submittable}
            onClick={() => void runBasketRepair(true)}
          >
            {basketRepair?.submittable
              ? `Submit ${basketRepair.transactions} transaction(s) to the overlay`
              : 'Nothing to submit'}
          </button>
        </div>
        {basketRepair && (
          <>
            <p>
              <code>{basketRepair.basket || 'no basket answered'}</code> · {basketRepair.outputs} output(s) ·{' '}
              {basketRepair.present} already held · {basketRepair.submittable} submittable ·{' '}
              {basketRepair.incomplete} missing history · {basketRepair.skipped} not Adinals
            </p>
            {basketRepair.plans.filter((plan) => plan.decision !== 'skipped').length > 0 && (
              <ul className="retained-rehearsals">
                {basketRepair.plans.filter((plan) => plan.decision !== 'skipped').map((plan) => (
                  <li key={plan.outpoint}>
                    <code>{shortKey(plan.outpoint)}</code>
                    <span>{plan.decision}</span>
                    <span>{plan.missing ? `needs ${shortKey(plan.missing)}` : plan.note}</span>
                  </li>
                ))}
              </ul>
            )}
            {basketRepair.failures.length > 0 && (
              <ul className="retained-rehearsals">
                {basketRepair.failures.map((failure) => (
                  <li key={failure.outpoint}>
                    <code>{shortKey(failure.outpoint)}</code>
                    <span>refused</span>
                    <span>{failure.error}</span>
                  </li>
                ))}
              </ul>
            )}
            {basketRepair.unread.length > 0 && (
              <p>
                Not read:{' '}
                {basketRepair.unread.map((entry) => `${entry.basket} (${entry.error})`).join(', ')}.
                Production negotiates the BRC-99 basket name first and falls back to the portable one, so a wallet
                that does not implement that scheme refuses one of the two by design.
              </p>
            )}
          </>
        )}
        {basketRepairNote && <p role="status">{basketRepairNote}</p>}
      </section>
      <section className="collection-recovery" aria-label="Wallet no-send maintenance">
        <div>
          <span className="phase-badge">Wallet-side release</span>
          <h3>No-send actions holding wallet funding</h3>
          <p>
            <code>abortAction</code> needs the reference <code>createAction</code> returned, and <code>listActions</code>
            {' '}never returns one, so an action whose reference was lost cannot be released through BRC-100 alone.
            Wallet-toolbox wallets accept a reserved maintenance label that filters to no-send actions and releases them
            using the reference the wallet holds internally.
          </p>
          <p>
            Reviewing is read-only. Releasing aborts <strong>every</strong> no-send action for this wallet user, not only
            Adinals rehearsals, so a rehearsal you intended to publish would be destroyed with the stranded ones. A wallet
            that does not implement the label releases nothing.
          </p>
        </div>
        <div className="adlab-wallet-actions">
          <button type="button" className="ads-back" disabled={!wallet || noSendBusy} onClick={() => void reviewNoSend(false)}>
            {noSendBusy ? 'Asking wallet…' : 'Review reserved no-send actions'}
          </button>
        </div>
        {noSendSummary && noSendSummary.totalActions > 0 && (
          <>
            <p>
              {noSendSummary.totalActions} action(s) reserving about {noSendSummary.satoshis.toLocaleString()} satoshis.
            </p>
            <ul className="retained-rehearsals">
              {noSendSummary.actions.map((entry) => (
                <li key={entry.txid}>
                  <code>{shortKey(entry.txid)}</code>
                  <span>{entry.description}</span>
                  <span>{Math.abs(entry.satoshis).toLocaleString()} sats</span>
                </li>
              ))}
            </ul>
            <label>
              <input
                type="checkbox"
                checked={noSendUnderstood}
                onChange={(event) => setNoSendUnderstood(event.target.checked)}
              />
              <span>I understand this aborts every no-send action in this wallet and cannot be undone.</span>
            </label>
            <button
              type="button"
              className="ads-back ads-reject"
              disabled={!wallet || noSendBusy || !noSendUnderstood}
              onClick={() => void reviewNoSend(true)}
            >
              Release all no-send actions
            </button>
          </>
        )}
        {noSendNote && <p role="status">{noSendNote}</p>}
      </section>
      <section className="collection-recovery" aria-label="Retained no-send rehearsals">
        <div>
          <span className="phase-badge">Reserved wallet funding</span>
          <h3>Retained collection rehearsals</h3>
          <p>
            A no-send rehearsal keeps its funding input and its no-send change reserved inside the wallet until it is
            published or released, so an abandoned one can lock far more than its own anchor reserve. Releasing a
            rehearsal aborts its collection action and then its anchor; it never touches a published collection.
          </p>
        </div>
        {retainedRehearsals.length === 0 ? (
          <p>No retained rehearsals for this identity.</p>
        ) : (
          <ul className="retained-rehearsals">
            {retainedRehearsals.map(({ savedAt, result: rehearsal }) => (
              <li key={rehearsal.outpoint}>
                <code>{shortKey(rehearsal.outpoint)}</code>
                <span>{rehearsal.map.name || 'Unnamed collection'}</span>
                <span>{new Date(savedAt).toLocaleString()}</span>
                {rehearsalOutcomes[rehearsal.outpoint] === 'accepted' ? (
                  <>
                    <span>Published — reserves nothing</span>
                    <button
                      type="button"
                      className="ads-back"
                      disabled={releasing === rehearsal.outpoint}
                      onClick={() => void forgetRehearsal(rehearsal.outpoint)}
                    >
                      Forget this record
                    </button>
                  </>
                ) : rehearsal.actionReference ? (
                  <button
                    type="button"
                    className="ads-back ads-reject"
                    disabled={releasing === rehearsal.outpoint}
                    onClick={() => void releaseRehearsal(rehearsal)}
                  >
                    {releasing === rehearsal.outpoint ? 'Releasing…' : 'Release reserved funding'}
                  </button>
                ) : (
                  <>
                    <span>No retained abort reference — release it from the wallet, then drop this record.</span>
                    <button
                      type="button"
                      className="ads-back"
                      disabled={releasing === rehearsal.outpoint}
                      onClick={() => void forgetRehearsal(rehearsal.outpoint)}
                    >
                      Forget this record
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {releaseNote && <p role="status">{releaseNote}</p>}
      </section>
      <section className="collection-recovery" aria-label="No-send recovery">
        <div>
          <span className="phase-badge">Refresh recovery gate</span>
          <h3>Check the retained wallet candidate</h3>
          <p>
            This read-only check asks the wallet for labeled actions and complete basket transactions. It cannot create,
            abort, internalize, or broadcast anything.
          </p>
        </div>
        <label>
          <span>Collection outpoint</span>
          <input value={recoveryOutpoint} onChange={(event) => {
            setRecoveryOutpoint(event.target.value)
            setRecoveryAudit(null)
            setNetworkAudit(null)
            setPublicationAttempt(null)
            setPublicationConfirmation('')
            setPublicationUnderstood(false)
          }} />
        </label>
        <button type="button" className="ads-back adlab-primary" disabled={!wallet || recovering} onClick={() => void recover()}>
          {recovering ? 'Reading wallet state…' : 'Check wallet recovery'}
        </button>
        {recoveryAudit && (
          <div className="recovery-report" aria-live="polite">
            <strong>{recoveryAudit.candidate?.valid
              ? '✓ Candidate recovered and byte-verified'
              : recoveryCleared
                ? 'No retained candidate found in this wallet'
                : 'Candidate requires reconciliation'}</strong>
            <dl>
              <dt>Wallet outpoint</dt><dd><code>{recoveryAudit.walletOutpoint}</code></dd>
              <dt>Basket output</dt><dd>{recoveryAudit.outputFound ? 'Found' : 'Not returned'}</dd>
              <dt>Labeled actions</dt><dd>{recoveryAudit.actions.length}</dd>
              {exactRecoveryAction && <><dt>Collection action</dt><dd>{exactRecoveryAction.status}</dd></>}
              {recoveryAudit.candidate && (
                <>
                  <dt>Anchor action</dt><dd>{recoveryAudit.candidate.anchorActionStatus ?? 'Not returned'}</dd>
                  <dt>BEEF transactions</dt><dd>{recoveryAudit.candidate.dependencyTransactionCount}</dd>
                  <dt>Unresolved dependencies</dt><dd>{recoveryAudit.candidate.unresolvedDependencyCount}</dd>
                </>
              )}
            </dl>
            {recoveryAudit.actionQueryError && <p className="recovery-error">Actions: {recoveryAudit.actionQueryError}</p>}
            {recoveryAudit.outputQueryError && <p className="recovery-error">Transactions: {recoveryAudit.outputQueryError}</p>}
            {recoveryAudit.candidate?.errors.map((candidateError) => (
              <p className="recovery-error" key={candidateError}>{candidateError}</p>
            ))}
            {recoveryAudit.candidate && session && (
              <div className="recovery-actions">
                <button
                  type="button"
                  className="ads-back"
                  onClick={() => downloadCollectionFixture(recoveryAudit.candidate!, {
                    walletVersion: session.version,
                    source: 'wallet-recovery',
                  })}
                >
                  Export recovered fixture
                </button>
                <button
                  type="button"
                  className="ads-back"
                  disabled={!recoveryAudit.candidate.valid || checkingNetwork}
                  onClick={() => void checkNetwork()}
                >
                  {checkingNetwork ? 'Checking public readers…' : 'Check public network status'}
                </button>
              </div>
            )}
            {networkAudit && (
              <div className="network-preflight">
                <strong>{networkAudit.allReadersAbsent
                  ? '✓ Both transactions absent from both public readers'
                  : 'Publication remains locked: found or unavailable evidence'}</strong>
                <dl>
                  <dt>Anchor · WhatsOnChain</dt><dd>{readerLabel(networkAudit.anchor.whatsOnChain)}</dd>
                  <dt>Anchor · GorillaPool</dt><dd>{readerLabel(networkAudit.anchor.gorillaPool)}</dd>
                  <dt>Collection · WhatsOnChain</dt><dd>{readerLabel(networkAudit.collection.whatsOnChain)}</dd>
                  <dt>Collection · GorillaPool</dt><dd>{readerLabel(networkAudit.collection.gorillaPool)}</dd>
                </dl>
                <p>Read-only check at {new Date(networkAudit.checkedAt).toLocaleString()}. No transaction was submitted.</p>
              </div>
            )}
            {recoveryAudit.candidate && (networkAudit?.allReadersAbsent || publicationAttempt) && (
              <div className="publication-gate">
                <span className="phase-badge">Controlled publication</span>
                <h4>Publish this exact anchor and collection</h4>
                {publicationAttempt ? (
                  <div className={`publication-result publication-${publicationAttempt.outcome}`}>
                    <strong>Publication state: {publicationAttempt.outcome}</strong>
                    <p>{publicationAttempt.message}</p>
                    <dl>
                      {publicationAttempt.sendWithResults.map((item) => (
                        <span key={item.txid} className="publication-status-row">
                          <dt>{shortKey(item.txid)}</dt><dd>{item.status}</dd>
                        </span>
                      ))}
                      <dt>GorillaPool indexing</dt><dd>{publicationAttempt.indexerOutcome}</dd>
                      {publicationAttempt.overlayStatus && <><dt>Overlay</dt><dd>{publicationAttempt.overlayStatus}</dd></>}
                      <dt>Attempt started</dt><dd>{new Date(publicationAttempt.startedAt).toLocaleString()}</dd>
                    </dl>
                    <p>No second publication attempt is available. Reconcile these exact txids through wallet recovery and public readers.</p>
                    <button
                      type="button"
                      className="ads-back"
                      disabled={reconcilingPublication}
                      onClick={() => void reconcilePublication()}
                    >
                      {reconcilingPublication ? 'Reconciling exact txids…' : 'Reconcile wallet + public network'}
                    </button>
                  </div>
                ) : (
                  <>
                    <p>
                      This asks the connected wallet to broadcast the retained anchor and collection as one `sendWith`
                      batch. Broadcasting is irreversible. Adinals will persist the attempt before calling the wallet and
                      will never automatically retry an ambiguous result.
                    </p>
                    {!COLLECTION_PUBLISH_ENABLED && (
                      <p className="recovery-error">
                        Live publication was deliberately disabled for this build with
                        <code>VITE_ENABLE_COLLECTION_PUBLISH=false</code>.
                      </p>
                    )}
                    <label className="publication-check">
                      <input
                        type="checkbox"
                        checked={publicationUnderstood}
                        onChange={(event) => setPublicationUnderstood(event.target.checked)}
                      />
                      <span>I understand these transactions will become public and permanent.</span>
                    </label>
                    <label>
                      <span>Type `PUBLISH {recoveryAudit.candidate.txid.slice(0, 8)}` to confirm</span>
                      <input
                        value={publicationConfirmation}
                        onChange={(event) => setPublicationConfirmation(event.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <button
                      type="button"
                      className="ads-back ads-reject"
                      disabled={
                        publishing ||
                        !COLLECTION_PUBLISH_ENABLED ||
                        !publicationUnderstood ||
                        publicationConfirmation !== `PUBLISH ${recoveryAudit.candidate.txid.slice(0, 8)}`
                      }
                      onClick={() => void publish()}
                    >
                      {publishing
                        ? 'Waiting for wallet publication…'
                        : COLLECTION_PUBLISH_ENABLED
                          ? 'Publish anchor + collection'
                          : 'Publication disabled'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="collection-workbench">
      <form className="collection-rehearsal-form" onSubmit={(event) => void rehearse(event)}>
        <div className="form-heading">
          <span className="phase-badge phase-active">No-send transaction rehearsal</span>
          <h3>Create an Adinals collection</h3>
          <p>Build and sign the exact v3 transaction in your wallet. This control cannot broadcast it.</p>
        </div>

        <label className="field-wide">
          <span>Collection name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
        </label>
        <label className="field-wide">
          <span>Description</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
        </label>
        <label>
          <span>Number of ads</span>
          <input
            type="number"
            value={maxSupply}
            min={1}
            step={1}
            onChange={(event) => setMaxSupply(Number(event.target.value))}
            required
          />
        </label>
        <label>
          <span>Publishing</span>
          <select value={approval} onChange={(event) => setApproval(event.target.value as 'creator' | 'open')}>
            <option value="creator">Creator approval</option>
            <option value="open">Open publishing</option>
          </select>
        </label>
        <label>
          <span>Ad format</span>
          <select value={format} onChange={(event) => setFormat(event.target.value as 'text' | 'image')}>
            <option value="text">Text</option>
            <option value="image">Image — 2:1 profile</option>
          </select>
        </label>
        {format === 'text' && (
          <label>
            <span>Maximum characters</span>
            <input
              type="number"
              value={maxChars}
              min={1}
              step={1}
              onChange={(event) => setMaxChars(Number(event.target.value))}
              required
            />
          </label>
        )}
        <label>
          <span>Placement label (optional)</span>
          <input value={placement} onChange={(event) => setPlacement(event.target.value)} placeholder="Homepage banner" />
        </label>
        <label>
          <span>Expiration (optional)</span>
          <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
        </label>
        <label className="field-wide check-field">
          <input
            type="checkbox"
            checked={familyFriendly}
            onChange={(event) => setFamilyFriendly(event.target.checked)}
          />
          <span>Family-friendly content policy</span>
        </label>

        <div className="field-wide rehearsal-safety">
          <strong>Compatibility test only</strong>
          <p>
            Both the SIGMA anchor and collection remain in the wallet’s no-send state. The anchor is sized from this
            record’s bytes as a temporary fee reserve; unused value returns as collection-transaction change. No
            GorillaPool submission
            or network broadcast occurs. Keep this candidate for the upcoming publish/recovery test instead of creating
            many disposable copies.
          </p>
        </div>
        {creationBlocked && (
          <div className="field-wide wallet-inline-error">
            Check the displayed candidate first. A page refresh is not evidence that its wallet reservations were removed.
          </div>
        )}
        <button type="submit" className="ads-back adlab-primary field-wide" disabled={!wallet || working || creationBlocked}>
          {working
            ? 'Waiting for wallet approvals…'
            : creationBlocked
              ? 'Recovery check required before another rehearsal'
              : wallet
                ? 'Build no-send rehearsal'
                : 'Connect wallet to rehearse'}
        </button>
        {error && <div className="field-wide wallet-inline-error" role="alert">{error}</div>}
      </form>

      <aside className="collection-result" aria-live="polite">
        {result ? (
          <>
            <span className="phase-badge phase-active">✓ Byte-verified · {publicationAttempt?.outcome === 'accepted' ? 'published' : 'not broadcast'}</span>
            <h3>{publicationAttempt?.outcome === 'accepted' ? 'Collection transaction published' : 'Collection transaction ready'}</h3>
            {snapshotMessage && <p className="snapshot-message">{snapshotMessage}</p>}
            <dl>
              <dt>Collection txid</dt><dd><code>{result.txid}</code></dd>
              <dt>Ordinal outpoint</dt><dd><code>{result.outpoint}</code></dd>
              <dt>SIGMA anchor</dt><dd><code>{result.anchorTxid}</code></dd>
              <dt>Owner / signer</dt><dd><code>{result.ownerAddress}</code></dd>
              <dt>Basket</dt><dd><code>{result.basket}</code></dd>
              <dt>Inscription</dt><dd>{result.verification.contentType} · {result.verification.contentBytes} bytes</dd>
              <dt>MAP</dt><dd>{result.map.app} · v{result.map.protocolVersion} · {result.map.subType}</dd>
              <dt>Verifier</dt><dd><code>{result.verifierRevision}</code></dd>
              <dt>Page source</dt><dd>{resultOrigin === 'browser-snapshot'
                ? 'Restored browser snapshot'
                : resultOrigin === 'wallet-recovery'
                  ? 'Verified wallet recovery'
                  : 'Current wallet response'}</dd>
            </dl>
            {session && (
              <button
                type="button"
                className="ads-back adlab-primary fixture-export"
                onClick={() => downloadCollectionFixture(result, {
                  walletVersion: session.version,
                  source: resultOrigin === 'wallet-recovery' ? 'wallet-recovery' : 'live-result',
                })}
              >
                Export complete fixture
              </button>
            )}
            <details>
              <summary>Raw verification material</summary>
              <pre>{JSON.stringify({
                broadcast: result.broadcast,
                outpoint: result.outpoint,
                anchorOutpoint: result.anchorOutpoint,
                map: result.map,
                verification: result.verification,
                rawtx: result.rawtx,
              }, null, 2)}</pre>
            </details>
          </>
        ) : (
          <>
            <span className="phase-badge">Expected result</span>
            <h3>Independent checks</h3>
            <p>
              The returned Atomic BEEF is parsed locally. It must contain exactly one byte-identical collection output
              with the expected inscription, exact MAP fields, and a valid SIGMA signature committed to the anchor.
            </p>
            <ul>
              <li>No <code>sendWith</code></li>
              <li><code>noSend: true</code> on create and sign</li>
              <li>Fixed output ordering</li>
              <li>Test namespace and basket</li>
            </ul>
          </>
        )}
      </aside>
      </div>
    </div>
  )
}

function EmptyWorkspace({
  tab,
  connected,
  ownership,
  count,
  developerMode,
}: {
  tab: Tab
  connected: boolean
  ownership: OwnershipState
  count: number
  developerMode: boolean
}) {
  const content = {
    approvals: {
      kicker: 'Creator inbox',
      title: 'Pending approvals',
      body: connected
        ? 'Updates from other owners awaiting a decision signed by your creator key. Your own updates are self-approved and never appear here.'
        : 'Connect the creator wallet to discover updates awaiting its signed decision.',
    },
    ads: {
      kicker: 'Owned by this wallet',
      title: 'My ads',
      body: connected
        ? 'Resolved from this wallet’s tracked ordinal outputs and re-verified against the public index.'
        : 'Connect a wallet to resolve Adinals it owns from its tracked ordinal outputs.',
    },
    collections: {
      kicker: 'Protocol v3',
      title: 'Collections',
      body: connected
        ? 'Collections held by the connected wallet.'
        : 'Connect a wallet to see the collections it created.',
    },
  }[tab]

  const model = ownership.model

  return (
    <section role="tabpanel" className="adlab-panel workspace-panel">
      <div className="adlab-section-head">
        <div>
          <span className="adlab-kicker">{content.kicker}</span>
          <h2>{content.title}</h2>
          <p>{content.body}</p>
        </div>
        <span className="adlab-count">{count}</span>
      </div>

      {connected && model && (
        <>
          {tab === 'collections' && <CollectionsView model={model} ads={model.ads} />}
          {tab === 'ads' && <MyAdsView ads={model.ads} />}
          {tab === 'approvals' && <ApprovalsView approvals={model.pendingApprovals} />}
        </>
      )}

      {connected && !model && (
        <div className="empty-state">
          <div className="empty-state-mark">○</div>
          <strong>{ownership.loading ? 'Resolving ownership…' : 'Ownership not resolved yet'}</strong>
          <p>{ownership.error || 'Reading the wallet basket and the public index.'}</p>
        </div>
      )}

      {!connected && (
        <div className="empty-state">
          <div className="empty-state-mark">○</div>
          <strong>Wallet connection required</strong>
          <p>No raw keys are generated, imported, or stored by this application.</p>
        </div>
      )}

      {developerMode && (
        <>
          {connected && <OwnershipPanel view={tab} ownership={ownership} />}
          {tab === 'collections' ? (
            <CollectionWorkspace />
          ) : connected ? (
            <LifecycleWorkspace view={tab} />
          ) : null}
        </>
      )}
    </section>
  )
}

export default function App() {
  const { status, session } = useWallet()
  const connected = status === 'connected' && Boolean(session)
  const [activeTab, setActiveTab] = useState<Tab>('collections')
  const ownership = useOwnership()
  // The no-send rehearsal forms, recovery gate, and publication canary are
  // development instruments, not the product. They stay available, but behind
  // an explicit switch so the default view is Adinals itself.
  const [developerMode, setDeveloperMode] = useState(false)
  const counts: Record<Tab, number> = {
    approvals: ownership.model?.pendingApprovals.length ?? 0,
    ads: ownership.model?.ads.length ?? 0,
    collections: ownership.model?.collections.length ?? 0,
  }
  const milestones = useMemo(() => [
    { label: 'BRC-100 connection', done: true },
    { label: 'Ordinal basket discovery', done: true },
    { label: 'v3 no-send action', done: true },
    { label: 'Adinals overlay', done: false },
  ], [])

  return (
    <main className="ads-page adlab-page">
      <div className="adlab-shell">
        <header className="adlab-hero">
          <div>
            <span className="adlab-eyebrow">
              {ADINALS_NAMESPACE.environment.toUpperCase()} · BRC-100 · ADINALS V3 · {COLLECTION_VERIFIER_REVISION}
            </span>
            <h1 className="adlab-wordmark" aria-label="Adinals">
              <span className="adlab-wordmark-ad">Ad</span>
              <span className="adlab-wordmark-inals">inals</span>
            </h1>
            <p>
              The wallet-compatible Adinals workspace—for people now and autonomous agents later.
              Your connected wallet keeps custody and approves every action.
            </p>
            <div className="adlab-hero-stats" aria-label="BRC-100 development summary">
              <div><strong>{connected ? '1' : '0'}</strong><span>wallet</span></div>
              <div><strong>{session?.ordinalCount ?? '—'}</strong><span>ordinals</span></div>
              <div><strong>0</strong><span>writers live</span></div>
            </div>
          </div>
          <div className="adlab-hero-side">
            <WalletPanel />
          </div>
        </header>

        <section className="migration-strip" aria-label="Implementation status">
          <div>
            <span className="adlab-kicker">Safe migration</span>
            <strong>Same v3 rules · isolated as {ADINALS_NAMESPACE.app}</strong>
          </div>
          <div className="milestone-list">
            {milestones.map((milestone) => (
              <span className={milestone.done ? 'milestone-done' : ''} key={milestone.label}>
                {milestone.done ? '✓' : '○'} {milestone.label}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="ads-back"
            aria-pressed={developerMode}
            onClick={() => setDeveloperMode((current) => !current)}
          >
            {developerMode ? 'Hide developer tools' : 'Developer tools'}
          </button>
        </section>

        <nav className="adlab-tabs" role="tablist" aria-label="Adinals workspace">
          {(['approvals', 'ads', 'collections'] as const).map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={activeTab === tab ? 'adlab-tab-active' : ''}
              onClick={() => setActiveTab(tab)}
              key={tab}
            >
              <span>{tab === 'ads' ? 'My ads' : `${tab[0].toUpperCase()}${tab.slice(1)}`}</span>
              <strong>{counts[tab]}</strong>
            </button>
          ))}
        </nav>

        <EmptyWorkspace
          tab={activeTab}
          connected={connected}
          ownership={ownership}
          count={counts[activeTab]}
          developerMode={developerMode}
        />

        <section className="developer-note">
          <span className="adlab-kicker">Connected identity</span>
          <p>
            {session
              ? `${shortKey(session.identityKey)} · ${session.network} · ${session.version}`
              : 'No identity has been requested from a wallet.'}
          </p>
        </section>
      </div>
    </main>
  )
}

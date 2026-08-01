import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Utils } from '@bsv/sdk'
import {
  buyAdinal,
  cancelAdinalListing,
  createAdinal,
  decideAdinal,
  listAdinal,
  updateAdinal,
  type AdinalsNoSendAction,
} from '../actions/lifecycle.ts'
import {
  abortLifecycleRehearsal,
  inventoryNoSendLifecycle,
  type LifecycleInventory,
} from '../actions/lifecycleInventory.ts'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import { downloadActionFixture } from '../fixtures/actionFixture.ts'
import {
  recoverOwnedActionFixture,
  type ImportedActionFixture,
} from '../fixtures/actionFixtureImport.ts'
import {
  deleteLifecycleRehearsal,
  loadLifecycleRehearsals,
  saveLifecycleRehearsal,
} from '../fixtures/lifecycleStore.ts'
import { loadLatestCollectionRehearsal } from '../fixtures/rehearsalStore.ts'
import { readIndexedAdinalsSummary } from '../readers/adinalsIndex.ts'
import { useWallet } from '../wallet/WalletContext.tsx'
import { LifecyclePublicationPanel } from './LifecyclePublicationPanel.tsx'

type ImportedFixture = ImportedActionFixture

const fixtureSource = (fixture: ImportedFixture) => ({
  outpoint: fixture.stateOutpoint ?? fixture.outpoint,
  atomicBeef: Utils.toArray(fixture.atomicBeef.data, 'base64'),
  map: fixture.map,
})

function ResultCard({ result }: { result: AdinalsNoSendAction | null }) {
  const { session } = useWallet()
  if (!result) return null
  return (
    <div className="collection-result lifecycle-result" aria-live="polite">
      <span className="phase-badge phase-active">✓ {result.kind} byte-verified · not broadcast</span>
      <dl>
        <dt>Transaction</dt><dd><code>{result.txid}</code></dd>
        <dt>Primary outpoint</dt><dd><code>{result.outpoint}</code></dd>
        {result.stateOutpoint && <><dt>Live state</dt><dd><code>{result.stateOutpoint}</code></dd></>}
        {result.anchorTxid && <><dt>SIGMA anchor</dt><dd><code>{result.anchorTxid}</code></dd></>}
        <dt>Owner</dt><dd><code>{result.ownerAddress}</code></dd>
      </dl>
      {session && (
        <button type="button" className="ads-back adlab-primary" onClick={() => downloadActionFixture(result, { walletVersion: session.version })}>
          Export {result.kind} fixture
        </button>
      )}
    </div>
  )
}

export function LifecycleWorkspace({ view }: { view: 'ads' | 'approvals' }) {
  const { wallet, session } = useWallet()
  const actionInFlight = useRef(false)
  const rehearsedMintSlots = useRef(new Set<string>())
  const [collection, setCollection] = useState<Awaited<ReturnType<typeof loadLatestCollectionRehearsal>>>(null)
  const [name, setName] = useState('Test ad')
  const [serial, setSerial] = useState(1)
  const [text, setText] = useState('Temporary namespace creative')
  const [url, setUrl] = useState('')
  const [price, setPrice] = useState(1000)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [snapshotNotice, setSnapshotNotice] = useState('')
  const [latest, setLatest] = useState<AdinalsNoSendAction | null>(null)
  const [storedActions, setStoredActions] = useState<AdinalsNoSendAction[]>([])
  const [inventory, setInventory] = useState<LifecycleInventory | null>(null)
  const [retainedTxid, setRetainedTxid] = useState('')
  const [owned, setOwned] = useState<AdinalsNoSendAction | null>(null)
  // `ownerKeyID` is only present for a listing this wallet created. An imported
  // listing belongs to another wallet, which cannot be withdrawn from here.
  const [listing, setListing] = useState<{ outpoint: string; atomicBeef: number[]; ownerKeyID?: string } | null>(null)
  const [approvalSource, setApprovalSource] = useState<{ outpoint: string; stateOutpoint: string; atomicBeef: number[]; map: Record<string, string> } | null>(null)
  const [approvalNote, setApprovalNote] = useState('')
  const [summary, setSummary] = useState<{ collections: number; ads: number; updates: number; decisions: number } | null>(null)

  useEffect(() => {
    if (!session) return
    actionInFlight.current = false
    rehearsedMintSlots.current = new Set()
    setLatest(null)
    setStoredActions([])
    setInventory(null)
    setRetainedTxid('')
    setOwned(null)
    setListing(null)
    setApprovalSource(null)
    setApprovalNote('')
    setSnapshotNotice('')
    void loadLatestCollectionRehearsal(session.identityKey).then(setCollection).catch(() => setCollection(null))
    void loadLifecycleRehearsals(session.identityKey).then((actions) => {
      const last = actions.at(-1) ?? null
      setLatest(last)
      setStoredActions(actions)
      setRetainedTxid([...actions].reverse().find((action) => action.kind === 'mint')?.txid ?? '')
      for (const action of actions) {
        if (action.kind !== 'mint' || !action.map?.subTypeData) continue
        try {
          const data = JSON.parse(action.map.subTypeData) as { collectionId?: unknown; mintNumber?: unknown }
          if (typeof data.collectionId === 'string' && Number.isSafeInteger(Number(data.mintNumber))) {
            rehearsedMintSlots.current.add(`${data.collectionId}:${Number(data.mintNumber)}`)
          }
        } catch {
          // An unreadable local snapshot cannot reserve an unrelated slot.
        }
      }
      if (last) {
        setSnapshotNotice('Restored for inspection only. Chained actions stay disabled after refresh until wallet recovery is implemented; import a fixture or create a fresh rehearsal.')
      }
    }).catch(() => undefined)
    void readIndexedAdinalsSummary().then((records) => setSummary({
      collections: records.collections.length,
      ads: records.ads.length,
      updates: records.updates.length,
      decisions: records.decisions.length,
    })).catch(() => setSummary(null))
  }, [session?.identityKey])

  const run = async (label: string, action: () => Promise<AdinalsNoSendAction>): Promise<AdinalsNoSendAction | null> => {
    if (actionInFlight.current) {
      setError('A wallet action is already in progress. Wait for it to finish before clicking again.')
      return null
    }
    actionInFlight.current = true
    setWorking(label)
    setError('')
    try {
      const result = await action()
      setLatest(result)
      setSnapshotNotice('')
      if (session) {
        try {
          await saveLifecycleRehearsal(session.identityKey, result)
          setStoredActions((actions) => [...actions.filter((action) => action.outpoint !== result.outpoint), result])
        } catch (storeFailure) {
          setError(`The transaction is complete in the wallet, but browser persistence failed: ${storeFailure instanceof Error ? storeFailure.message : String(storeFailure)}`)
        }
      }
      return result
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      return null
    } finally {
      actionInFlight.current = false
      setWorking('')
    }
  }

  const mint = async (event: FormEvent) => {
    event.preventDefault()
    if (!wallet || !session || !collection) return
    const slot = `${collection.outpoint}:${serial}`
    if (rehearsedMintSlots.current.has(slot)) {
      setError(`Mint slot #${serial} already has a browser-recorded rehearsal. Export or inspect that candidate instead of creating a duplicate.`)
      return
    }
    rehearsedMintSlots.current.add(slot)
    const result = await run('mint', () => createAdinal(wallet, {
      collectionId: collection.outpoint,
      creatorKeyID: collection.keyID,
      creatorAddress: collection.ownerAddress,
      name,
      serial,
      format: 'text',
      text,
      maxChars: Number(collection.map.adMaxChars) || 280,
      url,
    }, { basket: session.basket ?? ADINALS_NAMESPACE.basket }))
    if (result) {
      setOwned(result)
    } else {
      rehearsedMintSlots.current.delete(slot)
    }
  }

  const revise = async () => {
    if (!wallet || !session || !collection || !owned) return
    const currentOutpoint = owned.stateOutpoint ?? owned.outpoint
    const result = await run('update', () => updateAdinal(wallet, {
      collectionId: collection.outpoint,
      adOrigin: owned.map?.subType === 'collectionItem' ? owned.outpoint : (owned.map?.adOrigin ?? owned.outpoint),
      adOutpoint: currentOutpoint,
      ownerEpoch: owned.map?.ownerEpoch ?? owned.outpoint,
      format: 'text',
      text,
      url,
      atomicBeef: owned.atomicBeef,
      ownerKeyID: owned.ownerKeyID,
    }, { basket: session.basket ?? ADINALS_NAMESPACE.basket }))
    if (result?.stateOutpoint && result.map) {
      setOwned(result)
      if (result.ownerAddress === collection.ownerAddress) {
        setApprovalSource(null)
        setApprovalNote('This update is signed by the collection creator address and is self-approved under the original v3 reader rules. No decision record is needed.')
      } else {
        setApprovalNote('')
        setApprovalSource({
          outpoint: result.outpoint,
          stateOutpoint: result.stateOutpoint,
          atomicBeef: result.atomicBeef,
          map: result.map,
        })
      }
    }
  }

  const list = async () => {
    if (!wallet || !session || !owned) return
    const result = await run('listing', () => listAdinal(wallet, {
      adOutpoint: owned.stateOutpoint ?? owned.outpoint,
      atomicBeef: owned.atomicBeef,
      ownerKeyID: owned.ownerKeyID,
      priceSatoshis: price,
    }, { basket: session.basket ?? ADINALS_NAMESPACE.basket }))
    if (result) {
      setListing({
        outpoint: result.outpoint,
        atomicBeef: result.atomicBeef,
        ownerKeyID: result.ownerKeyID,
      })
    }
  }

  const cancelListing = async () => {
    if (!wallet || !session || !listing?.ownerKeyID) return
    const result = await run('cancel', () => cancelAdinalListing(wallet, {
      listingOutpoint: listing.outpoint,
      atomicBeef: listing.atomicBeef,
      ownerKeyID: listing.ownerKeyID as string,
    }, { basket: session.basket ?? ADINALS_NAMESPACE.basket }))
    if (result) {
      setListing(null)
      setOwned(result)
    }
  }

  const buy = async () => {
    if (!wallet || !session || !listing) return
    const result = await run('purchase', () => buyAdinal(wallet, {
      listingOutpoint: listing.outpoint,
      atomicBeef: listing.atomicBeef,
      expiresAt: collection?.map.expiresAt,
    }, { basket: session.basket ?? ADINALS_NAMESPACE.basket }))
    if (result) setOwned(result)
  }

  const decide = async (verdict: 'approved' | 'disapproved') => {
    if (!wallet || !session || !collection || !approvalSource) return
    await run('decision', () => decideAdinal(wallet, {
      collectionId: collection.outpoint,
      creatorKeyID: collection.keyID,
      creatorAddress: collection.ownerAddress,
      adOrigin: approvalSource.map.adOrigin,
      updateOutpoint: approvalSource.outpoint,
      adOutpoint: approvalSource.stateOutpoint,
      ownerEpoch: approvalSource.map.ownerEpoch,
      verdict,
      reasonCode: verdict === 'approved' ? 'meets-policy' : 'does-not-meet-policy',
    }, { basket: session.basket ?? ADINALS_NAMESPACE.basket }))
  }

  const inspectWalletActions = async () => {
    if (!wallet) return
    setWorking('inventory')
    setError('')
    try {
      setInventory(await inventoryNoSendLifecycle(wallet))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking('')
    }
  }

  const releaseCandidate = async (action: AdinalsNoSendAction) => {
    if (!wallet || !session || action.txid === retainedTxid) return
    const exactPair = inventory?.pairs.find((pair) => pair.child.txid === action.txid)
    if (!exactPair || exactPair.child.status !== 'nosend') {
      setError('Release stopped: a fresh wallet inventory no longer reports this exact child as nosend.')
      return
    }
    if (action.anchorTxid && (
      exactPair.anchor?.txid !== action.anchorTxid
      || exactPair.anchor.status !== 'nosend'
    )) {
      setError('Release stopped: the exact anchor is missing or is no longer nosend.')
      return
    }
    const confirmed = window.confirm(
      `Release only this unused ${action.kind} rehearsal?\n\nChild: ${action.txid}\nAnchor: ${action.anchorTxid ?? 'none'}\n\nThis does not broadcast anything.`,
    )
    if (!confirmed) return
    setWorking('release')
    setError('')
    try {
      const released = await abortLifecycleRehearsal(wallet, action)
      if (released.anchorAborted === false) {
        throw new Error('The child was released, but the wallet retained its anchor. Inspect wallet actions again before doing anything else.')
      }
      await deleteLifecycleRehearsal(session.identityKey, action.outpoint)
      setStoredActions((actions) => actions.filter((candidate) => candidate.outpoint !== action.outpoint))
      setInventory(await inventoryNoSendLifecycle(wallet))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking('')
    }
  }

  const importFixture = async (file: File | undefined, target: 'owned' | 'listing' | 'approval') => {
    if (!file) return
    setError('')
    try {
      const fixture = JSON.parse(await file.text()) as ImportedFixture
      const source = fixtureSource(fixture)
      if (target === 'owned') {
        if (!wallet || !collection) throw new Error('Connect the wallet and recover its collection first.')
        const recovered = await recoverOwnedActionFixture(wallet, fixture)
        setOwned(recovered)
        setLatest(recovered)
        setSnapshotNotice('Imported fixture independently reverified. Its wallet-derived owner key matches the live state, so update/list actions are enabled for this session.')
        if (recovered.kind === 'update' && recovered.stateOutpoint && recovered.map) {
          if (recovered.ownerAddress === collection.ownerAddress) {
            setApprovalSource(null)
            setApprovalNote('This update is signed by the collection creator address and is self-approved under the original v3 reader rules. No decision record is needed.')
          } else {
            setApprovalSource({ outpoint: recovered.outpoint, stateOutpoint: recovered.stateOutpoint, atomicBeef: recovered.atomicBeef, map: recovered.map })
          }
        }
      } else if (target === 'listing') {
        if (fixture.kind !== 'listing') throw new Error('Choose an exported listing fixture.')
        setListing({ outpoint: source.outpoint, atomicBeef: source.atomicBeef })
        setSnapshotNotice('Listing fixture loaded for this session. Buy remains no-send and will reproduce the seller payout encoded by OrdLock.')
      } else {
        if (fixture.kind !== 'update' || !fixture.stateOutpoint || !fixture.map) throw new Error('Choose an exported update fixture.')
        setApprovalNote('Imported owner update: a creator decision is required unless its verified signer equals the collection creator address.')
        setApprovalSource({ outpoint: fixture.outpoint, stateOutpoint: fixture.stateOutpoint, atomicBeef: source.atomicBeef, map: fixture.map })
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  if (view === 'approvals') {
    return (
      <div className="collection-workspace-stack">
        <section className="collection-rehearsal-form">
          <div className="form-heading field-wide">
            <span className="phase-badge phase-active">Creator decision · no-send</span>
            <h3>Approve or reject an exact update</h3>
            <p>Use the update built in this session or import its private fixture from another wallet.</p>
          </div>
          <label className="field-wide"><span>Import update fixture</span><input type="file" accept="application/json" onChange={(event) => void importFixture(event.target.files?.[0], 'approval')} /></label>
          <button type="button" className="ads-back adlab-primary" disabled={!approvalSource || Boolean(working)} onClick={() => void decide('approved')}>Build approval</button>
          <button type="button" className="ads-back ads-reject" disabled={!approvalSource || Boolean(working)} onClick={() => void decide('disapproved')}>Build rejection</button>
          {approvalNote && <div className="field-wide snapshot-message">{approvalNote}</div>}
          {snapshotNotice && <div className="field-wide snapshot-message">{snapshotNotice}</div>}
          {error && <div className="field-wide wallet-inline-error">{error}</div>}
        </section>
        <ResultCard result={latest} />
      </div>
    )
  }

  const currentMintSlotReserved = collection
    ? rehearsedMintSlots.current.has(`${collection.outpoint}:${serial}`)
    : false

  return (
    <div className="collection-workspace-stack">
      <section className="collection-recovery">
        <span className="phase-badge">Indexed temporary namespace</span>
        <strong>{ADINALS_NAMESPACE.app}</strong>
        <p>{summary ? `${summary.collections} collections · ${summary.ads} ads · ${summary.updates} updates · ${summary.decisions} decisions` : 'Index summary unavailable or still loading.'}</p>
      </section>
      <section className="collection-result lifecycle-inventory">
        <span className="phase-badge">Wallet no-send inventory</span>
        <h3>Exact lifecycle action pairs</h3>
        <p>Inventory is read-only. A separate confirmed release aborts only a browser-retained child and then its exact anchor; it never broadcasts or internalizes anything.</p>
        <button type="button" className="ads-back" disabled={!wallet || Boolean(working)} onClick={() => void inspectWalletActions()}>
          {working === 'inventory' ? 'Reading wallet actions…' : 'Inspect wallet actions'}
        </button>
        {inventory && (
          <ul>
            {inventory.pairs.map((pair) => {
              const stored = storedActions.find((action) => action.txid === pair.child.txid)
              const retained = pair.child.txid === retainedTxid
              return (
                <li key={pair.child.txid}>
                  <strong>{pair.child.kind} · {pair.child.status}{retained ? ' · retained candidate' : ''}</strong><br />
                  <code>{pair.child.txid}</code><br />
                  <span>Anchor: </span><code>{pair.anchor?.txid ?? 'not paired'}</code>
                  {pair.child.kind === 'mint' && (
                    <button type="button" className="ads-back" onClick={() => setRetainedTxid(retained ? '' : pair.child.txid)}>
                      {retained ? 'Allow cleanup' : 'Keep this mint'}
                    </button>
                  )}
                  {!retained && stored?.actionReference && pair.child.status === 'nosend' && (
                    <button type="button" className="ads-back ads-reject" disabled={Boolean(working)} onClick={() => void releaseCandidate(stored)}>Release this unused pair</button>
                  )}
                  {!retained && stored && !stored.actionReference && (
                    <small> Older browser snapshot: abort reference unavailable; inventory is read-only.</small>
                  )}
                </li>
              )
            })}
            {inventory.unpairedAnchors.map((anchor) => (
              <li key={anchor.txid}><strong>unpaired anchor · {anchor.status}</strong><br /><code>{anchor.txid}</code></li>
            ))}
          </ul>
        )}
      </section>
      <form className="collection-rehearsal-form" onSubmit={(event) => void mint(event)}>
        <div className="form-heading field-wide">
          <span className="phase-badge phase-active">Core lifecycle · no-send</span>
          <h3>Create, update, list, and buy an ad</h3>
          <p>{collection ? `Collection ${collection.outpoint}` : 'Create or restore a collection before minting an ad.'}</p>
        </div>
        <label><span>Ad name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label><span>Serial</span><input type="number" min={1} value={serial} onChange={(event) => setSerial(Number(event.target.value))} /></label>
        <label className="field-wide"><span>Creative text</span><textarea value={text} onChange={(event) => setText(event.target.value)} /></label>
        <label className="field-wide"><span>HTTPS destination (optional)</span><input value={url} onChange={(event) => setUrl(event.target.value)} /></label>
        <button type="submit" className="ads-back adlab-primary" disabled={!wallet || !collection || Boolean(working) || currentMintSlotReserved}>
          {currentMintSlotReserved ? `Mint #${serial} already rehearsed` : 'Create ad'}
        </button>
        <label className="field-wide"><span>Resume owned mint/update fixture</span><input type="file" accept="application/json" onChange={(event) => void importFixture(event.target.files?.[0], 'owned')} /></label>
        <button type="button" className="ads-back" disabled={!owned || Boolean(working)} onClick={() => void revise()}>Create update</button>
        <label><span>Listing price (sats)</span><input type="number" min={1} value={price} onChange={(event) => setPrice(Number(event.target.value))} /></label>
        <button type="button" className="ads-back" disabled={!owned || Boolean(working)} onClick={() => void list()}>List ad</button>
        <button type="button" className="ads-back ads-reject" disabled={!listing?.ownerKeyID || Boolean(working)} onClick={() => void cancelListing()}>
          {listing && !listing.ownerKeyID ? 'Cancel unavailable for an imported listing' : 'Cancel listing'}
        </button>
        <label className="field-wide"><span>Import another wallet’s listing fixture</span><input type="file" accept="application/json" onChange={(event) => void importFixture(event.target.files?.[0], 'listing')} /></label>
        <button type="button" className="ads-back adlab-primary" disabled={!listing || Boolean(working)} onClick={() => void buy()}>Buy listed ad</button>
        {working && <div className="field-wide snapshot-message">Waiting for wallet authorization: {working}…</div>}
        {snapshotNotice && <div className="field-wide snapshot-message">{snapshotNotice}</div>}
        {error && <div className="field-wide wallet-inline-error">{error}</div>}
      </form>
      <ResultCard result={latest} />
      <LifecyclePublicationPanel
        actions={storedActions}
        collectionOutpoint={collection?.outpoint}
        retainedMintTxid={retainedTxid}
      />
    </div>
  )
}

import type {
  OwnedAd,
  OwnedCollection,
  OwnershipModel,
  PendingApproval,
} from '../readers/ownershipModel.ts'

const short = (outpoint: string): string =>
  outpoint.length > 20 ? `${outpoint.slice(0, 10)}…${outpoint.slice(-6)}` : outpoint

const mapName = (map: Record<string, unknown> | null | undefined): string => {
  const name = map?.name
  return typeof name === 'string' && name.trim() ? name : 'Unnamed record'
}

/**
 * Says where a fact came from. A record held by this wallet is verified from
 * the bytes the wallet returned; one discovered publicly is verified from
 * independently fetched raw transactions.
 */
function EvidenceBadge({ evidence, valid }: { evidence: string; valid: boolean }) {
  return (
    <span className={`phase-badge ${valid ? 'phase-active' : ''}`}>
      {valid ? '✓' : '!'} {evidence === 'wallet-custody' ? 'wallet custody' : 'public index'}
    </span>
  )
}

function CollectionRow({ collection }: { collection: OwnedCollection }) {
  return (
    <li>
      <EvidenceBadge evidence={collection.evidence} valid={collection.valid} />
      <strong>{mapName(collection.custody?.map)}</strong>
      <br />
      <code>{short(collection.origin)}</code>
      <br />
      <span>
        {collection.rules.capacity} slots · {collection.rules.approval} approval ·{' '}
        {collection.rules.format}
        {collection.expired ? ' · expired' : ''}
      </span>
      {collection.error && <div className="wallet-inline-error">{collection.error}</div>}
    </li>
  )
}

function AdRow({ ad }: { ad: OwnedAd }) {
  return (
    <li>
      <EvidenceBadge evidence={ad.evidence} valid={ad.valid && !ad.duplicateSlot} />
      <strong>{mapName(ad.custody?.map ?? ad.indexed?.map)}</strong>
      {ad.duplicateSlot && <span className="phase-badge"> duplicate slot</span>}
      <br />
      <code>{short(ad.origin)}</code>
      <br />
      <span>
        {ad.serial ? `slot #${ad.serial} · ` : ''}
        now at <code>{short(ad.currentOutpoint)}</code>
        {ad.revisions.length ? ` · ${ad.revisions.length} update(s)` : ''}
        {ad.listed ? ` · listed for ${ad.listed.price.toLocaleString()} sats` : ''}
      </span>
      {ad.duplicateSlot && (
        <div className="snapshot-message">
          Another creator-signed mint already occupies this slot on chain. This one is a real
          ordinal you still control, but it does not consume collection capacity.
        </div>
      )}
      {ad.error && <div className="wallet-inline-error">{ad.error}</div>}
    </li>
  )
}

function ApprovalRow({ approval }: { approval: PendingApproval }) {
  return (
    <li>
      <span className="phase-badge phase-active">awaiting your decision</span>
      <strong>{mapName(approval.revision.map)}</strong>
      <br />
      <code>{short(approval.revision.outpoint)}</code>
      <br />
      <span>
        ad <code>{short(approval.ad.origin)}</code> · signed by{' '}
        <code>{short(approval.revision.signer)}</code>
      </span>
    </li>
  )
}

/**
 * The wallet's own Adinals. Ownership comes from basket custody joined to
 * verified public history, never from comparing one permanent address.
 */
export function OwnershipPanel({
  view,
  ownership,
}: {
  view: 'ads' | 'approvals' | 'collections'
  ownership: {
    model: OwnershipModel | null
    loading: boolean
    error: string
    refresh: () => Promise<void>
  }
}) {
  const { model, loading, error, refresh } = ownership

  const empty = {
    ads: 'No Adinals resolved from this wallet’s tracked ordinal outputs yet.',
    approvals: 'No updates from other owners are awaiting a decision from this wallet.',
    collections: 'No collections are held by this wallet.',
  }[view]

  return (
    <section className="collection-result lifecycle-inventory">
      <span className="phase-badge">Owned by this wallet</span>
      <h3>
        {view === 'ads' ? 'My ads' : view === 'approvals' ? 'Pending approvals' : 'My collections'}
      </h3>
      <p>
        Resolved from wallet custody and re-verified locally. A page refresh cannot remove these,
        because they are read from the wallet rather than from browser storage.
      </p>
      <button type="button" className="ads-back" disabled={loading} onClick={() => void refresh()}>
        {loading ? 'Reading wallet and index…' : 'Refresh ownership'}
      </button>

      {error && <div className="wallet-inline-error">{error}</div>}

      {model && (
        <>
          <ul>
            {view === 'collections' &&
              model.collections.map((collection) => (
                <CollectionRow collection={collection} key={collection.origin} />
              ))}
            {view === 'ads' && model.ads.map((ad) => <AdRow ad={ad} key={ad.origin} />)}
            {view === 'approvals' &&
              model.pendingApprovals.map((approval) => (
                <ApprovalRow approval={approval} key={approval.revision.outpoint} />
              ))}
          </ul>

          {((view === 'collections' && !model.collections.length) ||
            (view === 'ads' && !model.ads.length) ||
            (view === 'approvals' && !model.pendingApprovals.length)) && (
            <p className="snapshot-message">{empty}</p>
          )}

          <p className="snapshot-message">
            {model.custody.totalOutputs} basket output(s) ·{' '}
            {model.custody.outputs.filter((output) => output.verified).length} verified ·{' '}
            {model.custody.unrecognized} not Adinals routing
            {model.custody.queryError ? ` · ${model.custody.queryError}` : ''}
          </p>

          {model.notices.map((notice) => (
            <p className="snapshot-message" key={notice}>
              {notice}
            </p>
          ))}
        </>
      )}
    </section>
  )
}

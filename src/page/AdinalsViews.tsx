import type {
  OwnedAd,
  OwnedCollection,
  OwnershipModel,
  PendingApproval,
} from '../readers/ownershipModel.ts'
import { readAdinalsSubTypeData } from '../protocol/recordValidation.ts'

const shortAddress = (value: string): string =>
  value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value || '—'

const shortOutpoint = (value: string): string =>
  value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value

const expirationLabel = (expiresAt: unknown): string => {
  if (typeof expiresAt !== 'string' || !expiresAt) return 'no expiration'
  const time = Date.parse(expiresAt)
  if (!Number.isFinite(time)) return 'invalid expiration'
  return `${time <= Date.now() ? 'expired' : 'expires'} ${new Date(time).toLocaleDateString()}`
}

/**
 * The creative an ad displays, or a note that it has none. Text collections
 * are the only format the writer currently exposes.
 */
function Creative({ ad }: { ad: OwnedAd }) {
  if (!ad.live.text) {
    return <div className="adlab-creative-preview adlab-my-ad-creative">No creative published.</div>
  }
  return (
    <div className="adlab-creative-preview adlab-my-ad-creative">
      <span>{ad.live.text}</span>
      {ad.live.url && (
        <small>
          → <code>{ad.live.url}</code>
        </small>
      )}
    </div>
  )
}

function StatusBadges({ ad }: { ad: OwnedAd }) {
  return (
    <div className="adlab-card-actions">
      {ad.duplicateSlot && <span className="ads-badge ads-bad">duplicate slot</span>}
      {!ad.valid && !ad.duplicateSlot && (
        <span className="ads-badge ads-bad">{ad.error || 'invalid record'}</span>
      )}
      {ad.live.status === 'pending' && (
        <span className="ads-badge">update awaiting creator approval</span>
      )}
      {ad.live.status === 'rejected' && <span className="ads-badge ads-bad">update rejected</span>}
      {ad.listed && (
        <span className="ads-badge">listed · {ad.listed.price.toLocaleString()} sats</span>
      )}
    </div>
  )
}

export function CollectionsView({
  model,
  ads,
}: {
  model: OwnershipModel
  ads: OwnedAd[]
}) {
  if (!model.collections.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-mark">○</div>
        <strong>No collections held by this wallet</strong>
        <p>Create one below, or connect the wallet that holds it.</p>
      </div>
    )
  }

  return (
    <div className="adlab-collection-grid">
      {model.collections.map((collection) => {
        const filled = ads.filter(
          (ad) =>
            ad.collectionId === collection.origin &&
            ad.fromCreator &&
            !ad.duplicateSlot &&
            ad.serial >= 1 &&
            ad.serial <= collection.rules.capacity,
        ).length
        const pending = model.pendingApprovals.filter(
          (approval) => approval.collection.origin === collection.origin,
        ).length
        const data = readAdinalsSubTypeData(collection.custody?.map ?? {})
        const name = typeof collection.custody?.map?.name === 'string'
          ? collection.custody.map.name
          : 'Unnamed collection'

        return (
          <article
            className={`adlab-collection-card${collection.expired ? ' adlab-collection-expired' : ''}`}
            key={collection.origin}
          >
            <div className="adlab-card-top">
              <span className="adlab-kicker">Your collection</span>
              {collection.expired ? (
                <span className="ads-badge ads-bad adlab-expired-badge">Expired</span>
              ) : pending > 0 ? (
                <span className="adlab-count adlab-count-alert">{pending}</span>
              ) : null}
            </div>
            <strong>{name}</strong>
            <p>
              {typeof data.description === 'string' && data.description
                ? data.description
                : 'No description provided.'}
            </p>
            {typeof collection.custody?.map?.adPlacement === 'string' && (
              <small className="adlab-card-placement">
                Displayed in: {String(collection.custody.map.adPlacement)}
              </small>
            )}
            <div className="adlab-card-meta">
              <span>{collection.rules.format === 'image' ? 'Image ads' : 'Text ads'}</span>
              <span>
                {filled}/{collection.rules.capacity} filled
              </span>
              <span>{Math.max(0, collection.rules.capacity - filled)} available</span>
              {collection.rules.format === 'text' ? (
                <span>{collection.rules.maxChars}-character limit</span>
              ) : (
                <span>{collection.rules.imageProfile}</span>
              )}
              <span>
                {collection.rules.approval === 'open' ? 'automatic updates' : 'creator approval'}
              </span>
              <span className={collection.expired ? 'adlab-expired-text' : ''}>
                {expirationLabel(collection.custody?.map?.expiresAt)}
              </span>
            </div>
            <div className="adlab-card-footer">
              <span>Created by you · {shortAddress(collection.rules.creator)}</span>
              <code>{shortOutpoint(collection.origin)}</code>
            </div>
            {!collection.valid && <div className="wallet-inline-error">{collection.error}</div>}
          </article>
        )
      })}
    </div>
  )
}

export function MyAdsView({ ads }: { ads: OwnedAd[] }) {
  if (!ads.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-mark">○</div>
        <strong>No Adinals held by this wallet</strong>
        <p>Mint one into a collection you own, or buy one from a listing.</p>
      </div>
    )
  }

  return (
    <div className="adlab-my-ads-grid">
      {ads.map((ad) => (
        <article
          className={`adlab-my-ad-card${ad.duplicateSlot ? '' : ' ads-mine'}`}
          key={ad.origin}
        >
          <div className="adlab-card-top">
            <span className="adlab-kicker">
              {ad.serial ? `Slot #${ad.serial}` : 'Unslotted'}
            </span>
            <span className="adlab-count">{ad.revisions.length}</span>
          </div>
          <Creative ad={ad} />
          <StatusBadges ad={ad} />
          <div className="adlab-card-meta">
            <span>{ad.mine ? 'owned by this wallet' : 'discovered publicly'}</span>
            <span>
              {ad.revisions.length} update{ad.revisions.length === 1 ? '' : 's'}
            </span>
            <span>{ad.evidence === 'wallet-custody' ? 'verified locally' : 'verified from chain'}</span>
          </div>
          <div className="adlab-card-footer">
            <span>now at</span>
            <code>{shortOutpoint(ad.currentOutpoint)}</code>
          </div>
        </article>
      ))}
    </div>
  )
}

export function ApprovalsView({
  approvals,
  onDecide,
  busy,
}: {
  approvals: PendingApproval[]
  onDecide?: (approval: PendingApproval, verdict: 'approved' | 'disapproved') => void
  busy?: boolean
}) {
  if (!approvals.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-mark">✓</div>
        <strong>Nothing awaiting your decision</strong>
        <p>
          Updates signed by the collection creator are self-approved and never appear here. Only
          another owner's update to a collection you created needs a decision.
        </p>
      </div>
    )
  }

  return (
    <div className="adlab-approval-list">
      {approvals.map((approval) => (
        <article className="adlab-approval-card" key={approval.revision.outpoint}>
          <div className="adlab-approval-copy">
            <span className="adlab-kicker">
              Slot #{approval.ad.serial || '—'} · signed by {shortAddress(approval.revision.signer)}
            </span>
            <div className="adlab-creative-preview adlab-approval-creative">
              {typeof approval.revision.map.adText === 'string' && approval.revision.map.adText
                ? String(approval.revision.map.adText)
                : 'No creative in this update.'}
            </div>
            <small>
              update <code>{shortOutpoint(approval.revision.outpoint)}</code> · ad{' '}
              <code>{shortOutpoint(approval.ad.origin)}</code>
            </small>
          </div>
          <div className="adlab-approval-actions">
            <button
              type="button"
              className="ads-back adlab-primary"
              disabled={busy || !onDecide}
              onClick={() => onDecide?.(approval, 'approved')}
            >
              Approve
            </button>
            <button
              type="button"
              className="ads-back ads-reject"
              disabled={busy || !onDecide}
              onClick={() => onDecide?.(approval, 'disapproved')}
            >
              Reject
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

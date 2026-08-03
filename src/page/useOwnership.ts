import { useCallback, useEffect, useRef, useState } from 'react'
import { ADINALS_NAMESPACE } from '../config/environment.ts'
import { readOwnership } from '../readers/ownershipReader.ts'
import { readOverlayOwnershipSnapshot } from '../readers/overlayNamespaceClient.ts'
import type { OwnershipModel } from '../readers/ownershipModel.ts'
import { useWallet } from '../wallet/WalletContext.tsx'

export type OwnershipState = {
  model: OwnershipModel | null
  loading: boolean
  error: string
  refresh: () => Promise<void>
}

/**
 * Resolves what this wallet owns.
 *
 * Ownership is read from the wallet each time rather than restored from
 * browser storage, so clearing IndexedDB or refreshing the page cannot make an
 * owned Adinal disappear.
 */
export function useOwnership(): OwnershipState {
  const { wallet, session } = useWallet()
  const [snapshot, setSnapshot] = useState<{
    identityKey: string
    basket: string
    model: OwnershipModel
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const latestRequest = useRef(0)

  const [error, setError] = useState('')
  const identityKey = session?.identityKey
  const basket = session?.basket ?? ADINALS_NAMESPACE.basket
  const snapshotMatches = snapshot !== null
    && snapshot.identityKey === identityKey
    && snapshot.basket === basket
  const model = snapshotMatches ? snapshot.model : null

  const refresh = useCallback(async () => {
    if (!wallet || !identityKey) return
    const request = ++latestRequest.current
    setLoading(true)
    setError('')
    try {
      const nextModel = await readOwnership(wallet, {
        basket,
        // Public history from the overlay when it holds everything this wallet
        // owns; the index answers otherwise, and custody always comes from the
        // wallet itself either way.
        readOverlaySnapshot: readOverlayOwnershipSnapshot,
      })
      if (request !== latestRequest.current) return
      setSnapshot({ identityKey, basket, model: nextModel })
    } catch (failure) {
      if (request !== latestRequest.current) return
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      if (request === latestRequest.current) setLoading(false)
    }
  }, [wallet, identityKey, basket])

  useEffect(() => {
    if (!identityKey) {
      latestRequest.current += 1
      setLoading(false)
      setError('')
      return
    }
    void refresh()
  }, [identityKey, basket, refresh])

  return { model, loading, error, refresh }
}

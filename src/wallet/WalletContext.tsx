import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { WalletInterface } from '@bsv/sdk'
import {
  connectWallet,
  inspectOrdinalBasket,
  walletErrorMessage,
  type ConnectedWallet,
} from './connection'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

type WalletContextValue = {
  status: ConnectionStatus
  session: Omit<ConnectedWallet, 'wallet'> | null
  wallet: WalletInterface | null
  error: string | null
  refreshing: boolean
  connect: () => Promise<void>
  disconnect: () => void
  refresh: () => Promise<void>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const walletRef = useRef<WalletInterface | null>(null)
  const [session, setSession] = useState<Omit<ConnectedWallet, 'wallet'> | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const connect = useCallback(async () => {
    setStatus('connecting')
    setError(null)
    try {
      const connected = await connectWallet()
      const { wallet, ...publicSession } = connected
      walletRef.current = wallet
      setSession(publicSession)
      setStatus('connected')
    } catch (connectionError) {
      walletRef.current = null
      setSession(null)
      setError(walletErrorMessage(connectionError))
      setStatus('error')
    }
  }, [])

  const disconnect = useCallback(() => {
    walletRef.current = null
    setSession(null)
    setError(null)
    setStatus('disconnected')
  }, [])

  const refresh = useCallback(async () => {
    if (!walletRef.current || !session) return
    setRefreshing(true)
    setError(null)
    try {
      const [network, height, basketInspection] = await Promise.all([
        walletRef.current.getNetwork({}),
        walletRef.current.getHeight({}),
        inspectOrdinalBasket(walletRef.current, session.basket),
      ])
      setSession((current) => current && ({
        ...current,
        network: network.network,
        height: height.height,
        basket: basketInspection?.basket ?? null,
        ordinalCount: basketInspection?.totalOutputs ?? null,
      }))
    } catch (refreshError) {
      setError(walletErrorMessage(refreshError))
    } finally {
      setRefreshing(false)
    }
  }, [session])

  const value = useMemo<WalletContextValue>(() => ({
    status,
    session,
    wallet: walletRef.current,
    error,
    refreshing,
    connect,
    disconnect,
    refresh,
  }), [connect, disconnect, error, refresh, refreshing, session, status])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet must be used inside WalletProvider')
  return context
}

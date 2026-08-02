import ReactDOM from 'react-dom/client'
import ProductApp from './page/App'
import Brc100DeveloperApp from './page/Brc100DeveloperApp'
import { WalletProvider } from './wallet/WalletContext'
import './styles.css'
import { retryPendingOverlaySubmissions } from './overlay/submissionQueue.ts'
import { recoverAcceptedOverlaySubmissions } from './overlay/submissionRecovery.ts'

void retryPendingOverlaySubmissions()
  .then(() => recoverAcceptedOverlaySubmissions())
  .catch(() => undefined)

const App = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('brc100Developer') === '1'
  ? Brc100DeveloperApp
  : ProductApp

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <WalletProvider>
    <App />
  </WalletProvider>
)

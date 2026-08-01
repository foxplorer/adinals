const DEFAULT_API_BASE = 'https://tenmillionfoxes-99288f417d7b.herokuapp.com/adinals/v1'
const DEFAULT_REFRESH_MS = 10 * 60 * 1000
const RETRY_DELAYS_MS = Object.freeze([2_000, 5_000, 15_000, 30_000, 60_000])

class AdinalsEmbed extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.timer = null
    this.retryTimer = null
    this.retryAttempt = 0
    this.refreshing = false
    this.lastData = null
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.retryAttempt = 0
        this.refresh()
        this.startTimer()
      } else {
        this.stopTimer()
        this.clearRetry()
      }
    }
  }

  connectedCallback() {
    this.renderShell()
    this.refresh()
    this.startTimer()
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  disconnectedCallback() {
    this.stopTimer()
    this.clearRetry()
    this.retryAttempt = 0
    document.removeEventListener('visibilitychange', this.visibilityHandler)
  }

  get kind() {
    return this.getAttribute('kind') === 'ad' ? 'ad' : 'collection'
  }

  get mode() {
    if (this.kind === 'ad') return 'fixed'
    return this.getAttribute('mode') === 'grid' ? 'grid' : 'random'
  }

  get refreshMs() {
    const requested = Number(this.getAttribute('refresh-ms'))
    return Number.isFinite(requested) && requested >= 60_000 ? requested : DEFAULT_REFRESH_MS
  }

  get endpoint() {
    const base = (this.getAttribute('api-base') || DEFAULT_API_BASE).replace(/\/+$/, '')
    const origin = encodeURIComponent(this.getAttribute('origin') || '')
    return this.kind === 'ad'
      ? `${base}/ads/${origin}`
      : `${base}/collections/${origin}/live`
  }

  renderShell() {
    const theme = ['light', 'transparent'].includes(this.getAttribute('theme'))
      ? this.getAttribute('theme')
      : 'dark'
    this.setAttribute('data-theme', theme)
    this.shadowRoot.innerHTML = `
      <style>
        :host { --bg:#181a17; --panel:#20231d; --text:#f4f1e8; --muted:#9da296; --line:#3b4035; --accent:#c7f43d; display:block; min-width:0; color-scheme:dark; font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        :host([data-theme="light"]) { --bg:#f6f4ed; --panel:#fff; --text:#1c2118; --muted:#62695b; --line:#d7dccd; --accent:#628500; color-scheme:light; }
        :host([data-theme="transparent"]) { --bg:transparent; --panel:rgba(20,22,18,.92); --text:#f4f1e8; --muted:#aeb3a7; --line:rgba(255,255,255,.2); --accent:#c7f43d; }
        * { box-sizing:border-box; }
        .frame { position:relative; min-height:72px; border:1px solid var(--line); border-radius:10px; background:var(--bg); color:var(--text); overflow:hidden; }
        .ads { display:grid; grid-template-columns:1fr; gap:10px; padding:12px; }
        .ads.grid { grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); }
        .creative { display:flex; min-width:0; min-height:64px; align-items:center; justify-content:center; padding:12px; border:1px solid var(--line); border-radius:8px; background:var(--panel); color:var(--text); text-decoration:none; }
        .creative[href]:hover, .creative[href]:focus-visible { border-color:var(--accent); outline:none; }
        .creative-text { overflow-wrap:anywhere; font-size:clamp(15px,3vw,25px); font-weight:800; line-height:1.15; text-align:center; }
        .creative img { display:block; width:100%; aspect-ratio:2/1; object-fit:contain; }
        .empty { padding:22px; color:var(--muted); font-size:13px; text-align:center; }
        .attribution { position:absolute; right:8px; bottom:8px; z-index:2; padding:5px 8px; border:1px solid var(--line); border-radius:999px; background:var(--panel); color:var(--muted); cursor:pointer; font:700 9px/1 ui-sans-serif,system-ui,sans-serif; letter-spacing:.04em; }
        .attribution:hover, .attribution:focus-visible { border-color:var(--accent); color:var(--accent); outline:none; }
        .drawer[hidden] { display:none; }
        .drawer { position:fixed; z-index:2147483000; right:16px; bottom:16px; width:min(360px,calc(100vw - 32px)); max-height:min(560px,calc(100vh - 32px)); overflow:auto; padding:18px; border:1px solid var(--line); border-radius:14px; background:var(--panel); color:var(--text); box-shadow:0 18px 70px rgba(0,0,0,.45); }
        .drawer-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
        .drawer h2 { margin:3px 0 0; font-size:19px; }
        .drawer-kicker { color:var(--accent); font-size:9px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
        .close { width:30px; height:30px; border:1px solid var(--line); border-radius:999px; background:transparent; color:var(--text); cursor:pointer; font-size:18px; }
        .drawer p { color:var(--muted); font-size:12px; line-height:1.55; }
        .drawer dl { display:grid; gap:8px; margin:14px 0; }
        .drawer dl div { display:flex; justify-content:space-between; gap:12px; padding-top:8px; border-top:1px solid var(--line); }
        .drawer dt { color:var(--muted); font-size:10px; }
        .drawer dd { margin:0; font-size:10px; font-weight:700; text-align:right; }
        .drawer-links { display:grid; gap:7px; }
        .drawer a { color:var(--accent); font-size:12px; font-weight:700; }
        .notice { margin-bottom:0!important; font-size:10px!important; }
      </style>
      <section class="frame" aria-live="polite">
        <div class="ads"><div class="empty">Loading live Adinals…</div></div>
        <button class="attribution" type="button" aria-haspopup="dialog">Ads by Adinals</button>
      </section>
      <aside class="drawer" role="dialog" aria-modal="false" aria-label="About these Adinals" hidden>
        <div class="drawer-head"><div><span class="drawer-kicker">Ads by Adinals</span><h2 class="drawer-title">Live collection</h2></div><button class="close" type="button" aria-label="Close details">×</button></div>
        <p class="drawer-description"></p>
        <dl><div><dt>Collection</dt><dd class="drawer-collection"></dd></div><div><dt>Approval</dt><dd class="drawer-approval"></dd></div><div><dt>Expires</dt><dd class="drawer-expiry"></dd></div></dl>
        <div class="drawer-links"><a class="collection-link" target="_blank" rel="noopener noreferrer">View collection on Adinals ↗</a><a class="ad-link" target="_blank" rel="noopener noreferrer">View this Adinal ↗</a></div>
        <p class="notice">Slot ownership does not promise display, traffic, endorsement, or results. Publishers independently choose what they show.</p>
      </aside>`

    this.shadowRoot.querySelector('.attribution').addEventListener('click', () => this.openDrawer())
    this.shadowRoot.querySelector('.close').addEventListener('click', () => this.closeDrawer())
    this.shadowRoot.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.closeDrawer()
    })
  }

  startTimer() {
    this.stopTimer()
    if (document.visibilityState !== 'hidden') {
      this.timer = window.setInterval(() => this.refresh(), this.refreshMs)
    }
  }

  stopTimer() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
  }

  clearRetry() {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  scheduleRetry() {
    if (this.retryTimer !== null || !this.isConnected || document.visibilityState === 'hidden') return
    if (this.retryAttempt >= RETRY_DELAYS_MS.length) return
    const delay = RETRY_DELAYS_MS[this.retryAttempt++]
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null
      this.refresh()
    }, delay)
  }

  async refresh() {
    if (this.refreshing) return
    this.refreshing = true
    const origin = this.getAttribute('origin') || ''
    try {
      if (!/^[0-9a-f]{64}_\d+$/i.test(origin)) {
        this.showMessage('This embed needs a valid Adinal or collection origin.')
        return
      }
      const response = await fetch(this.endpoint, { headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`Live state returned ${response.status}`)
      const data = await response.json()
      this.clearRetry()
      if (!data.stale) this.retryAttempt = 0
      if (!data.displayEligible) {
        this.lastData = data
        this.showMessage(data.ineligibilityReason === 'expired' ? 'This collection has expired.' : 'No display-eligible creative is available.')
        this.updateDrawer(data, null)
        return
      }
      this.lastData = data
      this.renderData(data)
      if (data.stale) this.scheduleRetry()
    } catch (error) {
      const expiresAt = Date.parse(this.lastData?.collection?.expiresAt || '')
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        this.showMessage('This collection has expired.')
      } else if (!this.lastData) {
        this.showMessage('Live Adinals are temporarily unavailable. Retrying…')
      }
      this.scheduleRetry()
    } finally {
      this.refreshing = false
    }
  }

  showMessage(message) {
    const ads = this.shadowRoot.querySelector('.ads')
    ads.className = 'ads'
    ads.replaceChildren(Object.assign(document.createElement('div'), { className: 'empty', textContent: message }))
  }

  normalizeAds(data) {
    if (this.kind === 'ad') {
      return data.creative ? [{
        slot: data.ad.slot,
        origin: data.ad.origin,
        creative: data.creative,
        adinalsUrl: data.adinalsUrl,
      }] : []
    }
    return Array.isArray(data.ads) ? data.ads : []
  }

  renderData(data) {
    let items = this.normalizeAds(data)
    if (this.mode === 'random' && items.length > 1) {
      items = [items[Math.floor(Math.random() * items.length)]]
    }
    const ads = this.shadowRoot.querySelector('.ads')
    ads.className = this.mode === 'grid' ? 'ads grid' : 'ads'
    ads.replaceChildren()
    if (!items.length) {
      this.showMessage('No display-eligible ads are available.')
      this.updateDrawer(data, null)
      return
    }
    for (const item of items) ads.append(this.creativeElement(item))
    this.updateDrawer(data, items[0])
  }

  creativeElement(item) {
    const creative = item.creative || {}
    const element = creative.destinationUrl ? document.createElement('a') : document.createElement('div')
    element.className = 'creative'
    if (creative.destinationUrl) {
      element.href = creative.destinationUrl
      element.target = '_blank'
      element.rel = 'sponsored noopener noreferrer'
      element.setAttribute('aria-label', `Sponsored link to ${new URL(creative.destinationUrl).hostname}`)
    }
    if (creative.kind === 'image') {
      const image = document.createElement('img')
      image.src = creative.contentUrl
      image.alt = 'Image ad creative'
      image.loading = 'lazy'
      element.append(image)
    } else {
      const text = document.createElement('span')
      text.className = 'creative-text'
      text.textContent = creative.text || ''
      element.append(text)
    }
    return element
  }

  updateDrawer(data, item) {
    const collection = data.collection || {}
    this.shadowRoot.querySelector('.drawer-title').textContent = collection.name || 'Adinals collection'
    this.shadowRoot.querySelector('.drawer-description').textContent = collection.description || 'Public, signed, ownable live content.'
    this.shadowRoot.querySelector('.drawer-collection').textContent = collection.name || collection.id || 'Unknown'
    this.shadowRoot.querySelector('.drawer-approval').textContent = collection.approval === 'open' ? 'Automatic updates' : 'Creator review'
    this.shadowRoot.querySelector('.drawer-expiry').textContent = collection.expiresAt ? new Date(collection.expiresAt).toLocaleString() : 'No expiration'
    const collectionLink = this.shadowRoot.querySelector('.collection-link')
    collectionLink.href = collection.collectionUrl || data.collectionUrl || '#'
    collectionLink.hidden = !collectionLink.href || collectionLink.href.endsWith('#')
    const adLink = this.shadowRoot.querySelector('.ad-link')
    adLink.href = item?.adinalsUrl || data.adinalsUrl || '#'
    adLink.hidden = !item && !data.adinalsUrl
  }

  openDrawer() {
    const drawer = this.shadowRoot.querySelector('.drawer')
    drawer.hidden = false
    this.shadowRoot.querySelector('.close').focus()
  }

  closeDrawer() {
    this.shadowRoot.querySelector('.drawer').hidden = true
    this.shadowRoot.querySelector('.attribution').focus()
  }
}

if (!customElements.get('adinals-embed')) customElements.define('adinals-embed', AdinalsEmbed)

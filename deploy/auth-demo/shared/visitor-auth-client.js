// Framework-independent visitor auth controller for the current HUD's integration.
// No localStorage, cookies, transaction RPC, chain switching or wallet-specific SDK.
import { challengeMessage } from './visitor-challenge.js';
const validAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
const addressOf = (accounts) => Array.isArray(accounts) && validAddress(accounts[0]) ? accounts[0].toLowerCase() : null;
const chainOf = (s) => typeof s === 'string' && /^0x[0-9a-f]+$/i.test(s) && Number.isSafeInteger(Number(s)) ? Number(s) : null;

export function discoverWallets(target = window, legacy = target.ethereum) {
  const wallets = [], listeners = new Set();
  const add = (provider, name, id) => {
    if (!provider || typeof provider.request !== 'function' || wallets.some((w) => w.provider === provider)) return;
    // Treat names as text; never render provider-controlled HTML or icons.
    wallets.push({ provider, name: String(name || 'Injected wallet').slice(0, 80), id: String(id || wallets.length) });
    for (const listener of listeners) listener([...wallets]);
  };
  const announce = (e) => { const d = e.detail; if (d?.info) add(d.provider, d.info.name, d.info.uuid); };
  target.addEventListener('eip6963:announceProvider', announce);
  target.dispatchEvent(new Event('eip6963:requestProvider'));
  for (const p of (Array.isArray(legacy?.providers) ? legacy.providers : legacy ? [legacy] : [])) add(p, p.isRabby ? 'Rabby (legacy)' : p.isMetaMask ? 'MetaMask (legacy)' : 'Injected wallet (legacy)', null);
  return { get wallets() { return [...wallets]; }, subscribe(fn) { listeners.add(fn); fn([...wallets]); return () => listeners.delete(fn); }, destroy() { target.removeEventListener('eip6963:announceProvider', announce); listeners.clear(); } };
}

export function validateChallenge(c, cfg, { address, chainId, origin, uri, now = Date.now() }) {
  if (!c || c.version !== 1 || c.address !== address || c.chainId !== chainId || !cfg.chains.includes(chainId) || c.origin !== origin || c.uri !== uri || c.domain !== new URL(uri).host || c.world !== cfg.world || !/^[0-9a-f]{64}$/.test(c.nonce) || !Number.isSafeInteger(c.issuedAt) || !Number.isSafeInteger(c.expiresAt) || c.issuedAt > now + 30_000 || c.issuedAt < now - cfg.nonceTtlMs || c.expiresAt <= now || c.expiresAt - c.issuedAt !== cfg.nonceTtlMs || c.message !== challengeMessage(c)) throw new Error('Mismatched sign-in challenge. No signature requested.');
}

export class VisitorAuthClient {
  constructor({ baseUrl, uri, origin, fetchImpl = fetch, timeoutMs = 10_000, onChange = () => {} }) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); this.uri = uri; this.origin = origin;
    this.fetch = (...args) => fetchImpl(...args); this.timeoutMs = timeoutMs; this.onChange = onChange;
    this.generation = 0; this.state = 'disconnected'; this.error = ''; this.provider = null;
    this.address = null; this.chainId = null; this.session = null; this.config = null; this.pendingNonce = null;
    this.busy = false; this.cleanup = () => {}; this.expiryTimer = null; this.revocations = new Set();
  }
  emit(state = this.state, error = '') { this.state = state; this.error = error; this.onChange({ state, error, address: this.address, chainId: this.chainId, session: this.session, busy: this.busy }); }
  async deadline(promise) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Request timed out. You can retry.')), this.timeoutMs); })]); }
    finally { clearTimeout(timer); }
  }
  async request(route, body, token) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const r = await this.fetch(`${this.baseUrl}/api/auth/${route}`, { method: body === undefined ? 'GET' : 'POST',
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { 'X-Stratoks-Origin': this.origin, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `Backend returned ${r.status}`);
      return data;
    } catch (e) { if (e.name === 'AbortError') throw new Error('Backend timed out. You can retry.'); throw e; }
    finally { clearTimeout(timer); }
  }
  revoke(body, token) {
    // Track failures so UI never falsely claims server logout while offline.
    const job = { body, token }; this.revocations.add(job);
    return this.request('logout', body, token).then(() => this.revocations.delete(job));
  }
  async retryRevocations() {
    for (const job of [...this.revocations]) { await this.request('logout', job.body, job.token); this.revocations.delete(job); }
  }
  invalidate(reason = '', state = this.address ? 'connected' : 'disconnected') {
    ++this.generation; this.busy = false;
    clearTimeout(this.expiryTimer);
    const old = this.session, nonce = this.pendingNonce;
    this.session = null; this.pendingNonce = null;
    if (old || nonce) this.revoke(nonce ? { nonce } : {}, old?.token).catch(() => this.emit(this.state, 'Authentication cleared locally. Server revocation pending; reconnect and retry logout. Sessions also expire or end on server restart.'));
    this.emit(state, reason);
  }
  async loadConfig() {
    const generation = this.generation;
    try {
      const c = await this.request('config');
      if (!c.enabled || c.version !== 1 || c.uri !== this.uri || c.domain !== new URL(this.uri).host || typeof c.world !== 'string' || !Array.isArray(c.chains) || !Number.isSafeInteger(c.nonceTtlMs) || c.nonceTtlMs < 1 || c.transport !== 'memory-bearer') throw new Error('This backend does not offer compatible visitor sign-in.');
      if (generation === this.generation) { this.config = c; this.emit(); } return c;
    } catch (e) { if (generation === this.generation) { this.config = null; this.emit('unavailable', e.message); } throw e; }
  }
  async connect(provider) {
    if (this.busy) return;
    this.invalidate(); this.cleanup(); this.provider = provider; this.address = null; this.chainId = null;
    if (!provider?.request) { this.emit('unavailable', 'Use an injected EVM wallet extension or its mobile browser.'); return; }
    const changedAccounts = (a) => { this.address = addressOf(a); this.invalidate('Wallet account changed. Sign in again.'); };
    const changedChain = (c) => { this.chainId = chainOf(c); this.invalidate('Network changed. Sign in again on a supported network.'); };
    const disconnected = () => { this.address = null; this.invalidate('Wallet disconnected. Unlock or reconnect your wallet.', 'disconnected'); };
    for (const [name, fn] of [['accountsChanged', changedAccounts], ['chainChanged', changedChain], ['disconnect', disconnected]]) provider.on?.(name, fn);
    this.cleanup = () => { for (const [name, fn] of [['accountsChanged', changedAccounts], ['chainChanged', changedChain], ['disconnect', disconnected]]) provider.removeListener?.(name, fn); };
    const generation = this.generation; this.busy = true; this.emit();
    try {
      const accounts = await this.deadline(Promise.resolve().then(() => provider.request({ method: 'eth_requestAccounts' })));
      const chain = await this.deadline(Promise.resolve().then(() => provider.request({ method: 'eth_chainId' })));
      if (generation !== this.generation) return;
      this.address = addressOf(accounts); this.chainId = chainOf(chain);
      if (!this.address || !this.chainId) throw new Error('Wallet is locked or has no available account. Unlock it and retry.');
      this.emit('connected');
    } catch (e) { if (generation === this.generation) this.emit('disconnected', e.code === 4001 ? 'Connection declined. You can retry.' : e.message); }
    finally { if (generation === this.generation) { this.busy = false; this.emit(this.state, this.error); } }
  }
  async signIn() {
    if (this.busy || this.session || !this.address || !this.provider) return;
    const generation = this.generation, address = this.address, chainId = this.chainId, provider = this.provider;
    const current = () => generation === this.generation;
    this.busy = true; this.emit('signing');
    let nonce;
    try {
      await this.retryRevocations();
      const config = await this.loadConfig();
      if (!current()) return;
      if (!config.chains.includes(chainId)) throw new Error(`Unsupported network. Select chain ${config.chains.join(' or ')} in your wallet, then retry.`);
      const c = await this.request('nonce', { address, chainId }); nonce = c.nonce;
      if (!current()) { await this.revoke({ nonce }); return; }
      this.pendingNonce = nonce;
      validateChallenge(c, config, { address, chainId, origin: this.origin, uri: this.uri });
      // Recheck provider state before opening the signature prompt, and again before verify.
      const checkWallet = async () => {
        const [a, ch] = await this.deadline(Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]));
        if (!current() || addressOf(a) !== address || chainOf(ch) !== chainId) throw new Error('Wallet account or network changed. Sign in again.');
      };
      await checkWallet();
      const signature = await this.deadline(Promise.resolve().then(() => provider.request({ method: 'personal_sign', params: ['0x' + [...new TextEncoder().encode(c.message)].map((v) => v.toString(16).padStart(2, '0')).join(''), address] })));
      await checkWallet();
      const result = await this.request('verify', { nonce, address, chainId, message: c.message, signature });
      if (!current()) { await this.revoke({ nonce }, result.token); return; }
      if (result.address !== address || result.chainId !== chainId || result.world !== config.world || result.origin !== this.origin || result.uri !== this.uri || !/^[0-9a-f]{64}$/.test(result.token) || result.expiresAt <= Date.now() || result.role !== 'visitor') throw new Error('Mismatched session response.');
      this.session = result; this.pendingNonce = null;
      this.expiryTimer = setTimeout(() => this.invalidate('Session expired. Sign in again.', 'expired'), Math.max(0, result.expiresAt - Date.now()));
      this.emit('verified');
    } catch (e) {
      if (nonce) await this.revoke({ nonce }).catch(() => {});
      if (current()) { this.pendingNonce = null; this.session = null; this.emit(this.config ? 'connected' : 'unavailable', e.code === 4001 ? 'Signature declined. You can retry.' : e.message); }
    } finally { if (current()) { this.busy = false; this.emit(this.state, this.error); } }
  }
  async refreshSession() {
    if (!this.session) return;
    const generation = this.generation;
    try { await this.request('session', undefined, this.session.token); }
    catch (e) { if (generation === this.generation) this.invalidate(`Verification ended or backend unavailable: ${e.message}. Sessions end on server restart.`, 'expired'); }
  }
  async logout() {
    this.invalidate();
    try { await this.retryRevocations(); this.emit(this.address ? 'connected' : 'disconnected', 'Signed out on the server.'); }
    catch { this.emit(this.state, 'Cleared locally; server logout is pending while offline. Retry logout when the backend returns.'); }
  }
  disconnect() { this.cleanup(); this.address = null; this.provider = null; this.invalidate(); }
  destroy() { this.disconnect(); clearTimeout(this.expiryTimer); }
}

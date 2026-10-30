import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { discoverWallets, VisitorAuthClient, type AuthSnapshot, type WalletChoice } from "../../../shared/visitor-auth-client.js";
import { Icon } from "../icons";
import { Modal } from "../Modal";

const initial: AuthSnapshot = { state: "disconnected", error: "", address: null, chainId: null, session: null, busy: false };
const labels = {
  disconnected: "Disconnected", connected: "Connected · not signed in", signing: "Signing in…",
  verified: "Verified visitor", expired: "Session expired", unavailable: "Sign-in unavailable",
};
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
function readable(error: string) {
  if (/Failed to fetch|NetworkError|Load failed/i.test(error)) return "The sign-in server is offline or has not allowed this preview. Browsing is still available. Check the connection and retry.";
  if (/rate_limited|store_full/.test(error)) return "The sign-in server is at its request or account limit. Wait a minute and retry; if it continues, ask the world operator.";
  if (/unsupported_chain/.test(error)) return "Choose a supported network in your wallet, then retry.";
  if (/nonce_expired|unknown_or_used_nonce/.test(error)) return "The sign-in message expired or was already used. Retry for a fresh message.";
  if (/origin_not_allowed|origin_mismatch/.test(error)) return "The world operator must allow this exact preview origin before sign-in is available.";
  if (/wrong_signer|invalid_signature/.test(error)) return "The server could not verify this account signature. Retry with a compatible EVM account wallet. Smart contract wallets are not supported.";
  return error;
}

export function VisitorWallet({ backendUrl, worldId, open, onOpen, onClose }: {
  backendUrl: string | null; worldId: string | null; open: boolean; onOpen: () => void; onClose: () => void;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [wallets, setWallets] = useState<WalletChoice[]>([]);
  const [checking, setChecking] = useState(false);
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);
  const [offlineRevocations, setOfflineRevocations] = useState(0);
  const connectTicket = useRef(0);
  const client = useRef<VisitorAuthClient | null>(null);
  // Old services stay private while offline revocations are retried. No credential enters React state/storage.
  const retired = useRef(new Set<VisitorAuthClient>());
  const mounted = useRef(true);
  const probe = useRef(false);
  const releaseRetired = (old: VisitorAuthClient) => {
    if (!old.pendingRequests && !old.activeAttempts && !old.revocations.size) retired.current.delete(old);
    if (mounted.current) setOfflineRevocations([...retired.current].reduce((n, c) => n + c.revocations.size, 0));
  };
  useEffect(() => {
    const d = discoverWallets();
    const unsubscribe = d.subscribe(setWallets);
    return () => { unsubscribe(); d.destroy(); };
  }, []);
  useLayoutEffect(() => {
    setSnapshot(initial); setChecking(false); probe.current = false; setPendingWallet(null);
    let active = true;
    const c = new VisitorAuthClient({ baseUrl: backendUrl, uri: backendUrl ? `${backendUrl}/` : null, origin: location.origin, signatureTimeoutMs: 60_000,
      onChange: (s) => { if (active) setSnapshot({ ...s, session: s.session ? { ...s.session, token: "" } : null }); },
    });
    client.current = c;
    return () => {
      active = false;
      c.destroy();
      if (client.current === c) client.current = null;
      retired.current.add(c);
      c.retryRevocations().finally(() => releaseRetired(c)).catch(() => {});
    };
  }, [backendUrl, worldId]);
  useEffect(() => () => {
    mounted.current = false;
    for (const c of retired.current) c.retryRevocations().catch(() => {});
  }, []);

  async function checkAvailability() {
    const c = client.current;
    if (!backendUrl || !c || probe.current || c.busy) return;
    probe.current = true; setChecking(true);
    try { await c.loadConfig(); } catch { /* The controller exposes a recoverable unavailable state. */ }
    finally { if (client.current === c && mounted.current) { probe.current = false; setChecking(false); } }
  }
  useEffect(() => { void checkAvailability(); }, [backendUrl, worldId]);
  useEffect(() => {
    // Poll only a verified session, well below the bounded auth rate. Recheck on tab focus/online too.
    let reading = false;
    const refresh = async () => {
      if (reading) return;
      reading = true;
      try {
        const c = client.current;
        if (c?.session && !c.busy) await c.refreshSession();
        for (const old of retired.current) {
          try { await old.retryRevocations(); } catch { /* Retry remains available. */ }
          releaseRetired(old);
        }
        if (mounted.current) setOfflineRevocations([...retired.current].reduce((n, old) => n + old.revocations.size, 0));
      } finally { reading = false; }
    };
    const timer = setInterval(refresh, 30_000);
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    addEventListener("focus", onFocus); addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { clearInterval(timer); removeEventListener("focus", onFocus); removeEventListener("online", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, []);
  useEffect(() => { if (open && client.current?.session) void client.current.refreshSession(); }, [open]);

  const c = client.current;
  const available = !!c?.config;
  const state = backendUrl || snapshot.address ? snapshot.state : "unavailable";
  const supported = !!c?.config?.chains.includes(snapshot.chainId ?? -1);
  const reason = snapshot.busy ? "Waiting for the wallet or server. This action will time out; you can also cancel below."
    : !backendUrl
    ? "This is an isolated preview. Connect a world server in Choose world to use a visitor account."
    : checking ? "Checking whether this world offers visitor sign-in…"
    : !available ? "This world has not enabled compatible visitor sign-in, or its backend is unavailable."
    : snapshot.session ? `Verified on chain ${snapshot.session.chainId}. This session ends on expiry, reload or server restart.`
    : !snapshot.address ? "Choose and unlock a wallet first. Connecting alone does not sign you in."
    : !supported ? `Select chain ${c?.config?.chains.join(" or ")} in your wallet. Network is part of the signed message; no transaction is sent.`
    : "Sign a readable, free message. No gas, transaction, asset approval or private key.";
  const status = checking ? "Checking sign-in availability" : labels[state];
  const buttonText = snapshot.address ? (state === "verified" ? "Verified" : state === "signing" ? "Signing…" : state === "expired" ? "Expired" : "Wallet") : "Connect";
  const pendingRevocation = (c?.revocations.size ?? 0) + offlineRevocations > 0;

  return <>
    <button className="exp-wallet-control" aria-haspopup="dialog" aria-label={snapshot.address ? `${buttonText} wallet ${short(snapshot.address)} · ${status}` : "Connect wallet"}
      title={status} onClick={() => { onOpen(); if (!c?.config) void checkAvailability(); }}>
      <Icon name="wallet" size={18} />
      <span className="exp-wallet-compact">{buttonText}</span>
      <span className="exp-wallet-wide">{snapshot.address ? `${short(snapshot.address)} · ${buttonText}` : "Connect wallet"}</span>
    </button>
    <span className="sr-only" role="status">{status}</span>
    {open && <Modal title="Visitor account" onClose={onClose}>
      <div className="exp-visitor" data-auth-state={state}>
        <div className="exp-visitor-status"><Icon name={state === "verified" ? "check" : "wallet"} size={20} /><strong role="status">{status}</strong></div>
        <p className="exp-muted">Viewing is always free and walletless. Signing in records a private verified visit. It gives no world controls or resident memories.</p>
        {snapshot.address && <p className="exp-visitor-address" aria-label="Connected wallet address">{snapshot.address}</p>}
        <p id="visitor-reason" className="exp-visitor-reason">{reason}</p>
        {backendUrl && <p className="exp-small exp-muted exp-visitor-service">World service: <span>{backendUrl}</span></p>}
        {!snapshot.address && <div className="exp-visitor-wallets" aria-label="Choose a wallet">
          {wallets.map((w, i) => <button key={`${w.id}-${i}`} className="exp-visitor-wallet" disabled={snapshot.busy} aria-describedby="visitor-reason" onClick={async () => {
            const current = client.current;
            if (!current) return;
            const ticket = ++connectTicket.current;
            setPendingWallet(w.name); await current.connect(w.provider);
            if (client.current === current && ticket === connectTicket.current) setPendingWallet(null);
          }}>
            <Icon name="wallet" size={22} /><span>{w.name}{pendingWallet === w.name && snapshot.busy ? " · opening…" : ""}</span><Icon name="chevron" size={16} />
          </button>)}
          {!wallets.length && <p className="exp-small exp-muted">No wallet found. Use MetaMask, Rabby or a compatible EVM extension. On a phone, open this page inside your wallet’s own browser and unlock it. An ordinary mobile browser cannot connect here.</p>}
        </div>}
        {!backendUrl && <p className="exp-small exp-muted">Wallet sign-in is available only with an owner-run backend. The browser demo has no visitor accounts.</p>}
        {snapshot.session && <dl className="exp-visitor-profile">
          <div><dt>Verified visits</dt><dd>{snapshot.session.profile.visitCount.toLocaleString()}</dd></div>
          <div><dt>Session ends</dt><dd>{new Date(snapshot.session.expiresAt).toLocaleTimeString()}</dd></div>
          <div><dt>First verified visit</dt><dd>{new Date(snapshot.session.profile.firstVerifiedAt).toLocaleDateString()}</dd></div>
        </dl>}
        {!snapshot.session && backendUrl && <button className="exp-button primary" disabled={!available || checking || !snapshot.address || !supported || snapshot.busy} aria-describedby="visitor-reason" onClick={() => void c?.signIn()}>Sign in with message<Icon name="arrow" size={17} /></button>}
        {snapshot.busy && <button className="exp-button" onClick={() => { ++connectTicket.current; c?.invalidate("Attempt cancelled. Dismiss any wallet prompt before retrying."); setPendingWallet(null); }}>Cancel attempt</button>}
        {snapshot.session && <button className="exp-button" onClick={() => void c?.logout()}>Sign out</button>}
        {pendingRevocation && <button className="exp-button" disabled={snapshot.busy} onClick={async () => {
          await c?.logout();
          for (const old of retired.current) { try { await old.retryRevocations(); } catch {} releaseRetired(old); }
          setOfflineRevocations([...retired.current].reduce((n, old) => n + old.revocations.size, 0));
        }}>Retry server sign-out</button>}
        {snapshot.address && !snapshot.busy && <button className="exp-visitor-text" onClick={() => void (async () => {
          if (c?.session || c?.revocations.size) await c.logout();
          if (client.current === c) c?.disconnect();
        })()}>Disconnect wallet</button>}
        {!available && backendUrl && <button className="exp-button" disabled={checking || snapshot.busy} onClick={() => void checkAvailability()}>Check sign-in availability</button>}
        <p className="exp-visitor-error" role="status">{readable(snapshot.error)}</p>
        {pendingRevocation && <p className="exp-small exp-visitor-error">Server revocation is pending. Retry while this tab is open. Otherwise the old session lasts until expiry or server restart.</p>}
        <details className="exp-visitor-details"><summary>Privacy and wallet support</summary>
          <p>Sessions stay only in this tab’s memory and end on expiry, reload or server restart. Private visit history stays on the world server. Login never pauses, resets or advances the simulation.</p>
          <p>Only simulated MetaMask/Rabby-style providers were tested. Actual extensions and mobile devices are untested. Compatible injected EVM account wallets may work. Smart contract wallets, Coinbase Smart Wallet and WalletConnect are not supported by this signature verifier.</p>
        </details>
      </div>
    </Modal>}
  </>;
}

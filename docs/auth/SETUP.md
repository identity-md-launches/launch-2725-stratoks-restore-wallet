# Owner setup, demo and rollback

This component delivers actual Expanse visitor authentication, a private profile store, shared integration client, and an isolated browser demonstration. It does not change production, deploy anything, modify contracts, or add paid/admin gameplay. The existing world files, navigation/inspectors, simulation engine, live client configuration and Docker `COPY shared/` terrain fix are preserved. `server/src/auth.js` and `web/src/wallet.tsx` remain legacy code: **do not wire their developer role/transport into Expanse**.

## Run the isolated local demonstration

Requirements: Node 22 or newer; no npm dependencies, network, RPC endpoint or funds needed. From repository root:

```sh
node deploy/auth-demo/server.mjs
```

Open `http://127.0.0.1:8790/`. This creates a separate temporary demo world, listens only on loopback, and deletes its data on graceful shutdown. Never point the demo at live data. To demonstrate restart persistence, use a dedicated demo directory:

```sh
node deploy/auth-demo/server.mjs 8790 /tmp/stratoks-private-visitor-demo
```

Stop and restart with the same arguments: private visit counts persist; sessions end and require another sign-in. This directory is demo-only. Open the browser with an injected EVM wallet. Choose among providers if several announce themselves; a legacy injected fallback is available. Connect first, then explicitly sign in with the free readable message. Sign out must be confirmed by the backend. View ticks keep advancing independently. The page clearly identifies itself as an isolated demonstration, not the current HUD or live world.

The source/static preview is [`deploy/auth-demo/index.html`](../../deploy/auth-demo/index.html). To refresh its self-contained shared modules after changing the API client:

```sh
node deploy/auth-demo/build-preview.mjs
```

Serve that directory with any static HTTP server. **Static frontend hosting does not install a backend.** Its default metadata keeps all auth/world requests disabled, and sign-in is unavailable. The isolated Node demo server explicitly enables the same-origin demo backend only when it serves the page. The static preview never silently uses an existing live `/api` service on its hosting origin. Opening via `file://` may block ES modules; use static HTTP hosting. Screenshots are in [`screenshots/`](screenshots/).

Only simulated EIP-1193/EIP-6963 providers have been tested here. Actual MetaMask/Rabby extensions, injected mobile browsers and hardware wallets are untested. Other compatible injected EOA providers are untested too. On an ordinary mobile browser explain that a wallet's injected browser is needed; no WalletConnect or vendor deep-link promise is implemented. Smart-contract signatures are unsupported. No actual extension or device compatibility certification is implied by Chromium tests.

## Enable authentication on an owner-run Expanse service

1. Stop the **owner's** Expanse process cleanly and privately back up the existing data directory before upgrading. Work on a copy first. Keep its snapshot/manifest, generations, pre-migration archives, population, identifiers and history. This patch does not require a world reset or new world seed. Never run two writers against one data directory.
2. Set `AUTH_URI` to the **existing canonical public HTTPS service URI**, usually its origin plus `/`. This is an owner-settable value, not inferred from request headers. Preserve the deployed client's same-origin backend setting and existing Expanse reverse proxy paths. `/api/auth/*` must reach the same current Expanse process that serves `/api/expanse/*`; do not route it to the legacy server.
3. Optional `AUTH_ALLOWED_ORIGINS`: comma-separated **exact** IMD HTTPS preview origins the owner permits. No trailing `/`, wildcard, path or suffix patterns. The service URI origin is included automatically. `ALLOWED_ORIGINS` still separately controls anonymous world CORS and is unchanged; for cross-origin world previews configure it deliberately too. A preview must explicitly identify demo/live context and validate the expected service URI.
4. `AUTH_CHAINS` is comma-separated supported integer chain IDs, default `1`. The selected wallet network must match the challenge, even though sign-in makes no chain transaction or RPC call. Production must leave `AUTH_LOCAL_DEMO` unset/false.
5. Keep the existing `EXPANSE_DATA_DIR`, tick settings, seed configuration and world volume. Start `node server/src/expanse/server.js` (or `npm run start:expanse` in `server/`). With no `AUTH_URI` the service retains anonymous viewing and reports auth disabled. Bad auth configuration or corrupt private data also disables only authentication; CLI prints a generic diagnostic. Inspect configured URI/origins/chains and privately validate the store; never delete world data to fix login.
6. Check `/healthz`, anonymous `/api/expanse/frame`, and `GET /api/auth/config`. Confirm the exact URI/domain/chains/world before signing. Then verify using a disposable empty account, check `/api/auth/session`, logout, and ensure the old bearer receives 401. No RPC/owner key/token deployment is required.

Private data is stored at `<EXPANSE_DATA_DIR>/private-visitors/profiles-v1.json`, with mode 0600 in a mode 0700 directory. The runtime UID must own/write this directory. The directory contains a durable service identity and minimal private profiles, **no sessions or signing keys**. Preserve it for private backup/restore across restart. World snapshots/manifests/public frames/inspectors/exports omit it; the Expanse `backup()` helper deliberately copies only world snapshot and manifest. A whole-volume backup is private and must not be distributed as a public world export. Do not expose the data directory as static HTTP files. Retention/address deletion is an owner-operated offline maintenance procedure, not an unauthenticated API; keep schema/serviceId intact when privately archiving records.

A profile write failure prevents login, not ticking/viewing. A malformed profile store disables auth at startup rather than silently replacing visit history. Keep the damaged file for diagnosis, restore a known-good private copy while stopped, and restart. If a profile store reaches its 10,000-address limit, archive/adjust retention offline or deliberately increase the audited programmatic bound. No profiles are silently culled.

## Docker and ARM

The existing pinned Node base image and `COPY server/` plus `COPY shared/` are retained. New auth imports also resolve from `shared/`; Docker now runs a module-import check at image build time. There are zero runtime npm dependencies and no architecture-specific native addon. The owner must have Docker Buildx plus a native ARM host or configured ARM emulation to prove the ARM image actually starts:

```sh
# Repository-root build context is essential for the shared terrain/auth files.
sh deploy/expanse/check-auth-image.sh linux/arm64
```

The script builds/loads the actual Dockerfile, starts it as the unprivileged node user with a disposable tmpfs `/data`, checks module imports, makes a real disposable signature, verifies current session and logout revocation, confirms anonymous frames, reports `process.arch`, and removes the container. It never mounts any live volume and prints no credentials. For a native x86 smoke check use `linux/amd64`; this is not ARM proof. The current ARM build/start attempt failed with `docker: Permission denied` (raw `artifacts/visitor-auth/docker-arm.log`): image build/start/ARM execution are **unverified**, despite successful Node module checks. Do not treat the script's existence as a passing result.

For an owner deployment, `deploy/expanse/compose.yml` now forwards optional `AUTH_URI`, `AUTH_ALLOWED_ORIGINS`, `AUTH_CHAINS` from the owner's Compose environment; empty URI leaves login disabled. Keep the existing volume and resource limits. Configure those values in the owner's protected environment, then run the established owner-controlled compose rollout. No production rollout was performed here. The local demo's server is not the production entry point, and changing static hosting alone cannot enable authentication.

## Current HUD integration

The current HUD now includes `web/src/expanse/VisitorWallet.tsx`, using [`shared/visitor-auth-client.js`](../../shared/visitor-auth-client.js) and [API v1](API-v1.md). It has no import from the legacy wallet/developer transport. The top-right Connect wallet control opens an accessible native dialog on desktop and phone. Choose an EIP-6963 provider (or legacy browser provider), connect, then explicitly select **Sign in with message**. The full account address, verified private visit count, session expiry and restart behavior are visible. Sign out requires an API acknowledgment; offline revocation is labeled pending and offers retry. Browsing and every inspector/navigation control work without an account.

The HUD expects `AUTH_URI` to equal the selected backend base URL plus `/`, including any reverse-proxy prefix. For example a backend base `https://world.example/expanse` needs `AUTH_URI=https://world.example/expanse/`. A mismatch disables signing. Challenge address, chain, domain, origin, URI, world, nonce, exact message and timestamps are checked before `personal_sign`; account and network are checked before signing, before verify and after the verification reply. Account/network/disconnect/world changes discard earlier asynchronous results and cancel the nonce/revoke the session. A known frame-world change also recreates the private auth controller. Session checks run every 30 seconds while verified and on focus, tab visibility, online events and opening the account dialog. Backend restart is discovered on that next check (or immediately when making an auth request); it does not pause the world.

Backend/connection requests have a 10-second deadline. The HUD allows 60 seconds to read and sign the wallet message, within the default 120-second nonce lifetime. Cancel attempt clears local authentication and cancels its nonce; dismiss any remaining wallet-owned prompt before retrying. No timed-out prompt can later authenticate a different attempt.

For same-origin owner hosting, adapt the existing proxy rather than routing auth to the old settlement service. A Caddy pattern for a dedicated Expanse origin is below; the owner supplies the domain and installs the built export at the indicated static root. Keep private world/profile directories outside that root. This is documentation, not a deployed configuration:

```caddy
{$STRATOKS_WORLD_DOMAIN} {
    handle /api/* {
        reverse_proxy 127.0.0.1:8788
    }
    handle /healthz {
        reverse_proxy 127.0.0.1:8788
    }
    handle {
        root * /srv/stratoks/dist
        file_server
    }
}
```

Use the existing backend port if different. Set the frontend `httpUrl` and `AUTH_URI` consistently with that origin/base, retain `legacyAvailable:false`, and preserve any unrelated existing owner proxy routes. A public preview hosted elsewhere additionally requires its exact HTTPS origin in both applicable allowlists; no wildcard or cookie credential flow is needed.

`web/public/expanse-config.json` and the owner live URL are preserved. Automatic `startMode:live` applies only on the configured service's same origin; a different static preview starts the real isolated browser simulation. Explicit Choose world / `?server=` / a remembered source choice still select a permitted backend. Configure both exact world CORS and auth origins for cross-origin previews. Isolated browser/recorded modes never authenticate, even if that hosting origin happens to expose `/api`. Nothing installs or enables the backend when the frontend is hosted.

Wallet discovery/connection is still usable in an isolated static preview. Its controller has an explicitly null backend, makes no auth request and shows **Connected · not signed in** after connection. The sign-in action is absent there. Selecting a real world replaces that controller, then checks that backend before offering authentication. This is a provider connection, never a fake local account.

To run the actual production HUD with a real isolated authentication backend after building `dist/`:

```sh
node deploy/auth-demo/hud.mjs
```

Open `http://127.0.0.1:8791/preview/`. This dedicated loopback launcher creates a fresh temporary world, labels it **Isolated auth demo**, proxies only to its own Expanse instance and deletes its temporary data on graceful shutdown. It accepts no data-directory argument. No live-world files are opened. `node deploy/auth-demo/server.mjs` remains the smaller API demo; only that smaller demo accepts a dedicated disposable directory for demonstrating persistence across manual restart. Automated HUD tests restart their disposable backend while retaining its own temporary world/profile directory.

The bearer stays inside the controller in memory. The HUD redacts it before copying a private session into React state; credentials are not sent with anonymous frames and cannot enter inspector downloads. Unconfirmed old-world revocations stay in memory and are retried on focus/online/timer or **Retry server sign-out**. Keep that tab open to retry. Closing a tab while offline cannot guarantee server revocation; fixed expiry/restart remains the fallback. Reload always needs a new sign-in. Disconnect is local to the page and does not revoke the extension's site permission; use wallet settings for that.

The acceptance script is `tests/browser/expanse-hud-auth.mjs`. It serves the actual `dist/` under `/preview/`, exercises actual Expanse HTTP verification/logout with a fresh disposable signer and simulates injected providers. Actual MetaMask, Rabby, other extensions, hardware wallets and physical phones have **not** been exercised. This integration follows the brief's injected-wallet/mobile-browser scope; Coinbase Smart Wallet and other ERC-1271 accounts cannot authenticate with the current EOA-only verifier, so no nonworking Smart Wallet connection row is offered. No WalletConnect relay or project ID is required.

## Rollback

Stop the new process cleanly. Preserve a private backup of `private-visitors/`; changing the binary alone ends every session. Restore the prior server image/source and unset auth environment variables to disable auth, keeping the existing world volume and same-origin client configuration. This patch adds no world schema migration; the existing engine may still perform its established migration for an older snapshot. If rolling back to an engine that cannot read that schema, restore the pre-upgrade world copy or preserved `pre-migration/` snapshot/manifest into a **fresh** directory and run that older release against it. Keep the newer directory intact for recovery. Do not run legacy restore/reset tools against a running Expanse process. Do not overwrite the only current world copy or delete profiles to roll back code.

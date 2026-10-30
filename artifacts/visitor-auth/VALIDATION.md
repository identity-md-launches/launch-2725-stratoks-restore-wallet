# Visitor wallet HUD validation

This delivery integrates the accepted Expanse visitor API into the **current** HUD, with an owner-run local demo and a real static production export. No production service, wallet funds, approvals, transfers, contracts or world data were accessed. These are worker observations, not independent certification. Docker/ARM startup verification remains incomplete because Docker execution was denied.

## Delivered behavior

| Requirement | Implemented and checked |
| --- | --- |
| Current desktop/mobile HUD | Optional Connect wallet utility, provider choice, explicit sign-in, private account display and server-confirmed sign-out; existing world/inspector controls retained. |
| Walletless viewing | Default cross-origin static preview runs the genuine isolated browser engine. Same-origin owner configuration still selects live; explicit/remembered world choices remain supported. |
| Truthful static connection | Wallet discovery/connection works without a backend, labeled **Connected · not signed in**. An explicitly null backend makes no auth request and cannot create a session or request a signature. |
| Genuine authentication | Current Expanse HTTP nonce/verify/session/logout routes; exact challenge/scope validation, real EIP-191 signing and server signer recovery. No legacy developer-role transport. |
| Lifecycle and recovery | Immediate local clearing on account/network/disconnect/world change, generation checks, late nonce/session cancellation, expiry, timeout/cancel/retry, offline revocation queue and restart detection. |
| Private profiles | Existing atomic private store, persistence across restart, no profile/credential fields in public snapshots/frames/inspector downloads. |
| Bounded API | Actual HTTP tests exercise malformed/oversized/slow bodies, methods, exact CORS/preflight, nonce/session/profile capacity, garbage collection and rate limits. |
| Preservation | Engine, terrain, schema, brains, goals, histories, relationships, checkpoint assets, owner config and Docker shared-module fix are unchanged. Copied-world migration/restart tests pass. |
| Delivery | Source, existing unchanged manifest/lockfile, complete relative-URL `dist/`, [API v1](../../docs/auth/API-v1.md), [setup/rollback](../../docs/auth/SETUP.md), [design system](../../DESIGN.md), screenshots and raw evidence. |

## Commands and raw results

The existing frontend manifest and lockfile were copied unchanged to a disposable build mirror at `/tmp/stratoks-hud-build/web`; source/public files plus required server/shared imports were copied with their original relative paths. Dependencies were installed there with `npm ci --cache /tmp/stratoks-hud-npm-cache --no-audit --no-fund`. No dependency, lockfile or build-configuration edit was made. `dist/` is synchronized from that production build, with superseded chunks removed. Normal owner reproduction is documented in the root README.

| Actual check | Result | Raw evidence |
| --- | --- | --- |
| `npm --prefix /tmp/stratoks-hud-build/web run typecheck` | Passed (`tsc --noEmit`) | [typecheck.log](typecheck.log) |
| `npm --prefix /tmp/stratoks-hud-build/web run build` | Passed, Vite production export | [build.log](build.log) |
| `npm --prefix /tmp/stratoks-hud-build/web run test` | 34 passed | [client-tests.log](client-tests.log) |
| `node node_modules/tsx/dist/cli.mjs --test src/expanse/*.test.ts` in the build mirror | 17 passed | [expanse-client-tests.log](expanse-client-tests.log) |
| `node --test --test-concurrency=2 tests/*.test.js` | 233 passed | [backend-tests.tap](backend-tests.tap) |
| `node --test tests/expanse-auth-client.test.js tests/expanse-auth.test.js` | 27 passed, included in the backend suite | [auth-tests.tap](auth-tests.tap) |
| `PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node tests/browser/expanse-hud-auth.mjs` | 19 Chromium checks passed; no page errors | [browser.log](browser.log), [browser.json](browser.json) |
| Existing `web/scripts/agency-check.mjs`, copied into scratch with only Playwright import/output path adapted | 10 navigation/inspector checks passed; no errors | [navigation.log](navigation.log), [navigation.json](navigation.json) |
| Pinned `taste.mjs --out test/scratch/taste --offline`, with the supplied Playwright module/browser path | 16/16 checks passed | [taste.log](taste.log), [taste.json](taste.json) |
| Required server/shared module imports under Node | Passed | [modules.log](modules.log) |
| `sh deploy/expanse/check-auth-image.sh linux/arm64` | **Not verified**: `docker: Permission denied`, exit 127 | [docker-arm.log](docker-arm.log) |

The build retains the existing `node:fs` externalization warning from the shared defaults import. Actual rendered browser checks found no missing local assets or page errors. This is not evidence that every browser or production proxy will work.

The browser runner uses a fresh disposable random signer and actual Expanse HTTP handlers. Wallets are simulated EIP-1193/EIP-6963 providers, including initial account announcements, absent/multiple wallets, legacy fallback and emulated mobile injection. Tests cover selection without automatic connection, connection without authentication, real verification, revoked logout, signature rejection/retry, repeated clicks, account/chain changes, provider disconnect, a held signature, a held HTTP verification reply, connection timeout, locked provider, offline logout/retry, server restart/private visit persistence, world switch while signing, an auth-disabled backend and offline capability recovery. The Node suite additionally covers wrong signer/address/origin/chain/message, replay, expired nonce/session, malformed session/config responses, capacity/rate boundaries and world identity preservation.

The existing navigation probe was run against the actual production export at `/preview/`: all biomes/corners, map picking, minimap travel, search empty/recovery, goals/signals, evidence JSON download, follow/stop, panel focus, keyboard tile evidence, emulated touch pan/pinch and demo pause/resume. It checks 390×844, 320×568, 667×375, 844×390 and 851×700. Auth checks additionally cover 768×900 and 1440×900. These are emulated Chromium views, not physical devices.

## Better Interface review

All six pinned domains were considered while implementing the existing visual system. One visual idea remains: the painted isometric world, with compact moss/gold observer controls. The wallet is a header utility, not a new landing page or overlay over map controls.

| Domain | Coverage and evidence | Limits |
| --- | --- | --- |
| Accessibility | Native dialog/button/disclosure semantics, named controls, nearby disabled reasons, keyboard opening/Escape/focus return, tab trap, persistent status/error text, 44px wallet control and 52px provider rows. Existing map keyboard paths rechecked. | No native screen-reader or physical touch session. |
| Layout | Product, Find residents and Connect on the first 390px screen; header fits at 320; wrapping full address and service URL; inspector/map zones remain separate; short landscape navigation checked. | No localized/RTL or browser-native 200% zoom review. |
| Writing | Connected versus verified, unavailable sign-in, no resident-memory claim, explicit free message, expired/restart states, offline revocation and recovery instructions. Empty logout no longer claims a server acknowledgment. | Actual wallet-owned prompt text depends on the provider. |
| Typography | Existing local Manrope body, Georgia modal/title, 12/14px body roles and existing type scale; tabular changing numbers; full address reachable and wrapping. | No device font-rendering comparison. |
| Colors | Existing moss/gold tokens only. Rendered modal text/background ratios: gold status **7.53:1**, muted body **7.31:1**, primary text **11.01:1** against `#28362d`. Entry-page probe contrast passed. | Probe explicitly leaves 18 canvas/image-background text boxes unmeasured; this is not a full canvas contrast certification. |
| UI | Existing native Modal and Icon reused; hover/focus/disabled/pending/error/retry states; no new animation; reduced motion respected by the existing map; no overlapping modal slots. | No slow-motion animation-panel inspection; no new animation was introduced. |

### Findings fixed and rechecked

| Finding | Source | Correction and evidence |
| --- | --- | --- |
| High: wallet control missing from current HUD | `web/src/expanse/App.tsx` / `VisitorWallet.tsx` | Current header now owns the native account dialog. Browser selection/verification/logout and inspector-preservation checks pass. |
| High: silent wallet change during an in-flight verify could publish an obsolete result | `shared/visitor-auth-client.js:145` | Re-read wallet account/network after the HTTP response, then validate response scope. Unit and browser late-response tests confirm no retained server session. |
| Medium: initial provider account announcement could cancel a connection | `shared/visitor-auth-client.js:104` | Accept initial announcements during connect, then re-read accounts/chain before completion. Simulated wallet emits the initial event in every browser connection. |
| Medium: cross-origin static preview could automatically attempt owner live access | `web/src/expanse/App.tsx:101` | Auto-live only on matching origin; explicit choices remain. Static demo makes no auth request, even after wallet connection. |
| Medium: local auth demo inherited a Live label and one capture preceded art readiness | `web/src/expanse/visitor-wallet.css:26`, `deploy/auth-demo/hud.mjs`, browser runner | Final stylesheet loads last; auth demo has an explicit label; screenshots wait for the actual artwork. Reviewed final 390px screenshot. |
| Medium: empty local logout could imply a server acknowledgment | `shared/visitor-auth-client.js:169` | No-credential logout now says no active visitor session. Only successful revocation requests report server sign-out. Unit regression passes. |

### Screenshots reviewed

- [Static browser demo at 390px](static-hud-390.jpg): world and primary controls on the first screen.
- [Desktop provider choice](desktop-wallet-choice.jpg), [desktop verified visitor](desktop-verified.jpg): actual temporary backend world; no owner account or live data.
- [Mobile verified visitor](mobile-verified.jpg), [mobile without a provider](mobile-no-wallet.jpg): full address, clear status and recoverable controls.
- [Static preview availability](static-preview.jpg), [connected without authentication](static-connected.jpg): no fake login.
- `hud-320.jpg`, `hud-390.jpg`, `hud-768.jpg`, `hud-1440.jpg`: rendered local auth-demo layouts.

## Setup requirements and remaining limits

Owner action is required to install/run the backend, retain the existing world volume/reverse proxy, set canonical `AUTH_URI` to the selected base plus `/`, set exact permitted HTTPS preview origins and supported chains, ensure private-store write permissions and disable credential/body logging. Static frontend hosting does none of this. Follow the copied-world backup/migration/rollback steps before any owner rollout. No production access or rollout occurred.

Actual MetaMask/Rabby extensions, other wallets, hardware wallets and physical mobile devices are **untested**. Smart contract accounts/1271 and WalletConnect are unsupported and disclosed in the UI. WebKit could not launch; Safari is unverified. The browser MCP also returned `Transport closed`; all rendered observations here came from actual local Playwright Chromium, not that unavailable connection. Screen readers, native zoom and production proxy behavior are unverified. Offline tab-close cannot guarantee revocation; fixed expiry/server restart is the fallback, and an open tab can retry. Backend restart/offline detection is on the next session check, at most 30 seconds while active (browser timer throttling may delay background tabs).

No unresolved defect was found in the exercised HUD/API flow. **Required ARM Docker startup verification is unresolved**: the image was not built or started in this run. Module imports, architecture-neutral Node source and the preserved Docker `COPY shared/` line are not a substitute for that execution. The owner-run image check is supplied for a capable runtime. This is a completed useful frontend/backend integration with that explicit incomplete verification, not an ARM deployment claim.

Evidence under `artifacts/visitor-auth/` has a 1 MiB path budget; the complete added/modified submission has an 8 MiB budget. [delivery.json](delivery.json) records the final path/size/integrity check. Dependencies/caches, scratch tests and temporary worlds are excluded; no submodule or unnecessary packaging archive is added.

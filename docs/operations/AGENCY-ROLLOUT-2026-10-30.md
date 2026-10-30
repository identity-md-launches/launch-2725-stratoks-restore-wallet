# Agency rollout — 30 October 2026

Live observer: https://stratoks.2-29-11-211.sslip.io

Upstream delivery: `df59a0494012bc5dd2a14fa144be0c2a2a8ff915`, IMD job `a48682b9-7217-487a-8c51-e0e91510321b`.

## Deployment corrections

The supplied Expanse Dockerfile copied only `server/`, but the new view imports `shared/relief.js`. A real ARM container failed with `ERR_MODULE_NOT_FOUND`. The Dockerfile now includes `shared/`. The production image is `stratoks-agency:df59a04-r1`.

The owner-hosted frontend starts in live mode. The backend explicitly permits the published IMD preview origin `https://stratoks-a-world-taking-root.identitymd.eth.limo` as well as its own origin, allowing the preview's Connect live control to work. Viewer APIs remain read-only. No payment feature was added.

## Preservation

The rehearsal used a stopped, consistent copy of the actual schema-3 world: world `world-20260101-0`, tick 257668, 229 residents. Migration to schema 5 preserved its identity digest. Its old snapshot remained readable by the old image. The new service resumed the same world across restart.

The final cutover used a fresh stopped-world backup, not the advanced rehearsal world or bundled demo. At tick **260421**, all **261** residents and the identity digest were retained. Original schema-3 data volume `stratoks_expanse_52c3920` remains unchanged. New volume: `stratoks_agency_df59a04_r1`. A byte-preserved original is also in `pre-migration/schema-3-tick-260421` within the new volume.

The rollback archive is `/opt/stratoks/rollouts/df59a04/pre-agency.tar`, with a checksum and an off-host copy. Previous Compose/Caddy configuration is saved beside it. Stop the current world before rollback; restore the saved Compose configuration to use the old image and old volume. Never point the schema-3 binary at schema-5 data. After further live progress, rolling back will forfeit that newer simulation progress; retain a current backup first.

## Independent checks

- Backend suite: 206 passed, 0 failed, Node 24 on x86_64.
- Client suite: 34 passed; TypeScript check and production build passed.
- Chromium: demo tick advancement, all biome navigation, four corner picking, search/follow, actual goal/signal evidence, five viewport sizes, close/Escape/focus, real emulated pinch/drag. No browser errors.
- Actual copied world and then live HTTPS world: desktop and mobile connect, inspector, goals/signals, controls, no horizontal overflow, same world identity and advancing tick. POST viewer request returns 405.
- ARM64, Node 22.22.1: actual copied world 600 steps averaged 69.377 ms/step, peak reported RSS 508 MB (migration plus probe).
- ARM synthetic 250-resident/600-step benchmark under 0.7 CPU limit: p95 111.801 ms, max 229.396 ms, RSS 159 MB. Initial and final population 250. This is a synthetic capacity sample, not long-term growth evidence.
- Separate ARM 100-resident benchmark completed; raw records are in owner validation storage.
- After cutover: world container ~183 MiB of 1536 MiB allocation at the measurement point; daily backup timer active; exact IMD origin CORS response verified.

Owner evidence directory: `/root/stratoks-agency-validation` on the administration host. Private world backups are not committed.

## Limits

This is an evolving simulation, not demonstrated consciousness or a complete biological brain. Signal learning has no demonstrated causal benefit in the supplied experiments. Natural cooking and provisioning have not been demonstrated; their mechanics have tests. Natural repair/help-tending have been observed in supplied runs. Artwork is improved but remains substantially simpler than the original concept illustration. WebKit was unavailable; browser checks used Chromium, not native iOS Safari. No long-duration load guarantee is made.

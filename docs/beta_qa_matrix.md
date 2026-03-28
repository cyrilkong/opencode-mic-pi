# Beta QA Matrix

This matrix defines the minimum product QA surface for the `0.9.x beta` track.

It is not a substitute for script checks. It complements `scripts/check.js` with user-visible workflow validation.

## Status Legend

- `scripted`: covered by an existing repo check
- `manual`: must be verified in a real OpenCode session
- `mixed`: needs both scripted proof and manual UX verification

## Core Matrix

| Area | Scenario | Why it matters | Expected result | Evidence source | Status |
| --- | --- | --- | --- | --- | --- |
| Install | Fresh npm/local plugin install loads without project-surface runtime writes | Confirms plugin can be tried without leaking state into `.opencode/.workspace/` | Plugin loads, router state lands in app-data only, no project-surface router artifacts appear | `README.md`, `src/paths.js`, local OpenCode install session | manual |
| Bootstrap | `bootstrap --write --overwrite` seeds global router config cleanly | Confirms schema vs active-config boundary | `~/.config/opencode/opencode-router.json` is written from code defaults, not by copying schema, with one rollback backup | `scripts/bootstrap.js`, `README.md` | mixed |
| Mic intake | Messy user request becomes a stable intake card | Confirms Mic is a product surface, not only a parser shell | `As-is`, `Task List`, `Questions`, and ready state remain scanable and faithful | `src/presentation/mic-intake/`, realistic manual session | manual |
| Mic-frontstage loop | User stays in `mic`, Pi runs backstage | Validates the default low-friction product loop | Mic remains frontstage, Pi orchestration state updates are visible through Mic-friendly feedback, relay state is persisted | `src/commands.js`, `relay-bridge.json`, `interaction-mode.json` | mixed |
| Pi-frontstage loop | User talks directly to `pi`, Mic reconciles backlog backstage | Preserves direct orchestrator access without losing backlog truth | Pi stays user-facing, requirement drift can be handed to Mic backstage, backlog writeback remains coherent | `src/commands.js`, `relay-bridge.json`, manual session | mixed |
| Dispatch | `/pi-dispatch` builds a usable launch packet from ready intake | Confirms the main workflow handoff is dependable | Dispatch packet, workboard, resume capsule, and continuity state are created together | `scripts/check-memory-palace.js` | scripted |
| Status recovery | `/pi-up` is concise, useful, and action-oriented | Confirms fast recovery instead of raw state dump | Output exposes loop, stage, working state, focus, next step, and palace health within a compact view | `scripts/check-memory-palace.js`, manual scan test | mixed |
| Long-view recovery | `/pi-book` supports resume after interruption | Confirms memory-palace is actually usable | Dispatch packet, workboard, decisions, snapshots, research memory, palace index, and relay bridge are understandable as one recovery surface | `scripts/check-memory-palace.js`, manual scan test | mixed |
| Continuity | Same-project session reuse prevents repeat research | Validates the memory-palace promise | Hidden continuity block reuses anchors/findings and unfinished work stays visible as `working` until resolved | `scripts/check-memory-palace-continuity.js`, manual session | mixed |
| Rematch token | `/pi-rematch-token` runs verified discovery, rematches, and writes clean config | Confirms pay-as-cost path is stable | Billing mode stays `token_billing`; matched roles, fallbacks, and config sync complete without recursion | `scripts/check-model-rematch-flow.js` | scripted |
| Rematch request | `/pi-rematch-request` stays cost-sensitive for Mic and request-billed roles | Confirms subscription-billing path is stable | Billing mode stays `request_billing`; Mic prefers low-multiplier sufficient models; config sync completes cleanly | `scripts/check-model-rematch-flow.js`, evidence snapshots | mixed |
| Fallback | Failed assistant turn retries on next role fallback | Confirms runtime resilience under provider/model failure | Router retries once on the next fallback model when chain and prompt-cache conditions are met | `scripts/check-plugin-event-flow.js` | scripted |
| Config hygiene | Router writeback keeps only one rollback backup | Prevents self-multiplying `.bak` artifacts | `opencode-router.json.bak` is reused as the single rollback backup; unchanged rewrites are skipped | `src/config.js`, `README.md`, manual file check | mixed |
| Package | `npm pack --dry-run` produces a beta-ready tarball | Confirms package boundary and publishability | Pack succeeds and includes the intended runtime/plugin files | `npm pack --dry-run`, `package.json` | scripted |

## Minimum Beta Gate

Before tagging any `v0.9.0-beta.N` build:

1. All `scripted` rows must pass.
2. All `mixed` rows must have both script proof and one fresh manual session note.
3. All `manual` rows must have a dated local pilot note.
4. Any failure in Mic intake fidelity, dispatch, resume, rematch, or fallback blocks the beta tag.

## Current Gaps

- Mic backlog UX still needs a stronger product-grade ready vs pending surface.
- `/pi-up` and `/pi-book` need another round of hierarchy polish before they should be considered beta-finished.
- A full local pilot note set for both Mic-frontstage and Pi-frontstage loops is still missing.

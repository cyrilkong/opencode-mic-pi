# Beta Pilot Runbook

This runbook defines the minimum real-session checks required before calling a build a usable beta.

Use it together with `docs/beta_qa_matrix.md` and record outcomes in `docs/beta_pilot_notes.md`.

## Pilot A: Mic-frontstage

Goal: confirm the default low-friction loop works without forcing the user out of `mic`.

1. Start in `mic` with a messy multi-part request.
2. Confirm Mic asks only the missing questions and produces a stable intake card.
3. Reach a ready state and trigger `/pi-dispatch`.
4. Keep the user in `mic` while Pi runs backstage.
5. Confirm `interaction-mode.json` shows `mic_frontstage`.
6. Confirm `relay-bridge.json` records `mic -> pi` orchestration request/result.
7. Ask for progress and inspect `/pi-up`.
8. Interrupt with a requirement change and confirm Mic updates backlog truth without losing execution continuity.
9. Resume and inspect `/pi-book`.
10. Close the session, reopen the same project, and verify continuity context prevents redundant rediscovery.

Pass criteria:

- Mic remains the visible low-friction window.
- Backlog wording stays faithful to the user's intent.
- Pi execution state comes back to Mic in a concise form.
- Resume state is understandable without manual JSON surgery.

## Pilot B: Pi-frontstage

Goal: confirm power-user direct orchestration works while Mic stays available as backstage backlog truth.

1. Start directly in `pi` with an execution-heavy request.
2. Confirm Pi packages the work instead of collapsing into raw specialist imitation.
3. Introduce a requirement branch or reprioritization mid-flight.
4. Confirm Pi remains frontstage.
5. Confirm `interaction-mode.json` shows `pi_frontstage`.
6. Confirm `relay-bridge.json` records `pi -> mic` backlog reconcile request/result.
7. Inspect `/pi-up` for current lane, risk, working state, and next step.
8. Inspect `/pi-book` for dispatch packet, workboard, relay bridge, and memory-palace index coherence.
9. Close and reopen the same project to confirm the outstanding work still appears as `working`.

Pass criteria:

- Pi remains the speaking window throughout.
- Requirement drift is reflected in backlog truth via backstage Mic reconciliation.
- Progress and next-step information stay legible under interruption.
- Same-project resume does not restart the whole investigation.

## Pilot C: Rematch / fallback sanity

Goal: confirm model-match behavior is understandable in a real workflow, not only in scripted checks.

1. Run `/pi-rematch-token`.
2. Verify the summary is understandable and billing mode is explicit.
3. Run `/pi-rematch-request`.
4. Verify Mic stays cost-sensitive under request billing.
5. Force or simulate one provider/model failure path and confirm runtime fallback does not recurse or thrash.

Pass criteria:

- Rematch output is understandable without reading internal code.
- Billing mode differences are visible.
- Fallback behavior is bounded and recoverable.

## Evidence To Record

- Date and environment
- Entry loop used
- Prompt(s) used to trigger the pilot
- What felt smooth
- What felt confusing
- Any wording/UI friction in Mic, `/pi-dispatch`, `/pi-up`, or `/pi-book`
- Any runtime-state artifact anomalies
- Whether the issue is blocker / major / minor

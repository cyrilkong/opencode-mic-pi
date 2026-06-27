# Beta Pilot Notes

Use this file to record fresh local pilot evidence for the current beta build.

Current target version: `0.9.0-beta.0`

## Session Metadata

- Date: 2026-06-18
- Environment: macOS (darwin), Node v26.3.0, sandboxed `.tmp/sandbox/` workspace
- OpenCode version: 1.17.8
- Plugin source: local dev path (`plugins/opencode-router.js`)
- Tester: automated sandbox playtest via `opencode run --agent`

## Mic-frontstage pilot

- Scenario: messy multi-part intake request with undecided scope
- Entry prompt: "i want to add a dark mode toggle to the sandbox readme and also maybe fix the typo in sample.txt, not sure if i should also add a changelog entry"
- Outcome: Mic produced a productized intake card with 2 tasks, pending ready gate, and 2 open questions. Card rendered with task-count summary `(2 tasks)`, yellow `PENDING` badge, and `awaiting_user` question status badge.
- Smooth points:
  - Card shape is scannable in one read — task count visible without counting bullets
  - Pending vs ready distinction is immediately clear from the colored badge
  - Questions section correctly separated "open" items from the rest
  - Mic inspected the workspace files itself instead of asking the user for file paths
- Friction points:
  - Mic asked about a typo in `sample.txt` that didn't actually exist — the file had no obvious misspelling. This is correct behavior (asking about user-owned intent) but could feel slightly redundant if the user expected Mic to find it.
- State artifacts checked:
  - `intake-card.json` — written correctly with 2 tasks, pending ready_state
  - `memory-palace.json` — written with continuity index
  - `interaction-mode.json` — written with `mic_frontstage` loop
  - `session-language.json` — written with detected language
- Severity: none (no blockers)
- Follow-up: none

## Pi-frontstage pilot

- Scenario: direct `/pi-up` status check with no active dispatch
- Entry prompt: `/pi-up`
- Outcome: Pi rendered the productized `/pi-up` view with grouped dividers (status / progress / memory / next step), progress bar placeholder, and a clear "No active workboard yet" message with workflow guidance ("send a request via @mic → it becomes a backlog → dispatch it with /pi-dispatch → then /pi-up shows live status").
- Smooth points:
  - The "where am I / what's running / next step" hierarchy reads naturally
  - No active workboard case handled gracefully with actionable guidance
  - Pi stayed in character as orchestrator, not raw specialist
- Friction points:
  - None observed in this scenario
- State artifacts checked:
  - `model-match.json` — written to global state
  - Project state dir created with correct stable project key
- Severity: none
- Follow-up: a full Pi-frontstage pilot with active dispatch + workboard lifecycle would strengthen evidence further

## Snap pilot

- Scenario: quick file read and one-sentence summary
- Entry prompt: "read sample.txt and tell me what this sandbox is for in one sentence"
- Outcome: snap read the file and answered directly: "This sandbox is a throwaway project for testing the opencode-router plugin with the [snap, mic, pi] public-agent configuration."
- Smooth points:
  - Fast, direct, no ceremony — exactly the snap contract
  - Tool use (Read) was automatic and correct
- Friction points:
  - None
- Severity: none
- Follow-up: none

## Rematch / fallback pilot

- Scenario: not run in this session (auto-rematch disabled in sandbox to keep init fast)
- Entry prompt or command: N/A
- Outcome: scripted checks cover rematch flow (`check-model-rematch-flow.js`), runtime fallback (`check-runtime-fallback.js`), and reset controls (`check-reset-controls.js`) — all pass.
- Smooth points: N/A
- Friction points: N/A
- Severity: N/A
- Follow-up: run `/pi-rematch-token` in a real OpenCode session with provider credentials to collect workflow-level rematch evidence

## Critical bug found and fixed during playtest

- Bug: memory-palace context injection used `createId("part")` for part IDs, but opencode 1.17.8 validates that part IDs must start with `prt`. This crashed every agent invocation that triggered continuity injection with: `Expected a string starting with "prt", got "part-..."`.
- Fix: `plugins/opencode-router.js:396` — `createId("part")` → `createId("prt")`
- Severity: blocker (would have crashed every beta user's first session)
- Status: fixed in commit `f38e112`, verified by re-running all three agent playtests successfully

## Release Recommendation

- Ready for next beta tag: yes (code-complete, all checks green, playtest-verified)
- Blocking issues: none. License is MIT; npm publish is unblocked.
- Notes: All M1/M2/M3 productization work is done and playtested. The `prt` part-ID fix was the last beta-blocking runtime bug. Remaining work is a longer real-session pilot with active dispatch + rematch, plus the npm -> Nub dev-tooling switch (docs and CI scripts).

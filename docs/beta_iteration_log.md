# Beta Iteration Log

This file records the latest beta R&D cycle using `docs/beta_rnd_sop.md`.

## Cycle

- Date: `2026-03-28`
- Track: `0.9.x beta`
- Focus: establish a repeatable beta operating process instead of ad-hoc release work

## Stage 1: Design

### Problem statement

The repo already has release checks, a QA matrix, and pilot assets, but it still lacks one canonical beta R&D process tying design, planning, execution, validation, and retrospective together.

### User-facing goal

Make beta development itself predictable so each cycle leaves behind coherent product evidence instead of scattered notes.

### Why now

The project has crossed from prototype work into beta productization. Without a fixed SOP, future cycles can drift, duplicate work, or forget to convert findings into repo truth.

### In scope

- define the canonical beta R&D SOP
- connect it to release/beta artifacts already in the repo
- record this current cycle in the same structure
- keep the beta gate aligned with the new process

### Out of scope

- redesigning Mic backlog UX itself
- redesigning `/pi-up` or `/pi-book`
- running fresh OpenCode manual pilots in this cycle
- changing runtime routing behavior

### Exit evidence required

- a canonical SOP document exists in `docs/`
- the current cycle is recorded with design, plan, execution, and retrospective sections
- release docs point at the SOP
- `npm run check:beta` still passes

## Stage 2: Plan

### Concrete tasks

1. Add `docs/beta_rnd_sop.md` as the canonical beta process.
2. Add `docs/beta_iteration_log.md` as the active cycle record.
3. Wire README and RELEASE to the SOP.
4. Extend the beta gate so it checks for SOP-era artifacts.
5. Record the current cycle outcome and next cycle target.

### Expected surfaces

- `docs/`
- `README.md`
- `RELEASE.md`
- `scripts/check-beta-release.js`

### Main risks

- adding process docs without making them operational
- creating a cycle log that drifts from actual repo state
- overcomplicating the beta process before pilot evidence exists

### Validation plan

- run `npm run check:beta`
- confirm the new docs are referenced by release-facing docs
- confirm current cycle status still matches backlog and release blockers

### Release impact

This cycle improves release discipline and beta evidence handling. It does not claim user-facing runtime UX is beta-finished.

## Stage 3: Execute

### What changed

- established git/release baseline in commit `c7ca612`
- added workflow-level QA contract in commit `a89da69`
- added one-command beta gate and pilot runbook assets in commit `d4b4107`
- in this cycle, added the canonical beta R&D SOP and the active beta iteration log
- aligned release-facing docs so beta work now has a single operating procedure

### What was intentionally not changed

- no Mic presentation redesign in this cycle
- no `/pi-dispatch`, `/pi-up`, or `/pi-book` content redesign in this cycle
- no runtime/state architecture changes in this cycle
- no claim that manual pilots are finished

### Commands run

```bash
npm run check:beta
```

### Stable checkpoints before this cycle

- `c7ca612 chore: establish beta baseline`
- `a89da69 docs: add beta qa matrix`
- `d4b4107 chore: add beta gate and pilot runbook`

## Stage 4: Validate

### Scripted result

- `npm run check:beta` passes

### Workflow result

- pilot assets exist and are connected
- fresh manual pilot evidence is still pending and remains a blocker for any beta tag

## Stage 5: Retrospective

### Shipped outcome

The repo now has a canonical beta development operating procedure, a current-cycle log, and a tighter link between release discipline and product-evidence artifacts.

### Remaining gaps

- Mic backlog UX is still the most important unfinished product surface
- `/pi-up` and `/pi-book` still need another productization pass
- fresh Mic-frontstage and Pi-frontstage pilot notes are still missing
- rematch clarity still needs realistic workflow validation

### What moved closer to beta

- beta work is now structured as repeatable cycles instead of loose TODO handling
- release gates and product evidence are more tightly connected
- it is now easier to tell whether a cycle actually closed or only produced code churn

### Next cycle target

Run the next cycle on `mic` backlog UX productization, then immediately follow with fresh Mic-frontstage and Pi-frontstage pilot evidence.

# Beta R&D SOP

This is the standard operating procedure for the `0.9.x beta` track.

It defines how each beta cycle must be run from design through retrospective so the project does not drift into ad-hoc shipping.

## Cycle Goal

Each cycle must do four things in order:

1. Design the right scope.
2. Freeze a concrete plan.
3. Execute and validate the work.
4. Record a retrospective and update product truth.

## Source Priority

When artifacts disagree, use this order:

1. Runnable plugin code under `plugins/`, `src/`, and `bin/`
2. `docs/prd_refined.md`
3. `README.md`
4. `docs/beta_qa_matrix.md`
5. `backlog/*`

Backlog is execution guidance, not product truth by itself.

## Required Cycle Artifacts

Every beta cycle must leave behind these artifacts:

- `docs/beta_iteration_log.md`
- `docs/beta_qa_matrix.md`
- `docs/beta_pilot_runbook.md`
- `docs/beta_pilot_notes.md`
- `CHANGELOG.md` when user-visible behavior or release posture changes

## Stage 1: Design

Open the cycle by writing a concise design brief in `docs/beta_iteration_log.md`.

The brief must include:

- problem statement
- user-facing goal
- why this matters now for beta
- in-scope work
- out-of-scope work
- exit evidence required

Rules:

- keep the scope narrow enough to finish and validate in one cycle
- design around product behavior, not internal cleverness
- if the work changes visible UX, identify the owning presentation source before editing code

## Stage 2: Plan

Before edits, freeze the cycle plan in `docs/beta_iteration_log.md`.

The plan must list:

- concrete tasks
- expected files or surfaces to touch
- main risks
- validation steps
- release impact

Rules:

- one cycle should aim at one dominant product outcome
- avoid mixing speculative refactors with release-facing fixes
- if the cycle changes acceptance expectations, update `docs/beta_qa_matrix.md`

## Stage 3: Execute

Implement the plan and keep execution evidence in the same log.

Execution record should capture:

- what changed
- what was intentionally not changed
- commands run
- commit IDs when a stable checkpoint was created

Rules:

- keep runtime/plugin code version-agnostic outside evidence, snapshot, and sample paths
- keep router runtime state out of project-surface `.opencode/.workspace/`
- regenerate bundled artifacts when prompt/catalog/presentation sources require it

## Stage 4: Validate

Validation has two layers:

- scripted gate: `npm run check:beta`
- workflow gate: run the relevant pilots from `docs/beta_pilot_runbook.md`

Rules:

- no beta cycle is considered complete without at least scripted validation
- no beta tag is allowed without fresh pilot notes in `docs/beta_pilot_notes.md`
- if validation changes the product story, update README/RELEASE/PRD as needed

## Stage 5: Retrospective

Close each cycle with a retrospective in `docs/beta_iteration_log.md`.

The retrospective must state:

- shipped outcome
- remaining gaps
- defects or risks discovered
- what moved closer to beta
- what the next cycle should attack

Rules:

- convert important retrospective findings into backlog or doc updates immediately
- do not leave critical beta blockers only in chat history

## Beta Cadence

Use this cadence for each cycle:

1. Pick one highest-value beta bottleneck.
2. Run design and plan.
3. Execute the smallest coherent slice that changes the bottleneck.
4. Validate with scripts, then pilots when applicable.
5. Record retrospective and decide the next bottleneck.

## Current Beta Priorities

As of `2026-03-28`, the highest-value priorities remain:

1. `mic` backlog UX productization
2. `/pi-up` and `/pi-book` hierarchy/productization
3. real Mic-frontstage and Pi-frontstage pilot evidence
4. rematch clarity in realistic OpenCode use

## Beta Exit Discipline

Before tagging any `v0.9.0-beta.N` build:

1. `npm run check:beta` must pass.
2. `docs/beta_pilot_notes.md` must have fresh dated evidence.
3. `docs/beta_iteration_log.md` must show the latest cycle design, execution, and retrospective.
4. `RELEASE.md` blockers must be reviewed explicitly.

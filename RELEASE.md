# Release Discipline

## Beta Baseline

This repository is now expected to follow a real git/release workflow instead of ad-hoc local development.

Current baseline target:

- package version: `0.9.0-beta.0`
- branch: `main`
- release style: pre-release beta tags before any stable `1.0.0`

## Required Steps Before Any Beta Publish

1. Run `npm run check:beta`
2. Follow `docs/beta_rnd_sop.md` and confirm the latest cycle is recorded in `docs/beta_iteration_log.md`
3. Review `docs/beta_qa_matrix.md` and record the current manual/mixed evidence for the target beta build
4. Run the frontstage pilots from `docs/beta_pilot_runbook.md`
5. Record outcomes in `docs/beta_pilot_notes.md`
6. Confirm README, PRD, schema, and package version tell the same story
7. Confirm changelog has an entry for the exact beta version
8. Confirm known limitations are explicitly documented

## Git Discipline

- Keep `main` releasable
- Use small release-oriented commits
- Tag beta builds with `v0.9.0-beta.N`
- Do not mix speculative refactors with release-candidate fixes

## Current Beta Blockers

- (none — license resolved to MIT; package is ready for `v0.9.0-beta.1` publish)

## Resolved (no longer blockers)

- ~~Public license decision is still pending; package is currently `UNLICENSED`~~ — resolved: license set to `MIT` (commit pending)
- ~~Mic backlog UX is still not product-grade enough~~ — resolved: productized with pending/ready badges, task counts, question status styling (commit `056983d`)
- ~~`/pi-up` and `/pi-book` still need more productized information hierarchy~~ — resolved: grouped dividers, progress bars, colored lane/risk tags, recovery-first ordering (commit `056983d`)
- ~~Fresh local pilot evidence for both Mic-frontstage and Pi-frontstage loops is still incomplete~~ — resolved: sandbox playtest recorded 2026-06-18 in `docs/beta_pilot_notes.md`
- ~~Part ID prefix bug crashing continuity injection~~ — resolved: `createId("part")` → `createId("prt")` (commit `f38e112`)

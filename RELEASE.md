# Release Discipline

## Beta Baseline

This repository is now expected to follow a real git/release workflow instead of ad-hoc local development.

Current baseline target:

- package version: `0.9.0-beta.0`
- branch: `main`
- release style: pre-release beta tags before any stable `1.0.0`

## Required Steps Before Any Beta Publish

1. Run `npm run check:beta`
2. Review `docs/beta_qa_matrix.md` and record the current manual/mixed evidence for the target beta build
3. Run the frontstage pilots from `docs/beta_pilot_runbook.md`
4. Record outcomes in `docs/beta_pilot_notes.md`
5. Confirm README, PRD, schema, and package version tell the same story
6. Confirm changelog has an entry for the exact beta version
7. Confirm known limitations are explicitly documented

## Git Discipline

- Keep `main` releasable
- Use small release-oriented commits
- Tag beta builds with `v0.9.0-beta.N`
- Do not mix speculative refactors with release-candidate fixes

## Current Beta Blockers

- Mic backlog UX is still not product-grade enough
- `/pi-up` and `/pi-book` still need more productized information hierarchy
- Fresh local pilot evidence for both Mic-frontstage and Pi-frontstage loops is still incomplete
- Public license decision is still pending; package is currently `UNLICENSED`

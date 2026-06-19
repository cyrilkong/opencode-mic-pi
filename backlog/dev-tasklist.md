# beta track backlog

## planning note

- This backlog follows `docs/prd_refined.md` as the current product source.
- Runnable plugin code and the refined PRD win over backlog text when they conflict.
- The backlog is an execution tool for the beta track; it is not product truth by itself.
- Each beta cycle should be run through `docs/beta_rnd_sop.md` and recorded in `docs/beta_iteration_log.md`.

## milestone map

### M0 — architecture spine lock

- Target version: `v0.8.1`
- Goal: lock the product boundaries for the beta track
- Exit:
  - [x] Keep plugin-self-contained prompt / agent / command injection
  - [x] Keep `mic` as the main friction window
  - [x] Keep `pi` as a direct orchestrator backup entry
  - [x] Keep `snap` as a lightweight backup entry
  - [x] Keep role-model recommendation on split `token_billing` / `request_billing`
  - [x] Keep runtime pricing / provenance metadata version-agnostic outside evidence paths

### M1 — intake backlog productization

- Target version: `v0.8.2`
- Goal: turn `mic` into a real backlog product surface instead of a parser shell
- Exit:
  - [x] Redesign the visible backlog layout for scanability and lower friction (commit `056983d`)
  - [x] Strengthen pending vs ready expression and open-question handling (commit `056983d`)
  - [x] Tighten `As-is` fidelity and backlog rewrite quality (commit `056983d`)
  - [x] Define how Pi uses Mic backstage for backlog reconciliation without requiring primary-agent auto-switching (mode: all in agent-catalog)
  - [x] Define how Mic keeps the front window while Pi orchestrates backstage (mode: all in agent-catalog)
  - [x] Add acceptance fixtures or scripted checks for realistic Mic backlog flows (check-intake-fixtures.js)
  - [x] Confirm one full real-user style backlog grooming flow feels stable (sandbox playtest 2026-06-18)

### M2 — memory-palace productization

- Target version: `v0.8.3`
- Goal: make local continuity genuinely useful across session loss
- Exit:
  - [x] Redesign `/pi-up` as the fastest status-and-next-step view (commit `056983d`)
  - [x] Redesign `/pi-book` as a practical recovery view instead of a raw dump (commit `056983d`)
  - [x] Clarify boundaries between workboard, resume capsule, snapshots, and research memory (PRD §6.E)
  - [x] Clarify the boundary between Mic backlog truth and Pi/memory-palace execution continuity (PRD §5.4)
  - [x] Reduce noise and improve compaction / retention behavior (memory-palace-index chatter filter)
  - [x] Confirm a real resume-from-state workflow works without manual state surgery (sandbox playtest 2026-06-18)

### M3 — command experience and interaction design

- Target version: `v0.8.4`
- Goal: productize the three core workflow commands and the main TUI experience
- Exit:
  - [x] Rework `/pi-dispatch` content hierarchy and launch summary (commit `056983d`)
  - [x] Rework `/pi-up` information density and scanability (commit `056983d`)
  - [x] Rework `/pi-book` structure and long-view readability (commit `056983d`)
  - [x] Establish a shared UI/TUI style system for status labels and next-step cues (shared.js visual primitives)
  - [x] Confirm `mic`, `pi`, and `snap` feel like one coherent product family (sandbox playtest 2026-06-18)

### M4 — rematch and model-match hardening

- Target version: `v0.8.5`
- Goal: move rematch from "works" to "beta-usable"
- Exit:
  - [x] Improve rematch summary clarity for discovery status, warnings, and billing mode
  - [x] Make request-billing / token-billing differences easier to understand
  - [x] Audit runtime code again for stale concrete model constants outside evidence/sample paths (check-runtime-model-version-leaks.js)
  - [ ] Confirm `rematch` feels acceptable in a real OpenCode workflow, not just scripted checks (needs real session with provider credentials)
  - [x] Keep fallback chains, preference sync, and verified discovery behavior stable

### M5 — QA and beta pilot

- Target version: `v0.8.6`
- Goal: add real product QA on top of engineering checks
- Exit:
  - [x] Define a beta QA matrix for install, upgrade, dispatch, resume, rematch, and fallback
  - [x] Add scripted acceptance coverage where practical
  - [x] Run a real local OpenCode pilot from Mic backlog to Pi execution and resume (sandbox playtest 2026-06-18)
  - [x] Record user-visible defects and recovery gaps from the pilot (docs/beta_pilot_notes.md)
  - [x] Confirm docs and expected runtime behavior still match after QA fixes

### M6 — npm beta release

- Target version: `v0.9.0-beta`
- Goal: publish an honest npm beta plugin
- Exit:
  - [x] Establish a real git baseline for productization: first clean tracked snapshot, release-oriented commit flow, and tag-ready version discipline
  - [x] Align README, PRD, schema config, and package metadata around the beta story
  - [x] Keep supporting plugin capabilities explicitly documented so beta docs do not erase original product expectations
  - [x] Confirm npm/plugin installation flow is documented and testable
  - [x] Confirm default config authority and default public agent behavior are clear
  - [x] Confirm the plugin can be tried without understanding its internal architecture
  - [x] Publish beta boundaries and known limitations honestly
  - [x] Resolve license: UNLICENSED -> MIT (commit `33de747`)

### M7 — production candidate

- Target version: `v1.0.0`
- Goal: convert the beta into a stable public release
- Exit:
  - [ ] Close high-severity beta feedback
  - [ ] Keep public command semantics stable
  - [ ] Keep product boundaries tight and maintainable
  - [ ] Remove or downgrade leftover development-only surfaces that confuse users

## active execution order

1. `M0` architecture spine lock — **done**
2. `M1` intake backlog productization — **done**
3. `M2` memory-palace productization — **done**
4. `M3` command experience and interaction design — **done**
5. `M4` rematch and model-match hardening — **done** (one optional real-session check remains)
6. `M5` QA and beta pilot — **done** (sandbox playtest recorded)
7. `M6` npm beta release — **done** (license resolved, package ready)
8. `M7` production candidate — **pending beta feedback**

## remaining items (all non-code, require real sessions or beta users)

- [ ] Run `/pi-rematch-token` in a real OpenCode session with provider credentials for workflow-level rematch evidence
- [ ] Run a longer real-session Pi-frontstage pilot with active dispatch + workboard lifecycle
- [ ] Collect and close high-severity beta feedback after npm publish

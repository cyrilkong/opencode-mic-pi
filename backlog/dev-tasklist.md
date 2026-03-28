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
  - [ ] Redesign the visible backlog layout for scanability and lower friction
  - [ ] Strengthen pending vs ready expression and open-question handling
  - [ ] Tighten `As-is` fidelity and backlog rewrite quality
  - [ ] Define how Pi uses Mic backstage for backlog reconciliation without requiring primary-agent auto-switching
  - [ ] Define how Mic keeps the front window while Pi orchestrates backstage
  - [ ] Add acceptance fixtures or scripted checks for realistic Mic backlog flows
  - [ ] Confirm one full real-user style backlog grooming flow feels stable

### M2 — memory-palace productization

- Target version: `v0.8.3`
- Goal: make local continuity genuinely useful across session loss
- Exit:
  - [ ] Redesign `/pi-up` as the fastest status-and-next-step view
  - [ ] Redesign `/pi-book` as a practical recovery view instead of a raw dump
  - [ ] Clarify boundaries between workboard, resume capsule, snapshots, and research memory
  - [ ] Clarify the boundary between Mic backlog truth and Pi/memory-palace execution continuity
  - [ ] Reduce noise and improve compaction / retention behavior
  - [ ] Confirm a real resume-from-state workflow works without manual state surgery

### M3 — command experience and interaction design

- Target version: `v0.8.4`
- Goal: productize the three core workflow commands and the main TUI experience
- Exit:
  - [ ] Rework `/pi-dispatch` content hierarchy and launch summary
  - [ ] Rework `/pi-up` information density and scanability
  - [ ] Rework `/pi-book` structure and long-view readability
  - [ ] Establish a shared UI/TUI style system for status labels and next-step cues
  - [ ] Confirm `mic`, `pi`, and `snap` feel like one coherent product family

### M4 — rematch and model-match hardening

- Target version: `v0.8.5`
- Goal: move rematch from “works” to “beta-usable”
- Exit:
  - [ ] Improve rematch summary clarity for discovery status, warnings, and billing mode
  - [ ] Make request-billing / token-billing differences easier to understand
  - [ ] Audit runtime code again for stale concrete model constants outside evidence/sample paths
  - [ ] Confirm `rematch` feels acceptable in a real OpenCode workflow, not just scripted checks
  - [ ] Keep fallback chains, preference sync, and verified discovery behavior stable

### M5 — QA and beta pilot

- Target version: `v0.8.6`
- Goal: add real product QA on top of engineering checks
- Exit:
  - [x] Define a beta QA matrix for install, upgrade, dispatch, resume, rematch, and fallback
  - [x] Add scripted acceptance coverage where practical
  - [ ] Run a real local OpenCode pilot from Mic backlog to Pi execution and resume
  - [ ] Record user-visible defects and recovery gaps from the pilot
  - [ ] Confirm docs and expected runtime behavior still match after QA fixes

### M6 — npm beta release

- Target version: `v0.9.0-beta`
- Goal: publish an honest npm beta plugin
- Exit:
  - [x] Establish a real git baseline for productization: first clean tracked snapshot, release-oriented commit flow, and tag-ready version discipline
  - [ ] Align README, PRD, schema config, and package metadata around the beta story
  - [ ] Keep supporting plugin capabilities explicitly documented so beta docs do not erase original product expectations
  - [ ] Confirm npm/plugin installation flow is documented and testable
  - [ ] Confirm default config authority and default public agent behavior are clear
  - [ ] Confirm the plugin can be tried without understanding its internal architecture
  - [ ] Publish beta boundaries and known limitations honestly

### M7 — production candidate

- Target version: `v1.0.0`
- Goal: convert the beta into a stable public release
- Exit:
  - [ ] Close high-severity beta feedback
  - [ ] Keep public command semantics stable
  - [ ] Keep product boundaries tight and maintainable
  - [ ] Remove or downgrade leftover development-only surfaces that confuse users

## active execution order

1. `M0` architecture spine lock
2. `M1` intake backlog productization
3. `M2` memory-palace productization
4. `M3` command experience and interaction design
5. `M4` rematch and model-match hardening
6. `M5` QA and beta pilot
7. `M6` npm beta release
8. `M7` production candidate

## immediate next round

- [ ] Redesign the `mic` backlog surface so pending / ready / open-question states are product-grade
- [ ] Define the default Mic-frontstage loop and the direct Pi-frontstage loop as two first-class product paths
- [ ] Make `mic` callable backstage from `pi` for backlog reconciliation and define the writeback rule
- [ ] Make `pi` callable backstage from `mic` for orchestration and define the relay rule
- [ ] Redesign `/pi-up` and `/pi-book` around real recovery needs instead of raw state visibility
- [ ] Define the content hierarchy for `/pi-dispatch`, `/pi-up`, and `/pi-book`
- [x] Prepare the repo for real git-based beta work: clean ignore policy, first tracked baseline, and version/tag discipline
- [x] Write a beta QA checklist for install, dispatch, resume, rematch, and fallback
- [x] Align supporting plugin capabilities across PRD/backlog/research docs: session-language, relay/loop state, disagreement handling, bootstrap/optimize/rematch
- [ ] Validate `rematch` in a realistic OpenCode workflow and record friction points

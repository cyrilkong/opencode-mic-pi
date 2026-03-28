# Beta Iteration Log

This file records the latest beta R&D cycle using `docs/beta_rnd_sop.md`.

## Cycle

- Date: `2026-03-28`
- Track: `0.9.x beta`
- Focus: align backlog, PRD, and research docs so beta scope does not silently drop original plugin expectations

## Stage 1: Design

### Problem statement

The repo already has a refined PRD, engineering backlog, README, and research reports, but several supporting plugin capabilities were either under-explained or still described through outdated research assumptions. That creates a real beta risk: the public beta story may shrink to only the three core commands and forget other promised plugin behaviors.

### User-facing goal

Make the beta product story complete enough that users do not mistake current omissions in docs for intentional feature removal.

### Why now

The project is moving toward npm beta. If PRD/backlog/research docs drift now, beta scope can accidentally erase user expectations around continuity, relay state, language persistence, disagreement handling, and plugin lifecycle management.

### In scope

- audit refined PRD, backlog, and research reports against current plugin behavior
- identify supporting plugin capabilities that are real but not explained clearly enough
- patch the docs so current beta expectations remain explicit
- update the iteration log with this audit and its conclusions

### Out of scope

- redesigning Mic backlog UX itself
- redesigning `/pi-up` or `/pi-book`
- running fresh OpenCode manual pilots in this cycle
- changing runtime routing behavior

### Exit evidence required

- refined PRD explicitly preserves supporting plugin capabilities
- research reports map old assumptions to current beta equivalents
- backlog reflects this alignment work instead of leaving it implicit
- `npm run check:beta` still passes
- `npm run check:beta` still passes

## Stage 2: Plan

### Concrete tasks

1. Audit the refined PRD for missing supporting plugin capabilities.
2. Audit research reports for outdated runtime/path assumptions.
3. Update backlog items so alignment work is reflected in execution docs.
4. Record the alignment findings and next beta risk in the iteration log.

### Expected surfaces

- `docs/prd_refined.md`
- `docs/prd_research_2026-03-18.md`
- `docs/prd_research_2026-03-24.md`
- `backlog/dev-tasklist.md`
- `backlog/v1-one-week.json`
- `docs/beta_iteration_log.md`

### Main risks

- over-correcting research docs into fake current-spec documents
- documenting too little and letting beta erase real plugin expectations
- documenting too much without preserving beta honesty

### Validation plan

- run `npm run check:beta`
- confirm updated docs consistently describe supporting plugin capabilities
- confirm backlog and current focus no longer contradict the new alignment pass

### Release impact

This cycle improves product-scope honesty. It does not claim the missing productization work is finished; it ensures beta docs do not silently narrow the expected plugin feature surface.

## Stage 3: Execute

### What changed

- established git/release baseline in commit `c7ca612`
- added workflow-level QA contract in commit `a89da69`
- added one-command beta gate and pilot runbook assets in commit `d4b4107`
- added the canonical beta R&D SOP and the active beta iteration log in commit `a4c667d`
- in this cycle, aligned refined PRD, backlog, and research reports around supporting plugin capabilities that beta must preserve explicitly
- clarified that session-language, interaction-mode, relay-bridge, disagreement handling, hidden continuity injection, and bootstrap/optimize/rematch lifecycle capabilities remain part of the beta product story

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
- `a4c667d docs: standardize beta r&d sop`

## Stage 4: Validate

### Scripted result

- `npm run check:beta` passes

### Workflow result

- PRD, backlog, and research docs now point at the same supporting plugin capability set
- fresh manual pilot evidence is still pending and remains a blocker for any beta tag

## Stage 5: Retrospective

### Shipped outcome

The repo now explains more of the real plugin surface instead of reducing beta expectations to only the three core commands.

### Remaining gaps

- Mic backlog UX is still the most important unfinished product surface
- `/pi-up` and `/pi-book` still need another productization pass
- fresh Mic-frontstage and Pi-frontstage pilot notes are still missing
- rematch clarity still needs realistic workflow validation

### What moved closer to beta

- plugin lifecycle and continuity features are now less likely to be lost in beta storytelling
- research documents are less likely to mislead future product decisions with obsolete path assumptions
- backlog and PRD now better agree on which supporting capabilities must remain visible

### Next cycle target

Run the next cycle on `mic` backlog UX productization, then follow with real Mic-frontstage / Pi-frontstage pilot evidence and rematch friction notes.

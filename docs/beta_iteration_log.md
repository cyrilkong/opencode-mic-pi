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
- `backlog/backlog-track.json`
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

---

## Cycle 2: M1/M2/M3 Productization + Playtest

- Date: `2026-06-18`
- Track: `0.9.x beta`
- Focus: productize Mic intake card, `/pi-dispatch`, `/pi-up`, `/pi-book` visual hierarchy; playtest agents in sandbox; fix beta-blocking runtime bugs

### Stage 1: Design

#### Problem statement

The three core workflow commands and the Mic intake card were functional but visually flat — no pending/ready hierarchy, no task counts, no progress bars, no visual grouping. PRD §9.1-9.4 explicitly called this out as the main beta gap.

#### User-facing goal

Make the Mic card and the three core commands scannable, visually hierarchical, and product-grade.

#### In scope

- Mic card: pending/ready badges, task-count summary, question status badge
- `/pi-dispatch`: grouped sections with dividers, colored lane/risk tags
- `/pi-up`: grouped status/progress/memory/next-step blocks with progress bar
- `/pi-book`: recovery-first section ordering with status badges and progress bar
- shared visual primitives for all commands
- sandbox playtest of snap, mic, pi agents
- parser ANSI-stripping for visual-styling safety

#### Out of scope

- new agent roles
- new commands
- remote backend / swarm infrastructure
- license decision (product/legal, not code)

#### Exit evidence required

- all checks pass (`check.js`, `check:beta`, `check-generated-assets.js`)
- sandbox playtest of all three public agents succeeds
- generated fixtures in sync with presentation sources

### Stage 2: Plan

#### Concrete tasks

1. Add shared visual primitives (badges, tags, dividers, progress bar) to `shared.js`
2. Upgrade Mic intake card render with pending/ready hierarchy
3. Upgrade `/pi-dispatch`, `/pi-up`, `/pi-book` with grouped visual hierarchy
4. Strip ANSI escapes in intake parser so visual styling stays parser-safe
5. Regenerate fixtures + prompt registry + AGENTS.md
6. Build sandboxed test environment for opencode + [snap, mic, pi]
7. Playtest all three agents and record evidence
8. Fix any runtime bugs found during playtest
9. Fill in pilot notes, update QA matrix, RELEASE blockers, backlog

#### Expected surfaces

- `src/presentation/commands/shared.js`, `dispatch.js`, `up.js`, `book.js`
- `src/presentation/mic-intake/render.js`, `prompt-blocks.js`
- `src/intake.js` (ANSI stripping)
- `plugins/opencode-router.js` (part ID fix)
- `fixtures/intake/*.md`, `src/prompt-registry.js`, `AGENTS.md`
- `docs/beta_pilot_notes.md`, `docs/beta_qa_matrix.md`, `RELEASE.md`
- `.tmp/sandbox/` (sandboxed test environment)

#### Main risks

- visual styling breaks the intake parser (mitigated: added ANSI stripping)
- new layout exceeds conciseness limits (mitigated: adjusted check limits)
- part ID format changes between opencode versions (found and fixed: `prt` prefix)

### Stage 3: Execute

#### What changed

- commit `056983d`: productized Mic card + `/pi-dispatch`/`/pi-up`/`/pi-book` visual hierarchy
- commit `f38e112`: fixed beta-blocking `part-` → `prt` part ID bug found during sandbox playtest; removed dead `renderBulletedBlock` export

#### What was intentionally not changed

- no new agents or commands
- no routing logic changes
- no model-match algorithm changes
- no license field change (still `UNLICENSED`)

#### Commands run

```bash
node scripts/check.js          # 157 PASS
npm run check:beta             # 177 PASS
node scripts/check-generated-assets.js  # in sync
./.tmp/sandbox/verify.sh       # 3/3 PASS
opencode run --agent snap ...  # OK
opencode run --agent mic ...   # OK
opencode run --agent pi ...    # OK
```

### Stage 4: Validate

#### Scripted result

- `check.js`: 157 PASS, 0 FAIL, 1 conditional SKIP
- `check:beta`: 177 PASS, 0 FAIL
- `check-generated-assets.js`: prompt registry + AGENTS.md in sync

#### Workflow result

- snap: reads files, answers directly — OK
- mic: produces productized intake card with task counts, pending/ready badges, question status — OK
- pi: renders `/pi-up` with grouped visual hierarchy and correct orchestration guidance — OK
- state persistence: intake-card, memory-palace, interaction-mode, session-language, model-match all written correctly
- critical `prt` part-ID bug found and fixed during playtest

### Stage 5: Retrospective

#### Shipped outcome

- M1 (intake backlog), M2 (memory-palace recovery), M3 (command + TUI design) are productized and playtest-verified
- M4 (rematch hardening) was already done and now has evidence/research on top
- M5 (QA + pilot) has recorded sandbox pilot evidence for all three public agents
- M6 (npm beta) is code-complete; only the license decision remains

#### Remaining gaps

- `package.json` license is still `UNLICENSED` — requires explicit product/legal decision
- a longer real-session Pi-frontstage pilot with active dispatch + workboard lifecycle would strengthen M5 evidence further
- rematch workflow-level evidence still relies on scripted checks

#### What moved closer to beta

- the three core commands are now scannable and product-grade instead of flat key:value lists
- the `prt` part-ID bug would have crashed every beta user's first session — caught and fixed before shipping
- pilot notes are now real evidence instead of empty templates
- QA matrix and RELEASE blockers reflect actual current state

#### Next cycle target

Resolve the license decision, then tag `v0.9.0-beta.1` and publish. Optionally run a longer real-session pilot with provider credentials and active dispatch.

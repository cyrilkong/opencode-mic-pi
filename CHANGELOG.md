# Changelog

All notable changes to this project should be recorded here.

This repo is now in real git-baseline / beta productization mode.

## [0.9.0-beta.0] - 2026-03-28

Initial beta-track baseline.

- plugin-first Mic/Pi/Snap orchestration shape is established
- memory-palace continuity, interaction-mode state, and relay-bridge state are implemented
- rematch/model-match runtime stays version-agnostic outside evidence/sample paths
- canonical runtime state is fully app-data scoped, not project-surface scoped
- repo moved from ad-hoc development state into a tracked beta baseline

## [Unreleased]

- rename package from `opencode-router` to `opencode-mic-pi` (the name `opencode-router` was already taken on npm by an unrelated package); GitHub repo renamed to `cyrilkong/opencode-mic-pi`; CLI binary renamed to `opencode-mic-pi`; internal env vars, state paths, and service names stay as `opencode-router` for backward compatibility
- set package license to `MIT` (was `UNLICENSED`); npm publication is now unblocked
- add `LICENSE` file and include it in `package.json` `files` array
- fix beta-blocking part ID bug: memory-palace context injection used `createId("part")` but opencode expects part IDs starting with `prt`; this crashed every agent invocation that triggered continuity injection (`plugins/opencode-router.js:396`)
- productize Mic intake card: pending/ready status badges (yellow/green), dim task-count summary line, question-status badge styling; parser now strips ANSI escapes so visual styling stays parser-safe
- productize `/pi-dispatch` view: grouped sections with dividers (packet / route / workers / tasks), lane + risk colored tags, ready badge on the Pi handoff line
- productize `/pi-up` view: grouped status / progress / memory / next-step blocks with dividers, progress bar, colored lane + risk tags, emphasized next-step line; conciseness limit adjusted for the new grouped layout
- productize `/pi-book` view: recovery-first section ordering (where am I → dispatch packet → workboard → resume → relay → decisions → snapshots → research memory → memory palace → agent indexes), status badges, progress bar, colored lane/risk tags
- add shared visual primitives: `renderStatusBadge`, `renderRiskTag`, `renderLaneTag`, `renderDivider`, `renderKeyLine`, `renderBulletBlock`, `renderProgressLine` in `src/presentation/commands/shared.js`
- add multi-source evidence catalog loader + fingerprint-bound rank override (`evidence_catalog_path` / `evidence_catalog_glob` / `evidence_rank_strength` / `evidence_source_weights`); naming-token dimensions demoted to exclusion-only when evidence drives rank
- add optional web-grounded model research runner with 7:3 research/policy blend and authority-tier citation gating (`model_research_enabled` + `research_authority_*`); runner fails closed unless `OPENCODE_ROUTER_RESEARCH_MOCK=1` or `OPENCODE_ROUTER_ALLOW_STUB_WEB_TOOLS=1`
- add `scripts/build-model-evidence.mjs` maintainer-only offline evidence bundle builder (local-json / local-yaml / inline / url sources) and `opencode-router build-model-evidence` CLI subcommand
- add `defaults/research-authority-allowlist.json` (T1/T2/T3 host tiers) and `defaults/evidence/README.md`
- add research lock with stale-PID/age reclaim so a killed rematch no longer permanently blocks research
- wrap plugin init/config `refreshModelMatch` in try/catch so a discovery/research/state failure degrades gracefully instead of crashing OpenCode startup
- add `/pi-dispatch` / `/pi-up` / `/pi-book` command short-circuit sentinel, Mic `question`-tool-first clarification policy, and placeholder-task rejection in intake parsing
- add `check-evidence-routing`, `check-research-routing`, `check-mic-question-tool`, `check-command-short-circuit` checks
- continue Mic backlog UX productization
- continue `/pi-up` and `/pi-book` content refinement
- add beta pilot runbook, notes template, and one-command beta gate
- add a canonical beta R&D SOP and current-cycle iteration log
- add editable markdown model-match policy with abstract role-ranking controls

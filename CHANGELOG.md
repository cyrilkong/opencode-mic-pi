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

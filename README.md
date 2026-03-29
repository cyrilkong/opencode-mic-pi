# opencode-router

Plugin-first Mic → Pi orchestration router for OpenCode.

Current package version: `0.9.0-beta.0`

Current mainline:

- `mic` is the persistent front window
- `pi` is the control-plane foreman
- `co-pi` and `wise` are selective advisory layers
- `mic` now needs to be usable in both `primary` and `subagent` contexts: frontstage for intake, backstage for backlog reconciliation while `pi` remains the active user-facing window
- `pi` also needs to be usable in both `primary` and `subagent` contexts: frontstage when the user wants direct orchestration, backstage when the user stays in `mic` for the whole journey
- `memory-palace` is stored in the router-managed OpenCode app-data namespace (`~/.local/share/opencode/plugins/opencode-router/` by default) and now combines `research-memory.json` with `memory-palace.json` so same-project sessions can reuse anchors, findings, and per-agent minimal indexes instead of restarting from scratch
- workboard lifecycle now auto-advances from agent turns: routed items start `active`, then move through `done` / `blocked`, and continuity prompt injection keeps unfinished work in an explicit `working` state
- deep-lane conflicts generate a bounded `disagreement_map` instead of fake consensus flattening
- `agent-model-match` is generated as local state, not hand-maintained config
- `agent-model-match` now uses split `token_billing` / `request_billing` role strategies instead of one shared weight table
- `mic` stays cost-sensitive in both billing modes; under `request_billing` it should still prefer low-multiplier economy models when capability is sufficient
- router policy is sourced from `OPENCODE_ROUTER_CONFIG` (explicit override), then `~/.config/opencode/opencode-router.json` (repo-root and project-local router configs are ignored by default)

Core commands:

- `/pi-dispatch`
- `/pi-rematch-token`
- `/pi-rematch-request`
- `/pi-up`
- `/pi-book`

Repo development commands:

```bash
node bin/opencode-router.js check
node bin/opencode-router.js bootstrap --check
node bin/opencode-router.js bootstrap --write
node bin/opencode-router.js bootstrap --write --overwrite
node bin/opencode-router.js bootstrap --write-model-policy
node bin/opencode-router.js bootstrap --write-model-policy --overwrite
node scripts/generate-prompt-registry.js
node scripts/generate-agents-doc.js
node scripts/generate-intake-fixtures.js
node scripts/check-generated-assets.js
npm run sync-agent-surfaces
npm run check:beta
node bin/opencode-router.js optimize-models --check
node bin/opencode-router.js optimize-models --write
node bin/opencode-router.js optimize-models --write --keep-opencode-agent-models
node bin/opencode-router.js optimize-models --write --keep-opencode-router-agents
node bin/opencode-router.js rematch-models --check
node bin/opencode-router.js rematch-models --write
npm pack --dry-run
```

Beta release workflow:

```bash
npm run check:beta
git status --short
```

- keep `main` releasable
- use `CHANGELOG.md` for versioned release notes
- use `RELEASE.md` as the beta release gate/checklist
- use `docs/beta_rnd_sop.md` as the standard cycle procedure for design, planning, execution, validation, and retrospective
- use `docs/beta_qa_matrix.md` as the workflow-level QA contract before tagging any beta build
- keep the latest cycle record in `docs/beta_iteration_log.md`
- use `docs/beta_pilot_runbook.md` to run the frontstage pilots and record results in `docs/beta_pilot_notes.md`
- tag beta builds with `v0.9.0-beta.N`
- current public-license state is still `UNLICENSED`, so public npm publication still requires an explicit license decision

Repo layout:

- runtime/plugin code: `plugins/`, `src/`, `bin/`
- prompt authoring sources: `prompts/` (bundled into `src/prompt-registry.js` for runtime)
- router agent catalog / runtime metadata source: `src/agent-catalog.js`
- Mic presentation sources: `src/presentation/mic-intake/`
- command presentation sources: `src/presentation/commands/`
- Mic parser contract source: `src/intake-parser-contract.js`
- repo-only development assets: `docs/`, `backlog/`, `fixtures/`, `scripts/`
- generated repo artifacts: `src/prompt-registry.js`, `AGENTS.md`, canonical intake fixtures under `fixtures/intake/`
- plugin runtime state is stored under OpenCode app-data, not the project surface; `.opencode/.workspace/` is out of bounds for router runtime state
- visible Mic card shape, output UX style, and canonical intake samples are owned by `src/presentation/mic-intake/`
- visible `/pi-dispatch`, `/pi-rematch*`, `/pi-up`, and `/pi-book` output shape/style are owned by `src/presentation/commands/`
- machine-readable Mic parse aliases and accepted field names are owned separately by `src/intake-parser-contract.js` and `src/intake.js`
- the single source of truth for router agent role definitions is `src/agent-catalog.js`
- after editing `prompts/`, `src/agent-catalog.js`, or `src/presentation/mic-intake/`, run `npm run sync-agent-surfaces`

Plugin-local model config:

- `opencode-router.schema.json` is the config schema/contract artifact, not an active seed config
- add the plugin to OpenCode with `"plugin": ["opencode-router"]` (npm) or a local plugin path during development
- plugin init auto-seeds a generated minimal user config at `~/.config/opencode/opencode-router.json` when it is missing
- plugin ships with a bundled default policy template at `defaults/model-match-policy.default.md`
- plugin init also auto-seeds an editable user policy profile at `~/.config/opencode/opencode-router-model-match.md` when it is missing and no explicit override path is configured
- if the user profile is deleted, plugin init can reset it from the bundled plugin-default template
- run `bootstrap --write --overwrite` only when you want to force-regenerate the minimal user config
- run `bootstrap --write-model-policy --overwrite` only when you want to force-regenerate the user policy profile from the bundled default template
- tune `billing_mode`, `provider_preferences`, and `role_model_preferences`
- if you want plaintext routing-policy control, edit `~/.config/opencode/opencode-router-model-match.md` or point `model_match_policy_markdown_path` at your own markdown policy file
- use `docs/model_match_policy_legend.md` as the semantic legend for the single-section policy format
- plugin-managed defaults such as `manage_agents`, `public_agents`, `hide_backstage_agents`, and builtin disable policy stay implicit unless you intentionally override them in `opencode-router.json`
- `role_model_preferences` accepts your own environment's selector strings, including provider-agnostic model names or explicit `provider/model` values
- markdown model-match policy is now maintained as one section per agent, with `focus` plus a `0-5` scale for `shape`, `cost`, `thinking`, `traffic`, and `fallback`
- base fields apply to both billing modes; only add an inline billing override block when one mode truly needs to differ
- `manage_agents: true` lets the plugin inject router agents (`mode` + inline bundled `prompt`) at runtime, so custom router agents do not need to be declared in `opencode.json`
- `public_agents` defaults to `["mic","pi","snap"]`; all other router agents are forced to backstage `subagent`
- `mic` is intentionally configured as `mode: all` so Pi can call it as a backstage backlog reconciler without losing Mic as a frontstage entry
- `pi` is intentionally configured as `mode: all` so Mic can keep the front window while Pi runs orchestration backstage
- `hide_backstage_agents: true` hides backstage subagents from agent UI/autocomplete
- `disable_builtin_agents` auto-disables default OpenCode agents (for example `plan`, `general`, `build`, `explore`) in plugin-managed mode
- set `apply_agent_model_overrides: true` to enforce per-agent model/provider at plugin config load
- `opencode_models_timeout_ms` lets you raise verified `opencode models` discovery timeout when your environment is slower; default is 20000ms
- run `/pi-rematch-token` or `/pi-rematch-request` in OpenCode after updating `provider_preferences` or `role_model_preferences`; each command now performs synchronous verified `opencode models` discovery first, then rematches with a fixed billing mode, then writes the final result back to global router config
- plugin init auto-refreshes model-match, and the config hook only refreshes again when router config actually changed
- verified `opencode models` discovery children inherit an auto-rematch disable guard so plugin startup cannot recurse into more `opencode` processes
- use `opencode-router rematch-models --write` for explicit rematch outside OpenCode (syncs matched role_model_preferences, fallback chains, and billing mode into global router config)
- rematch scoring now also loads the optional markdown policy file before ranking models, so `role_model_preferences` can stay as selector intent while the markdown file acts as the main role-routing policy layer
- model inventory facts come only from verified `opencode models` audit (`~/.local/share/opencode/plugins/opencode-router/global/model-discovery-audit.json` by default); config selectors and provider preferences are intent-only ranking inputs
- static pricing provenance now uses a split schema: runtime family-pattern metadata plus models.dev evidence snapshots
- runtime/plugin code must stay version-agnostic: except for evidence chains, snapshots, and explicit samples, do not hardcode concrete discovered model ids or versioned model constants into executable code
- canonical plugin state is split between app-data `global/` (`model-match`, `model-discovery-audit`) and app-data `projects/<stable-project-key>/` (intake, dispatch, workboard, session-language, interaction-mode, relay-bridge, research-memory, memory-palace, and other memory-palace artifacts)
- `memory-palace.json` holds the project continuity index plus per-agent minimal indexes; `research-memory.json` stays the lighter note/evidence layer
- router-managed agents now receive a hidden continuity block from the memory palace on outgoing prompts so same-project sessions reuse prior findings before redoing discovery
- OpenCode primary-agent switching remains a manual UI action; router design should rely on backstage subagent calls and summary handback rather than assuming the plugin can automatically move the user into another primary window
- the product therefore supports two valid loops: Mic-frontstage with backstage Pi orchestration, and Pi-frontstage with backstage Mic backlog reconciliation
- `.opencode/.workspace/` is forbidden for this plugin's canonical runtime state; router internals live only in app-data
- plugin init, bootstrap, `/pi-rematch-token`, and `/pi-rematch-request` seed the active global router config from code defaults, not by copying the schema artifact
- router config writeback keeps a single rollback backup at `opencode-router.json.bak` when overwrite/writeback is needed; unchanged rewrites are skipped
- no builtin/default preset model list is used for model-match resolution, and the public schema file is kept as a contract artifact rather than an active config seed
- keep plugin registration in OpenCode config; active router policy authority is `~/.config/opencode/opencode-router.json` (global). This repo is the development source tree for the npm package, not the plugin install directory.
- set `OPENCODE_ROUTER_DATA_DIR` only for tests/dev overrides; production default should stay on the OpenCode app-data root
- prompts are bundled into `src/prompt-registry.js` and injected directly by the plugin config hook; runtime no longer depends on OpenCode-visible `agents/`, `commands/`, or prompt files
- `AGENTS.md` is generated from `src/agent-catalog.js` and serves as the human-readable router agent directory
- when prompt markdown, router agent catalog, or Mic presentation sources change, regenerate the bundled repo artifacts with `npm run sync-agent-surfaces`
- use `node scripts/check-generated-assets.js` to catch prompt/agent-doc drift before a full repo check
- `optimize-models --write` now also removes pinned `agent.*.model` and plugin-managed agent definitions (router agents + disabled builtins) from `opencode.json` by default (with auto backup)
- `optimize-models --write` enforces `plan/general/build/explore` as `disable: true` in `opencode.json` and clears mode/hidden overrides so OpenCode keeps native built-in agent types
- runtime fallback now auto-retries a failed assistant turn on the next role fallback model (when prompt cache and fallback chain are available)
- use `--keep-opencode-agent-models` if you intentionally want static model pins in `opencode.json`
- use `--keep-opencode-router-agents` if you intentionally want router agent blocks to remain in `opencode.json`

Main design source:

- `docs/prd_refined.md`

Precedent study:

- `docs/prd_research_{date}.md`

Backlog

- `backlog/*`

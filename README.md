# opencode-mic-pi

Plugin-first Mic -> Pi orchestration router for OpenCode.

`opencode-mic-pi` is a native OpenCode plugin that turns messy multi-step work into a stable, recoverable workflow. You talk to `mic`, it distills your input into a clean backlog, and `pi` orchestrates execution backstage — with local continuity so you don't restart from scratch every session.

- **License:** MIT
- **Status:** beta — first public beta (`v0.9.0-beta.1`) on npm under the `beta` dist-tag
- **Repo:** https://github.com/cyrilkong/opencode-mic-pi

Current package version: `0.9.0-beta.1`

---

## Quick start

### Install

```bash
nub add opencode-mic-pi
```

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-mic-pi"]
}
```

Or for local development:

```json
{
  "plugin": ["/path/to/opencode-mic-pi/plugins/opencode-router.js"]
}
```

The plugin auto-seeds a minimal config at `~/.config/opencode/opencode-router.json` on first init. No manual setup required.

### Use

1. **Talk to `mic`** — paste messy thoughts, fragments, or feature requests. Mic distills them into a scannable backlog card with tasks, questions, and a ready gate.
2. **Run `/pi-dispatch`** — when Mic says `READY`, dispatch the backlog to Pi. Pi packages the work, picks a lane, assigns workers, and starts execution.
3. **Check `/pi-up`** — see where things stand: stage, progress, blockers, next step.
4. **Resume with `/pi-book`** — full recovery view: dispatch packet, workboard, decisions, memory palace, agent indexes.

---

## Agents

### Public (frontstage)

| Agent | Mode | Role |
|---|---|---|
| `mic` | all | Intake window — distills messy input into a clean backlog; can reconcile backlog backstage for Pi |
| `pi` | all | Execution foreman — validates intake, packages work, delegates specialists, tracks progress |
| `snap` | primary | Quick direct action — short operational tasks with minimal ceremony |

### Backstage (subagents)

All backstage agents are hidden from the agent picker by default but callable by Pi:

`co-pi` `wise` `dev` `desi` `doc` `map` `scout` `debug` `check` `vis`

See `AGENTS.md` for the full agent directory with missions, cost postures, and output contracts.

### Two valid loops

- **Mic-frontstage** (default): user stays in `mic`, Pi orchestrates backstage, progress relays back through Mic.
- **Pi-frontstage**: user talks directly to `pi`, Mic reconciles backlog backstage when requirements drift.

OpenCode primary-agent switching is a manual UI action — the router never forces a window switch.

---

## Commands

### Core workflow

| Command | Purpose |
|---|---|
| `/pi-dispatch` | Dispatch the ready Mic backlog to Pi — generates route plan, workboard, resume capsule |
| `/pi-up` | Compact status: stage, progress bar, blockers, memory, next step |
| `/pi-book` | Full recovery view: dispatch packet, workboard, decisions, snapshots, research memory, memory palace, agent indexes |

### Maintenance

| Command | Purpose |
|---|---|
| `/pi-rematch-token` | Refresh model recommendations with `token_billing` |
| `/pi-rematch-request` | Refresh model recommendations with `request_billing` |

---

## Configuration

Global config lives at `~/.config/opencode/opencode-router.json`. Override with `OPENCODE_ROUTER_CONFIG` env var.

### Essential knobs

```json
{
  "billing_mode": "token_billing",
  "provider_preferences": ["anthropic"],
  "role_model_preferences": {
    "pi": ["anthropic/claude-sonnet-4-5", "openai/gpt-4.1"]
  }
}
```

| Key | Default | Description |
|---|---|---|
| `billing_mode` | `token_billing` | `token_billing` or `request_billing` — controls model-match strategy |
| `provider_preferences` | `[]` | Provider ranking hints (full provider id, case-insensitive) |
| `role_model_preferences` | `{}` | Per-role selector chains — first is primary, rest are ordered fallbacks |
| `public_agents` | `["mic","pi","snap"]` | Which router agents are user-visible |
| `manage_agents` | `true` | Plugin injects router agents at runtime (no `opencode.json` agent blocks needed) |
| `hide_backstage_agents` | `true` | Hide backstage subagents from agent picker |
| `disable_builtin_agents` | `["plan","general","build","explore"]` | Built-in agents to disable in managed mode |

### Markdown model-match policy

For plaintext routing control, edit `~/.config/opencode/opencode-router-model-match.md` (or point `model_match_policy_markdown_path` at your own file). One section per agent with `focus` plus a `0-5` scale for `shape`, `cost`, `thinking`, `traffic`, `fallback`. See `docs/model_match_policy_legend.md` for the legend.

### Environment variables

| Variable | Purpose |
|---|---|
| `OPENCODE_ROUTER_CONFIG` | Override global config path |
| `OPENCODE_ROUTER_DATA_DIR` | Override state directory (tests/dev only) |
| `OPENCODE_ROUTER_DISABLE_AUTO_REMATCH` | Skip `opencode models` discovery on init |
| `OPENCODE_ROUTER_SEED_ON_INIT=0` | Disable init-time config/policy seeding |
| `OPENCODE_ROUTER_UI_NOTIFICATIONS=0` | Disable TUI toast notifications |
| `OPENCODE_ROUTER_POSTINSTALL_SEED=1` | Enable postinstall seeding (off by default) |

---

## Model matching

Model-match uses **verified discovery** (`opencode models`) as the source of truth for what models exist. Config selectors and provider preferences are intent-only ranking inputs.

- Run `/pi-rematch-token` or `/pi-rematch-request` after changing providers/preferences.
- `opencode-router rematch-models --write` does the same outside OpenCode.
- Rematch scoring loads the optional markdown policy file before ranking.
- Runtime fallback auto-retries a failed turn on the next fallback model.
- Runtime code stays version-agnostic — no hardcoded model IDs outside evidence/snapshot paths.

### Evidence-backed routing (opt-in)

Drop a `model-evidence.<shortFingerprint>.json` bundle next to the verified discovery audit. Raise `evidence_rank_strength` (default `0`) so fused SWE/IQ-style scores drive ranking while name-token heuristics contribute zero.

- Path precedence: `evidence_catalog_path` -> `evidence_catalog_glob` -> `OPENCODE_ROUTER_EVIDENCE_JSON` -> `OPENCODE_ROUTER_EVIDENCE_DIR` -> bundled `defaults/evidence/`
- Fingerprint mismatch surfaces a warning, applies neutral evidence, and never falls back to name-token rank.
- Build bundles offline: `opencode-router build-model-evidence --source-spec <yaml> --audit-path <discovery-audit.json> --out defaults/evidence`
- See `defaults/evidence/README.md` and `scripts/evidence-sources.example.yaml`.

### Web-grounded research (opt-in, advanced)

Set `model_research_enabled: true` to spawn an external research runner before persisting model-match. The runner validates authority-tier citations against `defaults/research-authority-allowlist.json`, then ranking blends research signal **7:3** with policy soft scores. The default runner fails closed unless `OPENCODE_ROUTER_RESEARCH_MOCK=1` or `OPENCODE_ROUTER_ALLOW_STUB_WEB_TOOLS=1`. See `docs/agent-model-match.md` §3.5.3.

---

## State and continuity

All router state lives under the OpenCode app-data namespace (`~/.local/share/opencode/plugins/opencode-router/`):

- **Global:** `model-match.json`, `model-discovery-audit.json`
- **Per-project:** `intake-card.json`, `dispatch-packet.json`, `workboard.json`, `decision-ledger.jsonl`, `outcome-snapshots.jsonl`, `resume-capsule.json`, `session-language.json`, `interaction-mode.json`, `relay-bridge.json`, `research-memory.json`, `memory-palace.json`, `model-research.json`

`memory-palace.json` holds the project continuity index plus per-agent minimal indexes. Router agents receive a hidden continuity block on outgoing prompts so same-project sessions reuse prior findings.

### Reset

```bash
opencode-router reset-state              # clear current-project state (default)
opencode-router reset-state --global     # clear shared router state only
opencode-router reset-state --all        # clear everything
opencode-router reset-profile            # restore config + policy to defaults
opencode-router reset-profile --config   # restore config only
opencode-router reset-profile --policy   # restore policy only
```

---

## CLI

```bash
opencode-mic-pi check                                    # run all repo checks
opencode-mic-pi bootstrap --check                        # verify config exists
opencode-mic-pi bootstrap --write                        # write minimal config
opencode-mic-pi bootstrap --write-model-policy           # write default policy markdown
opencode-mic-pi optimize-models --check                  # preview opencode.json cleanup
opencode-mic-pi optimize-models --write                  # clean pinned models + agent defs
opencode-mic-pi rematch-models --check                   # preview model rematch
opencode-mic-pi rematch-models --write                   # write rematch to global config
opencode-mic-pi build-model-evidence --source-spec ...   # build evidence bundle
opencode-mic-pi reset-state [--project|--global|--all]   # clear router state
opencode-mic-pi reset-profile [--config|--policy|--all]  # restore defaults
```

---

## Development

### Repo layout

```
plugins/          plugin entry point
src/              runtime source (agents, intake, routing, memory, model-match, presentation)
  presentation/   Mic card + command view renderers
bin/              CLI entry
prompts/          prompt authoring sources (bundled into src/prompt-registry.js)
defaults/         bundled default policy + evidence + research allowlist
fixtures/         test fixtures (intake, routing, evidence)
scripts/          check + generate + build scripts
docs/             PRD, research, beta QA docs
```

### Workflow

```bash
nub run check                    # full repo check (156 assertions)
nub run check:beta               # beta release gate (176 assertions)
nub run sync-agent-surfaces      # regenerate prompts + fixtures + AGENTS.md
node scripts/check-generated-assets.js   # drift check
nub pack --dry-run               # verify package contents
```

After editing `prompts/`, `src/agent-catalog.js`, or `src/presentation/mic-intake/`, run `nub run sync-agent-surfaces`.

### Sandbox testing

A sandboxed opencode environment lives at `.tmp/sandbox/` (gitignored):

```bash
./.tmp/sandbox/verify.sh    # non-interactive smoke test (plugin + agents)
./.tmp/sandbox/run.sh        # launch opencode TUI with sandboxed config/state
```

### Beta release workflow

```bash
nub run check:beta
git status --short
```

- Keep `main` releasable
- Tag beta builds with `v0.9.0-beta.N`
- `CHANGELOG.md` for versioned release notes
- `RELEASE.md` for the beta release gate
- `docs/beta_qa_matrix.md` for the QA contract
- `docs/beta_pilot_notes.md` for pilot evidence

### CI/CD

Two GitHub Actions workflows live under `.github/workflows/`:

- **`node.js.yml` (CI)** — runs on every push and PR to `main`. Matrix tests on Node 18.x, 20.x, 22.x via `nubjs/setup-nub@v0` and executes `nub run test` + `nub run check:beta`.
- **`release.yml` (CD)** — publishes the package to npm. Triggers on:
  - `push` of any tag matching `v*` (e.g. `v0.9.0-beta.1`)
  - `workflow_dispatch` (manual run from the Actions tab)

  The release job resolves the target version from the tag (or from the `version` input on manual runs), verifies `package.json` matches, reruns the full test + beta gate, auto-detects the npm dist-tag (`beta` for prereleases, `latest` for stable; overridable via the `dist-tag` input), publishes with `nub publish --provenance`, verifies the published version with `npm view`, and auto-creates a GitHub Release for tag-triggered runs.

**Required secret for `release.yml`:**

- `NPM_TOKEN` — a granular npm access token scoped to `opencode-mic-pi` with `Publish` permission and **`Bypass 2FA`** enabled. Add it at `github.com/cyrilkong/opencode-mic-pi → Settings → Secrets and variables → Actions → New repository secret`.

**Tag-driven release flow:**

1. Bump `package.json` version, refresh `CHANGELOG.md` with a new `## [X.Y.Z]` section, commit on `main`.
2. `nub run check:beta` locally — must be green.
3. `git tag vX.Y.Z && git push origin vX.Y.Z` (use `env -u GITHUB_TOKEN` if your local `GITHUB_TOKEN` env var has only `repo` scope, the same trick used for pushing workflow files).
4. `release.yml` runs CI, publishes, and opens the GitHub Release with auto-generated notes.

### Design sources

- PRD: `docs/prd_refined.md`
- Precedent study: `docs/prd_research_2026-03-24.md`
- Agent directory: `AGENTS.md` (generated from `src/agent-catalog.js`)
- Model-match deep dive: `docs/agent-model-match.md`
- Issues: https://github.com/cyrilkong/opencode-mic-pi/issues

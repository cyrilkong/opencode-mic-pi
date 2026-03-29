# Model Match Policy Legend

This file explains how to manipulate `opencode-router-model-match.md` with a small human-readable policy surface.

It is not a score table.
It is not a model pin list.
It is a routing-policy guide for how each agent should prefer models.

## 1. Mental Model

Use markdown policy for:

- describing each agent's routing posture
- expressing abstract preference order
- shaping model selection without hardcoding concrete versions

Use `role_model_preferences` for:

- selector intent
- explicit preferred selector chains
- rare cases where you truly want a certain provider/model name to win first

Runtime still does the real work:

- discover available models
- score them with built-in role strategies
- apply billing-aware penalties
- apply your policy as an abstract steering layer
- persist the matched result into router state/config

## 2. Default Layers

There are now two policy layers:

1. Bundled plugin default template
   Path: `defaults/model-match-policy.default.md`
   Purpose: product author's failsafe baseline shipped with the plugin
2. User profile policy
   Path: `~/.config/opencode/opencode-router-model-match.md`
   Purpose: the user's editable maintenance surface

If the user profile is missing, plugin init re-seeds it from the bundled default template.

## 3. Minimal Schema

The recommended schema is:

```md
### mic
- focus: instruction > speed > cost_efficiency > output_quality
- cost: 5
- thinking: 1
- traffic: 5
- fallback: 2
- ceiling: economy
*when request based billing override*
- focus: cost_efficiency > speed > instruction > output_quality
- thinking: 0
```

Keep one section per agent.
Base fields apply to both billing modes.
Only add an override block when one billing mode truly needs to differ.

## 4. Field Guide

### `focus`

Main control surface.
Ordered dimensions from most important to least important.

Example:

```md
- focus: reasoning > coding > long_context > output_quality
```

Common dimensions:

- `reasoning`
- `coding`
- `instruction`
- `context`
- `long_context`
- `output_quality`
- `speed`
- `multimodal`
- `cost_efficiency`

### `shape`

How concentrated the role should be around its top priorities.
Use `0-5`.

- `0` means broad
- `5` means sharp

### `cost`

How price-sensitive the role should be.
Use `0-5`.

Interpretation:

- `0` means ignore
- `5` means critical
- token billing: stronger token price pressure
- request billing: stronger multiplier pressure

### `thinking`

How much this role should favor deeper reasoning / context / output quality.
Use `0-5`.

- `0` means minimal
- `5` means critical

### `traffic`

How frequently this role appears in the workflow, which affects how cost/speed should matter.
Use `0-5`.

- `0` means rare
- `5` means always

### `fallback`

How deep the fallback chain should be.
Use `0-5`.

- `0` means short
- `5` means extended

### `ceiling`

Optional price-tier ceiling.

Values:

- `economy`
- `mid`
- `premium`

Use this sparingly.

### `prefer_families` / `avoid_families`

Soft family steering only.
Do not treat them as hard locks.

Example:

```md
- prefer_families: claude > gpt
- avoid_families: gemini
```

### `prefer_benchmarks` / `avoid_benchmarks`

Soft benchmark-profile steering only.
Matches against the model's computed `benchmark_key`, which is derived from its name pattern against capability profiles.

Example:

```md
- prefer_benchmarks: coding+balanced > balanced
```

All valid benchmark keys (from TOKEN_PROFILES only):

| Key | What it signals | Matches name patterns |
|-----|-----------------|----------------------|
| `mini` | lightweight, fast, cost-efficient | mini, small, nano |
| `fast` | speed-optimized, lower depth | flash, turbo, instant, haiku |
| `coding` | coding/dev specialization | code, coder, codex, dev |
| `premium` | highest capability, deep reasoning | pro, max, ultra, opus, reasoning |
| `balanced` | general-purpose mid-tier | sonnet, balanced, standard, plus |
| `multimodal` | vision/image/audio capable | vision, image, multimodal, omni |
| `long-context` | large context window | 128k, 200k, 1m, long |
| `quality` | output quality focus | high-quality, quality |

Keys combine with `+` when multiple profiles match (e.g. `coding+premium` for a model matching both).

> **Note:** Family-specific tier names like `claude-opus`, `gemini-flash`, `gpt-max` are used internally for price inference only — they are **not** valid benchmark keys. Use `prefer_keyword` for that kind of steering.

### `prefer_keyword` / `avoid_keyword`

Soft model-name keyword steering.
Matches against the normalized model name segment (the part after provider prefix).

Example:

```md
- prefer_keyword: opus > sonnet
- avoid_keyword: nano, mini
```

Use this when you want to steer toward or away from a specific model name fragment without hardcoding a full model ID.
The match is a substring check — `opus` matches any model whose name contains `opus`.

Guidelines:

- Use lowercase keywords
- List in preference order using `>` (first = strongest bonus)
- Avoid overlapping keywords unless intentional (e.g. `max` matches both `codex-max` and `gpt-max`)
- Do not use version numbers — they change; prefer capability names like `opus`, `sonnet`, `pro`, `flash`

### `notes`

Optional human explanation for why this role is shaped this way.

## 5. Workflow

1. Let plugin init auto-seed the user profile, or force-regenerate it with `opencode-router bootstrap --write-model-policy --overwrite`.
2. Edit only one or two roles first.
3. Run `/pi-rematch-token` or `/pi-rematch-request`.
4. Check whether the matched role outputs now feel closer to the intended product behavior.
5. Use `role_model_preferences` only when abstract policy shaping is still insufficient.

## 6. Guardrails

Do:

- keep policy abstract
- tune agent posture, not exact model ids
- keep one section per agent
- keep overrides sparse
- think in workflow cost, depth, and frequency

Do not:

- write concrete discovered model versions into policy
- treat policy as a replacement for runtime scoring
- turn family preferences into a hard router lock
- duplicate the same preference in both policy and selector chains unless you truly need both

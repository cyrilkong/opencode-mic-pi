# Model Match Policy Legend

This file explains how to manipulate `opencode-router-model-match.md` using human-readable ranking language instead of raw numeric weights.

It is a developer/operator guide, not a runtime config file.

---

## 1. Mental Model

The markdown policy is a **role description layer**.

You are not directly setting scores.
You are telling the router:

- what this role values first
- how sharply it prioritizes those values
- how price-sensitive it should be
- how thinking-heavy it should be
- how frequently the role tends to appear
- how deep its fallback chain should be
- which model families / benchmark profiles it should softly prefer or avoid

The runtime translates that into internal scoring.

Use the markdown policy for:

- role behavior shaping
- abstract preference expression
- keeping scoring understandable to humans

Use `role_model_preferences` for:

- selector intent
- explicit primary/fallback selector chains
- rare cases where you want exact model-name preference order

---

## 2. Field Legend

### `dimension_priority`

Format:

```md
- dimension_priority: reasoning > long_context > output_quality > instruction > coding > context > speed > cost_efficiency
```

Meaning:

- Leftmost dimensions matter most.
- Rightmost dimensions matter least.
- This is the main control surface for role personality.

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

### `dimension_baseline`

Values:

- `sharp`
- `focused`
- `balanced`
- `broad`

Meaning:

- `sharp`: top priorities dominate hard
- `focused`: first few priorities dominate clearly
- `balanced`: several dimensions matter together
- `broad`: many dimensions remain relevant

Use:

- `sharp` for specialists
- `focused` for most purposeful roles
- `balanced` for mixed operational roles
- `broad` for general synthesis / flexible utility roles

### `price_sensitivity`

Values:

- `critical`
- `high`
- `medium`
- `low`
- `minimal`
- `ignore`

Meaning:

- Stronger value means stronger price penalty.
- Under `request_billing`, this mainly affects multiplier tolerance.
- Under `token_billing`, this mainly affects token-price penalty.

Suggested intuition:

- `mic`: usually `critical` or `high`
- `snap`: usually `high`
- `map` / `scout`: often `medium` or `high`
- `pi`: usually `medium` or `low`
- `wise`: usually `low` or `minimal`

### `thinking_sensitivity`

Values:

- `critical`
- `high`
- `medium`
- `low`
- `minimal`

Meaning:

- Boosts how much the role values deep thinking signals such as `reasoning`, `long_context`, `context`, and `output_quality`.

Use:

- `wise`: `critical`
- `pi`: `high`
- `debug`: `high`
- `mic`: often `low` or `medium`
- `snap`: usually `minimal` or `low`

### `role_frequency`

Values:

- `always`
- `high`
- `medium`
- `low`
- `rare`

Meaning:

- Models how often this role is expected to appear in normal workflows.
- Higher frequency nudges the role toward cheaper/faster/frontstage-friendly behavior.

Use:

- `mic`: `always`
- `pi`: `high`
- `snap`: `high`
- `wise`: `low`
- `vis`: `low`

### `fallback_depth`

Values:

- `short`
- `medium`
- `long`
- `extended`

Meaning:

- Controls how many fallback candidates are kept for the role.

Use:

- `mic`: often `medium`
- `pi`: often `long`
- `wise`: often `extended`
- `snap`: often `short`

### `price_cap`

Values:

- `economy`
- `mid`
- `premium`
- `none`

Meaning:

- Soft cap for acceptable price tier.
- More expensive tiers may still win, but incur extra penalty.

### `family_preferences`

Format:

```md
- family_preferences: claude > gemini > gpt
```

Meaning:

- Soft family ranking.
- Earlier families get more bonus than later ones.
- This is not a hard lock.

### `family_avoidances`

Format:

```md
- family_avoidances: llama > phi
```

Meaning:

- Soft avoidance ranking.
- Earlier families get stronger penalty.

### `benchmark_preferences`

Format:

```md
- benchmark_preferences: coding+balanced > balanced > premium
```

Meaning:

- Soft preference for benchmark/profile shapes.
- Useful when you care more about behavior profile than provider/family.

### `benchmark_avoidances`

Format:

```md
- benchmark_avoidances: mini > fast
```

Meaning:

- Soft avoidance for benchmark/profile shapes.

---

## 3. Example Patterns

### A. Cheap front-window intake role

```md
### mic
- dimension_priority: instruction > speed > cost_efficiency > output_quality > context > reasoning > long_context > coding
- dimension_baseline: focused
- price_sensitivity: critical
- thinking_sensitivity: low
- role_frequency: always
- fallback_depth: medium
- price_cap: economy
```

Effect:

- prioritizes low friction
- resists premium reasoning-heavy picks
- still values instruction-following first

### B. Strong orchestrator

```md
### pi
- dimension_priority: reasoning > long_context > output_quality > instruction > coding > context > speed > cost_efficiency
- dimension_baseline: focused
- price_sensitivity: medium
- thinking_sensitivity: high
- role_frequency: high
- fallback_depth: long
- price_cap: mid
```

Effect:

- stays orchestration-heavy
- still tolerates stronger models
- avoids collapsing into cheap-but-shallow picks

### C. Rare but high-authority reviewer

```md
### wise
- dimension_priority: reasoning > long_context > output_quality > context > instruction > coding > speed > cost_efficiency
- dimension_baseline: sharp
- price_sensitivity: minimal
- thinking_sensitivity: critical
- role_frequency: low
- fallback_depth: extended
- price_cap: premium
```

Effect:

- strongly favors deep review quality
- barely cares about cost relative to frontstage roles

### D. Fast low-ceremony operator

```md
### snap
- dimension_priority: speed > instruction > cost_efficiency > output_quality > context > reasoning > coding > long_context
- dimension_baseline: focused
- price_sensitivity: high
- thinking_sensitivity: minimal
- role_frequency: high
- fallback_depth: short
- price_cap: mid
```

Effect:

- fast, low-friction, operational
- avoids drifting into expensive slow models

---

## 4. Common Tuning Moves

If a role feels too expensive:

- move `cost_efficiency` left in `dimension_priority`
- raise `price_sensitivity`
- raise `role_frequency`
- lower `price_cap`

If a role feels too shallow:

- move `reasoning`, `long_context`, or `output_quality` left
- switch `dimension_baseline` toward `focused` or `sharp`
- raise `thinking_sensitivity`
- lower `price_sensitivity`

If a role feels too slow:

- move `speed` left
- lower `thinking_sensitivity`
- raise `price_sensitivity`

If a role overfits one provider:

- remove or soften `family_preferences`
- rely more on `dimension_priority`

If rematch still picks the wrong model family:

- first change abstract role behavior in markdown policy
- only after that, use `role_model_preferences` to constrain selectors

---

## 5. What Not To Do

Do not:

- treat `family_preferences` as a hard lock
- encode concrete model versions into the markdown policy
- put every possible selector into `role_model_preferences`
- try to fine-tune every role at once

Prefer:

1. tune one role
2. run rematch
3. inspect outcome
4. adjust again

---

## 6. Suggested First-Pass Defaults

For most teams:

- `mic`: `focused`, `critical`, `low`, `always`
- `pi`: `focused`, `medium`, `high`, `high`
- `co-pi`: `balanced`, `medium`, `high`, `medium`
- `wise`: `sharp`, `minimal`, `critical`, `low`
- `snap`: `focused`, `high`, `minimal`, `high`
- `map`: `balanced`, `medium`, `medium`, `high`
- `debug`: `focused`, `low`, `high`, `medium`
- `desi`: `balanced`, `medium`, `high`, `medium`

---

## 7. Recommended Workflow

1. Generate the template with `opencode-router bootstrap --write-model-policy`.
2. Edit only one or two roles first.
3. Run `/pi-rematch-token` or `/pi-rematch-request`.
4. Check whether the new role outputs match your mental model.
5. Only add selector-level constraints if abstract policy shaping is still insufficient.

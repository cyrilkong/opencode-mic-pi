# Model Match Policy

This is the bundled plugin-default routing policy for `opencode-router`.

Global weight scale:

- `0` = not care / ignore / broad / rare / short / minimal
- `5` = strongest preference / sharp / critical / always / extended

Rules:

- Keep one section per agent.
- `focus` is the ordered priority list.
- `cost`, `thinking`, `traffic`, `fallback`, and optional `shape` use the `0-5` scale.
- Base fields apply to both billing modes.
- Only add an override block when one billing mode really needs to differ.
- Policy is a routing layer, not a direct score table and not a concrete model pin list.

Optional fields:

- `shape`
- `ceiling`
- `prefer_families`
- `avoid_families`
- `prefer_benchmarks`
- `avoid_benchmarks`
- `notes`

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

### pi
- focus: reasoning > coding > long_context > output_quality > instruction
- cost: 2
- thinking: 4
- traffic: 4
- fallback: 4
- avoid_families: gemini
*when request based billing override*
- cost: 1

### co-pi
- focus: reasoning > instruction > context > output_quality
- cost: 2
- thinking: 4
- traffic: 2
- fallback: 4
- avoid_families: gemini
*when request based billing override*
- focus: reasoning > context > instruction > output_quality
- cost: 1

### wise
- focus: reasoning > long_context > output_quality > context
- shape: 5
- cost: 1
- thinking: 5
- traffic: 1
- fallback: 5
- avoid_families: gemini
*when request based billing override*
- cost: 0
- fallback: 1

### dev
- focus: coding > reasoning > long_context > output_quality
- cost: 2
- thinking: 4
- traffic: 4
- fallback: 4
- prefer_families: gpt > claude
- avoid_families: gemini

### desi
- focus: output_quality > instruction > reasoning > context
- cost: 2
- thinking: 4
- traffic: 2
- fallback: 2
- prefer_families: gemini
*when request based billing override*
- cost: 1

### doc
- focus: instruction > output_quality > long_context > context
- cost: 2
- thinking: 3
- traffic: 2
*when request based billing override*
- cost: 1

### map
- focus: long_context > context > speed > cost_efficiency
- cost: 4
- thinking: 1
- traffic: 4
- fallback: 3
- ceiling: mid
- prefer_families: claude
- avoid_families: gemini
*when request based billing override*
- focus: long_context > context > speed > instruction
- cost: 4

### scout
- focus: speed > context > instruction > cost_efficiency
- cost: 4
- thinking: 1
- traffic: 4
- fallback: 3
- ceiling: mid
*when request based billing override*
- focus: speed > context > instruction > output_quality
- cost: 5
- ceiling: economy

### debug
- focus: coding > reasoning > context > output_quality
- cost: 2
- thinking: 4
- traffic: 3
- fallback: 4
*when request based billing override*
- cost: 1

### check
- focus: reasoning > output_quality > instruction > coding
- cost: 2
- thinking: 4
- traffic: 2
- fallback: 3
- ceiling: mid
*when request based billing override*
- cost: 1

### vis
- focus: multimodal > output_quality > reasoning
- cost: 1
- thinking: 3
- traffic: 0
- fallback: 2
- prefer_families: gemini
*when request based billing override*
- cost: 0

### snap
- focus: speed > instruction > cost_efficiency > output_quality
- cost: 4
- thinking: 1
- traffic: 4
- fallback: 1
*when request based billing override*
- focus: speed > instruction > output_quality > context
- cost: 3

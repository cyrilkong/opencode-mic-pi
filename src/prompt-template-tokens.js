import { buildPiRoutingReference } from "./agent-catalog.js"
import { getMicPromptTemplateTokens } from "./presentation/mic-intake/prompt-blocks.js"

export function buildPromptTemplateTokens() {
  return new Map([
    ...getMicPromptTemplateTokens().entries(),
    ["{{PI_ROUTING_REFERENCE}}", buildPiRoutingReference()],
  ])
}

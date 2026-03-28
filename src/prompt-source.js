export function sortPromptFiles(files = []) {
  return [...files].sort((a, b) => a.localeCompare(b))
}

export function applyTemplateTokens(text, templateTokens = new Map()) {
  let next = String(text || "")
  for (const [token, value] of templateTokens.entries()) {
    next = next.split(token).join(String(value || ""))
  }
  return next
}

export function buildPromptRegistrySource(entries = []) {
  const lines = []
  lines.push("export const ROUTER_PROMPTS = {")

  for (const [agentID, promptText] of entries) {
    lines.push(`  ${JSON.stringify(agentID)}: ${JSON.stringify(promptText)},`)
  }

  lines.push("}")
  lines.push("")
  lines.push("export function getRouterPrompt(agentID) {")
  lines.push('  return ROUTER_PROMPTS[String(agentID || "").trim()] || ""')
  lines.push("}")
  lines.push("")

  return `${lines.join("\n")}`
}

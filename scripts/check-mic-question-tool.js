const path = require("node:path")
const { pathToFileURL } = require("node:url")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const promptRegistryUrl = pathToFileURL(path.resolve(repoRoot, "src", "prompt-registry.js")).href
  const catalogUrl = pathToFileURL(path.resolve(repoRoot, "src", "agent-catalog.js")).href

  const { getRouterPrompt } = await import(promptRegistryUrl)
  const { ROUTER_AGENT_CATALOG } = await import(catalogUrl)

  const micPrompt = getRouterPrompt("mic")
  const promptText = String(micPrompt || "")
  const normalizedPrompt = promptText.toLowerCase()
  assert(normalizedPrompt.includes("opencode's built-in `question` tool as the primary ask surface"), "expected Mic prompt to require the built-in question tool as the primary ask surface")
  assert(promptText.includes("plain-text `Questions` prose as the primary live ask channel"), "expected Mic prompt to forbid plain-text Questions as the primary ask channel")
  assert(promptText.includes("Treat the visible `Questions` block as a compact mirror of the active/open `question` tool request"), "expected Mic prompt to define Questions as a mirror of tool state")
  assert(promptText.includes("Fall back to plain-text clarification only when the `question` tool is unavailable"), "expected Mic prompt to scope plain-text fallback narrowly")
  assert(promptText.includes("Treat the current workspace, current router state, current implementation, file locations, and existing output/data shapes as locally discoverable facts"), "expected Mic prompt to treat workspace facts as locally discoverable")
  assert(promptText.includes("Do not ask the user for repository name, branch, file path, implementation location"), "expected Mic prompt to forbid asking for discoverable repo facts")
  assert(promptText.includes("Start directly with the Mic card. Do not add any preface"), "expected Mic prompt to forbid preface/meta narration")
  assert(promptText.includes("The first non-empty line must already be the Mic card header"), "expected Mic prompt to require card header as the first visible line")
  assert(promptText.includes("Never output planning or reasoning text such as `Preparing...`, `I’m organizing...`, `I'm putting together...`"), "expected Mic prompt to forbid planning/reasoning leakage variants")
  assert(promptText.includes("Never print tool chatter, shell transcripts"), "expected Mic prompt to forbid tool and shell leakage")
  assert(promptText.includes("Never describe your internal plan, hidden work, or formatting choices."), "expected Mic prompt to forbid internal-plan leakage")
  assert(promptText.includes("Never fabricate placeholder tasks such as `None yet`"), "expected Mic prompt to forbid placeholder tasks")
  assert(promptText.includes("Never mark the card `READY` when there are zero real tasks"), "expected Mic prompt to forbid zero-task ready cards")
  assert(promptText.includes("infer that language and continue directly; do not reopen a language menu in the same turn"), "expected Mic prompt to skip reopening language menu after substantive first input")

  const micAgent = ROUTER_AGENT_CATALOG.mic
  assert(micAgent?.permission?.question === "allow", "expected Mic agent to keep question tool permission enabled")

  process.stdout.write("PASS: Mic prefers the built-in question tool, forbids meta narration, and avoids fake ready/task placeholders\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

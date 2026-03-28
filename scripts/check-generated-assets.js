const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const promptsDir = path.resolve(repoRoot, "prompts")
  const promptSourceUrl = pathToFileURL(path.resolve(repoRoot, "src", "prompt-source.js")).href
  const promptTokensUrl = pathToFileURL(path.resolve(repoRoot, "src", "prompt-template-tokens.js")).href
  const agentsDocUrl = pathToFileURL(path.resolve(repoRoot, "src", "agents-doc.js")).href

  const { applyTemplateTokens, buildPromptRegistrySource, sortPromptFiles } = await import(promptSourceUrl)
  const { buildPromptTemplateTokens } = await import(promptTokensUrl)
  const { buildAgentsDocument } = await import(agentsDocUrl)

  const templateTokens = buildPromptTemplateTokens()
  const promptFiles = sortPromptFiles(
    fs.readdirSync(promptsDir).filter((fileName) => fileName.endsWith(".md")),
  )

  const promptEntries = promptFiles.map((fileName) => {
    const agentID = fileName.replace(/\.md$/u, "")
    const promptText = applyTemplateTokens(fs.readFileSync(path.resolve(promptsDir, fileName), "utf8"), templateTokens)
    return [agentID, promptText]
  })

  const expectedPromptRegistry = buildPromptRegistrySource(promptEntries)
  const actualPromptRegistry = fs.readFileSync(path.resolve(repoRoot, "src", "prompt-registry.js"), "utf8")
  if (actualPromptRegistry !== expectedPromptRegistry) {
    throw new Error("src/prompt-registry.js is out of sync with prompts/ or shared prompt template tokens")
  }
  process.stdout.write("PASS: prompt registry is in sync\n")

  const expectedAgentsDoc = buildAgentsDocument()
  const actualAgentsDoc = fs.readFileSync(path.resolve(repoRoot, "AGENTS.md"), "utf8")
  if (actualAgentsDoc !== expectedAgentsDoc) {
    throw new Error("AGENTS.md is out of sync with src/agent-catalog.js")
  }
  process.stdout.write("PASS: AGENTS.md is in sync\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const promptsDir = path.resolve(repoRoot, "prompts")
  const targetPath = path.resolve(repoRoot, "src", "prompt-registry.js")
  const promptTokensUrl = pathToFileURL(path.resolve(repoRoot, "src", "prompt-template-tokens.js")).href
  const promptSourceUrl = pathToFileURL(path.resolve(repoRoot, "src", "prompt-source.js")).href
  const { buildPromptTemplateTokens } = await import(promptTokensUrl)
  const { applyTemplateTokens, buildPromptRegistrySource, sortPromptFiles } = await import(promptSourceUrl)
  const templateTokens = buildPromptTemplateTokens()

  const promptFiles = sortPromptFiles(
    fs.readdirSync(promptsDir).filter((fileName) => fileName.endsWith(".md")),
  )

  const entries = promptFiles.map((fileName) => {
    const agentID = fileName.replace(/\.md$/u, "")
    const promptText = applyTemplateTokens(fs.readFileSync(path.resolve(promptsDir, fileName), "utf8"), templateTokens)
    return [agentID, promptText]
  })

  fs.writeFileSync(targetPath, buildPromptRegistrySource(entries))
  process.stdout.write(`SYNC: prompt registry -> ${targetPath}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

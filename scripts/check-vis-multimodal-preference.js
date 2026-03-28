const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const { recommendRoleModels } = await import(modelMatchUrl)

  const recommendation = recommendRoleModels({
    availableModels: [
      "openai/gpt-5.1-codex-max",
      "anthropic/claude-3.7-sonnet",
      "google/gemini-2.5-pro-vision",
    ],
    billingMode: "token_billing",
    routerConfig: {},
  })

  const vis = recommendation?.roles?.vis
  if (!vis?.default_model) {
    throw new Error("expected vis recommendation to resolve")
  }
  if (vis.default_model !== "google/gemini-2.5-pro-vision") {
    throw new Error(`expected vis to prefer multimodal-capable model, got ${vis.default_model}`)
  }
  if ((vis.dimensions?.multimodal || 0) < 4) {
    throw new Error("expected vis winner to expose strong multimodal rating")
  }

  process.stdout.write("PASS: vis prefers multimodal-capable models when available\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

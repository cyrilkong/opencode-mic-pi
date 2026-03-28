const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const { recommendRoleModels } = await import(modelMatchUrl)

  const availableModels = [
    "google/gemini-2.5-pro-vision",
    "openai/gpt-5.1-codex-max",
    "openai/gpt-4.1-mini",
    "anthropic/claude-3.7-sonnet",
  ]

  const recommendation = recommendRoleModels({
    availableModels,
    billingMode: "token_billing",
    routerConfig: {
      force_cross_model_family_for_copi: false,
    },
  })

  const map = recommendation?.roles?.map
  const debug = recommendation?.roles?.debug

  if (!map?.default_model || !debug?.default_model) {
    throw new Error("expected map/debug recommendations to resolve")
  }

  if (map.default_model !== "google/gemini-2.5-pro-vision") {
    throw new Error(`expected map to prefer long-context model, got ${map.default_model}`)
  }
  if ((map.dimensions?.long_context || 0) < 4) {
    throw new Error("expected map winner to expose strong long_context rating")
  }

  if (debug.default_model !== "openai/gpt-5.1-codex-max") {
    throw new Error(`expected debug to prefer strong coding model, got ${debug.default_model}`)
  }
  if ((debug.dimensions?.coding || 0) < 5) {
    throw new Error("expected debug winner to expose top coding rating")
  }

  process.stdout.write("PASS: role specialization favors long-context models for map and coding-heavy models for debug\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

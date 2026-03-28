const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const { recommendRoleModels } = await import(modelMatchUrl)

  const availableModels = [
    "anthropic/claude-3.7-sonnet",
    "openai/gpt-5.1-codex-max",
    "openai/gpt-4.1-mini",
    "google/gemini-2.5-pro",
  ]

  const tokenRecommendation = recommendRoleModels({
    availableModels,
    billingMode: "token_billing",
    routerConfig: {},
  })

  const requestRecommendation = recommendRoleModels({
    availableModels,
    billingMode: "request_billing",
    routerConfig: {},
  })

  const tokenMic = tokenRecommendation?.roles?.mic
  const requestMic = requestRecommendation?.roles?.mic

  if (!tokenMic?.default_model || !requestMic?.default_model) {
    throw new Error("expected mic recommendation to resolve under both billing modes")
  }

  if (tokenMic.price_tier === "premium") {
    throw new Error("expected token-billing mic to avoid premium primary model")
  }

  if (requestMic.default_model !== "openai/gpt-4.1-mini") {
    throw new Error(`expected request-billing mic to prefer lower-multiplier economy model, got ${requestMic.default_model}`)
  }

  if (requestMic.price_tier !== "economy") {
    throw new Error(`expected request-billing mic winner to expose economy tier, got ${requestMic.price_tier}`)
  }

  const requestCostWeight = Number(requestMic?.applied_weights?.cost_efficiency || 0)
  if (requestCostWeight < 0.1) {
    throw new Error("expected request-billing mic to keep a meaningful cost_efficiency weight")
  }

  if ((requestMic.price_penalty || 0) !== 0) {
    throw new Error("expected request-billing mic economy winner to avoid multiplier penalty")
  }

  process.stdout.write("PASS: mic remains cost-sensitive in both modes and prefers low-multiplier economy models under request billing\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

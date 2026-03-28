const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const { recommendRoleModels } = await import(modelMatchUrl)

  const availableModels = [
    "anthropic/claude-3.7-opus",
    "openai/gpt-5.1-codex-max",
    "anthropic/claude-3.7-sonnet",
    "google/gemini-2.5-pro",
  ]

  const tokenRecommendation = recommendRoleModels({
    availableModels,
    billingMode: "token_billing",
    routerConfig: {
      force_cross_model_family_for_copi: false,
    },
  })

  const requestRecommendation = recommendRoleModels({
    availableModels,
    billingMode: "request_billing",
    routerConfig: {
      force_cross_model_family_for_copi: false,
    },
  })

  const tokenCopi = tokenRecommendation?.roles?.["co-pi"]
  const requestCopi = requestRecommendation?.roles?.["co-pi"]

  if (!tokenCopi?.default_model) {
    throw new Error("expected token-billing co-pi recommendation to resolve")
  }
  if (!requestCopi?.default_model) {
    throw new Error("expected request-billing co-pi recommendation to resolve")
  }

  if (tokenCopi.price_tier !== "mid") {
    throw new Error(`expected token-billing co-pi to stay on a mid-tier second-brain, got ${tokenCopi.price_tier}`)
  }
  if ((tokenCopi.price_penalty || 0) <= 0) {
    throw new Error("expected token-billing co-pi winner to expose non-zero price penalty metadata")
  }
  if (tokenCopi.default_model === "anthropic/claude-3.7-opus") {
    throw new Error("expected token-billing co-pi to avoid premium opus as primary second-brain")
  }

  const tokenFallback = tokenRecommendation?.fallback?.["co-pi"] || []
  if (!tokenFallback.includes("anthropic/claude-3.7-opus")) {
    throw new Error("expected expensive Opus candidate to remain available in co-pi fallback chain")
  }

  const tokenCostWeight = Number(tokenCopi?.applied_weights?.cost_efficiency || 0)
  const requestCostWeight = Number(requestCopi?.applied_weights?.cost_efficiency || 0)
  if (!(requestCostWeight < tokenCostWeight)) {
    throw new Error("expected request_billing co-pi to down-weight cost relative to token_billing")
  }
  if ((requestCopi.price_penalty || 0) >= (tokenCopi.price_penalty || 0)) {
    throw new Error("expected request_billing co-pi to apply a lighter pricing penalty than token_billing")
  }

  process.stdout.write("PASS: co-pi behaves like a mid-tier second-brain under token billing and relaxes pricing pressure under request billing\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

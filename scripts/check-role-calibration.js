const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const { recommendRoleModels } = await import(modelMatchUrl)

  const recommendation = recommendRoleModels({
    availableModels: [
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash-image",
      "openai/gpt-5.1-codex-max",
      "anthropic/claude-3.7-sonnet",
      "anthropic/claude-3.7-opus",
    ],
    billingMode: "token_billing",
    routerConfig: {
      model_match_policy_markdown_path: path.resolve(repoRoot, "defaults", "model-match-policy.default.md"),
    },
  })

  const pi = recommendation?.roles?.pi
  const copi = recommendation?.roles?.["co-pi"]
  const wise = recommendation?.roles?.wise
  const dev = recommendation?.roles?.dev
  const desi = recommendation?.roles?.desi
  const doc = recommendation?.roles?.doc
  const map = recommendation?.roles?.map
  const vis = recommendation?.roles?.vis

  if (pi?.family !== "gpt") {
    throw new Error(`expected pi to stay on the GPT family, got ${pi?.default_model || "none"}`)
  }
  if (copi?.family !== "claude") {
    throw new Error(`expected co-pi to diversify onto the Claude family, got ${copi?.default_model || "none"}`)
  }
  if (wise?.default_model !== "anthropic/claude-3.7-opus") {
    throw new Error(`expected wise to land on Claude Opus, got ${wise?.default_model || "none"}`)
  }
  if (dev?.default_model !== "openai/gpt-5.1-codex-max") {
    throw new Error(`expected dev to prefer GPT Codex Max, got ${dev?.default_model || "none"}`)
  }
  if (doc?.default_model !== "anthropic/claude-3.7-sonnet") {
    throw new Error(`expected doc to prefer Claude Sonnet, got ${doc?.default_model || "none"}`)
  }
  if (desi?.family !== "gemini") {
    throw new Error(`expected desi to stay on the Gemini family, got ${desi?.default_model || "none"}`)
  }
  if (map?.default_model !== "google/gemini-2.5-pro") {
    throw new Error(`expected map to prefer Gemini Pro over flash-image variants, got ${map?.default_model || "none"}`)
  }
  if (vis?.default_model !== "google/gemini-2.5-flash-image") {
    throw new Error(`expected vis to prefer the multimodal Gemini candidate, got ${vis?.default_model || "none"}`)
  }

  const families = new Set([pi?.family, copi?.family, desi?.family].filter(Boolean))
  if (families.size < 3) {
    throw new Error("expected calibration to distribute key roles across GPT, Claude, and Gemini families")
  }

  process.stdout.write("PASS: default model-match calibration distributes core roles across GPT, Claude, and Gemini\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const policyUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match-policy.js")).href

  const {
    recommendRoleModels,
    renderDefaultModelMatchPolicyMarkdown,
  } = await import(modelMatchUrl)
  const {
    readModelMatchPolicyMarkdown,
  } = await import(policyUrl)

  const tempDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-model-policy-"))
  const templatePath = path.resolve(tempDir, "template.md")
  fs.writeFileSync(templatePath, renderDefaultModelMatchPolicyMarkdown(), "utf8")

  const templateState = readModelMatchPolicyMarkdown({
    model_match_policy_markdown_path: templatePath,
  })

  if (!templateState.found) {
    throw new Error("expected generated model-match markdown template to exist")
  }
  if (Array.isArray(templateState.errors) && templateState.errors.length > 0) {
    throw new Error(`expected generated model-match markdown template to parse cleanly, got ${templateState.errors.join("; ")}`)
  }
  if (!templateState.policy?.token_billing?.mic || !templateState.policy?.request_billing?.pi) {
    throw new Error("expected generated markdown template to include token/request role sections")
  }
  process.stdout.write("PASS: generated model-match policy markdown template parses cleanly\n")

  const customPolicyPath = path.resolve(tempDir, "custom-policy.md")
  fs.writeFileSync(
    customPolicyPath,
    [
      "# Model Match Policy",
      "",
      "## token_billing",
      "### mic",
      "- summary: force mic to prioritize reasoning in this test policy",
      "- dimension_priority: reasoning > instruction > output_quality > context > speed > cost_efficiency > long_context > coding",
      "- dimension_baseline: sharp",
      "- price_sensitivity: low",
      "- thinking_sensitivity: critical",
      "- role_frequency: medium",
      "### pi",
      "- family_preferences: claude > gpt",
      "- dimension_priority: reasoning > long_context > output_quality > instruction > coding > context > speed > cost_efficiency",
      "- dimension_baseline: focused",
      "- price_sensitivity: minimal",
      "- thinking_sensitivity: high",
      "- role_frequency: medium",
      "",
      "## request_billing",
      "### mic",
      "- dimension_priority: instruction > speed > cost_efficiency > output_quality > context > reasoning > long_context > coding",
      "- dimension_baseline: focused",
      "- price_sensitivity: critical",
      "- role_frequency: always",
      "",
    ].join("\n"),
    "utf8",
  )

  const baseRecommendation = recommendRoleModels({
    availableModels: [
      "openai/gpt-codex-balanced",
      "anthropic/claude-balanced",
    ],
    billingMode: "token_billing",
    routerConfig: {},
  })

  const customRecommendation = recommendRoleModels({
    availableModels: [
      "openai/gpt-codex-balanced",
      "anthropic/claude-balanced",
    ],
    billingMode: "token_billing",
    routerConfig: {
      model_match_policy_markdown_path: customPolicyPath,
    },
  })

  if (customRecommendation?.model_match_policy?.found !== true) {
    throw new Error("expected recommendation to report loaded model-match policy markdown")
  }
  const micWeights = customRecommendation?.roles?.mic?.applied_weights || {}
  if (Number(micWeights.reasoning || 0) <= Number(micWeights.speed || 0)) {
    throw new Error("expected markdown dimension_priority to make reasoning outrank speed for mic")
  }
  if (JSON.stringify(baseRecommendation?.roles?.pi?.applied_weights || {}) === JSON.stringify(customRecommendation?.roles?.pi?.applied_weights || {})) {
    throw new Error("expected markdown policy to change pi applied weight profile")
  }
  if (!Array.isArray(customRecommendation?.roles?.pi?.dimension_priority) || customRecommendation.roles.pi.dimension_priority[0] !== "reasoning") {
    throw new Error("expected recommendation to expose markdown-derived abstract role strategy metadata")
  }
  process.stdout.write("PASS: markdown model-match policy overrides abstract role strategy and scoring\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

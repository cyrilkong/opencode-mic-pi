const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const policyUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match-policy.js")).href
  const originalHome = process.env.HOME

  const {
    recommendRoleModels,
    renderDefaultModelMatchPolicyMarkdown,
  } = await import(modelMatchUrl)
  const {
    readModelMatchPolicyMarkdown,
  } = await import(policyUrl)

  try {
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

    process.env.HOME = path.resolve(tempDir, "missing-home")
    const bundledFallbackState = readModelMatchPolicyMarkdown({})
    if (bundledFallbackState.found !== false) {
      throw new Error("expected missing default-global policy path to report found=false")
    }
    if (bundledFallbackState.fallback_source !== "bundled_default") {
      throw new Error("expected missing default-global policy path to fall back to the bundled default markdown")
    }
    if (!bundledFallbackState.policy?.token_billing?.pi || !bundledFallbackState.policy?.request_billing?.mic) {
      throw new Error("expected bundled default fallback to provide parsed token/request role policy")
    }

    const customPolicyPath = path.resolve(tempDir, "custom-policy.md")
    fs.writeFileSync(
      customPolicyPath,
      [
        "# Model Match Policy",
        "",
        "### mic",
        "- notes: force mic to prioritize reasoning in this test policy",
        "- focus: reasoning > instruction > output_quality > context > speed > cost_efficiency > long_context > coding",
        "- shape: 5",
        "- cost: 1",
        "- thinking: 5",
        "- traffic: 2",
        "- fallback: 3",
        "*when request based billing override*",
        "- traffic: 3",
        "- cost: 5",
        "",
        "### pi",
        "- prefer_families: claude > gpt",
        "- focus: reasoning > long_context > output_quality > instruction > coding > context > speed > cost_efficiency",
        "- shape: 4",
        "- cost: 0",
        "- thinking: 4",
        "- traffic: 3",
        "- fallback: 4",
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
      throw new Error("expected markdown focus to make reasoning outrank speed for mic")
    }
    if (JSON.stringify(baseRecommendation?.roles?.pi?.applied_weights || {}) === JSON.stringify(customRecommendation?.roles?.pi?.applied_weights || {})) {
      throw new Error("expected markdown policy to change pi applied weight profile")
    }
    if (customRecommendation?.roles?.pi?.price_sensitivity !== "ignore") {
      throw new Error("expected numeric cost scale to flow through as abstract price sensitivity")
    }
    if (!Array.isArray(customRecommendation?.roles?.pi?.dimension_priority) || customRecommendation.roles.pi.dimension_priority[0] !== "reasoning") {
      throw new Error("expected recommendation to expose markdown-derived abstract role strategy metadata")
    }
    const requestRecommendation = recommendRoleModels({
      availableModels: [
        "openai/gpt-codex-balanced",
        "anthropic/claude-balanced",
      ],
      billingMode: "request_billing",
      routerConfig: {
        model_match_policy_markdown_path: customPolicyPath,
      },
    })
    if (requestRecommendation?.roles?.mic?.role_frequency !== "high") {
      throw new Error("expected request-billing override block to apply on top of the base role section")
    }

    const keywordAvoidPolicyPath = path.resolve(tempDir, "keyword-avoid-policy.md")
    fs.writeFileSync(
      keywordAvoidPolicyPath,
      [
        "# Model Match Policy",
        "",
        "### pi",
        "- focus: reasoning > coding > long_context > output_quality",
        "- cost: 1",
        "- thinking: 4",
        "- fallback: 3",
        "- avoid_keyword: pro",
        "",
      ].join("\n"),
      "utf8",
    )

    const keywordAvoidRecommendation = recommendRoleModels({
      availableModels: [
        "google/gemini-3-pro",
        "anthropic/claude-3.7-sonnet",
      ],
      billingMode: "token_billing",
      routerConfig: {
        model_match_policy_markdown_path: keywordAvoidPolicyPath,
      },
    })

    if (keywordAvoidRecommendation?.roles?.pi?.default_model !== "anthropic/claude-3.7-sonnet") {
      throw new Error("expected avoid_keyword to penalize matching models strongly enough to change ranking when alternatives exist")
    }
    if (Array.isArray(keywordAvoidRecommendation?.fallback?.pi) && keywordAvoidRecommendation.fallback.pi[0] !== "google/gemini-3-pro") {
      throw new Error("expected avoided keyword models to remain available as fallback candidates rather than being hard filtered")
    }

    const benchmarkSubsetPolicyPath = path.resolve(tempDir, "benchmark-subset-policy.md")
    fs.writeFileSync(
      benchmarkSubsetPolicyPath,
      [
        "# Model Match Policy",
        "",
        "### dev",
        "- focus: coding > reasoning > output_quality > instruction",
        "- prefer_benchmarks: coding+quality",
        "- cost: 1",
        "- thinking: 4",
        "",
      ].join("\n"),
      "utf8",
    )

    const benchmarkSubsetRecommendation = recommendRoleModels({
      availableModels: [
        "openai/gpt-5.1-codex-max",
        "anthropic/claude-3.7-sonnet",
      ],
      billingMode: "token_billing",
      routerConfig: {
        model_match_policy_markdown_path: benchmarkSubsetPolicyPath,
      },
    })

    if (benchmarkSubsetRecommendation?.roles?.dev?.default_model !== "openai/gpt-5.1-codex-max") {
      throw new Error("expected coding+quality benchmark preference to pick the codex model")
    }
    if ((benchmarkSubsetRecommendation?.roles?.dev?.policy_adjustment || 0) <= 0) {
      throw new Error("expected benchmark preference subset matching to contribute a positive policy adjustment")
    }
    process.stdout.write("PASS: markdown model-match policy overrides abstract role strategy and scoring\n")
  } finally {
    process.env.HOME = originalHome
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

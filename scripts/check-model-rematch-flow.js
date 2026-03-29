const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")
const { pathToFileURL } = require("node:url")

function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch (error) {
    if (error?.code === "ENOENT") return null
    throw error
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function readJsonLines(filePath) {
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch (error) {
    if (error?.code === "ENOENT") return []
    throw error
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const pluginUrl = pathToFileURL(path.resolve(repoRoot, "plugins", "opencode-router.js")).href
  const pathsUrl = pathToFileURL(path.resolve(repoRoot, "src", "paths.js")).href
  const { OpenCodeRouterPlugin } = await import(pluginUrl)
  const { STATE_PATHS } = await import(pathsUrl)

  const priorEnvConfig = process.env.OPENCODE_ROUTER_CONFIG
  const priorOpencodeBin = process.env.OPENCODE_BIN
  const priorTestMarker = process.env.OPENCODE_ROUTER_TEST_MARKER
  const priorTestDepth = process.env.OPENCODE_ROUTER_TEST_DEPTH
  const priorHome = process.env.HOME
  const priorModelMatchExists = fs.existsSync(STATE_PATHS.modelMatch)
  const priorModelMatchContent = priorModelMatchExists ? fs.readFileSync(STATE_PATHS.modelMatch, "utf8") : ""
  const priorAuditExists = fs.existsSync(STATE_PATHS.modelDiscoveryAudit)
  const priorAuditContent = priorAuditExists ? fs.readFileSync(STATE_PATHS.modelDiscoveryAudit, "utf8") : ""
  const projectConfigPath = path.resolve(repoRoot, ".opencode", "opencode-router.json")
  const priorProjectConfigExists = fs.existsSync(projectConfigPath)
  const priorProjectConfigContent = priorProjectConfigExists ? fs.readFileSync(projectConfigPath, "utf8") : ""

  const tempDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-rematch-"))
  const tempConfigPath = path.resolve(tempDir, "opencode-router.json")
  const tempHome = path.resolve(tempDir, "home")
  const failingOpencodeBinPath = path.resolve(tempDir, "missing-opencode")

  const promptMessages = []
  const client = {
    app: { log: async () => {} },
    tui: {
      toast: { show: async () => {} },
    },
    session: {
      prompt: async (payload) => {
        const text = payload?.body?.parts?.find((part) => part.type === "text")?.text || ""
        promptMessages.push(text)
      },
    },
  }

  let failed = false
  try {
    const initialConfig = { billing_mode: "token_billing" }
    const updatedConfig = { ...initialConfig, billing_mode: "request_billing" }

    writeJson(tempConfigPath, initialConfig)
    process.env.OPENCODE_ROUTER_CONFIG = tempConfigPath
    process.env.OPENCODE_BIN = failingOpencodeBinPath

    try {
      fs.unlinkSync(STATE_PATHS.modelDiscoveryAudit)
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }

    const plugin = await OpenCodeRouterPlugin({ client })
    const matchAfterInit = readJsonOrNull(STATE_PATHS.modelMatch)
    if (!matchAfterInit?.recommendation_id) {
      throw new Error("expected plugin init to persist model-match")
    }
    if (matchAfterInit.model_pool_source !== "verified_discovery_required" || matchAfterInit.model_pool_verified !== false) {
      throw new Error("expected plugin init rematch to use strict verified-discovery-required metadata before audit refresh")
    }
    if (matchAfterInit.billing_mode !== initialConfig.billing_mode) {
      throw new Error("expected init rematch to honor initial billing_mode")
    }
    process.stdout.write("PASS: plugin init auto-rematch persists model-match\n")

    writeJson(tempConfigPath, updatedConfig)

    await plugin.config({ command: {}, agent: {} })
    const matchAfterConfig = readJsonOrNull(STATE_PATHS.modelMatch)
    if (!matchAfterConfig?.recommendation_id) {
      throw new Error("expected config hook rematch to persist model-match")
    }
    if (matchAfterConfig.model_pool_source !== "verified_discovery_required" || matchAfterConfig.model_pool_verified !== false) {
      throw new Error("expected config hook rematch to keep strict verified-discovery-required metadata before audit refresh")
    }
    if (matchAfterConfig.billing_mode !== updatedConfig.billing_mode) {
      throw new Error("expected config hook rematch to reload changed billing_mode")
    }
    process.stdout.write("PASS: plugin config auto-rematch refreshes changed router config\n")

    try {
      await plugin["command.execute.before"]({ command: "pi-rematch-request", sessionID: "test-session" })
    } catch (error) {
      if (!String(error?.message || "").includes("__OPENCODE_ROUTER_COMMAND_HANDLED__")) {
        throw error
      }
    }

    const latestPrompt = promptMessages[promptMessages.length - 1] || ""
    if (!latestPrompt.includes("[Model Match Rematch]")) {
      throw new Error("expected /pi-rematch-request command to inject rematch summary")
    }
    if (!latestPrompt.includes("Status:")) {
      throw new Error("expected compact rematch status line")
    }
    if (!latestPrompt.includes("Billing mode: request_billing")) {
      throw new Error("expected compact rematch to display selected billing mode")
    }
    if (!latestPrompt.includes("Pool:")) {
      throw new Error("expected compact rematch pool line")
    }
    if (!latestPrompt.includes("Discovery refresh:")) {
      throw new Error("expected compact rematch discovery refresh status line")
    }
    if (!latestPrompt.includes("complete (synchronous verified discovery before rematch)")) {
      throw new Error("expected /pi-rematch-request to finish synchronous verified discovery before reporting result")
    }
    if (!latestPrompt.includes("Policy authority: inspect ~/.config/opencode/opencode-router-model-match.md")) {
      throw new Error("expected rematch output to hint the global markdown policy authority path")
    }
    if (!latestPrompt.includes("Audit:")) {
      throw new Error("expected compact rematch audit status line")
    }
    if (!latestPrompt.includes("[Updated Config]")) {
      throw new Error("expected rematch output to include updated config section")
    }
    if (!latestPrompt.includes("[Role Weights]")) {
      throw new Error("expected rematch output to include role weights section")
    }
    if (!latestPrompt.includes("Pi:")) {
      throw new Error("expected compact rematch Pi row")
    }
    if (!latestPrompt.includes("Co-pi:")) {
      throw new Error("expected compact rematch Co-pi row")
    }
    if (!latestPrompt.includes("Wise:")) {
      throw new Error("expected compact rematch Wise row")
    }
    if (latestPrompt.includes("Source:")) {
      throw new Error("expected compact rematch output without source line")
    }
    if (latestPrompt.includes("Config:")) {
      throw new Error("expected compact rematch output without raw config path line")
    }
    if (!latestPrompt.includes("inspect ~/.config/opencode/opencode-router.json")) {
      throw new Error("expected rematch output to hint the global router config authority path")
    }
    if (latestPrompt.includes("scout(") || latestPrompt.includes("vis(")) {
      throw new Error("expected compact rematch warnings to suppress non-core selector misses (scout/vis)")
    }
    if (latestPrompt.includes("role_model_preferences.")) {
      throw new Error("expected compact rematch output without raw selector-miss spam")
    }
    const matchAfterCommand = readJsonOrNull(STATE_PATHS.modelMatch)
    if (!matchAfterCommand?.recommendation_id) {
      throw new Error("expected /pi-rematch-request command to keep persisted model-match")
    }
    if (["opencode_config_runtime", "builtin_defaults"].includes(matchAfterCommand.model_pool_source)) {
      throw new Error("expected /pi-rematch-request command path to avoid unverified runtime/default fallback sources")
    }
    if (!Array.isArray(matchAfterCommand.warnings) || !matchAfterCommand.warnings.some((line) => String(line).includes("timed out after") || String(line).includes("failed; no verified model pool available"))) {
      throw new Error("expected /pi-rematch-request command path to surface honest synchronous discovery failure/timing warnings")
    }
    if (!String(matchAfterCommand.model_pool_verification?.status || "").trim()) {
      throw new Error("expected /pi-rematch-request command path to persist synchronous discovery status metadata")
    }
    if (matchAfterCommand.billing_mode !== "request_billing") {
      throw new Error("expected /pi-rematch-request to persist selected request_billing mode")
    }
    process.stdout.write("PASS: /pi-rematch-request command runs synchronous discovery-first rematch and reports final summary\n")

    process.env.HOME = tempHome
    delete process.env.OPENCODE_ROUTER_CONFIG
    fs.rmSync(path.resolve(tempHome, ".config", "opencode", "opencode-router.json"), { force: true })
    if (priorProjectConfigExists) {
      fs.unlinkSync(projectConfigPath)
    }

    const pluginWithoutConfig = await OpenCodeRouterPlugin({ client })
    try {
      await pluginWithoutConfig["command.execute.before"]({ command: "pi-rematch-request", sessionID: "test-session-no-config" })
    } catch (error) {
      if (!String(error?.message || "").includes("__OPENCODE_ROUTER_COMMAND_HANDLED__")) {
        throw error
      }
    }

    const seededConfigPath = path.resolve(tempHome, ".config", "opencode", "opencode-router.json")
    const seededPolicyPath = path.resolve(tempHome, ".config", "opencode", "opencode-router-model-match.md")
    if (!fs.existsSync(seededConfigPath)) {
      throw new Error("expected plugin init to auto-seed global router config when none exists")
    }
    if (!fs.existsSync(seededPolicyPath)) {
      throw new Error("expected plugin init to auto-seed global model-match policy markdown when none exists")
    }
    const latestNoConfigPrompt = promptMessages[promptMessages.length - 1] || ""
    if (!latestNoConfigPrompt.includes("Config authority: inspect ~/.config/opencode/opencode-router.json")) {
      throw new Error("expected /pi-rematch-request summary to point at the active global router config")
    }
    if (!latestNoConfigPrompt.includes("Policy authority: inspect ~/.config/opencode/opencode-router-model-match.md")) {
      throw new Error("expected /pi-rematch-request summary to point at the active markdown policy file")
    }
    if (latestNoConfigPrompt.includes("default global config created")) {
      throw new Error("expected /pi-rematch-request summary to avoid stale command-created config wording after init auto-seed")
    }
    if (latestNoConfigPrompt.includes("Config:")) {
      throw new Error("expected /pi-rematch-request seeded summary to avoid raw config path line")
    }
    process.stdout.write("PASS: plugin init auto-seeds missing global config + policy before /pi-rematch-request summary\n")

    const routerConfigPath = path.resolve(tempHome, ".config", "opencode", "opencode-router.json")
    const routerConfig = readJsonOrNull(routerConfigPath)
    if (!routerConfig?.role_model_preferences || typeof routerConfig.role_model_preferences !== "object") {
      throw new Error("expected /pi-rematch-request durable sync to populate router role_model_preferences")
    }
    const syncedPiModel = routerConfig.role_model_preferences.pi?.[0] || null
    const syncedPiFallbacks = routerConfig.role_model_preferences.pi?.slice(1) || []
    const persistedAfterSeed = readJsonOrNull(STATE_PATHS.modelMatch)
    const recommendedPiModel = persistedAfterSeed?.roles?.pi?.default_model || persistedAfterSeed?.roles?.pi?.model || null
    const recommendedPiFallbacks = Array.isArray(persistedAfterSeed?.fallback?.pi) ? persistedAfterSeed.fallback.pi : []
    if (recommendedPiModel && syncedPiModel !== recommendedPiModel) {
      throw new Error("expected /pi-rematch-request durable sync to mirror pi recommendation into router preferences")
    }
    if (!recommendedPiModel && syncedPiModel) {
      throw new Error("expected router preferences to avoid inventing pi model when verified recommendation is unavailable")
    }
    if (recommendedPiFallbacks.length > 0 && JSON.stringify(syncedPiFallbacks) !== JSON.stringify(recommendedPiFallbacks)) {
      throw new Error("expected /pi-rematch-request durable sync to persist matched pi fallback chain")
    }
    if (routerConfig.billing_mode !== "request_billing") {
      throw new Error("expected /pi-rematch-request durable sync to persist selected billing_mode to global router config")
    }
    process.stdout.write("PASS: /pi-rematch-request durable sync writes router role_model_preferences\n")

    const recursiveConfigPath = path.resolve(tempDir, "recursive-router.json")
    const recursiveMarkerPath = path.resolve(tempDir, "recursive-opencode-invocations.jsonl")
    const recursiveOpencodeBinPath = path.resolve(tempDir, "fake-opencode.js")
    writeJson(recursiveConfigPath, initialConfig)
    fs.writeFileSync(
      recursiveOpencodeBinPath,
      [
        "#!/usr/bin/env node",
        'const fs = require("node:fs")',
        "async function main() {",
        '  const depth = Number.parseInt(process.env.OPENCODE_ROUTER_TEST_DEPTH || "0", 10)',
        "  fs.appendFileSync(",
        `    ${JSON.stringify(recursiveMarkerPath)},`,
        "    JSON.stringify({",
        "      depth,",
        "      disable: process.env.OPENCODE_ROUTER_DISABLE_AUTO_REMATCH || null,",
        "      child: process.env.OPENCODE_ROUTER_MODEL_DISCOVERY_CHILD || null,",
        "      argv: process.argv.slice(2),",
        "    }) + \"\\n\",",
        '    "utf8",',
        "  )",
        "  if (depth >= 3) {",
        '    process.stderr.write("recursive model discovery detected\\n")',
        "    process.exit(99)",
        "    return",
        "  }",
        '  process.env.OPENCODE_ROUTER_TEST_DEPTH = String(depth + 1)',
        '  if (process.argv[2] !== "models") {',
        "    process.exit(64)",
        "    return",
        "  }",
        `  const { OpenCodeRouterPlugin } = await import(${JSON.stringify(pluginUrl)})`,
        "  const client = {",
        "    app: { log: async () => {} },",
        "    tui: { toast: { show: async () => {} } },",
        "    session: { prompt: async () => {} },",
        "  }",
        "  await OpenCodeRouterPlugin({ client })",
        '  process.stdout.write("openai/gpt-5.4\\n")',
        "}",
        "main().catch((error) => {",
        '  process.stderr.write(`${error.message}\\n`)',
        "  process.exit(1)",
        "})",
      ].join("\n"),
      "utf8",
    )
    fs.chmodSync(recursiveOpencodeBinPath, 0o755)

    writeJson(STATE_PATHS.modelDiscoveryAudit, {
      audit_id: "mda-preexisting",
      audited_at: new Date().toISOString(),
      status: "verified",
      command: "opencode models",
      command_bin: "fixture",
      timeout_ms: 1000,
      duration_ms: 10,
      error_code: null,
      error_message: null,
      exit_code: 0,
      signal: null,
      models: ["openai/gpt-5.4"],
      model_count: 1,
      fingerprint: '["openai/gpt-5.4"]',
    })
    try {
      fs.unlinkSync(STATE_PATHS.modelMatch)
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }

    process.env.OPENCODE_ROUTER_CONFIG = recursiveConfigPath
    process.env.OPENCODE_BIN = recursiveOpencodeBinPath
    process.env.OPENCODE_ROUTER_TEST_MARKER = recursiveMarkerPath
    delete process.env.OPENCODE_ROUTER_TEST_DEPTH

    const recursivePlugin = await OpenCodeRouterPlugin({ client })
    const recursiveInitInvocations = readJsonLines(recursiveMarkerPath)
    if (recursiveInitInvocations.length !== 1) {
      throw new Error("expected startup rematch to invoke model discovery child exactly once")
    }
    if (recursiveInitInvocations[0]?.disable !== "1" || recursiveInitInvocations[0]?.child !== "1") {
      throw new Error("expected model discovery child to inherit auto-rematch recursion guards")
    }

    await recursivePlugin.config({ command: {}, agent: {} })
    const recursiveAfterSameConfig = readJsonLines(recursiveMarkerPath)
    if (recursiveAfterSameConfig.length !== 1) {
      throw new Error("expected config hook to skip duplicate startup model discovery when router config is unchanged")
    }

    writeJson(recursiveConfigPath, updatedConfig)
    await recursivePlugin.config({ command: {}, agent: {} })
    const recursiveAfterChangedConfig = readJsonLines(recursiveMarkerPath)
    if (recursiveAfterChangedConfig.length !== 2) {
      throw new Error("expected config hook to refresh model discovery exactly once after router config changes")
    }
    process.stdout.write("PASS: model discovery child disables recursive auto-rematch and config hook de-duplicates unchanged refresh\n")

  } catch (error) {
    failed = true
    process.stdout.write(`FAIL: model rematch flow :: ${error.message}\n`)
  } finally {
    if (priorEnvConfig) {
      process.env.OPENCODE_ROUTER_CONFIG = priorEnvConfig
    } else {
      delete process.env.OPENCODE_ROUTER_CONFIG
    }

    if (priorOpencodeBin) {
      process.env.OPENCODE_BIN = priorOpencodeBin
    } else {
      delete process.env.OPENCODE_BIN
    }

    if (priorTestMarker) {
      process.env.OPENCODE_ROUTER_TEST_MARKER = priorTestMarker
    } else {
      delete process.env.OPENCODE_ROUTER_TEST_MARKER
    }

    if (priorTestDepth) {
      process.env.OPENCODE_ROUTER_TEST_DEPTH = priorTestDepth
    } else {
      delete process.env.OPENCODE_ROUTER_TEST_DEPTH
    }

    if (priorHome) {
      process.env.HOME = priorHome
    } else {
      delete process.env.HOME
    }

    if (priorModelMatchExists) {
      fs.mkdirSync(path.dirname(STATE_PATHS.modelMatch), { recursive: true })
      fs.writeFileSync(STATE_PATHS.modelMatch, priorModelMatchContent, "utf8")
    } else {
      try {
        fs.unlinkSync(STATE_PATHS.modelMatch)
      } catch (error) {
        if (error?.code !== "ENOENT") throw error
      }
    }

    if (priorAuditExists) {
      fs.mkdirSync(path.dirname(STATE_PATHS.modelDiscoveryAudit), { recursive: true })
      fs.writeFileSync(STATE_PATHS.modelDiscoveryAudit, priorAuditContent, "utf8")
    } else {
      try {
        fs.unlinkSync(STATE_PATHS.modelDiscoveryAudit)
      } catch (error) {
        if (error?.code !== "ENOENT") throw error
      }
    }

    if (priorProjectConfigExists) {
      fs.mkdirSync(path.dirname(projectConfigPath), { recursive: true })
      fs.writeFileSync(projectConfigPath, priorProjectConfigContent, "utf8")
    } else {
      try {
        fs.unlinkSync(projectConfigPath)
      } catch (error) {
        if (error?.code !== "ENOENT") throw error
      }
    }

    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (error) {
      // ignore temp cleanup failure in check harness
    }
  }

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

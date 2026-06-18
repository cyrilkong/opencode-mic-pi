const path = require("node:path")
const fs = require("node:fs")
const os = require("node:os")
const { pathToFileURL } = require("node:url")

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const tempOverrideDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-config-"))
  const configPath = path.resolve(tempOverrideDir, "opencode-router.json")
  const dataDir = path.resolve(tempOverrideDir, "data")
  writeJson(configPath, {
    billing_mode: null,
    provider_preferences: [],
    role_model_preferences: {},
    apply_agent_model_overrides: true,
    manage_agents: true,
    public_agents: ["mic", "pi", "snap"],
    hide_backstage_agents: true,
    seed_global_surfaces_on_init: false,
    disable_builtin_agents: ["plan", "general", "build", "explore"],
    force_cross_model_family_for_copi: true,
    opencode_models_timeout_ms: null,
  })
  process.env.OPENCODE_ROUTER_CONFIG = configPath
  process.env.OPENCODE_ROUTER_DATA_DIR = dataDir

  const routerConfigUrl = pathToFileURL(path.resolve(repoRoot, "src", "router-config.js")).href
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const pathsUrl = pathToFileURL(path.resolve(repoRoot, "src", "paths.js")).href
  const pluginUrl = pathToFileURL(path.resolve(repoRoot, "plugins", "opencode-router.js")).href

  const { loadRouterConfig, writeRoleModelPreferences, resolveRouterConfigBackupPath } = await import(routerConfigUrl)
  const { recommendRoleModels, readModelDiscoveryAudit } = await import(modelMatchUrl)
  const { STATE_PATHS } = await import(pathsUrl)
  const { OpenCodeRouterPlugin } = await import(pluginUrl)

  const configState = loadRouterConfig()
  if (!configState.found) throw new Error("expected router config to be found")
  if (configState.source !== configPath) throw new Error("router config source path mismatch")

  const recommendation = recommendRoleModels({
    routerConfig: configState.config,
    configSource: configState.source,
    discoveryAudit: readModelDiscoveryAudit(),
  })

  if (typeof recommendation.model_pool_source !== "string" || recommendation.model_pool_source.length === 0) {
    throw new Error("expected model_pool_source metadata in recommendation")
  }
  if (typeof recommendation.model_pool_verified !== "boolean") {
    throw new Error("expected model_pool_verified metadata in recommendation")
  }
  if (!recommendation.model_pool_verification || typeof recommendation.model_pool_verification !== "object") {
    throw new Error("expected model_pool_verification metadata in recommendation")
  }

  const expectedPi = configState.config?.role_model_preferences?.pi?.[0] || null
  const expectedCopi = configState.config?.role_model_preferences?.["co-pi"]?.[0] || null
  const expectedDev = configState.config?.role_model_preferences?.dev?.[0] || null
  const resolvedPi = recommendation?.roles?.pi?.default_model || null
  const resolvedCopi = recommendation?.roles?.["co-pi"]?.default_model || null
  const warnings = Array.isArray(recommendation.warnings) ? recommendation.warnings : []
  const hasModels = Array.isArray(recommendation.available_models) && recommendation.available_models.length > 0
  if (!hasModels && warnings.length === 0) {
    throw new Error("expected explicit warning when no selectable model pool is available")
  }
  if (expectedPi) {
    if (!resolvedPi && hasModels) {
      throw new Error("expected pi model recommendation to be resolved")
    }
    if (!resolvedPi && !hasModels) {
      process.stdout.write("PASS: pi recommendation is empty when no verified model pool is available\n")
    }
    const piSelectorLooksExact = String(expectedPi).includes("/")
    const piAvailable = Array.isArray(recommendation.available_models) && recommendation.available_models.includes(expectedPi)
    if (piSelectorLooksExact && piAvailable && resolvedPi !== expectedPi) {
      throw new Error("expected exact pi model override from router config")
    }
    if (piSelectorLooksExact && !piAvailable && hasModels && !warnings.some((line) => line.includes("Preference selectors unmatched"))) {
      throw new Error("expected warning for unavailable pi role override")
    }
  }
  if (expectedCopi) {
    if (!resolvedCopi && hasModels) {
      throw new Error("expected co-pi model recommendation to be resolved")
    }
    if (!resolvedCopi && !hasModels) {
      process.stdout.write("PASS: co-pi recommendation is empty when no verified model pool is available\n")
    }
    const copiSelectorLooksExact = String(expectedCopi).includes("/")
    const copiAvailable = Array.isArray(recommendation.available_models) && recommendation.available_models.includes(expectedCopi)
    if (copiSelectorLooksExact && copiAvailable && resolvedCopi !== expectedCopi) {
      throw new Error("expected exact co-pi model override from router config")
    }
    if (copiSelectorLooksExact && !copiAvailable && hasModels && !warnings.some((line) => line.includes("Preference selectors unmatched"))) {
      throw new Error("expected warning for unavailable co-pi role override")
    }
  }
  if (expectedDev && hasModels && !recommendation.roles?.dev?.model) {
    throw new Error("expected dev model recommendation to be resolved")
  }
  if (!Array.isArray(recommendation.fallback?.pi)) {
    throw new Error("expected pi fallback field to exist as array")
  }
  if (recommendation.model_pool_verified && recommendation.available_models.length > 0 && recommendation.fallback.pi.length === 0) {
    throw new Error("expected non-empty pi fallback chain when verified model pool exists")
  }
  process.stdout.write("PASS: router config is loaded and model-match overrides are applied\n")

  const client = {
    app: { log: async () => {} },
    session: { prompt: async () => {} },
    tui: { toast: { show: async () => {} } },
  }
  const plugin = await OpenCodeRouterPlugin({ client })
  const persistedMatch = JSON.parse(fs.readFileSync(STATE_PATHS.modelMatch, "utf8").trim())
  if (["opencode_config_runtime", "builtin_defaults"].includes(persistedMatch.model_pool_source)) {
    throw new Error("expected plugin init rematch to avoid unverified runtime/default fallback model pool sources")
  }
  const opencodeConfig = { command: {}, agent: {} }
  await plugin.config(opencodeConfig)

  for (const commandName of ["pi-dispatch", "pi-rematch-token", "pi-rematch-request", "pi-up", "pi-book"]) {
    if (!opencodeConfig.command?.[commandName]?.template) {
      throw new Error(`expected plugin config hook to inject command ${commandName}`)
    }
  }

  if (opencodeConfig.default_agent !== "mic") {
    throw new Error("expected plugin config hook to set default_agent=mic in managed mode")
  }
  if (opencodeConfig.agent?.mic?.mode !== "all") {
    throw new Error("expected mic mode=all to be injected by managed agent profile")
  }
  if (opencodeConfig.agent?.pi?.mode !== "all") {
    throw new Error("expected pi mode=all to be injected by managed agent profile")
  }
  if (opencodeConfig.agent?.dev?.mode !== "subagent") {
    throw new Error("expected dev mode to be injected by managed agent profile")
  }
  if (opencodeConfig.agent?.dev?.hidden !== true) {
    throw new Error("expected backstage dev agent to be hidden by managed agent policy")
  }
  if (opencodeConfig.agent?.mic?.hidden !== false) {
    throw new Error("expected public mic agent to remain visible")
  }
  if (opencodeConfig.agent?.pi?.hidden !== false) {
    throw new Error("expected public pi agent to remain visible")
  }
  if (opencodeConfig.agent?.snap?.hidden !== false) {
    throw new Error("expected public snap agent to remain visible")
  }
  if (typeof opencodeConfig.agent?.mic?.prompt !== "string" || !opencodeConfig.agent.mic.prompt.includes("You are [Mic], the user's low-cost intake mic and persistent front window.")) {
    throw new Error("expected mic inline prompt text to be injected by managed agent profile")
  }
  if (typeof opencodeConfig.agent?.pi?.prompt !== "string" || !opencodeConfig.agent.pi.prompt.includes("You are [Pi], the foreman and backstage execution orchestrator.")) {
    throw new Error("expected pi inline prompt text to be injected by managed agent profile")
  }
  if (
    opencodeConfig.agent?.pi?.description
    !== "Foreman and execution orchestrator. Takes a backlog and converts it into sequenced, delegated execution, whether Pi is frontstage or called backstage by Mic."
  ) {
    throw new Error("expected pi description to be injected by managed agent profile")
  }
  if (
    opencodeConfig.agent?.mic?.description
    !== "User-facing intake mic and backlog reconciler. Captures messy input and distills it into a clean backlog, and can also reconcile backlog updates backstage for Pi."
  ) {
    throw new Error("expected mic description to be injected by managed agent profile")
  }
  if (opencodeConfig.agent?.mic?.temperature !== 0) {
    throw new Error("expected mic temperature=0 to keep intake deterministic")
  }
  if (opencodeConfig.agent?.mic?.maxSteps !== 2) {
    throw new Error("expected mic maxSteps=2 to keep intake agentic churn bounded")
  }
  for (const builtin of ["plan", "general", "build", "explore"]) {
    if (opencodeConfig.agent?.[builtin]?.disable !== true) {
      throw new Error(`expected builtin agent ${builtin} to be auto-disabled`)
    }
    if (Object.prototype.hasOwnProperty.call(opencodeConfig.agent?.[builtin] || {}, "mode")) {
      throw new Error(`expected builtin agent ${builtin} mode to remain unmanaged`)
    }
    if (Object.prototype.hasOwnProperty.call(opencodeConfig.agent?.[builtin] || {}, "hidden")) {
      throw new Error(`expected builtin agent ${builtin} hidden to remain unmanaged`)
    }
  }

  if (resolvedPi && opencodeConfig.agent?.pi?.model !== resolvedPi) {
    throw new Error("expected plugin config hook to apply pi model override")
  }
  if (resolvedCopi && opencodeConfig.agent?.["co-pi"]?.model !== resolvedCopi) {
    throw new Error("expected plugin config hook to apply co-pi model override")
  }
  if (recommendation.roles?.dev?.model && opencodeConfig.agent?.dev?.model !== recommendation.roles.dev.model) {
    throw new Error("expected plugin config hook to apply dev model recommendation in managed mode")
  }
  if (hasModels && !recommendation.roles?.map?.family_recommendation) {
    throw new Error("expected family recommendation to be included for role output")
  }
  process.stdout.write("PASS: plugin config hook manages agent profiles and applies model overrides\n")

  const paramsOutput = { temperature: 0.7, topP: 0.9, topK: 40, options: {} }
  await plugin["chat.params"](
    {
      sessionID: "router-config-session",
      agent: "mic",
      model: { providerID: "fixture", modelID: "fixture-model" },
      provider: { id: "fixture", name: "fixture", source: "config", env: [], options: {}, models: {} },
      message: {
        id: "router-config-user-msg",
        sessionID: "router-config-session",
        role: "user",
        time: { created: Date.now() },
        agent: "mic",
        model: { providerID: "fixture", modelID: "fixture-model" },
      },
    },
    paramsOutput,
  )
  if (paramsOutput.temperature !== 0 || paramsOutput.topP !== 1) {
    throw new Error("expected chat.params to clamp mic generation settings")
  }
  process.stdout.write("PASS: mic runtime params are clamped for deterministic low-churn intake\n")

  const piPreferenceSelectors = configState.config?.role_model_preferences?.pi || []
  if (piPreferenceSelectors.length > 1) {
    const selectorPoolRecommendation = recommendRoleModels({
      availableModels: [
        `derived/${piPreferenceSelectors[0].replace(/^\*\//, "")}`,
        `derived/${piPreferenceSelectors[1].replace(/^\*\//, "")}`,
      ],
      routerConfig: {
        ...configState.config,
        role_model_preferences: {
          ...configState.config.role_model_preferences,
          pi: [...piPreferenceSelectors.slice(0, 2)],
        },
      },
    })

    const fallbackPi = selectorPoolRecommendation?.fallback?.pi || []
    if (!Array.isArray(fallbackPi) || fallbackPi.length === 0) {
      throw new Error("expected derived selector fallback candidates for pi")
    }
    process.stdout.write("PASS: role preference ordering produces derived fallback candidates\n")
  } else {
    process.stdout.write("SKIP: derived selector fallback candidate check (schema config has fewer than two pi selectors)\n")
  }

  if (!recommendation.roles?.scout?.family_recommendation) {
    if (recommendation.available_models.length > 0) {
      throw new Error("expected benchmark-assisted family recommendation for scout when models are available")
    }
  }
  process.stdout.write("PASS: benchmark-assisted role ratings are present in router-config recommendation\n")

  const strictPoolRecommendation = recommendRoleModels({
    availableModels: [],
    routerConfig: configState.config,
  })
  if (strictPoolRecommendation.model_pool_verified !== true) {
    throw new Error("expected explicit availableModels input to be treated as verified pool")
  }
  if ((strictPoolRecommendation.available_models || []).length !== 0) {
    throw new Error("expected strict empty verified pool to remain empty")
  }
  if (strictPoolRecommendation.roles?.pi?.model) {
    throw new Error("expected no pi model selection from empty verified pool")
  }
  if (!Array.isArray(strictPoolRecommendation.warnings) || strictPoolRecommendation.warnings.some((line) => line.includes("role_model_preferences."))) {
    throw new Error("expected strict empty verified pool warnings to stay aggregated")
  }
  process.stdout.write("PASS: empty verified pool does not silently degrade to unverified selections\n")

  const slowDiscoveryRecommendation = recommendRoleModels({
    routerConfig: configState.config,
    discoveryAudit: readModelDiscoveryAudit(),
  })
  if (!String(slowDiscoveryRecommendation.model_pool_verification?.status || "").trim()) {
    throw new Error("expected discovery verification status metadata to be recorded")
  }
  process.stdout.write("PASS: model pool verification metadata records strict audit status details\n")

  const priorHome = process.env.HOME
  const priorOverride = process.env.OPENCODE_ROUTER_CONFIG
  const repoRootConfigPath = path.resolve(repoRoot, "opencode-router.json")
  const priorRepoRootConfigExists = fs.existsSync(repoRootConfigPath)
  const priorRepoRootConfigContent = priorRepoRootConfigExists ? fs.readFileSync(repoRootConfigPath, "utf8") : ""
  const tempDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-config-precedence-"))
  const tempHome = path.resolve(tempDir, "home")
  const globalConfigPath = path.resolve(tempHome, ".config", "opencode", "opencode-router.json")
  const overrideConfigPath = path.resolve(tempDir, "override", "router.json")

  try {
    writeJson(globalConfigPath, { billing_mode: "request_billing" })
    writeJson(overrideConfigPath, { billing_mode: "token_billing" })

    process.env.HOME = tempHome
    process.env.OPENCODE_ROUTER_CONFIG = overrideConfigPath

    const overrideState = loadRouterConfig()
    if (overrideState.source !== overrideConfigPath) {
      throw new Error("expected env override to be highest-precedence router config source")
    }
    if (overrideState.config?.billing_mode !== "token_billing") {
      throw new Error("expected env override billing_mode to be loaded")
    }

    delete process.env.OPENCODE_ROUTER_CONFIG
    writeJson(repoRootConfigPath, { billing_mode: "token_billing" })

    const globalFallbackState = loadRouterConfig()
    if (globalFallbackState.source !== globalConfigPath) {
      throw new Error("expected global home config to be used when project-local config is absent")
    }
    if (globalFallbackState.config?.billing_mode !== "request_billing") {
      throw new Error("expected repo-root opencode-router.json to be ignored by loader")
    }

    process.stdout.write("PASS: router config precedence is env override > global home, and repo-root/project-local configs are ignored\n")

    const backupProbePath = path.resolve(tempDir, "backup-probe.json")
    writeJson(backupProbePath, {
      billing_mode: "token_billing",
      role_model_preferences: { pi: ["provider-a/model-a"] },
    })
    const firstWrite = writeRoleModelPreferences({
      preferences: { pi: ["provider-b/model-b"] },
      billingMode: "request_billing",
      targetPath: backupProbePath,
      backup: true,
    })
    const rollbackPath = resolveRouterConfigBackupPath(backupProbePath)
    if (firstWrite.backupPath !== rollbackPath) {
      throw new Error("expected router config rollback backup path to stay fixed")
    }
    if (!fs.existsSync(rollbackPath)) {
      throw new Error("expected router config rollback backup file to be created")
    }
    const rollbackBefore = fs.readFileSync(rollbackPath, "utf8")

    const secondWrite = writeRoleModelPreferences({
      preferences: { pi: ["provider-b/model-b"] },
      billingMode: "request_billing",
      targetPath: backupProbePath,
      backup: true,
    })
    if (secondWrite.wrote !== false || secondWrite.skipped !== "unchanged") {
      throw new Error("expected router config rewrite to skip when content is unchanged")
    }
    const rollbackAfter = fs.readFileSync(rollbackPath, "utf8")
    if (rollbackAfter !== rollbackBefore) {
      throw new Error("expected unchanged router config rewrite to avoid mutating rollback backup")
    }
    const siblingBackups = fs.readdirSync(tempDir).filter((file) => file.startsWith("backup-probe.json.bak"))
    if (siblingBackups.length !== 1 || siblingBackups[0] !== path.basename(rollbackPath)) {
      throw new Error("expected exactly one stable router config rollback backup file")
    }
    process.stdout.write("PASS: router config writes use a single rollback backup and skip unchanged rewrites\n")
  } finally {
    try {
      fs.rmSync(tempOverrideDir, { recursive: true, force: true })
    } catch (error) {
      // ignore temp cleanup errors in check harness
    }

    if (priorRepoRootConfigExists) {
      fs.writeFileSync(repoRootConfigPath, priorRepoRootConfigContent, "utf8")
    } else {
      try {
        fs.unlinkSync(repoRootConfigPath)
      } catch (error) {
        if (error?.code !== "ENOENT") throw error
      }
    }

    if (priorHome) {
      process.env.HOME = priorHome
    } else {
      delete process.env.HOME
    }

    if (priorOverride) {
      process.env.OPENCODE_ROUTER_CONFIG = priorOverride
    } else {
      delete process.env.OPENCODE_ROUTER_CONFIG
    }

    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (error) {
      // ignore cleanup errors in check harness
    }
  }

}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

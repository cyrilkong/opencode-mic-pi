const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const args = new Set(process.argv.slice(2))
  const shouldWrite = args.has("--write")
  const keepPinnedModels = args.has("--keep-opencode-agent-models")
  const keepRouterAgentDefs = args.has("--keep-opencode-router-agents")
  const forceCleanPinnedModels = args.has("--clean-opencode-agent-models")
  const forceCleanRouterAgentDefs = args.has("--clean-opencode-router-agents")

  const repoRoot = path.resolve(__dirname, "..")
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const routerConfigUrl = pathToFileURL(path.resolve(repoRoot, "src", "router-config.js")).href
  const opencodeConfigUrl = pathToFileURL(path.resolve(repoRoot, "src", "opencode-config.js")).href
  const agentPolicyUrl = pathToFileURL(path.resolve(repoRoot, "src", "agent-policy.js")).href
  const {
    explainRecommendation,
    readModelDiscoveryAudit,
    recommendRoleModels,
    writeModelMatch,
  } = await import(modelMatchUrl)
  const { loadRouterConfig } = await import(routerConfigUrl)
  const { DEFAULT_DISABLED_BUILTIN_AGENTS, ROUTER_AGENT_IDS } = await import(agentPolicyUrl)
  const {
    enforceDisabledBuiltinAgents,
    readOpencodeConfig,
    listPinnedAgentModels,
    listAgentDefinitions,
    stripPinnedAgentModels,
    stripAgentDefinitions,
    writeOpencodeConfig,
    backupOpencodeConfig,
  } = await import(opencodeConfigUrl)
  const routerConfigState = loadRouterConfig()
  const cleanupAgentDefinitions = [...ROUTER_AGENT_IDS]
  const builtinDisableList = Array.isArray(routerConfigState.config?.disable_builtin_agents)
    && routerConfigState.config.disable_builtin_agents.length > 0
    ? routerConfigState.config.disable_builtin_agents
    : DEFAULT_DISABLED_BUILTIN_AGENTS
  const cleanPinnedModels = forceCleanPinnedModels || (shouldWrite && !keepPinnedModels)
  const cleanRouterAgentDefs = forceCleanRouterAgentDefs
    || (shouldWrite && routerConfigState.config?.manage_agents !== false && !keepRouterAgentDefs)

  const recommendation = recommendRoleModels({
    routerConfig: routerConfigState.config,
    configSource: routerConfigState.source,
    discoveryAudit: readModelDiscoveryAudit(),
  })

  if (shouldWrite) {
    writeModelMatch(recommendation)
  }

  process.stdout.write(`${explainRecommendation(recommendation)}\n`)

  const opencodeState = readOpencodeConfig()
  if (opencodeState.error || !opencodeState.config) {
    process.stdout.write(`OpenCode config: unavailable (${opencodeState.error || "unknown error"})\n`)
    return
  }

  const pinned = listPinnedAgentModels(opencodeState.config)
  const routerAgentDefs = listAgentDefinitions(opencodeState.config, cleanupAgentDefinitions)

  if (pinned.length === 0) {
    process.stdout.write("OpenCode config pinned agent models: none\n")
  } else {
    process.stdout.write(
      `OpenCode config pinned agent models (${pinned.length}): ${pinned.map((entry) => `${entry.agent}=${entry.model}`).join(", ")}\n`,
    )
  }
  if (routerAgentDefs.length === 0) {
    process.stdout.write("OpenCode config plugin-managed agent definitions: none\n")
  } else {
    process.stdout.write(
      `OpenCode config plugin-managed agent definitions (${routerAgentDefs.length}): ${routerAgentDefs.join(", ")}\n`,
    )
  }

  if (!shouldWrite) {
    if (pinned.length > 0 && cleanPinnedModels) {
      process.stdout.write("Dry run: pinned models detected. Re-run with --write to clean and backup opencode.json\n")
    }
    if (routerAgentDefs.length > 0 && cleanRouterAgentDefs) {
      process.stdout.write("Dry run: plugin-managed agent definitions detected. Re-run with --write to clean and backup opencode.json\n")
    }
    return
  }

  let nextConfig = opencodeState.config
  let removedPinnedModels = []
  let removedRouterAgents = []
  let updatedBuiltinDisables = []

  if (cleanPinnedModels) {
    const result = stripPinnedAgentModels(nextConfig)
    nextConfig = result.nextConfig
    removedPinnedModels = result.removed
  } else {
    process.stdout.write("Pinned models cleanup disabled (--keep-opencode-agent-models)\n")
  }

  if (cleanRouterAgentDefs) {
    const result = stripAgentDefinitions(nextConfig, cleanupAgentDefinitions)
    nextConfig = result.nextConfig
    removedRouterAgents = result.removed
  } else {
    process.stdout.write("Plugin-managed agent definition cleanup disabled (--keep-opencode-router-agents)\n")
  }

  const builtinResult = enforceDisabledBuiltinAgents(nextConfig, builtinDisableList)
  nextConfig = builtinResult.nextConfig
  updatedBuiltinDisables = builtinResult.updated

  if (removedPinnedModels.length === 0 && removedRouterAgents.length === 0 && updatedBuiltinDisables.length === 0) {
    process.stdout.write("OpenCode config cleanup: nothing removed\n")
    return
  }

  const backupPath = backupOpencodeConfig(opencodeState.path)
  writeOpencodeConfig(opencodeState.path, nextConfig)
  if (removedPinnedModels.length > 0) {
    process.stdout.write(`OpenCode config cleanup: removed ${removedPinnedModels.length} pinned agent models\n`)
  }
  if (removedRouterAgents.length > 0) {
    process.stdout.write(`OpenCode config cleanup: removed ${removedRouterAgents.length} plugin-managed agent definitions\n`)
  }
  if (updatedBuiltinDisables.length > 0) {
    process.stdout.write(`OpenCode config cleanup: enforced disable=true for builtin agents ${updatedBuiltinDisables.join(", ")}\n`)
  }
  process.stdout.write(`OpenCode config cleanup backup=${backupPath}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})

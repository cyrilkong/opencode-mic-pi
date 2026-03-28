import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export function getOpencodeConfigPath() {
  return process.env.OPENCODE_CONFIG || path.resolve(os.homedir(), ".config", "opencode", "opencode.json")
}

export function readOpencodeConfig(configPath = getOpencodeConfigPath()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { config: null, path: configPath, error: "opencode config is not a JSON object" }
    }
    return { config: parsed, path: configPath, error: null }
  } catch (error) {
    return { config: null, path: configPath, error: error?.message || "failed to read opencode config" }
  }
}

export function listConfiguredModelsFromOpencodeConfig(configPath = getOpencodeConfigPath()) {
  const state = readOpencodeConfig(configPath)
  const raw = state.config
  const providerConfig = raw?.provider
  if (!providerConfig || typeof providerConfig !== "object") return []

  const result = []
  for (const [providerID, providerDef] of Object.entries(providerConfig)) {
    const models = providerDef?.models
    if (!models || typeof models !== "object") continue
    for (const modelID of Object.keys(models)) {
      if (!modelID) continue
      result.push(`${providerID}/${modelID}`)
    }
  }
  return [...new Set(result)]
}

export function listPinnedAgentModels(config) {
  if (!config || typeof config !== "object") return []
  const agents = config.agent
  if (!agents || typeof agents !== "object" || Array.isArray(agents)) return []

  const pinned = []
  for (const [agentID, agentDef] of Object.entries(agents)) {
    if (!agentDef || typeof agentDef !== "object" || Array.isArray(agentDef)) continue
    const model = typeof agentDef.model === "string" ? agentDef.model.trim() : ""
    if (!model) continue
    pinned.push({ agent: agentID, model })
  }
  return pinned
}

export function stripPinnedAgentModels(config) {
  if (!config || typeof config !== "object") return { nextConfig: config, removed: [] }
  const nextConfig = JSON.parse(JSON.stringify(config))
  const removed = []
  const agents = nextConfig.agent

  if (!agents || typeof agents !== "object" || Array.isArray(agents)) {
    return { nextConfig, removed }
  }

  for (const [agentID, agentDef] of Object.entries(agents)) {
    if (!agentDef || typeof agentDef !== "object" || Array.isArray(agentDef)) continue
    const model = typeof agentDef.model === "string" ? agentDef.model.trim() : ""
    if (!model) continue
    removed.push({ agent: agentID, model })
    delete agentDef.model
  }

  return { nextConfig, removed }
}

export function listAgentDefinitions(config, agentIDs = []) {
  if (!config || typeof config !== "object") return []
  const agents = config.agent
  if (!agents || typeof agents !== "object" || Array.isArray(agents)) return []

  const tracked = new Set((agentIDs || []).map((item) => String(item || "").trim()).filter(Boolean))
  if (tracked.size === 0) return []

  const found = []
  for (const [agentID, agentDef] of Object.entries(agents)) {
    if (!tracked.has(agentID)) continue
    if (!agentDef || typeof agentDef !== "object" || Array.isArray(agentDef)) continue
    found.push(agentID)
  }
  return found
}

export function stripAgentDefinitions(config, agentIDs = []) {
  if (!config || typeof config !== "object") return { nextConfig: config, removed: [] }
  const nextConfig = JSON.parse(JSON.stringify(config))
  const agents = nextConfig.agent
  const tracked = new Set((agentIDs || []).map((item) => String(item || "").trim()).filter(Boolean))
  const removed = []

  if (!agents || typeof agents !== "object" || Array.isArray(agents) || tracked.size === 0) {
    return { nextConfig, removed }
  }

  for (const agentID of Object.keys(agents)) {
    if (!tracked.has(agentID)) continue
    removed.push(agentID)
    delete agents[agentID]
  }

  if (Object.keys(agents).length === 0) {
    delete nextConfig.agent
  }

  return { nextConfig, removed }
}

export function enforceDisabledBuiltinAgents(config, agentIDs = []) {
  if (!config || typeof config !== "object") {
    return { nextConfig: config, updated: [] }
  }

  const nextConfig = JSON.parse(JSON.stringify(config))
  nextConfig.agent ??= {}
  const tracked = [...new Set((agentIDs || []).map((item) => String(item || "").trim()).filter(Boolean))]
  const updated = []

  for (const agentID of tracked) {
    const previous = nextConfig.agent[agentID]
    const prevDisable = previous?.disable === true
    const hadMode = previous && Object.prototype.hasOwnProperty.call(previous, "mode")
    const hadHidden = previous && Object.prototype.hasOwnProperty.call(previous, "hidden")
    nextConfig.agent[agentID] = { ...(previous || {}) }
    nextConfig.agent[agentID].disable = true
    if (Object.prototype.hasOwnProperty.call(nextConfig.agent[agentID], "mode")) {
      delete nextConfig.agent[agentID].mode
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig.agent[agentID], "hidden")) {
      delete nextConfig.agent[agentID].hidden
    }
    if (!prevDisable || hadMode || hadHidden) {
      updated.push(agentID)
    }
  }

  return { nextConfig, updated }
}

export function writeOpencodeConfig(configPath, config) {
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
}

export function backupOpencodeConfig(configPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = `${configPath}.bak-${timestamp}`
  fs.copyFileSync(configPath, backupPath)
  return backupPath
}

export function syncAgentModelsToOpencodeConfig({
  recommendation,
  configPath = getOpencodeConfigPath(),
  backup = true,
} = {}) {
  if (!recommendation || typeof recommendation !== "object") {
    return { applied: [], backupPath: null, wrote: false, path: configPath, skipped: "no_recommendation" }
  }

  const roles = recommendation.roles || {}
  const desired = Object.fromEntries(
    Object.entries(roles)
      .map(([agent, descriptor]) => [agent, descriptor?.default_model || descriptor?.model || null])
      .filter(([, model]) => typeof model === "string" && model.trim().length > 0),
  )

  if (Object.keys(desired).length === 0) {
    return { applied: [], backupPath: null, wrote: false, path: configPath, skipped: "no_models" }
  }

  const state = readOpencodeConfig(configPath)
  const existingConfig = state.config && typeof state.config === "object" && !Array.isArray(state.config)
    ? JSON.parse(JSON.stringify(state.config))
    : {}

  existingConfig.agent ??= {}

  const applied = []
  for (const [agent, model] of Object.entries(desired)) {
    const currentModel = typeof existingConfig.agent[agent]?.model === "string"
      ? existingConfig.agent[agent].model.trim()
      : ""
    if (currentModel === model) continue
    existingConfig.agent[agent] ??= {}
    existingConfig.agent[agent].model = model
    applied.push({ agent, model })
  }

  if (applied.length === 0) {
    return { applied, backupPath: null, wrote: false, path: configPath, skipped: "unchanged" }
  }

  const dir = path.dirname(configPath)
  fs.mkdirSync(dir, { recursive: true })

  let backupPath = null
  if (backup && fs.existsSync(configPath)) {
    backupPath = backupOpencodeConfig(configPath)
  }

  writeOpencodeConfig(configPath, existingConfig)
  return { applied, backupPath, wrote: true, path: configPath, skipped: null }
}

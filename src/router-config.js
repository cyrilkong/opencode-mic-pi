import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { DEFAULT_DISABLED_BUILTIN_AGENTS, DEFAULT_PUBLIC_AGENTS } from "./agent-policy.js"

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeStringMap(value) {
  if (!isPlainObject(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, model]) => typeof model === "string" && model.trim())
      .map(([role, model]) => [String(role).trim(), model.trim()]),
  )
}

function normalizeStringArrayMap(value) {
  if (!isPlainObject(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, list]) => [
        String(key).trim(),
        Array.isArray(list)
          ? list.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
          : [],
      ])
      .filter(([, list]) => list.length > 0),
  )
}

function normalizeRoleModelPreferencesValue(value) {
  return normalizeStringArrayMap(value)
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeOptionalBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback
}

function normalizeRoleModelPreferences(rawConfig) {
  const direct = normalizeStringArrayMap(rawConfig?.role_model_preferences)
  const merged = { ...direct }
  const legacyRoleModels = normalizeStringMap(rawConfig?.role_models)
  const legacyRoleFallbacks = normalizeStringArrayMap(rawConfig?.role_fallbacks)

  for (const [role, model] of Object.entries(legacyRoleModels)) {
    merged[role] = [...new Set([model, ...(merged[role] || []), ...(legacyRoleFallbacks[role] || [])])]
  }

  for (const [role, fallbacks] of Object.entries(legacyRoleFallbacks)) {
    merged[role] = [...new Set([...(merged[role] || []), ...fallbacks])]
  }

  return Object.fromEntries(
    Object.entries(merged)
      .map(([role, selectors]) => [role, normalizeStringArray(selectors)])
      .filter(([, selectors]) => selectors.length > 0),
  )
}

function parseConfigFile(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"))
    if (!isPlainObject(parsed)) {
      return { config: null, errors: [`${path.basename(filePath)} must be a JSON object`] }
    }
    return { config: parsed, errors: [] }
  } catch (error) {
    return { config: null, errors: [error.message] }
  }
}

function serializeConfigFile(config) {
  return `${JSON.stringify(config, null, 2)}\n`
}

export function resolveRouterConfigBackupPath(configPath) {
  return `${configPath}.bak`
}

export function writeRouterConfigFile({
  config,
  targetPath,
  backup = false,
} = {}) {
  const resolvedTarget = targetPath || resolveGlobalConfigPath()
  const nextContent = serializeConfigFile(config)
  const targetExists = fs.existsSync(resolvedTarget)
  const currentContent = targetExists ? fs.readFileSync(resolvedTarget, "utf8") : null

  if (currentContent === nextContent) {
    return {
      path: resolvedTarget,
      backupPath: null,
      wrote: false,
      skipped: "unchanged",
    }
  }

  fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true })

  let backupPath = null
  if (backup && currentContent !== null) {
    backupPath = resolveRouterConfigBackupPath(resolvedTarget)
    const previousBackup = fs.existsSync(backupPath) ? fs.readFileSync(backupPath, "utf8") : null
    if (previousBackup !== currentContent) {
      fs.writeFileSync(backupPath, currentContent, "utf8")
    }
  }

  fs.writeFileSync(resolvedTarget, nextContent, "utf8")

  return {
    path: resolvedTarget,
    backupPath,
    wrote: true,
    skipped: null,
  }
}

function normalizeConfig(rawConfig) {
  const hasDisableBuiltinAgents = Object.prototype.hasOwnProperty.call(rawConfig || {}, "disable_builtin_agents")
  const normalized = {
    billing_mode:
      rawConfig?.billing_mode === "request_billing" || rawConfig?.billing_mode === "token_billing"
        ? rawConfig.billing_mode
        : null,
    provider_preferences: normalizeStringArray(rawConfig?.provider_preferences || rawConfig?.provider_allowlist)
      .map((provider) => provider.toLowerCase()),
    role_model_preferences: normalizeRoleModelPreferences(rawConfig),
    apply_agent_model_overrides:
      typeof rawConfig?.apply_agent_model_overrides === "boolean" ? rawConfig.apply_agent_model_overrides : true,
    manage_agents: typeof rawConfig?.manage_agents === "boolean" ? rawConfig.manage_agents : true,
    public_agents: normalizeStringArray(rawConfig?.public_agents)
      .map((agent) => agent.toLowerCase())
      .filter(Boolean),
    hide_backstage_agents:
      typeof rawConfig?.hide_backstage_agents === "boolean" ? rawConfig.hide_backstage_agents : true,
    ui_notifications: normalizeOptionalBoolean(rawConfig?.ui_notifications, true),
    seed_global_surfaces_on_init: normalizeOptionalBoolean(rawConfig?.seed_global_surfaces_on_init, true),
    disable_builtin_agents: hasDisableBuiltinAgents
      ? normalizeStringArray(rawConfig?.disable_builtin_agents).map((agent) => agent.toLowerCase())
      : DEFAULT_DISABLED_BUILTIN_AGENTS,
    force_cross_model_family_for_copi:
      typeof rawConfig?.force_cross_model_family_for_copi === "boolean"
        ? rawConfig.force_cross_model_family_for_copi
        : true,
    model_match_policy_markdown_path: normalizeOptionalString(rawConfig?.model_match_policy_markdown_path),
    global_avoid_keywords: normalizeStringArray(rawConfig?.global_avoid_keywords)
      .map((kw) => kw.toLowerCase())
      .filter(Boolean),
    opencode_models_timeout_ms:
      Number.isFinite(rawConfig?.opencode_models_timeout_ms) && rawConfig.opencode_models_timeout_ms >= 1000
        ? rawConfig.opencode_models_timeout_ms
        : null,
  }

  if (normalized.public_agents.length === 0) {
    normalized.public_agents = [...DEFAULT_PUBLIC_AGENTS]
  }

  return normalized
}

const USER_MANAGED_ROUTER_CONFIG_TEMPLATE = Object.freeze({
  billing_mode: null,
  provider_preferences: [],
  role_model_preferences: {},
})

export function buildDefaultRouterConfig() {
  return normalizeConfig({
    provider_preferences: [],
    role_model_preferences: {},
  })
}

export function buildUserManagedRouterConfigTemplate() {
  return {
    billing_mode: USER_MANAGED_ROUTER_CONFIG_TEMPLATE.billing_mode,
    provider_preferences: [...USER_MANAGED_ROUTER_CONFIG_TEMPLATE.provider_preferences],
    role_model_preferences: { ...USER_MANAGED_ROUTER_CONFIG_TEMPLATE.role_model_preferences },
  }
}

function resolveOverridePath() {
  if (!process.env.OPENCODE_ROUTER_CONFIG) return null
  const trimmed = String(process.env.OPENCODE_ROUTER_CONFIG).trim()
  return trimmed ? path.resolve(trimmed) : null
}

export function resolveGlobalConfigPath() {
  return path.resolve(os.homedir(), ".config", "opencode", "opencode-router.json")
}

export function seedGlobalRouterConfigIfMissing() {
  const overridePath = resolveOverridePath()
  if (overridePath) {
    return {
      created: false,
      reason: "override_path_set",
      path: null,
    }
  }

  const existing = loadRouterConfig()
  if (existing.found) {
    return {
      created: false,
      reason: "config_already_found",
      path: null,
      source: existing.source || null,
    }
  }

  const targetPath = resolveGlobalConfigPath()
  const defaultConfig = buildUserManagedRouterConfigTemplate()
  writeRouterConfigFile({
    config: defaultConfig,
    targetPath,
    backup: false,
  })
  return {
    created: true,
    reason: "created",
    path: targetPath,
    source: "generated_default",
  }
}

export function loadRouterConfig() {
  const overridePath = resolveOverridePath()
  const globalConfigPath = resolveGlobalConfigPath()
  const candidates = [
    overridePath,
    globalConfigPath,
  ].filter(Boolean)
  const sourcePath = candidates.find((candidate) => fs.existsSync(candidate)) || null

  if (!sourcePath) {
    return {
      source: null,
      config: normalizeConfig({}),
      errors: [],
      found: false,
    }
  }

  const parsed = parseConfigFile(sourcePath)
  if (!parsed.config) {
    return {
      source: sourcePath,
      config: normalizeConfig({}),
      errors: parsed.errors,
      found: true,
    }
  }

  return {
    source: sourcePath,
    config: normalizeConfig(parsed.config),
    errors: parsed.errors,
    found: true,
  }
}

export function writeRoleModelPreferences({
  preferences = {},
  billingMode = undefined,
  targetPath,
  sourcePath,
  backup = false,
} = {}) {
  const resolvedTarget = targetPath || sourcePath || resolveGlobalConfigPath()
  const normalizedPreferences = normalizeRoleModelPreferencesValue(preferences)

  let existingConfig = {}
  const parsed = fs.existsSync(resolvedTarget) ? parseConfigFile(resolvedTarget) : { config: {} }
  if (parsed.config && typeof parsed.config === "object" && !Array.isArray(parsed.config)) {
    existingConfig = { ...parsed.config }
  }

  const nextConfig = { ...existingConfig, role_model_preferences: normalizedPreferences }
  if (billingMode === "request_billing" || billingMode === "token_billing") {
    nextConfig.billing_mode = billingMode
  }

  const writeResult = writeRouterConfigFile({
    config: nextConfig,
    targetPath: resolvedTarget,
    backup,
  })

  return {
    path: writeResult.path,
    backupPath: writeResult.backupPath,
    wrote: writeResult.wrote,
    skipped: writeResult.skipped,
    preferences: normalizedPreferences,
  }
}

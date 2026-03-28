import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export const MODEL_MATCH_POLICY_MARKDOWN_ENV = "OPENCODE_ROUTER_MODEL_MATCH_POLICY_MARKDOWN"

const BILLING_MODES = new Set(["token_billing", "request_billing"])
const ROLES = new Set([
  "mic",
  "pi",
  "co-pi",
  "wise",
  "dev",
  "desi",
  "doc",
  "map",
  "scout",
  "debug",
  "check",
  "vis",
  "snap",
])

const LIST_KEYS = new Set([
  "preferred_families",
  "avoided_families",
  "preferred_benchmark_keys",
  "avoided_benchmark_keys",
  "dimension_priority",
  "family_preferences",
  "family_avoidances",
  "benchmark_preferences",
  "benchmark_avoidances",
])

const MAP_KEYS = new Set(["weights", "price_profile", "request_tier_penalties"])

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function parseScalarValue(value) {
  const trimmed = String(value || "").trim()
  if (!trimmed) return ""
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (trimmed === "null") return null
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)
  return trimmed
}

function parseListValue(value) {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw || ["none", "(none)", "null"].includes(raw)) return []
  return String(value || "")
    .split(/[>,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function parseMapValue(value) {
  return Object.fromEntries(
    String(value || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=")
        if (separator < 0) return null
        const key = entry.slice(0, separator).trim()
        const rawValue = entry.slice(separator + 1).trim()
        if (!key) return null
        return [key, parseScalarValue(rawValue)]
      })
      .filter(Boolean),
  )
}

function parsePolicyValue(key, value) {
  if (LIST_KEYS.has(key)) return parseListValue(value)
  if (MAP_KEYS.has(key)) return parseMapValue(value)
  return parseScalarValue(value)
}

function normalizePolicyLineKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
}

export function resolveGlobalModelMatchPolicyPath() {
  return path.resolve(os.homedir(), ".config", "opencode", "opencode-router-model-match.md")
}

export function resolveModelMatchPolicyPath(routerConfig = {}) {
  const envPath = String(process.env[MODEL_MATCH_POLICY_MARKDOWN_ENV] || "").trim()
  if (envPath) {
    return {
      path: path.resolve(envPath),
      explicit: true,
      source: MODEL_MATCH_POLICY_MARKDOWN_ENV,
    }
  }

  if (nonEmptyString(routerConfig?.model_match_policy_markdown_path)) {
    return {
      path: path.resolve(String(routerConfig.model_match_policy_markdown_path).trim()),
      explicit: true,
      source: "router_config",
    }
  }

  return {
    path: resolveGlobalModelMatchPolicyPath(),
    explicit: false,
    source: "default_global",
  }
}

export function parseModelMatchPolicyMarkdown(markdown) {
  const policy = {
    token_billing: {},
    request_billing: {},
  }
  const errors = []

  let currentMode = null
  let currentRole = null

  const lines = String(markdown || "").split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("<!--")) continue

    const modeMatch = trimmed.match(/^##\s+([a-z0-9_-]+)\s*$/i)
    if (modeMatch) {
      const mode = String(modeMatch[1] || "").trim().toLowerCase()
      currentMode = BILLING_MODES.has(mode) ? mode : null
      currentRole = null
      if (!currentMode) {
        errors.push(`line ${index + 1}: unknown billing mode heading "${modeMatch[1]}"`)
      }
      continue
    }

    const roleMatch = trimmed.match(/^###\s+([a-z0-9_-]+)\s*$/i)
    if (roleMatch) {
      const role = String(roleMatch[1] || "").trim().toLowerCase()
      currentRole = currentMode && ROLES.has(role) ? role : null
      if (!currentMode) {
        errors.push(`line ${index + 1}: role heading "${role}" appeared before billing mode heading`)
        continue
      }
      if (!currentRole) {
        errors.push(`line ${index + 1}: unknown role heading "${roleMatch[1]}"`)
        continue
      }
      policy[currentMode][currentRole] ??= {}
      continue
    }

    const itemMatch = trimmed.match(/^-+\s+([^:]+):\s*(.+)$/)
    if (itemMatch && currentMode && currentRole) {
      const rawKey = normalizePolicyLineKey(itemMatch[1])
      const rawValue = itemMatch[2]
      policy[currentMode][currentRole][rawKey] = parsePolicyValue(rawKey, rawValue)
    }
  }

  return {
    policy,
    errors,
  }
}

export function readModelMatchPolicyMarkdown(routerConfig = {}) {
  const resolved = resolveModelMatchPolicyPath(routerConfig)
  const exists = fs.existsSync(resolved.path)

  if (!exists) {
    return {
      source: resolved.path,
      found: false,
      explicit: resolved.explicit,
      source_kind: resolved.source,
      policy: {
        token_billing: {},
        request_billing: {},
      },
      warnings: resolved.explicit ? [`model-match policy markdown not found: ${resolved.path}`] : [],
      errors: [],
      raw: "",
    }
  }

  const raw = fs.readFileSync(resolved.path, "utf8")
  const parsed = parseModelMatchPolicyMarkdown(raw)

  return {
    source: resolved.path,
    found: true,
    explicit: resolved.explicit,
    source_kind: resolved.source,
    policy: parsed.policy,
    warnings: parsed.errors.length > 0 ? [`model-match policy markdown parsed with ${parsed.errors.length} warning(s)`] : [],
    errors: parsed.errors,
    raw,
  }
}

function formatMap(map = {}) {
  return Object.entries(map)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ")
}

function formatList(values = []) {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : "(none)"
}

function inferDimensionPriority(weights = {}) {
  return Object.entries(weights)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .map(([dimension]) => dimension)
}

function inferDimensionBaseline(weights = {}) {
  const ordered = Object.values(weights)
    .map((value) => Number(value) || 0)
    .sort((a, b) => b - a)
  const first = ordered[0] || 0
  const third = ordered[2] || 0
  const sixth = ordered[5] || 0
  if (first >= 0.28 && third <= 0.11) return "sharp"
  if (first >= 0.22 && third <= 0.14) return "focused"
  if (sixth >= 0.06) return "broad"
  return "balanced"
}

function inferPriceSensitivity(strategy = {}, mode = "token_billing") {
  if (mode === "request_billing") {
    const premium = Number(strategy?.request_tier_penalties?.premium || 0)
    if (premium >= 0.2) return "critical"
    if (premium >= 0.08) return "high"
    if (premium >= 0.03) return "medium"
    if (premium > 0) return "low"
    return "minimal"
  }

  const sensitivity = Number(strategy?.price_profile?.sensitivity || 0)
  if (sensitivity >= 0.2) return "critical"
  if (sensitivity >= 0.14) return "high"
  if (sensitivity >= 0.09) return "medium"
  if (sensitivity > 0.04) return "low"
  return "minimal"
}

function inferThinkingSensitivity(strategy = {}) {
  const reasoningLoad =
    Number(strategy?.weights?.reasoning || 0)
    + Number(strategy?.weights?.long_context || 0)
    + Number(strategy?.weights?.output_quality || 0)
  if (reasoningLoad >= 0.55) return "critical"
  if (reasoningLoad >= 0.42) return "high"
  if (reasoningLoad >= 0.3) return "medium"
  if (reasoningLoad >= 0.18) return "low"
  return "minimal"
}

function inferRoleFrequency(role) {
  if (["mic"].includes(role)) return "always"
  if (["pi", "map", "scout", "snap"].includes(role)) return "high"
  if (["wise", "vis"].includes(role)) return "low"
  return "medium"
}

function inferFallbackDepth(count) {
  if (count >= 5) return "extended"
  if (count >= 4) return "long"
  if (count >= 3) return "medium"
  return "short"
}

export function renderDefaultModelMatchPolicyMarkdown(strategies = {}) {
  const lines = [
    "# Model Match Policy",
    "",
    "This markdown file lets you steer role-model scoring without editing runtime code.",
    "",
    "Rules:",
    "- Edit abstract rankings and labels directly.",
    "- Unspecified fields fall back to built-in defaults.",
    "- Use abstract families / benchmark keys, not concrete model versions.",
    "- The runtime translates these human-readable preferences into internal weights and penalties.",
    "",
  ]

  for (const mode of ["token_billing", "request_billing"]) {
    lines.push(`## ${mode}`, "")
    const modeStrategies = strategies?.[mode] || {}
    for (const role of Object.keys(modeStrategies)) {
      const strategy = modeStrategies[role] || {}
      const dimensionPriority = inferDimensionPriority(strategy.weights || {})
      lines.push(`### ${role}`)
      lines.push(`- summary: ${role} scoring baseline`)
      lines.push(`- dimension_priority: ${dimensionPriority.join(" > ")}`)
      lines.push(`- dimension_baseline: ${inferDimensionBaseline(strategy.weights || {})}`)
      lines.push(`- price_sensitivity: ${inferPriceSensitivity(strategy, mode)}`)
      lines.push(`- thinking_sensitivity: ${inferThinkingSensitivity(strategy)}`)
      lines.push(`- role_frequency: ${inferRoleFrequency(role)}`)
      lines.push(`- fallback_depth: ${inferFallbackDepth(strategy.fallback_count ?? 3)}`)
      lines.push(`- price_cap: ${strategy.price_cap_tier || "none"}`)
      lines.push(`- family_preferences: ${formatList(strategy.preferred_families || [])}`)
      lines.push(`- family_avoidances: ${formatList(strategy.avoided_families || [])}`)
      lines.push(`- benchmark_preferences: ${formatList(strategy.preferred_benchmark_keys || [])}`)
      lines.push(`- benchmark_avoidances: ${formatList(strategy.avoided_benchmark_keys || [])}`)
      lines.push("")
    }
  }

  return `${lines.join("\n").trim()}\n`
}

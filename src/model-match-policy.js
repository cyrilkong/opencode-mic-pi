import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

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
  "dimension_priority",
  "family_preferences",
  "family_avoidances",
  "benchmark_preferences",
  "benchmark_avoidances",
  "keyword_preferences",
  "keyword_avoidances",
])

const POLICY_KEY_ALIASES = Object.freeze({
  notes: "summary",
  note: "summary",
  summary: "summary",
  focus: "dimension_priority",
  optimize_for: "dimension_priority",
  prioritize: "dimension_priority",
  shape: "dimension_baseline",
  spread: "dimension_baseline",
  cost: "price_sensitivity",
  spend: "price_sensitivity",
  thinking: "thinking_sensitivity",
  depth: "thinking_sensitivity",
  traffic: "role_frequency",
  frequency: "role_frequency",
  cadence: "role_frequency",
  fallback: "fallback_depth",
  ceiling: "price_cap",
  cap: "price_cap",
  prefer_families: "family_preferences",
  prefer_family: "family_preferences",
  avoid_families: "family_avoidances",
  avoid_family: "family_avoidances",
  prefer_benchmarks: "benchmark_preferences",
  prefer_benchmark: "benchmark_preferences",
  avoid_benchmarks: "benchmark_avoidances",
  avoid_benchmark: "benchmark_avoidances",
  preferred_families: "family_preferences",
  avoided_families: "family_avoidances",
  preferred_benchmark_keys: "benchmark_preferences",
  avoided_benchmark_keys: "benchmark_avoidances",
  prefer_keywords: "keyword_preferences",
  prefer_keyword: "keyword_preferences",
  avoid_keywords: "keyword_avoidances",
  avoid_keyword: "keyword_avoidances",
})

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

function parsePolicyValue(key, value) {
  if (LIST_KEYS.has(key)) return parseListValue(value)
  return parseScalarValue(value)
}

function createEmptyPolicy() {
  return {
    token_billing: {},
    request_billing: {},
  }
}

function normalizePolicyLineKey(key) {
  const normalized = String(key || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
  return POLICY_KEY_ALIASES[normalized] || normalized
}

export function resolveBundledModelMatchPolicyTemplatePath() {
  return fileURLToPath(new URL("../defaults/model-match-policy.default.md", import.meta.url))
}

export function readBundledModelMatchPolicyTemplate() {
  return fs.readFileSync(resolveBundledModelMatchPolicyTemplatePath(), "utf8")
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

export function seedModelMatchPolicyMarkdownIfMissing({
  routerConfig = {},
  markdown = "",
} = {}) {
  const resolved = resolveModelMatchPolicyPath(routerConfig)

  if (resolved.explicit) {
    return {
      created: false,
      reason: "explicit_path_set",
      path: null,
      source: resolved.path,
      source_kind: resolved.source,
    }
  }

  if (fs.existsSync(resolved.path)) {
    return {
      created: false,
      reason: "policy_already_found",
      path: null,
      source: resolved.path,
      source_kind: resolved.source,
    }
  }

  if (!nonEmptyString(markdown)) {
    return {
      created: false,
      reason: "empty_markdown",
      path: null,
      source: resolved.path,
      source_kind: resolved.source,
    }
  }

  fs.mkdirSync(path.dirname(resolved.path), { recursive: true })
  fs.writeFileSync(resolved.path, markdown, "utf8")

  return {
    created: true,
    reason: "created",
    path: resolved.path,
    source: "generated_default",
    source_kind: resolved.source,
  }
}

function normalizeOverrideModeMarker(line) {
  const normalized = String(line || "")
    .trim()
    .replace(/^[*_`\s]+/, "")
    .replace(/[*_`\s]+$/, "")
    .toLowerCase()

  if (/^when\s+token(?:\s+based)?\s+billing(?:\s+override)?$/.test(normalized)) {
    return "token_billing"
  }
  if (/^when\s+request(?:\s+based)?\s+billing(?:\s+override)?$/.test(normalized)) {
    return "request_billing"
  }
  return null
}

function compileRolePolicySections(sections = {}) {
  const policy = createEmptyPolicy()

  for (const [role, definition] of Object.entries(sections)) {
    const base = definition?.base && typeof definition.base === "object" ? definition.base : {}
    for (const mode of BILLING_MODES) {
      const override = definition?.[mode] && typeof definition[mode] === "object" ? definition[mode] : {}
      const merged = { ...base, ...override }
      if (Object.keys(merged).length > 0) {
        policy[mode][role] = merged
      }
    }
  }

  return policy
}

export function parseModelMatchPolicyMarkdown(markdown) {
  const policySections = {}
  const errors = []

  let currentRole = null
  let currentScope = "base"

  const lines = String(markdown || "").split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("<!--")) continue

    const roleMatch = trimmed.match(/^###\s+([a-z0-9_-]+)\s*$/i)
    if (roleMatch) {
      const role = String(roleMatch[1] || "").trim().toLowerCase()
      if (!ROLES.has(role)) {
        errors.push(`line ${index + 1}: unknown role heading "${roleMatch[1]}"`)
        continue
      }
      currentRole = role
      currentScope = "base"
      policySections[currentRole] ??= {
        base: {},
        token_billing: {},
        request_billing: {},
      }
      continue
    }

    const overrideMode = normalizeOverrideModeMarker(trimmed)
    if (overrideMode && currentRole) {
      currentScope = overrideMode
      continue
    }

    if (/^-+\s+inherited\s*$/i.test(trimmed)) {
      continue
    }

    const itemMatch = trimmed.match(/^-+\s+([^:]+):\s*(.+)$/)
    if (itemMatch && currentRole) {
      const rawKey = normalizePolicyLineKey(itemMatch[1])
      const rawValue = itemMatch[2]
      policySections[currentRole][currentScope][rawKey] = parsePolicyValue(rawKey, rawValue)
    }
  }

  return {
    policy: compileRolePolicySections(policySections),
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
      policy: createEmptyPolicy(),
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

export function renderDefaultModelMatchPolicyMarkdown() {
  return readBundledModelMatchPolicyTemplate()
}

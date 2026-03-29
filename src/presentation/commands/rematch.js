import { COMMAND_VIEW_STYLE, renderCommandSectionHeader } from "./shape.js"

const CORE_REMATCH_WARNING_ROLES = new Set(["mic", "pi", "co-pi", "wise"])

function summarizeRole(recommendation, roleLabel, roleKey) {
  const role = recommendation?.roles?.[roleKey] || {}
  const model = role.default_model || role.model || "(none)"
  const family = role.family_recommendation || role.family || "unknown"
  return `${roleLabel}: ${model} · family=${family}`
}

function compactRematchWarningLine(line) {
  const text = String(line || "").trim()
  if (!text) return null

  if (text.startsWith("Preference selectors unmatched in current model pool:")) {
    const matches = [...text.matchAll(/([a-z][a-z-]*)\((\d+)\)/gi)]
      .map((item) => ({ role: String(item[1] || "").toLowerCase(), count: Number.parseInt(String(item[2] || "0"), 10) }))
      .filter((item) => CORE_REMATCH_WARNING_ROLES.has(item.role) && Number.isInteger(item.count) && item.count > 0)
    if (matches.length === 0) return null
    return `Preference selectors unmatched in current model pool: ${matches.map((item) => `${item.role}(${item.count})`).join(", ")}`
  }

  if (text.startsWith("No preferred selectors matched for roles:")) {
    const rolesText = text.slice("No preferred selectors matched for roles:".length)
    const roles = rolesText
      .split(",")
      .map((role) => String(role || "").trim().toLowerCase())
      .filter((role) => CORE_REMATCH_WARNING_ROLES.has(role))
    if (roles.length === 0) return null
    return `No preferred selectors matched for roles: ${roles.join(", ")}`
  }

  return text
}

function compactAuditLabel(recommendation) {
  return recommendation?.model_discovery_audit?.status || recommendation?.model_pool_verification?.status || "missing"
}

export function renderCompactRematchView({
  recommendation,
  changed,
  defaultGlobalConfigCreated = false,
  defaultGlobalConfigPath = null,
  defaultGlobalModelMatchPolicyCreated = false,
  defaultGlobalModelMatchPolicyPath = null,
  selectionRequired = false,
}) {
  const status = changed ? "updated" : "unchanged"
  const warningLines = Array.isArray(recommendation?.warnings)
    ? recommendation.warnings.map((line) => compactRematchWarningLine(line)).filter(Boolean)
    : []
  const poolSource = recommendation?.model_pool_source || "unknown"
  const poolVerified = recommendation?.model_pool_verified === true ? "verified" : "unverified"
  const auditStatus = compactAuditLabel(recommendation)

  return [
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.rematchHeader),
    `Status: ${status}`,
    `Billing mode: ${recommendation?.billing_mode || "token_billing"}`,
    "Discovery refresh: complete (synchronous verified discovery before rematch)",
    defaultGlobalConfigCreated
      ? `Config authority: default global config created; inspect ${defaultGlobalConfigPath || "~/.config/opencode/opencode-router.json"}`
      : null,
    !defaultGlobalConfigCreated ? "Config authority: inspect ~/.config/opencode/opencode-router.json for active router settings" : null,
    defaultGlobalModelMatchPolicyCreated
      ? `Policy authority: default policy markdown created; inspect ${defaultGlobalModelMatchPolicyPath || "~/.config/opencode/opencode-router-model-match.md"}`
      : null,
    !defaultGlobalModelMatchPolicyCreated
      ? "Policy authority: inspect ~/.config/opencode/opencode-router-model-match.md for abstract role-scoring policy"
      : null,
    selectionRequired ? "Choice capture: explicit billing-mode selection was required in command flow" : null,
    `Pool: ${poolSource} (${poolVerified})`,
    `Audit: ${auditStatus}`,
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.updatedConfigHeader),
    `billing_mode=${recommendation?.billing_mode || "token_billing"}`,
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.roleWeightsHeader),
    summarizeRole(recommendation, "Pi", "pi"),
    summarizeRole(recommendation, "Co-pi", "co-pi"),
    summarizeRole(recommendation, "Wise", "wise"),
    warningLines.length > 0
      ? `${renderCommandSectionHeader(COMMAND_VIEW_STYLE.warningsHeader)}\n${warningLines.map((line) => `- ${line}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n")
}
